import hashlib
import json
import os
import re
import subprocess
import threading
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from pathlib import Path
from backend.models import JobRequest
from backend.runtimes import DATA,ROOT,capability,worker_command
from backend.engines.common import write_json

def now():return datetime.now(timezone.utc).isoformat()
class JobManager:
    def __init__(self):
        self.root=DATA/'jobs';self.root.mkdir(parents=True,exist_ok=True)
        self.lock=threading.RLock();self.pool=ThreadPoolExecutor(max_workers=2,thread_name_prefix='solver');self.jobs={};self.processes={}
        for folder in self.root.iterdir():
            if not re.fullmatch(r'[a-f0-9]{32}',folder.name):continue
            try:
                record=json.loads((folder/'status.json').read_text(encoding='utf-8'))
                if record['status'] in {'queued','running'}:record.update(status='failed',error='服务重启，任务已中断；可重新提交')
                self.jobs[folder.name]=record
            except (OSError,ValueError,KeyError):pass
    def folder(self,id):
        if not re.fullmatch(r'[a-f0-9]{32}',id) or id not in self.jobs:raise KeyError(id)
        return self.root/id
    def save(self,record):
        with self.lock:
            self.jobs[record['id']]=record
            destination=self.root/record['id']/'status.json';temp=destination.with_suffix('.tmp')
            write_json(temp,record);temp.replace(destination)
    def list(self):
        with self.lock:return sorted([dict(r) for r in self.jobs.values()],key=lambda r:r['created_at'],reverse=True)[:80]
    def get(self,id):
        with self.lock:self.folder(id);record=dict(self.jobs[id])
        folder=self.root/id
        if record['status'] in {'succeeded','failed'} and (folder/'result.json').exists():
            try:record['result']=json.loads((folder/'result.json').read_text(encoding='utf-8'))
            except (OSError,ValueError):record['result_read_error']='结果文件不完整，请查看求解日志'
        log=folder/'solver.log'
        if log.exists():
            with log.open('rb') as f:f.seek(max(0,log.stat().st_size-12000));record['log_tail']=f.read().decode('utf-8',errors='replace')
        return record
    def submit(self,request:JobRequest,prepare=False):
        with self.lock:
            if sum(r['status'] in {'queued','running'} for r in self.jobs.values())>=12:raise ValueError('计算队列已满，请等待现有任务完成')
        if not prepare and not capability(request.engine)['available']:raise RuntimeError(capability(request.engine)['reason'])
        id=uuid.uuid4().hex;folder=self.root/id;folder.mkdir()
        raw=request.model_dump_json(indent=2);(folder/'request.json').write_text(raw,encoding='utf-8')
        record={'id':id,'engine':request.engine,'status':'queued','created_at':now(),'updated_at':now(),'model_revision':request.snapshot.revision,'input_sha256':hashlib.sha256(raw.encode()).hexdigest(),'data_sources':request.data_sources,'error':None}
        self.save(record)
        if prepare:
            try:
                self.bundle(id,request)
                record.update(status='prepared',updated_at=now());self.save(record)
            except Exception as error:
                record.update(status='failed',error=str(error),updated_at=now());self.save(record)
                raise
        else:self.pool.submit(self.run,id,request)
        return self.get(id)
    def bundle(self,id,request):
        folder=self.root/id
        if request.engine=='openfoam':
            from backend.engines.openfoam_engine import prepare_case
            prepare_case(request,folder/'case')
        readme='Run from this directory with a compatible Python/Linux engine environment:\npython3 -m backend.worker request.json\n\nOpenFOAM: OpenCFD v2312, source its etc/bashrc first.\nFEniCSx: DOLFINx 0.9.0.\nFull input parameters and model snapshot are in request.json.\n'
        (folder/'RUN.txt').write_text(readme,encoding='utf-8')
        with zipfile.ZipFile(folder/'case.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
            for name in ['request.json','RUN.txt']:z.write(folder/name,name)
            z.write(ROOT/'backend/requirements.txt','backend/requirements.txt')
            for path in (ROOT/'backend').rglob('*.py'):
                if '__pycache__' not in str(path):z.write(path,path.relative_to(ROOT))
            case=folder/'case'
            if case.exists():
                for path in case.rglob('*'):
                    if path.is_file():z.write(path,path.relative_to(folder))
    def run(self,id,request):
        with self.lock:
            record=self.jobs[id]
            if record['status']=='cancelled':return
            record.update(status='running',updated_at=now());self.save(record)
        folder=self.root/id;process=None
        try:
            env={**os.environ,'PYTHONUTF8':'1','OMP_NUM_THREADS':'2','OPENBLAS_NUM_THREADS':'2','MKL_NUM_THREADS':'2'}
            with (folder/'solver.log').open('wb') as output:
                process=subprocess.Popen(worker_command(request.engine,folder),cwd=ROOT,stdout=output,stderr=subprocess.STDOUT,env=env,start_new_session=os.name!='nt',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                with self.lock:
                    self.processes[id]=process
                    cancelled=record['status']=='cancelled'
                if cancelled:self.kill(id,process)
                started=time.monotonic()
                while process.poll() is None:
                    if time.monotonic()-started>request.timeout_seconds:
                        self.kill(id,process);raise TimeoutError('超过任务时间上限，求解已停止')
                    time.sleep(.15)
            if record['status']=='cancelled':return
            if process.returncode!=0:
                lines=(folder/'solver.log').read_text(encoding='utf-8',errors='replace').strip().splitlines()
                raise RuntimeError(lines[-1][:600] if lines else f'求解进程退出 {process.returncode}')
            result=json.loads((folder/'result.json').read_text(encoding='utf-8'))
            if not result.get('executed') or not result.get('converged'):raise RuntimeError('结果未通过求解完成校验')
            with self.lock:
                if record['status']!='cancelled':record.update(status='succeeded',updated_at=now());self.save(record)
        except Exception as error:
            with self.lock:
                if record['status']!='cancelled':record.update(status='failed',error=str(error)[:800],updated_at=now());self.save(record)
        finally:
            with self.lock:self.processes.pop(id,None)
    def kill(self,id,process):
        if process.poll() is None:
            if os.name=='nt':subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True,timeout=10,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            else:
                import signal
                try:os.killpg(process.pid,signal.SIGTERM)
                except ProcessLookupError:pass
        try:
            import shutil
            if shutil.which('docker'):subprocess.run(['docker','rm','-f','aidc-'+id],capture_output=True,timeout=10,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        except (OSError,subprocess.TimeoutExpired):pass
    def cancel(self,id):
        with self.lock:
            self.folder(id);record=self.jobs[id]
            if record['status'] not in {'queued','running'}:return dict(record)
            record.update(status='cancelled',updated_at=now());self.save(record);process=self.processes.get(id)
        if process:self.kill(id,process)
        return dict(record)
    def artifact(self,id,name):
        folder=self.folder(id).resolve();target=(folder/name).resolve()
        if not target.is_relative_to(folder) or not target.is_file() or target.suffix not in {'.json','.csv','.nc','.zip','.log','.vtu','.xdmf','.h5','.foam'}:raise KeyError(name)
        return target
