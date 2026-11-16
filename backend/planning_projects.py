"""Project-level planning dossiers. Values are user assertions, never verified facts."""
import json
import sqlite3
import uuid
import hashlib
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime, timezone
from threading import RLock

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Any, Literal


def stamp():
    return datetime.now(timezone.utc).isoformat()


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Evidence(Strict):
    status: Literal['missing','assumed','quoted','verified','blocked'] = 'missing'
    reference: str = Field(default='', max_length=500)
    checked_at: str = Field(default='', max_length=40)
    owner: str = Field(default='', max_length=80)

    @model_validator(mode='after')
    def checked_evidence(self):
        if self.status == 'verified' and not self.reference.strip():
            raise ValueError('已核实资料必须填写依据')
        return self


class Site(Strict):
    address: str = Field(default='', max_length=200)
    park_name: str = Field(default='', max_length=160)
    park_poi_id: str = Field(default='', max_length=100)
    coordinate_system: Literal['WGS84','GCJ02'] = 'WGS84'
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    area_m2: float | None = Field(default=None, ge=0)
    grid_mw: float | None = Field(default=None, ge=0)
    grid_voltage_kv: float | None = Field(default=None, ge=0)
    grid_lead_months: int | None = Field(default=None, ge=0, le=240)
    water_m3_day: float | None = Field(default=None, ge=0)
    network_gbps: float | None = Field(default=None, ge=0)
    latency_ms: float | None = Field(default=None, ge=0)
    grid_substation: str = Field(default='', max_length=120)
    grid_route_a: str = Field(default='', max_length=160)
    grid_route_b: str = Field(default='', max_length=160)
    grid_connection_cost_wan: float | None = Field(default=None, ge=0)
    land_title: str = Field(default='', max_length=200)
    land_use: str = Field(default='', max_length=120)
    building_height_m: float | None = Field(default=None, ge=0)
    floor_load_kn_m2: float | None = Field(default=None, ge=0)
    lease_years: int | None = Field(default=None, ge=0, le=100)
    discharge_m3_day: float | None = Field(default=None, ge=0)
    water_price_yuan_m3: float | None = Field(default=None, ge=0)
    cooling_scheme: str = Field(default='', max_length=120)
    summer_design_c: float | None = None
    carrier_a: str = Field(default='', max_length=100)
    carrier_b: str = Field(default='', max_length=100)
    route_independent: bool | None = None
    fiber_lead_months: int | None = Field(default=None, ge=0, le=240)
    flood_risk: str = Field(default='', max_length=300)
    seismic_risk: str = Field(default='', max_length=300)
    fire_status: str = Field(default='', max_length=300)
    approval_notes: str = Field(default='', max_length=800)
    evidence: dict[str, Evidence] = Field(default_factory=dict)


class CapexLine(Strict):
    amount_wan: float = Field(default=0, ge=0, le=100000000)
    reference: str = Field(default='', max_length=400)


class Phase(Strict):
    name: str = Field(min_length=1, max_length=80)
    opening_month: int = Field(ge=1, le=240)
    build_months: int = Field(default=12, ge=1, le=120)
    it_mw: float = Field(ge=0, le=1000)
    capex_wan: float = Field(ge=0, le=100000000)
    capex_lines: dict[str, CapexLine] = Field(default_factory=dict)


class Finance(Strict):
    horizon_years: int = Field(default=10, ge=1, le=30)
    discount_pct: float = Field(default=10, ge=0, le=100)
    pue: float = Field(default=1.35, ge=1, le=3)
    utilization_pct: float = Field(default=70, ge=0, le=100)
    opening_occupancy_pct: float = Field(default=25, ge=0, le=100)
    mature_occupancy_pct: float = Field(default=75, ge=0, le=100)
    ramp_months: int = Field(default=36, ge=1, le=120)
    electricity_yuan_kwh: float = Field(default=0.65, ge=0, le=10)
    tariff_mode: Literal['flat','components'] = 'flat'
    energy_yuan_kwh: float = Field(default=0.42, ge=0, le=10)
    transmission_yuan_kwh: float = Field(default=0.12, ge=0, le=10)
    loss_yuan_kwh: float = Field(default=0.02, ge=0, le=10)
    system_yuan_kwh: float = Field(default=0.03, ge=0, le=10)
    levy_yuan_kwh: float = Field(default=0.02, ge=0, le=10)
    green_yuan_kwh: float = Field(default=0.04, ge=0, le=10)
    peak_share_pct: float = Field(default=30, ge=0, le=100)
    valley_share_pct: float = Field(default=30, ge=0, le=100)
    peak_multiplier: float = Field(default=1.5, ge=0, le=5)
    valley_multiplier: float = Field(default=0.5, ge=0, le=5)
    demand_fee_wan_mw_month: float = Field(default=0, ge=0)
    power_billing: Literal['included','pass-through'] = 'included'
    revenue_model: Literal['colocation','gpu','mixed','own'] = 'colocation'
    gpu_capacity_pct: float = Field(default=50, ge=0, le=100)
    own_benefit_wan_year: float = Field(default=0, ge=0)
    rent_yuan_kw_month: float = Field(default=750, ge=0)
    gpu_count: int = Field(default=0, ge=0, le=1000000)
    gpu_yuan_hour: float = Field(default=0, ge=0)
    gpu_utilization_pct: float = Field(default=55, ge=0, le=100)
    fixed_opex_wan_year: float = Field(default=300, ge=0)
    variable_opex_yuan_kw_month: float = Field(default=30, ge=0)
    network_wan_year: float = Field(default=80, ge=0)
    water_wan_year: float = Field(default=30, ge=0)
    land_rent_wan_year: float = Field(default=0, ge=0)
    maintenance_capex_pct_year: float = Field(default=1, ge=0, le=100)
    tax_pct: float = Field(default=25, ge=0, le=100)
    loan_pct: float = Field(default=0, ge=0, le=100)
    loan_rate_pct: float = Field(default=4, ge=0, le=100)
    loan_years: int = Field(default=7, ge=1, le=30)


class CustomerDemand(Strict):
    code: str = Field(min_length=1, max_length=80)
    customer: str = Field(default='', max_length=120)
    customer_province: str = Field(default='', max_length=50)
    customer_city: str = Field(default='', max_length=80)
    workload: Literal['inference','training','general','storage','disaster-recovery','edge','other'] = 'general'
    stage: Literal['lead','rfp','intent','contract'] = 'lead'
    it_mw: float = Field(ge=0, le=1000)
    min_delivery_date: str = Field(default='', max_length=40)
    max_latency_ms: float | None = Field(default=None, ge=0, le=100000)
    bandwidth_gbps: float | None = Field(default=None, ge=0)
    movable_pct: float = Field(default=0, ge=0, le=100)
    target_yuan_kw_month: float | None = Field(default=None, ge=0)
    sla: str = Field(default='', max_length=300)
    reference: str = Field(default='', max_length=500)


class Milestone(Strict):
    key: Literal['lead','intent','site','connection','feasibility','investment','construction']
    owner: str = Field(default='', max_length=80)
    planned_date: str = Field(default='', max_length=40)
    actual_date: str = Field(default='', max_length=40)
    blocker: str = Field(default='', max_length=500)


class TechnicalOption(Strict):
    name: str = Field(default='', max_length=80)
    it_mw: float = Field(default=0, ge=0, le=1000)
    rack_count: int = Field(default=0, ge=0, le=100000)
    max_rack_kw: float = Field(default=0, ge=0, le=1000)
    power_scheme: str = Field(default='', max_length=200)
    redundancy: Literal['N','N+1','2N','other'] = 'N+1'
    cooling_scheme: str = Field(default='', max_length=200)
    liquid_pct: float = Field(default=0, ge=0, le=100)
    pue: float = Field(default=1.3, ge=1, le=3)
    capex_wan: float = Field(default=0, ge=0)
    delivery_months: int = Field(default=0, ge=0, le=240)
    assumptions: str = Field(default='', max_length=1000)


class IdcRackInput(Strict):
    kw: float | None = Field(default=None, ge=0)
    count: float | None = Field(default=None, ge=0)
    grossYuanKwMonth: float | None = Field(default=None, ge=0)
    itUsePct: float | None = Field(default=None, ge=0, le=100)
    mechYuanKw: float | None = Field(default=None, ge=0)


class IdcPhaseInput(Strict):
    name: str = Field(default='', max_length=80)
    deliveryMonth: int | None = Field(default=None, ge=1, le=360)
    buildMonths: int = Field(default=12, ge=1, le=120)
    operationYears: int = Field(default=20, ge=1, le=30)
    rack1: IdcRackInput = Field(default_factory=IdcRackInput)
    rack2: IdcRackInput = Field(default_factory=IdcRackInput)
    ramp12Pct: float | None = Field(default=None, ge=0, le=100)
    ramp24Pct: float | None = Field(default=None, ge=0, le=100)
    ramp36Pct: float | None = Field(default=None, ge=0, le=100)
    ramp48Pct: float | None = Field(default=None, ge=0, le=100)
    steadyPct: float | None = Field(default=None, ge=0, le=100)
    bandwidthAttachPct: float | None = Field(default=None, ge=0, le=100)
    bandwidthGrossYuanRackMonth: float | None = Field(default=None, ge=0)
    bandwidthGrossMarginPct: float | None = Field(default=None, ge=0, le=100)
    electricityRecoveryGrossYuanKwh: float | None = Field(default=None, ge=0)
    pueBefore: float | None = Field(default=None, ge=1, le=3)
    pueAfter: float | None = Field(default=None, ge=1, le=3)
    electricityGrossYuanKwh: float | None = Field(default=None, ge=0)
    demandFeeBeforeYuanMonth: float | None = Field(default=None, ge=0)
    demandFeeAfterYuanMonth: float | None = Field(default=None, ge=0)
    waterTonRackMonth: float | None = Field(default=None, ge=0)
    waterGrossYuanTon: float | None = Field(default=None, ge=0)
    facilityStaffBefore: float | None = Field(default=None, ge=0)
    facilityStaffAfter: float | None = Field(default=None, ge=0)
    facilitySalaryYuanMonth: float | None = Field(default=None, ge=0)
    roomStaffBefore: float | None = Field(default=None, ge=0)
    roomStaffAfter: float | None = Field(default=None, ge=0)
    roomSalaryYuanMonth: float | None = Field(default=None, ge=0)
    securityStaff: float | None = Field(default=None, ge=0)
    securitySalaryYuanMonth: float | None = Field(default=None, ge=0)
    cleaningStaff: float | None = Field(default=None, ge=0)
    cleaningSalaryYuanMonth: float | None = Field(default=None, ge=0)
    staffAnnualRisePct: float = Field(default=0, ge=0, le=100)
    rentAreaSqm: float | None = Field(default=None, ge=0)
    rentYuanSqmDay: float | None = Field(default=None, ge=0)
    rentStartMonth: int | None = Field(default=None, ge=1, le=360)
    rentFreeMonths: int = Field(default=0, ge=0, le=120)
    rentRiseEveryYears: int = Field(default=3, ge=1, le=30)
    rentRisePct: float = Field(default=0, ge=0, le=100)
    propertyAreaSqm: float | None = Field(default=None, ge=0)
    propertyYuanSqmDay: float | None = Field(default=None, ge=0)
    propertyRisePct: float = Field(default=0, ge=0, le=100)
    opexMode: Literal['ratio','detailed'] = 'ratio'
    opexRatioBeforePct: float | None = Field(default=None, ge=0, le=100)
    opexRatioAfterPct: float | None = Field(default=None, ge=0, le=100)
    steadyAfterMonth: int = Field(default=36, ge=0, le=120)
    capexTargetYuanKw: float | None = Field(default=None, ge=0)
    gridYuanKw: float | None = Field(default=None, ge=0)
    civilYuanKw: float | None = Field(default=None, ge=0)
    landYuanKw: float | None = Field(default=None, ge=0)
    landAreaMu: float | None = Field(default=None, ge=0)
    propertyPurchaseYuanKw: float | None = Field(default=None, ge=0)
    otherCapexYuan: float = Field(default=0, ge=0)
    batteryReplacementPct: float = Field(default=6.6, ge=0, le=100)
    batteryCycleYears: int = Field(default=5, ge=0, le=30)
    batteryReplacementCount: int = Field(default=3, ge=0, le=10)
    upsReplacementPct: float = Field(default=13.2, ge=0, le=100)
    upsCycleYears: int = Field(default=10, ge=0, le=30)
    upsReplacementCount: int = Field(default=1, ge=0, le=10)
    replacementRisePct: float = Field(default=0, ge=0, le=100)


class IdcModelInput(Strict):
    startYear: int = Field(ge=2000, le=2200)
    phases: list[IdcPhaseInput] = Field(min_length=1, max_length=4)
    discountPct: float | None = Field(default=None, ge=0, le=100)
    loanPct: float | None = Field(default=None, ge=0, le=100)
    loanRatePct: float | None = Field(default=None, ge=0, le=100)
    loanYears: int | None = Field(default=None, ge=1, le=30)
    vatRevenuePct: float = Field(default=6, ge=0, le=100)
    vatMechPct: float = Field(default=13, ge=0, le=100)
    vatConstructionPct: float = Field(default=9, ge=0, le=100)
    vatElectricityPct: float = Field(default=13, ge=0, le=100)
    vatWaterPct: float = Field(default=9, ge=0, le=100)
    vatRentPct: float = Field(default=9, ge=0, le=100)
    vatPropertyPct: float = Field(default=6, ge=0, le=100)
    incomeTaxPct: float = Field(default=25, ge=0, le=100)
    vatSurchargePct: float = Field(default=10, ge=0, le=100)
    propertyTaxDeductionPct: float = Field(default=10, ge=0, le=100)
    propertyTaxPct: float = Field(default=1.2, ge=0, le=100)
    landTaxYuanSqmYear: float = Field(default=3, ge=0)
    reference: dict[str, Any] | None = None


class Project(Strict):
    name: str = Field(min_length=1, max_length=120)
    province: str = Field(default='', max_length=40)
    city: str = Field(default='', max_length=60)
    opportunity_type: str = Field(default='new-build', max_length=40)
    business_model: Literal['colocation','capacity-lease','gpu-service','own','hybrid'] = 'colocation'
    stage: str = Field(default='lead', max_length=40)
    workload: str = Field(default='mixed', max_length=40)
    client: str = Field(default='', max_length=120)
    client_stage: str = Field(default='lead', max_length=40)
    committed_mw: float = Field(default=0, ge=0, le=1000)
    pipeline_mw: float = Field(default=0, ge=0, le=1000)
    owner: str = Field(default='', max_length=80)
    target_date: str = Field(default='', max_length=40)
    note: str = Field(default='', max_length=2000)
    customers: list[CustomerDemand] = Field(default_factory=list, max_length=100)
    milestones: list[Milestone] = Field(default_factory=list, max_length=7)
    technical_options: list[TechnicalOption] = Field(default_factory=list, max_length=6)
    idc_model: IdcModelInput | None = None
    finance_model: Literal['idc','legacy'] = 'legacy'
    site: Site = Field(default_factory=Site)
    phases: list[Phase] = Field(min_length=1, max_length=12)
    finance: Finance = Field(default_factory=Finance)

    @model_validator(mode='after')
    def cross_checks(self):
        if any(phase.opening_month <= phase.build_months for phase in self.phases):
            raise ValueError('投产月必须晚于建设月数')
        if any(phase.opening_month > self.finance.horizon_years * 12 for phase in self.phases):
            raise ValueError('测算期限必须覆盖全部建设期次的投产月')
        if self.finance.peak_share_pct + self.finance.valley_share_pct > 100:
            raise ValueError('峰谷电量占比合计不能超过 100%')
        allowed = {'land','civil','grid','distribution','ups','cooling','fire','racks','it','design','reserve'}
        if any(set(phase.capex_lines)-allowed for phase in self.phases):
            raise ValueError('存在未支持的投资分项')
        codes=[customer.code for customer in self.customers]
        if len(codes)!=len(set(codes)):
            raise ValueError('客户需求编号不可重复')
        milestones=[item.key for item in self.milestones]
        if len(milestones)!=len(set(milestones)):
            raise ValueError('项目里程碑不可重复')
        return self


class ProjectSave(Strict):
    expected_revision: int = Field(default=0, ge=0)
    data: Project


class PlanningProjectRepository:
    def __init__(self, path):
        self.path = path
        self.lock = RLock()
        self.docs = Path(path).parent / 'planning-documents'
        self.docs.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS planning_projects(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS planning_project_revisions(project_id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY(project_id,revision))')
            db.execute('CREATE TABLE IF NOT EXISTS planning_documents(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, gate TEXT NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL)')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
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
            rows = db.execute('SELECT id,revision,data,created_at,updated_at FROM planning_projects ORDER BY updated_at DESC LIMIT 500').fetchall()
        return {'projects': [self._record(row) for row in rows]}

    @staticmethod
    def _record(row):
        return {'id': row['id'], 'revision': row['revision'], 'data': json.loads(row['data']), 'created_at': row['created_at'], 'updated_at': row['updated_at']}

    def save(self, body: ProjectSave, id: str | None = None):
        payload = json.dumps(body.data.model_dump(), ensure_ascii=False)
        with self.lock, self.connect() as db:
            if id:
                row = db.execute('SELECT revision,created_at FROM planning_projects WHERE id=?', (id,)).fetchone()
                if row is None:
                    raise KeyError('项目不存在')
                if row['revision'] != body.expected_revision:
                    raise RuntimeError('项目已由其他操作更新，请刷新后重试')
                revision = row['revision'] + 1
                db.execute('UPDATE planning_projects SET revision=?,data=?,updated_at=? WHERE id=?', (revision, payload, stamp(), id))
            else:
                if body.expected_revision != 0:
                    raise ValueError('新项目版本必须为 0')
                if db.execute('SELECT COUNT(*) FROM planning_projects').fetchone()[0] >= 500:
                    raise ValueError('项目数量已达上限')
                id = 'PLAN-' + uuid.uuid4().hex[:12]
                db.execute('INSERT INTO planning_projects VALUES(?,?,?,?,?)', (id, 1, payload, stamp(), stamp()))
                revision = 1
            db.execute('INSERT INTO planning_project_revisions VALUES(?,?,?,?)',(id,revision,payload,stamp()))
            row = db.execute('SELECT id,revision,data,created_at,updated_at FROM planning_projects WHERE id=?', (id,)).fetchone()
        return self._record(row)

    def history(self,project_id:str):
        with self.connect() as db:
            if not db.execute('SELECT 1 FROM planning_projects WHERE id=?',(project_id,)).fetchone():
                raise KeyError('项目不存在')
            rows=db.execute('SELECT revision,data,saved_at FROM planning_project_revisions WHERE project_id=? ORDER BY revision DESC LIMIT 100',(project_id,)).fetchall()
        return {'versions':[{'revision':row['revision'],'data':json.loads(row['data']),'saved_at':row['saved_at']} for row in rows]}

    def documents(self, project_id: str):
        with self.connect() as db:
            if not db.execute('SELECT 1 FROM planning_projects WHERE id=?', (project_id,)).fetchone():
                raise KeyError('项目不存在')
            rows = db.execute('SELECT id,project_id,gate,filename,mime,size,sha256,created_at FROM planning_documents WHERE project_id=? ORDER BY created_at DESC', (project_id,)).fetchall()
        return {'documents': [dict(row) for row in rows]}

    def add_document(self, project_id: str, gate: str, filename: str, mime: str, contents: bytes):
        allowed = {'.pdf','.png','.jpg','.jpeg','.xlsx','.xls','.csv','.docx','.dwg','.dxf','.ifc'}
        name = Path(filename).name
        if not name or Path(name).suffix.lower() not in allowed:
            raise ValueError('不支持该附件格式')
        if not gate or len(gate) > 40 or not gate.replace('-', '').isalnum():
            raise ValueError('资料类别无效')
        if not contents or len(contents) > 20_000_000:
            raise ValueError('单个附件需在 20 MB 以内')
        document_id = 'DOC-' + uuid.uuid4().hex
        path = self.docs / document_id
        with self.lock, self.connect() as db:
            if not db.execute('SELECT 1 FROM planning_projects WHERE id=?', (project_id,)).fetchone():
                raise KeyError('项目不存在')
            if db.execute('SELECT COUNT(*) FROM planning_documents WHERE project_id=?', (project_id,)).fetchone()[0] >= 200:
                raise ValueError('项目附件已达上限')
            path.write_bytes(contents)
            try:
                db.execute('INSERT INTO planning_documents VALUES(?,?,?,?,?,?,?,?)', (document_id, project_id, gate, name[:200], mime[:100], len(contents), hashlib.sha256(contents).hexdigest(), stamp()))
            except Exception:
                path.unlink(missing_ok=True)
                raise
        return {'id':document_id,'gate':gate,'filename':name[:200],'size':len(contents),'sha256':hashlib.sha256(contents).hexdigest()}

    def document_path(self, project_id: str, document_id: str):
        with self.connect() as db:
            row = db.execute('SELECT filename,mime FROM planning_documents WHERE project_id=? AND id=?', (project_id,document_id)).fetchone()
        if row is None:
            raise KeyError('附件不存在')
        return self.docs / document_id,row['filename'],row['mime']
