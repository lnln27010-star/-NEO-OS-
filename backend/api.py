from fastapi import FastAPI, HTTPException, Request,UploadFile,File,Form
from fastapi.responses import FileResponse, JSONResponse
from backend.jobs import JobManager
from backend.models import JobRequest,Snapshot
from backend.runtimes import capabilities,DATA
from backend.engines.common import write_json
from datetime import datetime,timezone
from backend.foundation import CenterRepository,SaveCenter,Center,quality,compile_request
from backend.operations import OperationsRepository,EntitySave,ChangePlan,ChangeComplete,Publish,TelemetryBatch
from backend.documents import DocumentRepository,DocumentMeta,ImportMapping
from backend.platform_diagnostics import power_topology,dispatch_readiness,model_coverage
from backend.work_orders import WorkOrderRepository,OrderCreate,OrderAction
from backend.planning_demand import PlanningDemandRepository,DemandBatch
from backend.planning_projects import PlanningProjectRepository,ProjectSave
from backend.planning_regions import RegionRepository,RegionBatch
from backend.models import JobRequest,Electrical,Dispatch,Strict
from pydantic import Field
from typing import Literal
import math
import uuid
import json

app=FastAPI(title='AIDC Simulation API',version='7.0',docs_url='/api/simulation/docs',openapi_url='/api/simulation/openapi.json')
manager=JobManager()
centers=CenterRepository(DATA/'foundation.sqlite3')
operations=OperationsRepository(centers)
documents=DocumentRepository(centers,operations,DATA/'documents')
work_orders=WorkOrderRepository(centers)
planning_demand=PlanningDemandRepository(centers)
planning_projects=PlanningProjectRepository(DATA/'planning.sqlite3')
planning_regions=RegionRepository(DATA/'planning.sqlite3')
with centers.connect() as db:
    db.execute('CREATE TABLE IF NOT EXISTS design_proposals(id TEXT PRIMARY KEY, center_id TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)')

class DesignInputs(Strict):
    racks:int=Field(ge=1,le=4000)
    liquid_percent:float=Field(ge=0,le=100)
    pue:float=Field(ge=1,le=2.5)
    redundancy:Literal['N+1','2N']='N+1'
    it_kw_air:float=Field(gt=0,le=300)
    it_kw_liquid:float=Field(gt=0,le=500)

class DesignProposal(Strict):
    name:str=Field(min_length=1,max_length=120)
    site_id:str=Field(default='',max_length=64)
    site_name:str=Field(default='',max_length=120)
    center_id:str=Field(default='',max_length=64)
    source:Literal['user-planning-input']='user-planning-input'
    inputs:DesignInputs
    results:dict[str,float]|None=None
    note:str=Field(default='',max_length=700)

@app.get('/api/platform/designs')
def list_designs(center_id:str=''):
    if center_id:
        try:centers.get(center_id)
        except KeyError:raise HTTPException(404,'数据中心不存在')
    with centers.connect() as db:
        records=db.execute('SELECT data FROM design_proposals WHERE center_id=? ORDER BY created_at DESC LIMIT 100',(center_id,)).fetchall() if center_id else db.execute('SELECT data FROM design_proposals ORDER BY created_at DESC LIMIT 100').fetchall()
    return {'designs':[json.loads(row[0]) for row in records]}

@app.post('/api/platform/designs',status_code=201)
def save_design(request:DesignProposal):
    if request.center_id:
        try:centers.get(request.center_id)
        except KeyError:raise HTTPException(404,'数据中心不存在')
    p=request.inputs
    liquid=math.floor(p.racks*p.liquid_percent/100+.5)
    air=p.racks-liquid
    it_mw=(air*p.it_kw_air+liquid*p.it_kw_liquid)/1000
    water_mw=liquid*p.it_kw_liquid*.9/1000
    units=math.ceil(it_mw/2)
    result={'racks':p.racks,'it_mw':it_mw,'facility_mw':it_mw*p.pue,'water_mw':water_mw,'ups':units*2 if p.redundancy=='2N' else units+1,'cdu':math.ceil(water_mw/2.5),'crac':math.ceil((it_mw-water_mw)/.25),'chillers':math.ceil(it_mw/2)+1,'area_m2':math.ceil(p.racks*7+500)}
    record={'id':'DES-'+uuid.uuid4().hex[:12],**request.model_dump(exclude={'results'}),'results':result,'created_at':datetime.now(timezone.utc).isoformat(),'calculation':'方案级容量估算，尚需图纸与设备参数校核'}
    with centers.lock,centers.connect() as db:
        if db.execute('SELECT COUNT(*) FROM design_proposals').fetchone()[0]>=2000:raise HTTPException(429,'方案库已达容量上限')
        db.execute('INSERT INTO design_proposals VALUES(?,?,?,?)',(record['id'],record['center_id'],json.dumps(record,ensure_ascii=False),record['created_at']))
    return record

@app.get('/api/platform/overview')
def platform_overview():
    """Read registered centers and completed engineering work without creating telemetry."""
    records=centers.list()
    with centers.connect() as db:
        inventory_counts={(row[0],row[1]):row[2] for row in db.execute("SELECT center_id,kind,COUNT(*) FROM inventory WHERE kind IN ('server','component','source') GROUP BY center_id,kind")}
        raw_sources=db.execute("SELECT center_id,data FROM inventory WHERE kind='source'").fetchall()
    latest_sources={}
    for center_id,raw in raw_sources:
        source=json.loads(raw)
        if source.get('last_ingested','')>latest_sources.get(center_id,''):
            latest_sources[center_id]=source['last_ingested']
    items=[]
    for record in records:
        data=record['data'];identity=data['id'];publication=centers.publication(identity)
        items.append({'id':identity,'code':data['code'],'name':data['name'],'region':data['region'],'latitude':data['latitude'],'longitude':data['longitude'],'source':data['source'],'archived':data['archived'],'it_capacity_mw':data['it_capacity_mw'],'grid_capacity_mw':data['grid_capacity_mw'],'pue':data['pue'],'asset_count':len(data['assets']),'server_count':inventory_counts.get((identity,'server'),0),'component_count':inventory_counts.get((identity,'component'),0),'telemetry_source_count':inventory_counts.get((identity,'source'),0),'latest_measurement_at':latest_sources.get(identity),'revision':record['revision'],'updated_at':record['updated_at'],'quality_errors':record['quality']['errors'],'quality_warnings':record['quality']['warnings'],'baseline':publication['baseline'],'inventory_revision':publication['inventory_revision']})
    finished=[{'id':j['id'],'engine':j['engine'],'status':j['status'],'created_at':j['created_at'],'data_sources':j.get('data_sources',[])} for j in manager.list() if j.get('data_sources') and j['status']=='succeeded'][:8]
    return {'centers':items,'jobs':finished,'registered':len([c for c in items if not c['archived']]),'published':len([c for c in items if not c['archived'] and c['baseline']]),'measured':len([c for c in items if not c['archived'] and c['telemetry_source_count']]),'source':'本机已登记资料；测点来源会标明离线导入'}

@app.get('/api/platform/planning/demand')
def planning_demand_list():return planning_demand.list()

@app.post('/api/platform/planning/demand/import')
def planning_demand_import(batch:DemandBatch):return invoke(lambda:planning_demand.import_batch(batch))

@app.get('/api/platform/planning/projects')
def planning_project_list():return planning_projects.list()

@app.get('/api/platform/planning/regions')
def planning_region_list():return planning_regions.list()

@app.post('/api/platform/planning/regions/import')
def planning_region_import(batch:RegionBatch):return invoke(lambda:planning_regions.import_batch(batch))

@app.post('/api/platform/planning/projects',status_code=201)
def planning_project_create(body:ProjectSave):return invoke(lambda:planning_projects.save(body))

@app.put('/api/platform/planning/projects/{project_id}')
def planning_project_save(project_id:str,body:ProjectSave):return invoke(lambda:planning_projects.save(body,project_id))

@app.get('/api/platform/planning/projects/{project_id}/versions')
def planning_project_versions(project_id:str):return invoke(lambda:planning_projects.history(project_id))

@app.get('/api/platform/planning/projects/{project_id}/documents')
def planning_project_documents(project_id:str):return invoke(lambda:planning_projects.documents(project_id))

@app.post('/api/platform/planning/projects/{project_id}/documents',status_code=201)
async def planning_project_document_add(project_id:str,gate:str=Form(...),file:UploadFile=File(...)):
    contents=await file.read(20_000_001)
    return invoke(lambda:planning_projects.add_document(project_id,gate,file.filename or '',file.content_type or 'application/octet-stream',contents))

@app.get('/api/platform/planning/projects/{project_id}/documents/{document_id}')
def planning_project_document_download(project_id:str,document_id:str):
    path,name,mime=invoke(lambda:planning_projects.document_path(project_id,document_id))
    return FileResponse(path,media_type=mime,filename=name)

@app.get('/api/platform/capabilities')
def platform_capabilities():
    descriptions={
        'pandapower':('供电校核','已登记的变压器、供电连接、设备负载与线路参数','电压、负载率、断供、损耗和短路校核'),
        'pypsa':('多站算电优化','已发布中心的24小时电价、负载、绿电、储能及容量','多站购电、储能、算力迁移和费用'),
        'openfoam':('机房气流与换热','设备位置、热量、送风和水侧边界','温度、速度场与收敛检查'),
        'fenicsx':('部件热传导','设备组件几何、导热参数、热源与水风边界','局部温度场和能量平衡'),
    }
    return {'capabilities':[{**engine,'name':descriptions[engine['id']][0],'inputs':descriptions[engine['id']][1],'outputs':descriptions[engine['id']][2],'calibration':'待按现场测量校准','interface':'HTTP任务/API与MCP'} for engine in capabilities()], 'agent_runtime':'未连接外部大语言模型；可执行受控的本地任务编排','data_interfaces':[{'name':'中心基础资料','status':'本机资料库'},{'name':'离线测点与设备快照','status':'文件导入'},{'name':'Meta42 / ECC / DCIM / BMS / EMS','status':'待配置接口'}]}

@app.get('/api/platform/centers/{center_id}/power-topology')
def center_power_topology(center_id:str):
    try:
        record=centers.get(center_id)
        baseline=centers.publication(center_id)['baseline']
    except KeyError:raise HTTPException(404,'数据中心不存在')
    return power_topology(record['data'],record['revision'],baseline)

@app.get('/api/platform/centers/{center_id}/dispatch-readiness')
def center_dispatch_readiness(center_id:str):
    try:
        record=centers.get(center_id)
        baseline=centers.publication(center_id)['baseline']
        published=centers.published(center_id) if baseline else None
    except KeyError:raise HTTPException(404,'数据中心不存在')
    data=published['data'] if published else record['data']
    revision=published['revision'] if published else record['revision']
    return dispatch_readiness(data,baseline,record['revision'],revision)

@app.get('/api/platform/centers/{center_id}/work-orders')
def center_work_orders(center_id:str):return {'orders':invoke(lambda:work_orders.list(center_id))}

@app.get('/api/platform/centers/{center_id}/work-order-assets')
def center_work_order_assets(center_id:str):
    try:record=centers.get(center_id)
    except KeyError:raise HTTPException(404,'数据中心不存在')
    return {'assets':[{'id':asset['id'],'name':asset['name'],'kind':asset['kind'],'source':asset['source'],'installed':asset['installed']} for asset in record['data']['assets']]}

@app.get('/api/platform/centers/{center_id}/model-coverage')
def center_model_coverage(center_id:str):
    try:
        record=centers.get(center_id)
        baseline=centers.publication(center_id)['baseline']
    except KeyError:raise HTTPException(404,'数据中心不存在')
    with centers.connect() as db:
        counts={kind:db.execute('SELECT COUNT(*) FROM inventory WHERE center_id=? AND kind=?',(center_id,kind)).fetchone()[0] for kind in ('server','component','source')}
    return model_coverage(record['data'],record['revision'],baseline,counts['server'],counts['component'],counts['source'])

@app.post('/api/platform/centers/{center_id}/work-orders',status_code=201)
def create_work_order(center_id:str,request:OrderCreate):return invoke(lambda:work_orders.create(center_id,request))

@app.post('/api/platform/centers/{center_id}/work-orders/{order_id}/actions')
def advance_work_order(center_id:str,order_id:str,request:OrderAction):return invoke(lambda:work_orders.act(center_id,order_id,request))

class AssistantTask(Strict):
    action:Literal['coverage','power_check','dispatch','recent_jobs']
    center_ids:list[str]=Field(default_factory=list,max_length=12)
    flexible_percent:float=Field(default=35,ge=0,le=100)
    grid_limit_mw:float=Field(default=26,gt=0,le=3000)

@app.post('/api/platform/assistant/tasks')
def assistant_task(task:AssistantTask):
    """Bounded local workflows. No free-form commands or physical control endpoints."""
    if task.action=='recent_jobs':
        return {'action':task.action,'mode':'registered-jobs','jobs':manager.list()[:15]}
    if task.action=='coverage':
        known={item['id']:item for item in platform_overview()['centers']}
        selected=task.center_ids or list(known)
        if any(id not in known for id in selected):raise HTTPException(404,'数据中心不存在')
        return {'action':task.action,'mode':'registered-data','centers':[{'id':id,'name':known[id]['name'],'baseline':known[id]['baseline'],'quality_errors':known[id]['quality_errors'],'quality_warnings':known[id]['quality_warnings'],'telemetry_source_count':known[id]['telemetry_source_count'],'asset_count':known[id]['asset_count']} for id in selected]}
    if not task.center_ids:raise HTTPException(422,'请选择已登记的数据中心')
    if task.action=='power_check' and len(task.center_ids)!=1:raise HTTPException(422,'供电校核每次选择一个数据中心')
    try:
        request=JobRequest(engine='pandapower',data_center_ids=task.center_ids,electrical=Electrical(analysis='power_flow_short_circuit')) if task.action=='power_check' else JobRequest(engine='pypsa',data_center_ids=task.center_ids,dispatch=Dispatch(flexible_percent=task.flexible_percent,grid_limit_mw=task.grid_limit_mw))
        compiled=compile_request(request,centers)
        result=manager.submit(compiled)
        return {'action':task.action,'mode':'professional-solver','job':{'id':result['id'],'engine':result['engine'],'status':result['status'],'data_sources':result.get('data_sources',[])}}
    except KeyError:raise HTTPException(404,'数据中心不存在')
    except RuntimeError as error:raise HTTPException(409,str(error))
    except ValueError as error:raise HTTPException(422,str(error))

def invoke(action):
    try:return action()
    except KeyError:raise HTTPException(404,'记录不存在')
    except RuntimeError as e:raise HTTPException(409,str(e))
    except ValueError as e:raise HTTPException(422,str(e))

@app.get('/api/simulation/data-centers')
def list_centers():
    return {'centers':[dict(id=r['data']['id'],name=r['data']['name'],code=r['data']['code'],region=r['data']['region'],archived=r['data']['archived'],revision=r['revision'],updated_at=r['updated_at'],asset_count=len(r['data']['assets']),cable_count=len(r['data']['cables']),errors=r['quality']['errors'],warnings=r['quality']['warnings'],**centers.publication(r['data']['id'])) for r in centers.list()]}
@app.post('/api/simulation/data-centers/validate')
def validate_center(data:Center):return quality(data)
@app.post('/api/simulation/data-centers')
def save_center(request:SaveCenter):
    try:return centers.save(request)
    except RuntimeError as e:raise HTTPException(409,str(e))
    except ValueError as e:raise HTTPException(422,str(e))
@app.get('/api/simulation/data-centers/{id}')
def get_center(id:str):
    try:return centers.get(id)
    except KeyError:raise HTTPException(404,'数据中心不存在')
@app.get('/api/simulation/data-centers/{id}/history')
def center_history(id:str):
    try:return {'history':centers.history(id)}
    except KeyError:raise HTTPException(404,'数据中心不存在')
@app.get('/api/simulation/data-centers/{id}/history/{revision}')
def center_version(id:str,revision:int):
    try:return centers.version(id,revision)
    except KeyError:raise HTTPException(404,'历史修订不存在')

@app.get('/api/simulation/data-centers/{id}/publication')
def publication(id:str):return invoke(lambda:centers.publication(id))
@app.post('/api/simulation/data-centers/{id}/publish')
def publish(id:str,request:Publish):return invoke(lambda:centers.publish(id,request.expected_revision,request.operator,request.note,request.expected_inventory_revision))
@app.get('/api/simulation/data-centers/{id}/inventory/{kind}')
def inventory(id:str,kind:str,q:str='',limit:int=1000):
    if kind not in {'server','component','change','source'}:raise HTTPException(422,'类型无效')
    rows=invoke(lambda:operations.list(id,kind))
    filtered=[r for r in rows if q.casefold() in json.dumps(r['data'],ensure_ascii=False).casefold()]
    return {'records':filtered[:max(1,min(limit,5000))],'total':len(filtered)}
@app.post('/api/simulation/data-centers/{id}/inventory/{kind}')
def save_inventory(id:str,kind:str,request:EntitySave):
    result=invoke(lambda:operations.save(id,kind,request))
    return {'records':result[:1000],'total':len(result)}
@app.post('/api/simulation/data-centers/{id}/changes')
def create_change(id:str,request:ChangePlan):return {'records':invoke(lambda:operations.create_change(id,request))}
@app.post('/api/simulation/data-centers/{id}/changes/{change_id}/complete')
def complete_change(id:str,change_id:str,request:ChangeComplete):return {'records':invoke(lambda:operations.complete_change(id,change_id,request))}
@app.post('/api/simulation/data-centers/{id}/changes/{change_id}/cancel')
def cancel_change(id:str,change_id:str,request:ChangeComplete):return {'records':invoke(lambda:operations.complete_change(id,change_id,request,True))}
@app.get('/api/simulation/data-centers/{id}/audit')
def audit(id:str):return {'events':invoke(lambda:operations.audit(id))}
@app.post('/api/simulation/data-centers/{id}/measurements')
def measurements(id:str,request:TelemetryBatch):return invoke(lambda:operations.ingest(id,request))
@app.get('/api/simulation/data-centers/{id}/measurements/daily')
def daily(id:str,source_id:str,date:str):return invoke(lambda:operations.daily(id,source_id,date))
@app.get('/api/simulation/data-centers/{id}/documents')
def document_list(id:str):return {'documents':invoke(lambda:documents.list(id))}
@app.post('/api/simulation/data-centers/{id}/documents')
async def upload_document(id:str,file:UploadFile=File(...),metadata:str=Form(...)):
    raw=await file.read(40_000_001);await file.close()
    return invoke(lambda:documents.upload(id,file.filename or 'document',raw,DocumentMeta.model_validate_json(metadata)))
@app.get('/api/simulation/data-centers/{id}/documents/{document_id}/content')
def document_content(id:str,document_id:str):
    path,metadata=invoke(lambda:documents.file(id,document_id))
    return FileResponse(path,filename=metadata['filename'],headers={'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"})
@app.get('/api/simulation/data-centers/{id}/documents/{document_id}/extraction')
def document_extraction(id:str,document_id:str):
    data=invoke(lambda:documents.parsed(id,document_id));return {**data,'tables':[{**t,'rows':t['rows'][:120]} for t in data.get('tables',[])]}
@app.post('/api/simulation/data-centers/{id}/documents/{document_id}/preview')
def document_preview(id:str,document_id:str,request:ImportMapping):
    result=invoke(lambda:documents.preview(id,document_id,request));return {k:v for k,v in result.items() if k not in {'records','candidate'}}
@app.post('/api/simulation/data-centers/{id}/documents/{document_id}/apply')
def document_apply(id:str,document_id:str,request:ImportMapping):return invoke(lambda:documents.apply(id,document_id,request))
@app.post('/api/simulation/data-centers/{id}/documents/{document_id}/retry')
def document_retry(id:str,document_id:str):return invoke(lambda:documents.retry(id,document_id))

@app.middleware('http')
async def local_service(request:Request,call_next):
    origin=request.headers.get('origin')
    if origin and origin not in {'http://127.0.0.1:4186','http://localhost:4186','http://127.0.0.1:4187','http://localhost:4187','http://127.0.0.1:8001'}:return JSONResponse({'detail':'Origin not allowed'},status_code=403)
    limit=41_000_000 if request.url.path.endswith('/documents') and request.method=='POST' else 8_000_000
    if int(request.headers.get('content-length','0'))>limit:return JSONResponse({'detail':'上传或模型超过大小限制'},status_code=413)
    response=await call_next(request);response.headers['Cache-Control']='no-store';return response

@app.get('/api/simulation/health')
def health():return {'status':'ok','service':'aidc-simulation','version':'7.0'}
@app.get('/api/simulation/engines')
def engines():return {'engines':capabilities()}
@app.post('/api/simulation/model')
def sync_model(snapshot:Snapshot):
    with manager.lock:
        write_json(DATA/'current-model.json',{'snapshot':snapshot.model_dump(),'synced_at':datetime.now(timezone.utc).isoformat()})
    return {'revision':snapshot.revision,'devices':len(snapshot.devices)}
@app.get('/api/simulation/model')
def current_model():
    import json
    try:
        with manager.lock:return json.loads((DATA/'current-model.json').read_text(encoding='utf-8'))
    except FileNotFoundError:raise HTTPException(404,'请先在平台打开工程求解工作台，同步当前资产模型')
@app.get('/api/simulation/jobs')
def jobs():return {'jobs':manager.list()}
@app.post('/api/simulation/jobs',status_code=202)
def submit(request:JobRequest):
    try:request=compile_request(request,centers)
    except KeyError:raise HTTPException(404,'数据中心不存在')
    except ValueError as e:raise HTTPException(422,str(e))
    try:return manager.submit(request)
    except RuntimeError as e:raise HTTPException(409,str(e))
    except ValueError as e:raise HTTPException(429,str(e))
@app.post('/api/simulation/cases',status_code=201)
def prepare(request:JobRequest):
    try:return manager.submit(compile_request(request,centers),prepare=True)
    except KeyError:raise HTTPException(404,'数据中心不存在')
    except ValueError as e:raise HTTPException(422,str(e))
@app.get('/api/simulation/jobs/{id}')
def job(id:str):
    try:return manager.get(id)
    except KeyError:raise HTTPException(404,'Task not found')
@app.post('/api/simulation/jobs/{id}/cancel')
def cancel(id:str):
    try:return manager.cancel(id)
    except KeyError:raise HTTPException(404,'Task not found')
@app.get('/api/simulation/jobs/{id}/artifacts/{name:path}')
def artifact(id:str,name:str):
    try:return FileResponse(manager.artifact(id,name),filename=name.split('/')[-1])
    except KeyError:raise HTTPException(404,'Artifact not found')
