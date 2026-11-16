import hashlib
import json
import sys
import time
from datetime import datetime,timezone
from importlib import import_module
from pathlib import Path
from backend.models import JobRequest
from backend.engines.common import write_json

def main():
    path=Path(sys.argv[1]).resolve();raw=path.read_bytes();request=JobRequest.model_validate_json(raw)
    started=time.monotonic()
    module=import_module('backend.engines.'+{'pandapower':'pandapower_engine','pypsa':'pypsa_engine','openfoam':'openfoam_engine','fenicsx':'fenicsx_engine'}[request.engine])
    result=module.solve(request,path.parent)
    result.update({'engine':request.engine,'data_sources':request.data_sources,'adapter_sha256':hashlib.sha256(Path(module.__file__).read_bytes()).hexdigest(),'model_revision':request.snapshot.revision,'input_sha256':hashlib.sha256(raw).hexdigest(),'completed_at':datetime.now(timezone.utc).isoformat(),'elapsed_seconds':round(time.monotonic()-started,3),'executed':True})
    write_json(path.parent/'result.json',result)
    if not result.get('converged'):raise RuntimeError('求解未达到收敛条件；计算文件已保留供检查')
    print(json.dumps({'event':'completed','engine':request.engine,'seconds':result['elapsed_seconds']}),flush=True)
if __name__=='__main__':main()
