"""Environment capability checks and bounded native/container launches."""
import importlib.util
import importlib.metadata
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=Path(os.environ.get('AIDC_SIM_DATA',str(ROOT/'.solver-data'))).resolve()
IMAGES={'openfoam':'aidc-openfoam:2312','fenicsx':'aidc-fenicsx:0.9.0'}
NAMES={'pandapower':'供电校核','pypsa':'多站优化','openfoam':'风液耦合 CFD','fenicsx':'局部热有限元'}
_cache=None

def capabilities(refresh=False):
    global _cache
    if _cache and not refresh and time.monotonic()-_cache[0]<15:return _cache[1]
    engines=[]
    docker=shutil.which('docker');docker_ok=False
    if docker:
        try:docker_ok=subprocess.run([docker,'info','--format','{{.ServerVersion}}'],capture_output=True,timeout=3,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)).returncode==0
        except (OSError,subprocess.TimeoutExpired):pass
    for engine in NAMES:
        module={'fenicsx':'dolfinx'}.get(engine,engine)
        native=importlib.util.find_spec(module) is not None if engine!='openfoam' else bool(shutil.which('buoyantBoussinesqSimpleFoam') and shutil.which('chtMultiRegionFoam'))
        version=None
        if native:
            try:version=importlib.metadata.version(module)
            except importlib.metadata.PackageNotFoundError:version='native'
        mode='native' if native else None
        if not native and engine in IMAGES and docker_ok:
            try:
                if subprocess.run([docker,'image','inspect',IMAGES[engine]],capture_output=True,timeout=3,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)).returncode==0:mode='docker';version=IMAGES[engine].split(':')[-1]
            except (OSError,subprocess.TimeoutExpired):pass
        if mode:reason=''
        elif engine in IMAGES:reason='需要 Linux 原生引擎或对应 Docker 镜像；本机尚未就绪'
        else:reason=f'当前 Python 环境未安装 {engine}'
        engines.append({'id':engine,'name':NAMES[engine],'available':bool(mode),'runtime':mode,'version':version,'reason':reason,'can_prepare':True})
    _cache=(time.monotonic(),engines)
    return engines

def capability(engine):return next(c for c in capabilities() if c['id']==engine)

def worker_command(engine,folder):
    cap=capability(engine)
    if not cap['available']:raise RuntimeError(cap['reason'])
    if cap['runtime']=='native':return [sys.executable,'-m','backend.worker',str(folder/'request.json')]
    return [shutil.which('docker'),'run','--rm','--name','aidc-'+folder.name,'--network=none','--cpus=2','--memory=4g','--pids-limit=256','-e','PYTHONUTF8=1','-v',f'{ROOT / "backend"}:/app/backend:ro','-v',f'{folder}:/job','-w','/app',IMAGES[engine],'python3','-m','backend.worker','/job/request.json']
