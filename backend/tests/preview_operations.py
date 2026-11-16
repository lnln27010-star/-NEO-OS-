"""Isolated browser QA: no test inventory is written to the user's database."""
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.request import Request,urlopen
from urllib.error import HTTPError

ROOT=Path(__file__).resolve().parents[2]
for port in [8002,4187]:
    with socket.socket() as s:s.bind(('127.0.0.1',port))
temp=tempfile.TemporaryDirectory(prefix='aidc-隔离界面验证-');os.environ['AIDC_SIM_DATA']=temp.name
resolved_temp=Path(temp.name).resolve()
assert resolved_temp.parent==Path(tempfile.gettempdir()).resolve() and resolved_temp.name.startswith('aidc-隔离界面验证-')
from backend.tests.test_foundation import center
from backend.foundation import CenterRepository,SaveCenter
from backend.operations import OperationsRepository,EntitySave,TelemetryBatch
from backend.documents import DocumentRepository,DocumentMeta

repo=CenterRepository(Path(temp.name)/'foundation.sqlite3');ops=OperationsRepository(repo)
c=center('DC-QA');c.name='运营流程验证中心（隔离）';repo.save(SaveCenter(data=c))
ops.save(c.id,'server',EntitySave(data={'id':'SERVER-QA','name':'验证服务器','rack_id':'R-01','u_start':1,'u_height':2,'status':'installed','manufacturer':'验证厂家','model':'验证节点','measured_w':800}))
for id,status in [('GPU-OLD','installed'),('GPU-NEW','stock')]:ops.save(c.id,'component',EntitySave(data={'id':id,'kind':'gpu','model':id+' 验证件','status':status,'server_id':'SERVER-QA' if status=='installed' else '', 'slot':'GPU-0' if status=='installed' else ''}))
docs=DocumentRepository(repo,ops,Path(temp.name)/'documents');docs.upload(c.id,'验证清册.csv','设备编号,设备名称,设备类型,额定功率,厂家\nR-01,验证机柜,机柜,20,验证厂家\n'.encode('utf-8'),DocumentMeta(title='竣工清册验证文件',number='QA-001',version='1',supplier='隔离测试数据'))
docs.pool.shutdown(wait=True)
ops.ingest(c.id,TelemetryBatch(name='验证 IT 总表（离线）',source_id='SRC-QA',rows=[{'timestamp':f'2026-10-19T{h:02}:00:00+08:00','metric':m,'value':20+h if m=='it_kw' else 0} for h in range(24) for m in ['it_kw','solar_kw']]))
repo.publish(c.id,1,'验证员','隔离界面验证用基线',3)

shutdown_event=threading.Event()
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT/'dist'),**kwargs)
    def log_message(self,*args):pass
    def proxy(self):
        size=int(self.headers.get('Content-Length','0'));body=self.rfile.read(size) if size else None
        headers={k:v for k,v in self.headers.items() if k.lower() in {'content-type','origin','accept'}}
        request=Request('http://127.0.0.1:8002'+self.path,data=body,method=self.command,headers=headers)
        try:response=urlopen(request,timeout=90)
        except HTTPError as e:response=e
        raw=response.read();self.send_response(response.status)
        for k,v in response.headers.items():
            if k.lower() in {'content-type','content-disposition','cache-control'}:self.send_header(k,v)
        self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        if self.path=='/__qa_stop':
            self.send_response(200);self.end_headers();self.wfile.write(b'QA stopping');shutdown_event.set()
        elif self.path.startswith('/api/simulation/'):self.proxy()
        else:super().do_GET()
    def do_POST(self):self.proxy()

process=subprocess.Popen([sys.executable,'-m','uvicorn','backend.api:app','--host','127.0.0.1','--port','8002'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env={**os.environ,'PYTHONUTF8':'1'},creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
web=ThreadingHTTPServer(('127.0.0.1',4187),Handler)
try:
    for _ in range(100):
        try:
            with urlopen('http://127.0.0.1:8002/api/simulation/health',timeout=1):break
        except OSError:time.sleep(.1)
    threading.Thread(target=web.serve_forever,daemon=True).start()
    print('Isolated QA ready: http://127.0.0.1:4187/?scene=room&page=data',flush=True)
    shutdown_event.wait(1800)
finally:
    web.shutdown();web.server_close();process.terminate();process.wait(timeout=15);temp.cleanup()
