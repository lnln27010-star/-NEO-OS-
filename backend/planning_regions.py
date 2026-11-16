"""Auditable region-level evidence for screening. User supplied; not an official feed."""
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from backend.planning_demand import PROVINCES


class RegionSignal(BaseModel):
    model_config = ConfigDict(extra='forbid')
    province: str = Field(min_length=2, max_length=50)
    city: str = Field(default='', max_length=80)
    dimension: Literal['grid','land','water','network','policy','demand','risk','tariff','solar','wind']
    metric: str = Field(min_length=2, max_length=100)
    value: float | None = None
    text: str = Field(default='', max_length=1000)
    unit: str = Field(default='', max_length=30)
    status: Literal['lead','public','quoted','verified','blocked'] = 'lead'
    source: str = Field(min_length=2, max_length=500)
    as_of: str = Field(min_length=7, max_length=40)
    valid_until: str = Field(default='', max_length=40)
    owner: str = Field(default='', max_length=80)

    @model_validator(mode='after')
    def check_source(self):
        if self.province not in PROVINCES:raise ValueError('省份名称不在 31 个省级区域清单内')
        try:
            date.fromisoformat(self.as_of)
            if self.valid_until:date.fromisoformat(self.valid_until)
        except ValueError:raise ValueError('资料日期应为 YYYY-MM-DD')
        if self.value is None and not self.text.strip():raise ValueError('数值和文字说明至少填写一项')
        return self


class RegionBatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    rows: list[RegionSignal] = Field(min_length=1, max_length=500)


class RegionRepository:
    def __init__(self,path:Path):
        self.path=path
        self.lock=RLock()
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS planning_region_signals(id TEXT PRIMARY KEY, province TEXT NOT NULL, city TEXT NOT NULL, dimension TEXT NOT NULL, metric TEXT NOT NULL, source TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(province,city,dimension,metric,source))')

    @contextmanager
    def connect(self):
        db=sqlite3.connect(self.path,timeout=10)
        db.row_factory=sqlite3.Row
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def list(self):
        with self.connect() as db:
            rows=db.execute('SELECT id,data,updated_at FROM planning_region_signals ORDER BY updated_at DESC LIMIT 3000').fetchall()
        return {'signals':[{'id':r['id'],**json.loads(r['data']),'updated_at':r['updated_at']} for r in rows]}

    def import_batch(self,batch:RegionBatch):
        timestamp=datetime.now(timezone.utc).isoformat()
        with self.lock,self.connect() as db:
            total=db.execute('SELECT COUNT(*) FROM planning_region_signals').fetchone()[0]
            if total+len(batch.rows)>3500:raise ValueError('区域证据库容量已达上限')
            created=updated=0
            for row in batch.rows:
                existing=db.execute('SELECT id FROM planning_region_signals WHERE province=? AND city=? AND dimension=? AND metric=? AND source=?',(row.province,row.city,row.dimension,row.metric,row.source)).fetchone()
                if existing:
                    db.execute('UPDATE planning_region_signals SET data=?,updated_at=? WHERE id=?',(row.model_dump_json(),timestamp,existing['id']))
                    updated+=1
                else:
                    db.execute('INSERT INTO planning_region_signals VALUES(?,?,?,?,?,?,?,?)',('REG-'+uuid.uuid4().hex[:12],row.province,row.city,row.dimension,row.metric,row.source,row.model_dump_json(),timestamp))
                    created+=1
        return {'created':created,'updated':updated,'total':len(batch.rows)}
