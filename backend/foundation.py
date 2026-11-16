"""Versioned data-center engineering records and solver input compilation."""
import hashlib
import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from pydantic import Field, model_validator
from backend.models import Strict, Kind, Nameplate, JobRequest, Snapshot, Device, Circuit, DispatchSite

Origin = Literal['model','manual','measured','document','discovered']
def now():return datetime.now(timezone.utc).isoformat()

class Asset(Strict):
    id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')
    name: str = Field(default='', max_length=100)
    kind: Kind = 'rack'
    manufacturer: str = Field(default='', max_length=100)
    model: str = Field(default='', max_length=100)
    serial: str = Field(default='', max_length=100)
    room: str = Field(default='', max_length=100)
    source: Origin = 'manual'
    reference: str = Field(default='', max_length=300)
    capacity: float = Field(default=16, gt=0, le=100000)
    x: float = Field(default=0, ge=-200, le=200)
    z: float = Field(default=0, ge=-200, le=200)
    yaw: float = Field(default=0, ge=-10000, le=10000)
    pod: int = Field(default=0, ge=-1, le=3)
    installed: bool = True
    enabled: bool = True
    cooling_mode: Literal['air','liquid'] = 'air'
    nameplate: Nameplate = Field(default_factory=Nameplate)
    measured_kw: float | None = Field(default=None, ge=0, le=100000)
    load_profile_kw: list[float | None] | None = Field(default=None, min_length=24, max_length=24)
    heat_air_kw: float | None = Field(default=None, ge=0, le=100000)
    heat_water_kw: float | None = Field(default=None, ge=0, le=100000)
    flow_lpm: float | None = Field(default=None, ge=0, le=100000)
    connections: dict[Literal['powerA','powerB','supply','return','network'],str] = Field(default_factory=dict)
    rack_units: int = Field(default=42, ge=1, le=70)
    position_verified: bool = False
    provenance: dict[str,str] = Field(default_factory=dict,max_length=30)

    @model_validator(mode='after')
    def load_bounds(self):
        if self.load_profile_kw is not None and any(v is not None and (not __import__('math').isfinite(v) or v<0 or v>100000) for v in self.load_profile_kw):raise ValueError('设备逐时负载必须为 0–100000 kW')
        return self

class Cable(Strict):
    id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')
    source: str = Field(default='', max_length=64)
    target: str = Field(default='', max_length=64)
    port: Literal['powerA','powerB','supply','return','network'] = 'powerA'
    specification: str = Field(default='', max_length=150)
    material: Literal['copper','aluminium','other'] = 'copper'
    cross_section_mm2: float | None = Field(default=None, gt=0, le=10000)
    cores: int = Field(default=4, ge=1, le=100)
    installation: str = Field(default='', max_length=100)
    length_m: float | None = Field(default=None, gt=0, le=100000)
    r_ohm_km: float | None = Field(default=None, gt=0, le=50)
    x_ohm_km: float | None = Field(default=None, ge=0, le=50)
    max_i_ka: float | None = Field(default=None, gt=0, le=30)
    parallel: int = Field(default=1, ge=1, le=100)
    in_service: bool = True
    origin: Origin = 'manual'

class Hour(Strict):
    price: float | None = Field(default=None, ge=0, le=10)
    it_kw: float | None = Field(default=None, ge=0, le=1000000)
    solar_kw: float | None = Field(default=None, ge=0, le=1000000)

class Cooling(Strict):
    room_length_m: float = Field(default=96, gt=0, le=200)
    room_width_m: float = Field(default=61, gt=0, le=200)
    room_height_m: float = Field(default=8.5, gt=0, le=30)
    inlet_c: float = Field(default=20, ge=5, le=40)
    air_speed_m_s: float = Field(default=1, gt=.01, le=10)
    water_c: float = Field(default=22, ge=5, le=50)
    water_speed_m_s: float = Field(default=.1, gt=.001, le=2)
    liquid_capture_fraction: float = Field(default=.9, ge=0, le=.98)
    conductivity_w_mk: float = Field(default=380, gt=.1, le=1000)
    water_h_w_m2k: float = Field(default=5000, gt=1, le=100000)
    air_h_w_m2k: float = Field(default=10, ge=0, le=1000)

class Space(Strict):
    id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')
    name: str = Field(min_length=1,max_length=100)
    building: str = Field(default='',max_length=80)
    floor: str = Field(default='',max_length=40)
    category: Literal['server-room','power-room','plant-room','office','other'] = 'server-room'
    area_m2: float | None = Field(default=None,gt=0,le=1000000)
    height_m: float | None = Field(default=None,gt=0,le=30)
    reference: str = Field(default='',max_length=300)

class Center(Strict):
    id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=100)
    region: str = Field(default='', max_length=80)
    address: str = Field(default='', max_length=300)
    owner: str = Field(default='', max_length=100)
    reference: str = Field(default='', max_length=300)
    effective_date: str = Field(default='', max_length=30)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    it_capacity_mw: float | None = Field(default=None, gt=0, le=1000)
    grid_capacity_mw: float | None = Field(default=None, gt=0, le=2000)
    pue: float | None = Field(default=None, ge=1, le=3)
    solar_mw: float | None = Field(default=None, ge=0, le=1000)
    battery_mwh: float | None = Field(default=None, ge=0, le=10000)
    battery_mw: float | None = Field(default=None, ge=0, le=1000)
    grid_short_circuit_mva: float | None = Field(default=None, gt=0, le=100000)
    source: Origin = 'manual'
    archived: bool = False
    assets: list[Asset] = Field(default_factory=list, max_length=2500)
    cables: list[Cable] = Field(default_factory=list, max_length=5000)
    hourly: list[Hour] = Field(default_factory=lambda:[Hour() for _ in range(24)], min_length=24, max_length=24)
    cooling: Cooling = Field(default_factory=Cooling)
    spaces: list[Space] = Field(default_factory=list,max_length=1000)
    timezone: str = Field(default='Asia/Shanghai',max_length=60)

    @model_validator(mode='after')
    def unique_ids(self):
        for rows in [self.assets,self.cables,self.spaces]:
            if len({r.id for r in rows})!=len(rows):raise ValueError('同类记录的编号不能重复')
        from zoneinfo import ZoneInfo,ZoneInfoNotFoundError
        try:ZoneInfo(self.timezone)
        except ZoneInfoNotFoundError:raise ValueError('时区无效')
        return self

class SaveCenter(Strict):
    expected_revision: int = Field(default=0, ge=0)
    data: Center

def quality(c:Center):
    issues=[]
    def add(section,record,field,message,severity='warning'):issues.append(dict(section=section,record=record,field=field,message=message,severity=severity))
    ids={a.id for a in c.assets}; inputs=set(); graphs={p:{} for p in ['powerA','powerB']}
    if not c.assets:add('assets',c.code,'assets','尚未录入设备')
    for a in c.assets:
        if a.source in {'model','document'}:add('assets',a.id,'source','模型或资料提取记录，待现场核实')
        for key,label in [('manufacturer','厂家'),('model','型号')]:
            if not getattr(a,key):add('assets',a.id,key,label+'未填写')
        if a.installed and a.enabled and a.kind in {'rack','network','chiller','chw-pump','cw-pump','crac','cdu','cooling-tower','transformer','ups','lv-panel','busbar','rpp','pdu'} and a.nameplate.power_factor is None:add('assets',a.id,'power_factor','功率因数未填写')
        if a.kind=='ups' and a.nameplate.ups_loss_percent is None:add('assets',a.id,'ups_loss_percent','UPS 损耗率未填写')
        if a.kind=='transformer':
            for key in ['rated_kva','hv_kv','lv_kv','vk_percent','vkr_percent','pfe_kw','i0_percent']:
                if getattr(a.nameplate,key) is None:add('assets',a.id,key,'变压器参数 '+key+' 未填写')
        if a.enabled and a.installed and a.kind in {'rack','network','chiller','chw-pump','cw-pump','crac','cdu','cooling-tower'} and a.measured_kw is None and a.load_profile_kw is None:add('profiles',a.id,'measured_kw','尚无设备功率或逐时负载')
        if a.load_profile_kw is not None and any(v is None for v in a.load_profile_kw):add('profiles',a.id,'load_profile_kw','设备逐时负载尚未补齐')
        for port,target in a.connections.items():
            if target and target not in ids:add('assets',a.id,port,'连接目标不存在：'+target,'error')
    for cable in c.cables:
        if cable.origin=='model':add('cables',cable.id,'origin','由模型同步，待核实线路规格与长度')
        if cable.source not in ids or cable.target not in ids:add('cables',cable.id,'source','接线端点不存在','error')
        if cable.source==cable.target:add('cables',cable.id,'target','设备不能连接到自身','error')
        key=(cable.target,cable.port)
        if key in inputs:add('cables',cable.id,'port','同一设备端口重复接线','error')
        inputs.add(key)
        if cable.port in graphs and cable.in_service:graphs[cable.port][cable.target]=cable.source
        if cable.port.startswith('power'):
            for key in ['length_m','r_ohm_km','x_ohm_km','max_i_ka']:
                if getattr(cable,key) is None:add('cables',cable.id,key,'电缆 '+key+' 未填写')
    for port,graph in graphs.items():
        for start in graph:
            seen=set();node=start
            while node in graph:
                if node in seen:add('cables',start,port,'供电接线存在环路','error');break
                seen.add(node);node=graph[node]
    for field,label in [('price','电价'),('it_kw','IT 负载'),('solar_kw','光伏出力')]:
        missing=sum(getattr(h,field) is None for h in c.hourly)
        if missing:add('profiles',c.code,field,f'{label}缺少 {missing} 个小时')
    if c.solar_mw==0 and any((h.solar_kw or 0)>0 for h in c.hourly):add('profiles',c.code,'solar_kw','光伏容量为零，出力曲线却大于零','error')
    if c.solar_mw is not None and any((h.solar_kw or 0)>c.solar_mw*1000+.01 for h in c.hourly):add('profiles',c.code,'solar_kw','光伏出力超过装机容量','error')
    for key,label in [('it_capacity_mw','IT 容量'),('grid_capacity_mw','购电容量'),('pue','PUE'),('solar_mw','光伏容量'),('battery_mwh','储能容量'),('battery_mw','储能功率'),('grid_short_circuit_mva','上级电网短路容量')]:
        if getattr(c,key) is None:add('overview',c.code,key,label+'尚未核实'+('；无此设施请明确填写 0' if key in {'solar_mw','battery_mwh','battery_mw'} else ''))
    if bool(c.battery_mw)!=bool(c.battery_mwh):add('overview',c.code,'battery_mw','储能功率和容量需同时填写或同时为零','error')
    issues.sort(key=lambda i:i['severity']!='error')
    return dict(errors=sum(i['severity']=='error' for i in issues),warnings=sum(i['severity']=='warning' for i in issues),issues=issues[:1000])

class CenterRepository:
    def __init__(self,path:Path):
        self.path=path;path.parent.mkdir(parents=True,exist_ok=True);self.lock=threading.RLock()
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS centers(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS revisions(center_id TEXT, revision INTEGER, data TEXT, updated_at TEXT, PRIMARY KEY(center_id,revision))')
            db.execute('CREATE TABLE IF NOT EXISTS inventory(center_id TEXT,kind TEXT,id TEXT,revision INTEGER,data TEXT,updated_at TEXT,PRIMARY KEY(center_id,kind,id))')
            db.execute('CREATE TABLE IF NOT EXISTS inventory_state(center_id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0)')
            db.execute('CREATE TABLE IF NOT EXISTS baselines(center_id TEXT,version INTEGER,center_revision INTEGER,inventory_revision INTEGER,data TEXT,inventory TEXT,operator TEXT,note TEXT,created_at TEXT,PRIMARY KEY(center_id,version))')
            db.execute('CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,center_id TEXT,action TEXT,record_id TEXT,operator TEXT,details TEXT,created_at TEXT)')
    @contextmanager
    def connect(self):
        db=sqlite3.connect(self.path,timeout=10)
        try:
            with db:yield db
        finally:db.close()
    def record(self,row):
        if row is None:raise KeyError('数据中心不存在')
        model=Center.model_validate_json(row[2]);return dict(data=model.model_dump(),revision=row[1],updated_at=row[3],quality=quality(model))
    def list(self):
        with self.connect() as db:rows=db.execute('SELECT id,revision,data,updated_at FROM centers ORDER BY updated_at DESC').fetchall()
        return [self.record(row) for row in rows]
    def get(self,id):
        with self.connect() as db:return self.record(db.execute('SELECT id,revision,data,updated_at FROM centers WHERE id=?',(id,)).fetchone())
    def save(self,request:SaveCenter):
        c=request.data;raw=c.model_dump_json();timestamp=now()
        check=quality(c)
        if check['errors']:raise ValueError('；'.join(i['message']+' ['+i['record']+']' for i in check['issues'] if i['severity']=='error')[:1500])
        with self.lock,self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old=db.execute('SELECT revision FROM centers WHERE id=?',(c.id,)).fetchone()
            revision=old[0] if old else 0
            if revision!=request.expected_revision:raise RuntimeError('数据已被其他窗口修改，请重新读取后合并；当前修订 '+str(revision))
            if not old and db.execute('SELECT COUNT(*) FROM centers').fetchone()[0]>=100:raise ValueError('最多维护 100 个数据中心')
            revision+=1
            db.execute('INSERT OR REPLACE INTO centers VALUES(?,?,?,?)',(c.id,revision,raw,timestamp))
            db.execute('INSERT INTO revisions VALUES(?,?,?,?)',(c.id,revision,raw,timestamp))
            db.execute('DELETE FROM revisions WHERE center_id=? AND revision<?',(c.id,max(1,revision-29)))
        return self.get(c.id)
    def history(self,id):
        self.get(id)
        with self.connect() as db:return [dict(revision=r[0],updated_at=r[1]) for r in db.execute('SELECT revision,updated_at FROM revisions WHERE center_id=? ORDER BY revision DESC',(id,)).fetchall()]
    def version(self,id,revision):
        with self.connect() as db:
            row=db.execute('SELECT center_id,revision,data,updated_at FROM revisions WHERE center_id=? AND revision=?',(id,revision)).fetchone()
        return self.record(row)
    def publication(self,id):
        with self.connect() as db:
            row=db.execute('SELECT version,center_revision,inventory_revision,operator,note,created_at FROM baselines WHERE center_id=? ORDER BY version DESC LIMIT 1',(id,)).fetchone()
            current=db.execute('SELECT revision FROM inventory_state WHERE center_id=?',(id,)).fetchone()
        return {'baseline':dict(zip(['version','center_revision','inventory_revision','operator','note','created_at'],row)) if row else None,'inventory_revision':current[0] if current else 0}
    def publish(self,id,expected_revision,operator,note,expected_inventory_revision=None):
        if not operator.strip() or not note.strip():raise ValueError('请填写发布人和校核说明')
        with self.lock,self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT id,revision,data,updated_at FROM centers WHERE id=?',(id,)).fetchone();record=self.record(row)
            if record['revision']!=expected_revision:raise RuntimeError('资料修订已变化，请刷新后发布')
            model=Center.model_validate(record['data'])
            if model.archived:raise ValueError('已归档中心不能发布')
            if quality(model)['errors']:raise ValueError('请先修正数据错误')
            state=db.execute('SELECT revision FROM inventory_state WHERE center_id=?',(id,)).fetchone();inv=state[0] if state else 0
            if expected_inventory_revision is not None and inv!=expected_inventory_revision:raise RuntimeError('服务器配置已变化，请刷新后校核发布')
            previous=db.execute('SELECT version,center_revision,inventory_revision FROM baselines WHERE center_id=? ORDER BY version DESC LIMIT 1',(id,)).fetchone()
            if previous and previous[1:]==(expected_revision,inv):raise ValueError('当前资料和配置已经发布')
            version=previous[0]+1 if previous else 1
            inventory=[dict(kind=r[0],id=r[1],revision=r[2],data=json.loads(r[3])) for r in db.execute("SELECT kind,id,revision,data FROM inventory WHERE center_id=? AND kind IN ('server','component') ORDER BY kind,id",(id,))]
            db.execute('INSERT INTO baselines VALUES(?,?,?,?,?,?,?,?,?)',(id,version,expected_revision,inv,json.dumps(record['data'],ensure_ascii=False),json.dumps(inventory,ensure_ascii=False),operator[:80],note[:1000],now()))
            db.execute('INSERT INTO audit(center_id,action,record_id,operator,details,created_at) VALUES(?,?,?,?,?,?)',(id,'baseline-published',str(version),operator,json.dumps({'center_revision':expected_revision,'inventory_revision':inv,'warnings':record['quality']['warnings']}),now()))
        return self.publication(id)
    def published(self,id):
        self.get(id)
        with self.connect() as db:row=db.execute('SELECT version,center_revision,inventory_revision,data,inventory,created_at FROM baselines WHERE center_id=? ORDER BY version DESC LIMIT 1',(id,)).fetchone()
        if not row:raise ValueError('该数据中心尚未发布生效基线，请先在基本信息中校核并发布')
        return {'version':row[0],'revision':row[1],'inventory_revision':row[2],'data':json.loads(row[3]),'inventory':json.loads(row[4]),'updated_at':row[5]}

def compile_request(request:JobRequest,repository:CenterRepository):
    if not request.data_center_ids:return request
    if len(set(request.data_center_ids))!=len(request.data_center_ids):raise ValueError('数据中心重复')
    if request.engine!='pypsa' and len(request.data_center_ids)!=1:raise ValueError('该引擎每次请选择一个数据中心')
    records=[repository.published(id) for id in request.data_center_ids]
    centers=[Center.model_validate(r['data']) for r in records]
    if any(repository.get(c.id)['data']['archived'] for c in centers):raise ValueError('已归档的数据中心不能参与计算')
    refs=[dict(id=c.id,name=c.name,revision=r['revision'],baseline=r['version'],inventory_revision=r['inventory_revision'],sha256=hashlib.sha256(json.dumps({'data':r['data'],'inventory':r['inventory']},sort_keys=True,ensure_ascii=False).encode()).hexdigest()) for c,r in zip(centers,records)]
    data=request.model_dump();data['data_sources']=refs
    if request.engine=='pypsa':
        sites=[]
        for c in centers:
            missing=[label for key,label in [('it_capacity_mw','IT 容量'),('grid_capacity_mw','购电容量'),('pue','PUE'),('solar_mw','光伏容量'),('battery_mwh','储能容量'),('battery_mw','储能功率')] if getattr(c,key) is None]
            if missing:raise ValueError(c.name+'：请补齐 '+ '、'.join(missing))
            if any(h.price is None or h.it_kw is None or h.solar_kw is None for h in c.hourly):raise ValueError(c.name+'：请补齐 24 小时电价、IT 负载和光伏出力；无光伏填 0')
            sites.append(DispatchSite(id=c.id,name=c.name,capacity_mw=c.it_capacity_mw,grid_mw=c.grid_capacity_mw,pue=c.pue,price_yuan_kwh=max(.00001,sum(h.price for h in c.hourly)/24),solar_mw=c.solar_mw,hourly_prices=[h.price for h in c.hourly],hourly_it_mw=[h.it_kw/1000 for h in c.hourly],hourly_solar_mw=[h.solar_kw/1000 for h in c.hourly],battery_mw=c.battery_mw,battery_mwh=c.battery_mwh).model_dump())
        data['dispatch'].update(sites=sites,battery_mwh=sum(c.battery_mwh for c in centers),battery_mw=sum(c.battery_mw for c in centers))
    else:
        c=centers[0];devices=[];missing=[]
        for a in c.assets:
            links=dict(a.connections)
            for cable in c.cables:
                if cable.target==a.id:links[cable.port]=cable.source if cable.in_service else ''
            demand=a.load_profile_kw[request.data_hour] if a.load_profile_kw else a.measured_kw
            servers=[s['data'] for s in records[0]['inventory'] if s['kind']=='server' and s['data'].get('rack_id')==a.id and s['data'].get('status') in {'installed','maintenance'}]
            if demand is None and a.kind=='rack' and servers and all(s.get('measured_w') is not None for s in servers):demand=sum(s['measured_w'] for s in servers)/1000
            if request.engine=='openfoam' and a.installed and not a.position_verified:missing.append(a.id+' 位置未核实')
            if a.enabled and a.installed and a.kind in {'rack','network','chiller','chw-pump','cw-pump','crac','cdu','cooling-tower'} and demand is None:missing.append(a.id+' 功率')
            if request.engine=='pandapower' and a.kind=='transformer' and a.enabled and a.installed:
                for key in ['rated_kva','hv_kv','lv_kv','vk_percent','vkr_percent','pfe_kw','i0_percent']:
                    if getattr(a.nameplate,key) is None:missing.append(a.id+' '+key)
            if request.engine=='pandapower' and a.enabled and a.installed and a.kind in {'rack','network','chiller','chw-pump','cw-pump','crac','cdu','cooling-tower','transformer','ups','lv-panel','busbar','rpp','pdu'} and a.nameplate.power_factor is None:missing.append(a.id+' 功率因数')
            if request.engine=='pandapower' and a.enabled and a.installed and a.kind=='ups' and a.nameplate.ups_loss_percent is None:missing.append(a.id+' UPS 损耗率')
            devices.append(Device(id=a.id,kind=a.kind,capacity=a.capacity,x=a.x,z=a.z,yaw=a.yaw,pod=a.pod,installed=a.installed,enabled=a.enabled,cooling_mode=a.cooling_mode,nameplate=a.nameplate,custom_connections=True,connections=links,demand_kw=demand or 0,heat_air_kw=a.heat_air_kw if a.heat_air_kw is not None else demand or 0,heat_water_kw=a.heat_water_kw or 0,flow_lpm=a.flow_lpm or 0).model_dump())
        if not devices:raise ValueError(c.name+'：尚未录入设备')
        if missing:raise ValueError('请补齐工程数据：'+'、'.join(missing[:12])+('…' if len(missing)>12 else ''))
        revision='data-'+c.id+'-b'+str(records[0]['version'])+'-h'+str(request.data_hour)
        data['snapshot']=Snapshot(revision=revision,devices=devices).model_dump()
        if request.engine=='pandapower':
            if c.grid_short_circuit_mva is None:raise ValueError('请维护上级电网短路容量，不能用默认值代替现场资料')
            circuits=[]
            for cable in c.cables:
                if not cable.port.startswith('power'):continue
                if any(getattr(cable,key) is None for key in ['length_m','r_ohm_km','x_ohm_km','max_i_ka']):raise ValueError(cable.id+'：请补齐实际长度、电阻、电抗和载流量')
                circuits.append(Circuit(**{key:getattr(cable,key) for key in Circuit.model_fields}).model_dump())
            if not circuits:raise ValueError('请先维护供电电缆和接线')
            data['electrical'].update(circuits=circuits,explicit_circuits=True,grid_short_circuit_mva=c.grid_short_circuit_mva)
        for key in ['inlet_c','air_speed_m_s','water_c','water_speed_m_s','liquid_capture_fraction']:
            data['thermal'][key]=getattr(c.cooling,key)
        for key in ['conductivity_w_mk','water_h_w_m2k','air_h_w_m2k']:data['fem'][key]=getattr(c.cooling,key)
        if request.engine=='fenicsx' and data['fem']['target_device'] not in {a.id for a in c.assets}:
            data['fem']['target_device']=next((a.id for a in c.assets if a.kind in {'rack','cdu'}),'')
    return JobRequest.model_validate(data)
