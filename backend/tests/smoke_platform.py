"""Live end-to-end check through the frontend proxy and the MCP stdio transport."""
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from urllib.request import Request,urlopen
from mcp import ClientSession,StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT=Path(__file__).resolve().parents[2]
BASE='http://127.0.0.1:4186/api/simulation'
def call(path,body=None):
    request=Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
    with urlopen(request,timeout=30) as response:return json.load(response)
def wait(id):
    start=time.monotonic()
    while time.monotonic()-start<180:
        record=call('/jobs/'+id)
        if record['status'] not in {'queued','running'}:return record
        time.sleep(.3)
    raise TimeoutError(id)
def result(tool):return tool.structuredContent if tool.structuredContent is not None else json.loads(tool.content[0].text)
async def main():
    assert call('/health')['service']=='aidc-simulation'
    model=json.loads((ROOT/'artifacts/engine-fixture/full-model.json').read_text(encoding='utf-8'))
    call('/model',model)
    power=call('/jobs',{'engine':'pandapower','snapshot':model,'electrical':{'analysis':'power_flow_short_circuit'}})
    async with stdio_client(StdioServerParameters(command=sys.executable,args=['-m','backend.mcp_server'],cwd=str(ROOT),env={**os.environ,'PYTHONUTF8':'1'})) as (read,write):
        async with ClientSession(read,write) as session:
            await session.initialize()
            tools=await session.list_tools();assert len(tools.tools)==7
            engines=result(await session.call_tool('list_simulation_engines',{}));assert len(engines['engines'])==4
            current=result(await session.call_tool('get_current_asset_model',{}));assert len(current['snapshot']['devices'])==540
            optimization=result(await session.call_tool('submit_simulation',{'engine':'pypsa','parameters':{'demand_mw':20}}))
            prepared=result(await session.call_tool('prepare_simulation_case',{'engine':'fenicsx','parameters':{'target_device':'R-I01'}}));assert prepared['status']=='prepared'
            print('MCP: seven tools discovered; model read; optimization submitted; FEM case exported.',flush=True)
            optimized=await asyncio.to_thread(wait,optimization['id']);assert optimized['status']=='succeeded',optimized
            assert all(c['passed'] for c in optimized['result']['checks'])
            record=result(await session.call_tool('get_simulation_job',{'job_id':optimized['id']}));assert record['status']=='succeeded'
            artifact=result(await session.call_tool('read_simulation_artifact',{'job_id':optimized['id'],'name':'dispatch-results.json'}));assert artifact['inline'];assert len(artifact['content'])==24
            print('PyPSA / HiGHS:',json.dumps(optimized['result']['metrics'],ensure_ascii=True),flush=True)
    power=await asyncio.to_thread(wait,power['id']);assert power['status']=='succeeded',power
    assert power['result']['converged']
    assert len([a for a in power['result']['assets'] if a['kind']=='rack'])==384
    assert next(m['value'] for m in power['result']['metrics'] if m['key']=='unserved_kw')<.001
    print('pandapower / full 540-asset model:',json.dumps(power['result']['metrics'],ensure_ascii=True),flush=True)
    print('PASS: real power-flow and short-circuit solve; real optimal dispatch; same-origin API proxy; MCP tool execution; persisted artifacts.',flush=True)
if __name__=='__main__':asyncio.run(main())
