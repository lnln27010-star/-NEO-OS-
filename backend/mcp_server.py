"""Agent tools for the same job service used by the AIDC browser application."""
import json
import os
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from urllib.parse import quote
from mcp.server.fastmcp import FastMCP

service=os.environ.get('AIDC_SIM_URL','http://127.0.0.1:8001').rstrip('/')+'/api/simulation'
mcp=FastMCP('AIDC Engineering Simulation')

def call(path,body=None):
    request=Request(service+path,data=json.dumps(body).encode('utf-8') if body is not None else None,headers={'Content-Type':'application/json'})
    try:
        with urlopen(request,timeout=30) as response:return json.load(response)
    except HTTPError as error:raise ValueError(error.read().decode('utf-8',errors='replace'))

@mcp.tool()
def list_simulation_engines()->dict:
    """Inspect actual installed solver availability before submitting a task."""
    return call('/engines')

@mcp.tool()
def get_current_asset_model()->dict:
    """Read the asset snapshot last synchronized by the platform workbench."""
    return call('/model')

def task(engine,parameters,snapshot,data_center_ids=None,data_hour=12):
    sections={'pandapower':'electrical','pypsa':'dispatch','openfoam':'thermal','fenicsx':'fem'}
    if engine not in sections:raise ValueError('Unknown solver')
    return {'engine':engine,'snapshot':snapshot or ({} if data_center_ids else call('/model')['snapshot']),sections[engine]:parameters or {},'data_center_ids':data_center_ids or [],'data_hour':data_hour}

@mcp.tool()
def submit_simulation(engine:str,parameters:dict|None=None,snapshot:dict|None=None,data_center_ids:list[str]|None=None,data_hour:int=12)->dict:
    """Submit pandapower, pypsa, openfoam or fenicsx with validated SI-unit parameters. Returns job id; poll get_simulation_job. No arbitrary code or command input is accepted."""
    return call('/jobs',task(engine,parameters,snapshot,data_center_ids,data_hour))

@mcp.tool()
def prepare_simulation_case(engine:str,parameters:dict|None=None,snapshot:dict|None=None,data_center_ids:list[str]|None=None,data_hour:int=12)->dict:
    """Generate an executable case bundle even when its Linux/container runtime is not installed."""
    return call('/cases',task(engine,parameters,snapshot,data_center_ids,data_hour))

@mcp.tool()
def get_simulation_job(job_id:str)->dict:
    """Read persisted task status, convergence checks, metrics, result files and solver log tail."""
    return call('/jobs/'+job_id)

@mcp.tool()
def cancel_simulation_job(job_id:str)->dict:
    """Cancel a queued/running task without deleting its input, logs or results."""
    return call('/jobs/'+job_id+'/cancel',{})

@mcp.tool()
def read_simulation_artifact(job_id:str,name:str)->dict:
    """Read a JSON/CSV/log result artifact, limited to 2 MB. Binary/larger files return a download path instead."""
    path='/jobs/'+quote(job_id,safe='')+'/artifacts/'+quote(name,safe='')
    with urlopen(service+path,timeout=30) as response:
        data=response.read(2_000_001)
        if len(data)>2_000_000 or not name.endswith(('.json','.csv','.log')):return {'download_url':service+path,'inline':False}
        text=data.decode('utf-8')
        return {'name':name,'inline':True,'content':json.loads(text) if name.endswith('.json') else text}

if __name__=='__main__':mcp.run(transport='stdio')
