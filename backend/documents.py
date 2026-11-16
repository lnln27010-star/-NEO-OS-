import hashlib
import json
import re
import subprocess
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from pydantic import Field
from backend.models import Strict
from backend.foundation import Center,Asset,Cable,Space,SaveCenter,CenterRepository,now,quality
from backend.operations import OperationsRepository,ServerRecord,ComponentRecord,TelemetryBatch

class DocumentMeta(Strict):
    title:str=Field(min_length=1,max_length=150)
    discipline:str=Field(default='asset',max_length=40)
    stage:str=Field(default='as-built',pattern=r'^(design|as-built|operations)$')
    number:str=Field(default='',max_length=100)
    version:str=Field(default='',max_length=60)
    supplier:str=Field(default='',max_length=100)
    effective_date:str=Field(default='',max_length=40)

class ImportMapping(Strict):
    table:int=Field(default=0,ge=0,le=19)
    target:str=Field(pattern=r'^(assets|cables|spaces|servers|components|measurements)$')
    mapping:dict[str,str]=Field(default_factory=dict,max_length=60)
    constants:dict[str,str|float|int|bool]=Field(default_factory=dict,max_length=20)
    scales:dict[str,float]=Field(default_factory=dict,max_length=40)
    expected_revision:int=Field(ge=1)
    expected_inventory_revision:int=Field(default=0,ge=0)
    operator:str=Field(min_length=1,max_length=80)

class DocumentRepository:
    def __init__(self,centers:CenterRepository,ops:OperationsRepository,root:Path):
        self.centers=centers;self.ops=ops;self.root=root;root.mkdir(parents=True,exist_ok=True);self.pool=ThreadPoolExecutor(max_workers=2,thread_name_prefix='document')
        with centers.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,center_id TEXT,data TEXT)')
            for id,raw in db.execute('SELECT id,data FROM documents').fetchall():
                data=json.loads(raw)
                if data['status']=='processing':data.update(status='failed',error='服务重启，解析已中断，可重新解析');db.execute('UPDATE documents SET data=? WHERE id=?',(json.dumps(data,ensure_ascii=False),id))
    def list(self,center_id):
        self.centers.get(center_id)
        with self.centers.connect() as db:return sorted([json.loads(r[0]) for r in db.execute('SELECT data FROM documents WHERE center_id=?',(center_id,))],key=lambda d:d['created_at'],reverse=True)
    def get(self,center_id,id):
        with self.centers.connect() as db:row=db.execute('SELECT data FROM documents WHERE center_id=? AND id=?',(center_id,id)).fetchone()
        if not row:raise ValueError('资料文件不存在')
        return json.loads(row[0])
    def _save(self,data):
        with self.centers.connect() as db:db.execute('INSERT OR REPLACE INTO documents VALUES(?,?,?)',(data['id'],data['center_id'],json.dumps(data,ensure_ascii=False)))
    def _queue_available(self):
        with self.centers.connect() as db:count=sum(json.loads(r[0]).get('status')=='processing' for r in db.execute('SELECT data FROM documents'))
        if count>=6:raise ValueError('解析队列已满，请等待已有文件完成')
    def upload(self,center_id,name,raw,meta):
        self.centers.get(center_id);ext=Path(name).suffix.lower()
        if ext not in {'.pdf','.ifc','.dxf','.xlsx','.csv','.json','.dwg','.png','.jpg','.jpeg'}:raise ValueError('支持 IFC、DXF、PDF、XLSX、CSV、JSON 及图纸图片')
        if not raw or len(raw)>40_000_000:raise ValueError('文件不能为空且不能超过 40 MB')
        if ext=='.pdf' and b'%PDF-' not in raw[:1024]:raise ValueError('不是有效 PDF 文件')
        if ext=='.ifc' and b'ISO-10303-21' not in raw[:1024]:raise ValueError('不是 IFC STEP 文件')
        if len(self.list(center_id))>=100:raise ValueError('每中心最多保留 100 个资料文件')
        self._queue_available()
        id=uuid.uuid4().hex;folder=self.root/id;folder.mkdir();(folder/('source'+ext)).write_bytes(raw)
        data={'id':id,'center_id':center_id,**meta.model_dump(),'filename':Path(name).name[:200],'ext':ext,'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'created_at':now(),'status':'processing','error':'','tables':[],'warnings':[]}
        self._save(data);self.pool.submit(self.extract,center_id,id);return data
    def retry(self,center_id,id):
        data=self.get(center_id,id)
        if data['status']=='processing':raise ValueError('文件正在解析')
        self._queue_available();data.update(status='processing',error='',tables=[],warnings=[]);self._save(data);self.pool.submit(self.extract,center_id,id);return data
    def extract(self,center_id,id):
        data=self.get(center_id,id);folder=self.root/id
        try:
            result=subprocess.run([sys.executable,'-m','backend.document_parser',str(folder/('source'+data['ext'])),str(folder/'parsed.json')],cwd=Path(__file__).resolve().parents[1],capture_output=True,timeout=60,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            parsed=json.loads((folder/'parsed.json').read_text(encoding='utf-8'))
            if result.returncode or parsed.get('error'):raise ValueError(parsed.get('error') or '解析失败')
            data.update(status='ready' if parsed.get('tables') else 'reference',tables=[{'name':t['name'],'columns':t['columns'],'rows':len(t['rows']),'suggested':t['suggested']} for t in parsed['tables']],warnings=parsed['warnings'],parsed_at=now())
        except Exception as e:data.update(status='failed',error=str(e)[:1000])
        self._save(data)
    def parsed(self,center_id,id):
        self.get(center_id,id)
        try:return json.loads((self.root/id/'parsed.json').read_text(encoding='utf-8'))
        except FileNotFoundError:raise ValueError('资料尚未解析完成')
    def file(self,center_id,id):
        data=self.get(center_id,id);return self.root/id/('source'+data['ext']),data
    def preview(self,center_id,id,request:ImportMapping):
        current=self.centers.get(center_id)
        if current['revision']!=request.expected_revision:raise RuntimeError('中心资料已变化，请刷新后重新预览')
        if request.target in {'servers','components'} and self.centers.publication(center_id)['inventory_revision']!=request.expected_inventory_revision:raise RuntimeError('服务器配置已变化，请刷新后重新预览')
        doc=self.get(center_id,id);parsed=self.parsed(center_id,id)
        if doc['status']!='ready':raise ValueError('文件尚未形成可审核表格，请等待解析完成')
        if request.table>=len(parsed['tables']):raise ValueError('提取表不存在')
        t=parsed['tables'][request.table];target=request.target
        if any(column not in t['columns'] for column in request.mapping.values()):raise ValueError('映射源列不存在')
        model_type={'assets':Asset,'cables':Cable,'spaces':Space,'servers':ServerRecord,'components':ComponentRecord}.get(target)
        numbers={'capacity','x','z','rack_units','measured_kw','rated_kva','rated_current_a','hv_kv','lv_kv','power_factor','vk_percent','vkr_percent','pfe_kw','i0_percent','ups_loss_percent','length_m','r_ohm_km','x_ohm_km','max_i_ka','parallel','cores','cross_section_mm2','area_m2','height_m','u_start','u_height','measured_w','power_limit_w','rated_w','capacity_gb','value'}
        integers={'rack_units','parallel','cores','u_start','u_height'};booleans={'enabled','installed','in_service','position_verified'}
        existing={r['id']:r for r in current['data'].get(target,[])} if target in {'assets','cables','spaces'} else {r['id']:r['data'] for r in self.ops.list(center_id,'server' if target=='servers' else 'component')} if target in {'servers','components'} else {}
        records=[];errors=[];changes=[];seen=set()
        from backend.models import Nameplate
        allowed=set(model_type.model_fields) | set(Nameplate.model_fields) if model_type else {'timestamp','target_id','metric','value'}
        if any(k not in allowed for k in {*request.mapping,*request.constants}):raise ValueError('目标字段无效')
        for i,row in enumerate(t['rows']):
            values={key:row.get(column,'') for key,column in request.mapping.items()};values.update(request.constants)
            values={key:value for key,value in values.items() if value is not None and str(value).strip()!=''}
            try:
                for key in list(values):
                    if key=='kind':
                        labels={'机柜':'rack','服务器机柜':'rack','风冷机柜':'rack','液冷机柜':'rack','变压器':'transformer','低压配电柜':'lv-panel','低压柜':'lv-panel','不间断电源':'ups','UPS':'ups','PDU':'pdu','PDU配电柜':'pdu','母线槽':'busbar','母线':'busbar','精密空调':'crac','CDU':'cdu','冷水机组':'chiller','冷冻水泵':'chw-pump','冷却水泵':'cw-pump','冷却塔':'cooling-tower','电池柜':'battery','柴油发电机':'generator','网络机柜':'network','配电列头柜':'rpp'} if target=='assets' else {'CPU':'cpu','GPU':'gpu','显卡':'gpu','GPU加速卡':'gpu','内存':'memory','内存条':'memory','硬盘':'disk','SSD':'disk','网卡':'nic','电源':'psu'}
                        values[key]=labels.get(str(values[key]).strip(),values[key])
                    if key=='port':values[key]={'A':'powerA','A路':'powerA','A路供电':'powerA','B':'powerB','B路':'powerB','B路供电':'powerB','供水':'supply','回水':'return','网络':'network'}.get(str(values[key]).strip(),values[key])
                    if key=='status':values[key]={'在库':'stock','在库备件':'stock','待定位':'unlocated','已安装':'installed','运行中':'installed','计划上架':'planned','维护中':'maintenance','已退役':'retired','待维修':'repair'}.get(str(values[key]).strip(),values[key])
                    if key in numbers:
                        raw=str(values[key]).strip();percent=key=='power_factor' and raw.endswith('%');number=float(raw.rstrip('%') if percent else raw)
                        if percent:number/=100
                        factor=request.scales.get(key,1)
                        if factor<=0 or factor>1000000:raise ValueError('数值倍率必须大于 0 且不超过 1000000')
                        number*=factor
                        if key in integers and not number.is_integer():raise ValueError(key+' 必须为整数')
                        values[key]=int(number) if key in integers else number
                    if key in booleans:
                        raw=str(values[key]).casefold()
                        if raw not in {'true','false','1','0','是','否'}:raise ValueError(key+' 布尔值无效')
                        values[key]=raw in {'true','1','是'}
                if target=='measurements':
                    from backend.operations import TelemetryRow
                    item=TelemetryRow.model_validate(values).model_dump();records.append(item);continue
                record_id=values.get('id')
                if not record_id:raise ValueError('缺少编号映射')
                if record_id in seen:raise ValueError('文件内编号重复：'+str(record_id))
                seen.add(record_id);old=existing.get(record_id)
                if not old and target=='cables' and any(not values.get(k) for k in ['source','target','port']):raise ValueError('新增接线必须明确上游设备、下游设备和接入端口')
                if not old and target in {'servers','components'} and 'status' not in values:raise ValueError('新增配置必须明确状态：在库、待定位或已安装')
                if not old and target=='components' and 'kind' not in values:raise ValueError('新增部件必须明确 CPU、GPU、内存等类别')
                if not old and target=='servers' and values.get('status') in {'installed','maintenance','planned'} and any(k not in values for k in ['rack_id','u_start','u_height']):raise ValueError('已安装或计划上架的服务器需明确机柜、起始 U 位和占用 U 数')
                if target=='assets' and 'capacity' not in values and 'rated_kva' in values and 'power_factor' in values:values['capacity']=values['rated_kva']*values['power_factor']
                if target=='assets' and 'capacity' not in values and all(k in values for k in ['rated_current_a','lv_kv','power_factor']):values['capacity']=3**.5*values['rated_current_a']*values['lv_kv']*values['power_factor']
                if not old and target=='assets' and values.get('kind')=='rack' and 'rack_units' not in values:raise ValueError('新增机柜必须明确 U 位容量，可对同规格清册统一指定')
                mapped_fields=list(values)
                if target=='assets':
                    plate={k:values.pop(k) for k in list(values) if k in Nameplate.model_fields}
                    if not old and ('capacity' not in values or 'kind' not in values):raise ValueError('新增设备需提供类型与额定容量，不能使用猜测值')
                    item={**(old or {}),**values,'source':'document','nameplate':{**(old or {}).get('nameplate',{}),**plate},'provenance':{'document_id':id,'sha256':doc['sha256'],'table':t['name'],'row':str(i+2),'page':str(row.get('source_page','')),'entity':str(row.get('ifc_guid') or row.get('entity_handle') or '')}}
                else:item={**(old or {}),**values}
                if target=='cables':item['origin']='document'
                if target in {'servers','components'}:
                    item['source']='discovered' if 'Redfish' in t['name'] else 'document'
                    if old and item['source']=='discovered' and values.get('status')=='unlocated' and 'status' not in request.constants:item['status']=old['status']
                item=model_type.model_validate(item).model_dump();records.append(item)
                diff=[]
                for key in mapped_fields:
                    before=(old or {}).get('nameplate',{}).get(key) if key in Nameplate.model_fields else (old or {}).get(key)
                    after=item.get('nameplate',{}).get(key) if key in Nameplate.model_fields else item.get(key)
                    if before!=after:diff.append({'field':key,'before':before,'after':after})
                changes.append({'id':item['id'],'action':'update' if old else 'add','fields':[d['field'] for d in diff],'diff':diff})
            except Exception as e:errors.append({'row':i+2,'message':str(e)[:300]})
        candidate=None
        if target in {'assets','cables','spaces'} and not errors:
            merged={r['id']:r for r in current['data'][target]};merged.update({r['id']:r for r in records});candidate=Center.model_validate({**current['data'],target:list(merged.values())})
            q=quality(candidate)
            errors.extend({'row':0,'message':issue['message']+' '+issue['record']} for issue in q['issues'] if issue['severity']=='error')
        if target in {'servers','components'} and not errors:
            try:
                with self.centers.connect() as db:self.ops.validate_bulk(db,center_id,'server' if target=='servers' else 'component',records)
            except ValueError as e:errors.append({'row':0,'message':str(e)})
        return {'count':len(records),'changes':changes[:200],'errors':errors[:200],'error_count':len(errors),'records':records,'candidate':candidate.model_dump() if candidate else None,'reference':doc['filename']+' / '+doc['sha256']}
    def apply(self,center_id,id,request):
        with self.centers.lock:return self._apply_locked(center_id,id,request)
    def _apply_locked(self,center_id,id,request):
        result=self.preview(center_id,id,request)
        if result['error_count']:raise ValueError('请先修正导入预览中的错误')
        if not result['records']:raise ValueError('没有可导入记录')
        if result['candidate']:
            saved=self.centers.save(SaveCenter(expected_revision=request.expected_revision,data=Center.model_validate(result['candidate'])))
            with self.centers.connect() as db:self.ops._event(db,center_id,'document-import',id,request.operator,{'target':request.target,'count':result['count'],'revision':saved['revision'],'reference':result['reference']})
            return {'count':result['count'],'center_revision':saved['revision']}
        if request.target=='measurements':return self.ops.ingest(center_id,TelemetryBatch(name=self.get(center_id,id)['title'],reference=result['reference'],rows=result['records']))
        return self.ops.bulk_save(center_id,'server' if request.target=='servers' else 'component',result['records'],request.operator,result['reference'])
