"""Local inventory, physical-change registration and measured-data ingestion."""
import json
import uuid
from datetime import datetime,timezone
from typing import Literal
from zoneinfo import ZoneInfo
from pydantic import Field,model_validator
from backend.models import Strict
from backend.foundation import CenterRepository,now

class ServerRecord(Strict):
    id:str=Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')
    name:str=Field(default='',max_length=100)
    rack_id:str=Field(default='',max_length=64)
    u_start:int=Field(default=1,ge=1,le=70)
    u_height:int=Field(default=2,ge=1,le=70)
    form:Literal['unknown','rack-server','compute-tray','blade','storage','network']='unknown'
    manufacturer:str=Field(default='',max_length=100)
    model:str=Field(default='',max_length=100)
    serial:str=Field(default='',max_length=100)
    status:Literal['stock','unlocated','planned','installed','maintenance','retired']='stock'
    source:Literal['manual','document','discovered','model']='manual'
    measured_w:float|None=Field(default=None,ge=0,le=100000)
    power_limit_w:float|None=Field(default=None,gt=0,le=100000)
    installed_at:str=Field(default='',max_length=40)
    warranty_until:str=Field(default='',max_length=40)
    reference:str=Field(default='',max_length=500)

class ComponentRecord(Strict):
    id:str=Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')
    server_id:str=Field(default='',max_length=64)
    kind:Literal['cpu','gpu','memory','disk','nic','psu','other']='gpu'
    slot:str=Field(default='',max_length=60)
    manufacturer:str=Field(default='',max_length=100)
    model:str=Field(default='',max_length=100)
    serial:str=Field(default='',max_length=100)
    status:Literal['stock','unlocated','installed','repair','retired']='stock'
    interface:str=Field(default='',max_length=60)
    capacity_gb:float|None=Field(default=None,ge=0,le=100000)
    rated_w:float|None=Field(default=None,ge=0,le=10000)
    installed_at:str=Field(default='',max_length=40)
    warranty_until:str=Field(default='',max_length=40)
    source:Literal['manual','document','discovered']='manual'
    reference:str=Field(default='',max_length=500)

class EntitySave(Strict):
    expected_revision:int=Field(default=0,ge=0)
    operator:str=Field(default='本地操作员',max_length=80)
    data:dict

class ChangePlan(Strict):
    kind:Literal['replace-component','install-component','remove-component','move-server']
    target_id:str=Field(max_length=64)
    replacement_id:str=Field(default='',max_length=64)
    server_id:str=Field(default='',max_length=64)
    rack_id:str=Field(default='',max_length=64)
    slot:str=Field(default='',max_length=60)
    u_start:int=Field(default=1,ge=1,le=70)
    window:str=Field(default='',max_length=80)
    reason:str=Field(min_length=1,max_length=1000)
    operator:str=Field(min_length=1,max_length=80)

class ChangeComplete(Strict):
    expected_revision:int=Field(ge=1)
    operator:str=Field(min_length=1,max_length=80)
    compatibility_checked:bool=False

class Publish(Strict):
    expected_revision:int=Field(ge=1)
    operator:str=Field(min_length=1,max_length=80)
    note:str=Field(min_length=1,max_length=1000)
    expected_inventory_revision:int|None=Field(default=None,ge=0)

class TelemetryRow(Strict):
    timestamp:str=Field(max_length=80)
    target_id:str=Field(default='center',max_length=64)
    metric:Literal['it_kw','solar_kw','facility_kw','power_w','temperature_c','flow_lpm']
    value:float=Field(ge=-100,le=1000000000)
    @model_validator(mode='after')
    def nonnegative(self):
        if self.metric!='temperature_c' and self.value<0:raise ValueError('功率、流量不能为负数')
        return self

class TelemetryBatch(Strict):
    name:str=Field(min_length=1,max_length=100)
    source_id:str=Field(default='',pattern=r'^[A-Za-z0-9_-]{0,64}$')
    reference:str=Field(default='',max_length=500)
    rows:list[TelemetryRow]=Field(min_length=1,max_length=80000)

class OperationsRepository:
    def __init__(self,centers:CenterRepository):
        self.centers=centers
        with centers.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS measurements(center_id TEXT,source_id TEXT,timestamp TEXT,target_id TEXT,metric TEXT,value REAL,PRIMARY KEY(center_id,source_id,timestamp,target_id,metric))')
    def _rows(self,db,center_id,kind):return [dict(id=r[0],revision=r[1],data=json.loads(r[2]),updated_at=r[3]) for r in db.execute('SELECT id,revision,data,updated_at FROM inventory WHERE center_id=? AND kind=? ORDER BY updated_at DESC,id',(center_id,kind))]
    def list(self,center_id,kind):
        self.centers.get(center_id)
        with self.centers.connect() as db:return self._rows(db,center_id,kind)
    def _get(self,db,center_id,kind,id):
        row=db.execute('SELECT id,revision,data,updated_at FROM inventory WHERE center_id=? AND kind=? AND id=?',(center_id,kind,id)).fetchone()
        if not row:raise ValueError('记录不存在：'+id)
        return dict(id=row[0],revision=row[1],data=json.loads(row[2]),updated_at=row[3])
    def audit(self,center_id):
        self.centers.get(center_id)
        with self.centers.connect() as db:return [dict(id=r[0],action=r[1],record_id=r[2],operator=r[3],details=json.loads(r[4]),created_at=r[5]) for r in db.execute('SELECT id,action,record_id,operator,details,created_at FROM audit WHERE center_id=? ORDER BY id DESC LIMIT 150',(center_id,))]
    def _event(self,db,center_id,action,id,operator,details):db.execute('INSERT INTO audit(center_id,action,record_id,operator,details,created_at) VALUES(?,?,?,?,?,?)',(center_id,action,id,operator,json.dumps(details,ensure_ascii=False),now()))
    def _increment(self,db,center_id):db.execute('INSERT INTO inventory_state VALUES(?,1) ON CONFLICT(center_id) DO UPDATE SET revision=revision+1',(center_id,))
    def _write(self,db,center_id,kind,data,revision):db.execute('INSERT OR REPLACE INTO inventory VALUES(?,?,?,?,?,?)',(center_id,kind,data['id'],revision,json.dumps(data,ensure_ascii=False),now()))
    def _invalidate_loads(self,db,center_id,rack_ids):
        rack_ids=set(rack_ids)-{''}
        if not rack_ids:return
        row=db.execute('SELECT revision,data FROM centers WHERE id=?',(center_id,)).fetchone();data=json.loads(row[1]);changed=False
        for asset in data['assets']:
            if asset['id'] in rack_ids and (asset.get('measured_kw') is not None or asset.get('load_profile_kw') is not None):
                asset.update(measured_kw=None,load_profile_kw=None);changed=True
        if changed:
            raw=json.dumps(data,ensure_ascii=False);stamp=now();revision=row[0]+1
            db.execute('UPDATE centers SET revision=?,data=?,updated_at=? WHERE id=?',(revision,raw,stamp,center_id))
            db.execute('INSERT INTO revisions VALUES(?,?,?,?)',(center_id,revision,raw,stamp))
    def _validate_inventory(self,db,center_id,kind,data,overrides=None):
        c=self.centers.get(center_id)['data'];racks={a['id']:a for a in c['assets'] if a['kind']=='rack' and a['installed']}
        if kind=='server':
            server=ServerRecord.model_validate(data)
            if server.status not in {'installed','maintenance'} and any(p['data']['server_id']==server.id and p['data']['status']=='installed' for p in self._rows(db,center_id,'component')):raise ValueError('服务器仍有在位部件，请先登记拆卸')
            if server.status in {'installed','maintenance','planned'}:
                rack=racks.get(server.rack_id)
                if not rack:raise ValueError('请选择已安装的机柜')
                if server.u_start+server.u_height-1>rack['rack_units']:raise ValueError('服务器超出机柜 U 位范围')
                others={r['id']:r['data'] for r in self._rows(db,center_id,'server')};others.update(overrides or {})
                for id,s in others.items():
                    if id!=server.id and s['rack_id']==server.rack_id and s['status'] in {'installed','maintenance','planned'} and max(server.u_start,s['u_start'])<min(server.u_start+server.u_height,s['u_start']+s['u_height']):raise ValueError('U 位冲突：'+id)
            return server.model_dump()
        component=ComponentRecord.model_validate(data)
        if component.status=='installed':
            s=self._get(db,center_id,'server',component.server_id)['data']
            if s['status'] not in {'installed','maintenance'}:raise ValueError('目标服务器尚未安装或已退役')
            if not component.slot.strip():raise ValueError('已安装部件必须填写槽位')
            others={r['id']:r['data'] for r in self._rows(db,center_id,'component')};others.update(overrides or {})
            for id,part in others.items():
                if id!=component.id and part['status']=='installed' and part['server_id']==component.server_id and part['slot'].casefold()==component.slot.casefold():raise ValueError('部件槽位已占用：'+id)
        return component.model_dump()
    def save(self,center_id,kind,request:EntitySave):
        if kind not in {'server','component'}:raise ValueError('记录类型无效')
        self.centers.get(center_id)
        with self.centers.lock,self.centers.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            data=self._validate_inventory(db,center_id,kind,request.data)
            old=db.execute('SELECT revision,data FROM inventory WHERE center_id=? AND kind=? AND id=?',(center_id,kind,data['id'])).fetchone()
            if (old[0] if old else 0)!=request.expected_revision:raise RuntimeError('配置已被修改，请刷新后再保存')
            self._write(db,center_id,kind,data,request.expected_revision+1);self._increment(db,center_id)
            self._event(db,center_id,kind+'-saved',data['id'],request.operator,{'before':json.loads(old[1]) if old else None,'after':data})
        return self.list(center_id,kind)
    def bulk_save(self,center_id,kind,records,operator,reference):
        with self.centers.lock,self.centers.connect() as db:
            db.execute('BEGIN IMMEDIATE');self.validate_bulk(db,center_id,kind,records)
            for data in records:
                old=db.execute('SELECT revision FROM inventory WHERE center_id=? AND kind=? AND id=?',(center_id,kind,data['id'])).fetchone()
                self._write(db,center_id,kind,data,(old[0] if old else 0)+1)
            self._increment(db,center_id);self._event(db,center_id,'inventory-import',reference,operator,{'kind':kind,'count':len(records)})
        return {'count':len(records)}
    def validate_bulk(self,db,center_id,kind,records):
        c=self.centers.get(center_id)['data'];racks={a['id']:a for a in c['assets'] if a['kind']=='rack' and a['installed']}
        servers={r['id']:r['data'] for r in self._rows(db,center_id,'server')};parts={r['id']:r['data'] for r in self._rows(db,center_id,'component')}
        (servers if kind=='server' else parts).update({d['id']:d for d in records})
        slots={}
        for s in servers.values():
            if s['status'] not in {'installed','maintenance','planned'}:continue
            rack=racks.get(s['rack_id'])
            if not rack:raise ValueError(s['id']+'：机柜不存在或未安装')
            if s['u_start']+s['u_height']-1>rack['rack_units']:raise ValueError(s['id']+'：超出机柜 U 位范围')
            slots.setdefault(s['rack_id'],[]).append((s['u_start'],s['u_start']+s['u_height'],s['id']))
        for group in slots.values():
            group.sort()
            for previous,current in zip(group,group[1:]):
                if current[0]<previous[1]:raise ValueError('U 位冲突：'+previous[2]+' / '+current[2])
        occupied={}
        for part in parts.values():
            if part['status']!='installed':continue
            server=servers.get(part['server_id'])
            if not server or server['status'] not in {'installed','maintenance'}:raise ValueError(part['id']+'：目标服务器尚未安装或已退役')
            if not part['slot'].strip():raise ValueError(part['id']+'：已安装部件必须填写槽位')
            key=(part['server_id'],part['slot'].casefold())
            if key in occupied:raise ValueError('部件槽位冲突：'+occupied[key]+' / '+part['id'])
            occupied[key]=part['id']
    def create_change(self,center_id,request:ChangePlan):
        self.centers.get(center_id);id='CHG-'+uuid.uuid4().hex[:10];data={'id':id,**request.model_dump(),'status':'planned','expected':{}}
        with self.centers.lock,self.centers.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            kind='server' if request.kind=='move-server' else 'component'
            target=self._get(db,center_id,kind,request.target_id);data['expected'][request.target_id]=target['revision']
            if request.kind=='replace-component':
                replacement=self._get(db,center_id,'component',request.replacement_id)
                if replacement['data']['status']!='stock' or target['data']['status']!='installed':raise ValueError('替换需要一个已安装部件和一个在库备件')
                if target['data']['kind']!=replacement['data']['kind']:raise ValueError('只能用同类部件替换')
                data['expected'][request.replacement_id]=replacement['revision']
            elif request.kind=='install-component':
                if target['data']['status']!='stock':raise ValueError('请选择在库部件')
                candidate={**target['data'],'server_id':request.server_id,'slot':request.slot,'status':'installed'}
                self._validate_inventory(db,center_id,'component',candidate)
            elif request.kind=='remove-component' and target['data']['status']!='installed':raise ValueError('请选择已安装部件')
            elif request.kind=='move-server':
                if target['data']['status'] not in {'installed','maintenance'}:raise ValueError('移位只适用于已安装服务器')
                self._validate_inventory(db,center_id,'server',{**target['data'],'rack_id':request.rack_id,'u_start':request.u_start})
            if kind=='component':
                server_id=target['data'].get('server_id') or request.server_id
                s=self._get(db,center_id,'server',server_id);data['expected_server']={'id':server_id,'revision':s['revision']}
            data['before']=target['data'];self._write(db,center_id,'change',data,1)
            self._event(db,center_id,'change-planned',id,request.operator,{'kind':request.kind,'target':request.target_id})
        return self.list(center_id,'change')
    def complete_change(self,center_id,id,request:ChangeComplete,cancel=False):
        with self.centers.lock,self.centers.connect() as db:
            db.execute('BEGIN IMMEDIATE');record=self._get(db,center_id,'change',id);change=record['data']
            if record['revision']!=request.expected_revision or change['status']!='planned':raise RuntimeError('变更状态已更新，不能重复登记')
            if cancel:
                change['status']='cancelled';self._write(db,center_id,'change',change,record['revision']+1)
                self._event(db,center_id,'change-cancelled',id,request.operator,{});return self._rows(db,center_id,'change')
            if not request.compatibility_checked:raise ValueError('请确认现场操作、型号兼容性和维护后验证已完成')
            kind='server' if change['kind']=='move-server' else 'component'
            target=self._get(db,center_id,kind,change['target_id'])
            for target_id,expected in change['expected'].items():
                if self._get(db,center_id,kind,target_id)['revision']!=expected:raise RuntimeError('配置在计划后已改变，请重新建立变更')
            if change.get('expected_server'):
                s=change['expected_server']
                if self._get(db,center_id,'server',s['id'])['revision']!=s['revision']:raise RuntimeError('服务器在计划后已改变，请重新建立变更')
            updated=dict(target['data']);extra=None
            if change['kind']=='move-server':updated.update(rack_id=change['rack_id'],u_start=change['u_start'])
            elif change['kind']=='install-component':updated.update(server_id=change['server_id'],slot=change['slot'],status='installed',installed_at=now())
            elif change['kind']=='remove-component':updated.update(status='stock',server_id='',slot='')
            else:
                replacement=self._get(db,center_id,'component',change['replacement_id']);extra={**replacement['data'],'status':'installed','server_id':updated['server_id'],'slot':updated['slot'],'installed_at':now()};updated.update(status='repair',server_id='',slot='')
                self._validate_inventory(db,center_id,'component',extra,{updated['id']:updated})
            self._validate_inventory(db,center_id,kind,updated)
            self._write(db,center_id,kind,updated,target['revision']+1)
            if extra:self._write(db,center_id,'component',extra,replacement['revision']+1)
            affected=[]
            if kind=='component':
                server=self._get(db,center_id,'server',change['expected_server']['id']);sdata={**server['data'],'measured_w':None};self._write(db,center_id,'server',sdata,server['revision']+1);affected.append(sdata['rack_id'])
            else:affected.extend([change['before']['rack_id'],updated['rack_id']])
            self._invalidate_loads(db,center_id,affected)
            self._increment(db,center_id);change.update(status='recorded',completed_at=now(),completed_by=request.operator,after=extra or updated)
            self._write(db,center_id,'change',change,record['revision']+1);self._event(db,center_id,'change-recorded',id,request.operator,{'before':change['before'],'after':change['after']})
        return self.list(center_id,'change')
    def ingest(self,center_id,request:TelemetryBatch):
        center=self.centers.get(center_id)['data'];zone=ZoneInfo(center['timezone']);source_id=request.source_id or 'SRC-'+uuid.uuid4().hex[:10]
        rows=[]
        targets={'center'}|{a['id'] for a in center['assets']}|{s['id'] for s in self.list(center_id,'server')}
        for r in request.rows:
            if r.target_id not in targets:raise ValueError('测点对象不存在：'+r.target_id)
            try:stamp=datetime.fromisoformat(r.timestamp.replace('Z','+00:00'))
            except ValueError:raise ValueError('时间格式无效，请提供 ISO 日期时间')
            if stamp.tzinfo is None:stamp=stamp.replace(tzinfo=zone)
            rows.append((center_id,source_id,stamp.astimezone(timezone.utc).isoformat(),r.target_id,r.metric,r.value))
        with self.centers.lock,self.centers.connect() as db:
            db.execute('BEGIN IMMEDIATE');before=db.total_changes
            db.executemany('INSERT OR IGNORE INTO measurements VALUES(?,?,?,?,?,?)',rows);count=db.total_changes-before
            total=db.execute('SELECT COUNT(*) FROM measurements WHERE center_id=?',(center_id,)).fetchone()[0]
            if total>1000000:raise ValueError('本地中心测点记录上限 100 万，请分中心或外接时序库')
            metadata={'id':source_id,'name':request.name,'reference':request.reference,'mode':'offline-import','last_ingested':now(),'rows':db.execute('SELECT COUNT(*) FROM measurements WHERE center_id=? AND source_id=?',(center_id,source_id)).fetchone()[0]}
            old=db.execute('SELECT revision FROM inventory WHERE center_id=? AND kind=? AND id=?',(center_id,'source',source_id)).fetchone();self._write(db,center_id,'source',metadata,(old[0] if old else 0)+1)
            self._event(db,center_id,'measurement-import',source_id,'资料导入',{'added':count,'reference':request.reference})
        return {'source':metadata,'added':count}
    def daily(self,center_id,source_id,date):
        center=self.centers.get(center_id)['data'];zone=ZoneInfo(center['timezone'])
        try:day=datetime.strptime(date,'%Y-%m-%d').date()
        except ValueError:raise ValueError('日期应为 YYYY-MM-DD')
        with self.centers.connect() as db:rows=db.execute("SELECT timestamp,metric,value FROM measurements WHERE center_id=? AND source_id=? AND target_id='center' AND metric IN ('it_kw','solar_kw') ORDER BY timestamp",(center_id,source_id)).fetchall()
        buckets={metric:[[] for _ in range(24)] for metric in ['it_kw','solar_kw']}
        for stamp,metric,value in rows:
            local=datetime.fromisoformat(stamp).astimezone(zone)
            if local.date()==day:buckets[metric][local.hour].append(value)
        hourly=[{metric:sum(vals[h])/len(vals[h]) if vals[h] else None for metric,vals in buckets.items()} for h in range(24)]
        return {'date':date,'source_id':source_id,'timezone':str(zone),'hourly':hourly,'aggregation':'每小时已提供样本的算术平均；无样本保持空白'}
