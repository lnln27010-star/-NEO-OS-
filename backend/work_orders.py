"""Audited, manually reported equipment work orders. No device-control actions."""
import json
import uuid
from typing import Literal

from pydantic import Field

from backend.foundation import CenterRepository,now
from backend.models import Strict


class OrderCreate(Strict):
    asset_id:str=Field(min_length=1,max_length=64)
    summary:str=Field(min_length=5,max_length=500)
    evidence:str=Field(min_length=5,max_length=1000)
    owner:str=Field(min_length=1,max_length=80)
    severity:Literal['low','medium','high']='medium'
    due_at:str=Field(default='',max_length=40)


class OrderAction(Strict):
    expected_revision:int=Field(ge=1)
    action:Literal['start','request-review','close']
    operator:str=Field(min_length=1,max_length=80)
    evidence:str=Field(min_length=5,max_length=1500)


class WorkOrderRepository:
    def __init__(self,centers:CenterRepository):
        self.centers=centers
        with centers.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS work_orders(id TEXT PRIMARY KEY,center_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL)')

    def list(self,center_id:str):
        self.centers.get(center_id)
        with self.centers.connect() as db:
            rows=db.execute('SELECT data FROM work_orders WHERE center_id=? ORDER BY updated_at DESC LIMIT 500',(center_id,)).fetchall()
        return [json.loads(row[0]) for row in rows]

    @staticmethod
    def _audit(db,center_id,action,order_id,operator,details):
        db.execute('INSERT INTO audit(center_id,action,record_id,operator,details,created_at) VALUES(?,?,?,?,?,?)',(center_id,action,order_id,operator,json.dumps(details,ensure_ascii=False),now()))

    def create(self,center_id:str,request:OrderCreate):
        with self.centers.lock,self.centers.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT data FROM centers WHERE id=?',(center_id,)).fetchone()
            if not row:raise KeyError('数据中心不存在')
            center=json.loads(row[0])
            if center['archived']:raise ValueError('已归档基地不能新增工单')
            asset=next((item for item in center['assets'] if item['id']==request.asset_id),None)
            if not asset:raise ValueError('设备不在当前基地档案中')
            if db.execute('SELECT COUNT(*) FROM work_orders').fetchone()[0]>=20000:raise ValueError('本机工单记录已达上限')
            timestamp=now()
            record={'id':'WO-'+uuid.uuid4().hex[:12],'center_id':center_id,'asset_id':asset['id'],'asset_name':asset['name'],'asset_source':asset['source'],'summary':request.summary.strip(),'reported_evidence':request.evidence.strip(),'owner':request.owner.strip(),'severity':request.severity,'due_at':request.due_at,'status':'reported','revision':1,'events':[{'action':'reported','operator':request.owner.strip(),'evidence':request.evidence.strip(),'at':timestamp}],'created_at':timestamp,'updated_at':timestamp}
            db.execute('INSERT INTO work_orders VALUES(?,?,?,?,?)',(record['id'],center_id,1,json.dumps(record,ensure_ascii=False),timestamp))
            self._audit(db,center_id,'work-order-reported',record['id'],request.owner,{'asset_id':request.asset_id,'severity':request.severity})
        return record

    def act(self,center_id:str,order_id:str,request:OrderAction):
        transitions={'reported':('start','in_progress'),'in_progress':('request-review','review'),'review':('close','closed')}
        with self.centers.lock,self.centers.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT revision,data FROM work_orders WHERE center_id=? AND id=?',(center_id,order_id)).fetchone()
            if not row:raise KeyError('工单不存在')
            revision,raw=row
            if revision!=request.expected_revision:raise RuntimeError('工单已被更新，请刷新后再操作')
            record=json.loads(raw)
            expected=transitions.get(record['status'])
            if not expected or request.action!=expected[0]:raise ValueError('工单状态不允许此操作')
            if request.action=='close' and request.operator.strip()==record['owner']:raise ValueError('闭环复核人需与责任人不同')
            timestamp=now()
            record['status']=expected[1]
            record['revision']=revision+1
            record['updated_at']=timestamp
            record['events'].append({'action':request.action,'operator':request.operator.strip(),'evidence':request.evidence.strip(),'at':timestamp})
            db.execute('UPDATE work_orders SET revision=?,data=?,updated_at=? WHERE id=?',(revision+1,json.dumps(record,ensure_ascii=False),timestamp,order_id))
            self._audit(db,center_id,'work-order-'+request.action,order_id,request.operator,{'status':record['status'],'evidence':request.evidence.strip()})
        return record
