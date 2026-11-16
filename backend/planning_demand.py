"""Local, evidence-linked customer demand import for national site planning."""
import hashlib
import json
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import Field,model_validator

from backend.foundation import CenterRepository,now
from backend.models import Strict

PROVINCES={row['province'] for row in json.loads((Path(__file__).resolve().parents[1]/'public/data/planning-climate.json').read_text(encoding='utf-8'))['rows']}


class DemandRecord(Strict):
    province:str=Field(min_length=2,max_length=30)
    workload:Literal['inference','training','general','storage','other']
    stage:Literal['contract','rfp','pipeline']
    capacity_mw:float=Field(gt=0,le=100000)
    latency_ms:float|None=Field(default=None,ge=0,le=10000)
    reference:str=Field(min_length=3,max_length=180)
    as_of:str=Field(min_length=10,max_length=10)
    customer_code:str=Field(min_length=3,max_length=80)

    @model_validator(mode='after')
    def valid(self):
        if self.province not in PROVINCES:raise ValueError('省份名称不在 31 个省级区域清单内')
        try:date.fromisoformat(self.as_of)
        except ValueError:raise ValueError('资料日期应为 YYYY-MM-DD')
        return self


class DemandBatch(Strict):
    operator:str=Field(min_length=1,max_length=80)
    records:list[DemandRecord]=Field(min_length=1,max_length=500)


class PlanningDemandRepository:
    def __init__(self,centers:CenterRepository):
        self.centers=centers
        with centers.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS planning_demand(id TEXT PRIMARY KEY,province TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS planning_demand_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,record_id TEXT NOT NULL,operator TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL)')

    def list(self):
        with self.centers.connect() as db:
            records=[json.loads(row[0]) for row in db.execute('SELECT data FROM planning_demand LIMIT 5000')]
        records.sort(key=lambda record:record.get('updated_at',record['created_at']),reverse=True)
        aggregate={}
        for record in records:
            group=aggregate.setdefault(record['province'],{'contract_mw':0.,'rfp_mw':0.,'pipeline_mw':0.,'count':0})
            group[record['stage']+'_mw']+=record['capacity_mw']
            group['count']+=1
        return {'records':records,'aggregate':aggregate,'source':'用户导入的内部需求证据；阶段由提供者标注，未连接 CRM 或自动验证合同'}

    def import_batch(self,batch:DemandBatch):
        prepared=[]
        for row in batch.records:
            data=row.model_dump()
            digest=hashlib.sha256(json.dumps([data['province'],data['customer_code']],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()[:24]
            prepared.append(('DEM-'+digest,data))
        if len({item[0] for item in prepared})!=len(prepared):raise ValueError('导入文件含重复需求证据')
        added=0;updated=0;skipped=0
        with self.centers.lock,self.centers.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT COUNT(*) FROM planning_demand').fetchone()[0]+len(prepared)>5000:raise ValueError('需求证据记录已达上限')
            for record_id,data in prepared:
                existing=db.execute('SELECT data FROM planning_demand WHERE id=?',(record_id,)).fetchone()
                if existing:
                    previous=json.loads(existing[0])
                    if not any(previous[key]!=data[key] for key in data):skipped+=1;continue
                    if data['as_of']<=previous['as_of']:raise ValueError(f'{record_id} 已有同日或更新的资料，请核对项目编号与日期')
                    stamp=now();record={'id':record_id,**data,'created_at':previous['created_at'],'updated_at':stamp,'revision':previous.get('revision',1)+1,'operator':batch.operator.strip()}
                    db.execute('UPDATE planning_demand SET data=? WHERE id=?',(json.dumps(record,ensure_ascii=False),record_id))
                    db.execute('INSERT INTO planning_demand_audit(record_id,operator,action,details,created_at) VALUES(?,?,?,?,?)',(record_id,batch.operator.strip(),'update',json.dumps({'before':previous,'after':record},ensure_ascii=False),stamp))
                    updated+=1
                    continue
                stamp=now();record={'id':record_id,**data,'created_at':stamp,'updated_at':stamp,'revision':1,'operator':batch.operator.strip()}
                db.execute('INSERT INTO planning_demand VALUES(?,?,?,?)',(record_id,data['province'],json.dumps(record,ensure_ascii=False),stamp))
                db.execute('INSERT INTO planning_demand_audit(record_id,operator,action,details,created_at) VALUES(?,?,?,?,?)',(record_id,batch.operator.strip(),'import',json.dumps({'province':data['province'],'reference':data['reference']},ensure_ascii=False),stamp))
                added+=1
        return {'added':added,'updated':updated,'skipped':skipped,**self.list()}
