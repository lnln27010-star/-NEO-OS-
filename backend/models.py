from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Engine = Literal['pandapower', 'pypsa', 'openfoam', 'fenicsx']
Kind = Literal['rack','cdu','ups','rpp','network','chiller','generator','transformer','lv-panel','battery','chw-pump','cw-pump','crac','pdu','cooling-tower','pipe','busbar']

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class Nameplate(Strict):
    rated_kva: float | None = Field(default=None, gt=0, le=200000)
    hv_kv: float | None = Field(default=None, ge=1, le=500)
    lv_kv: float | None = Field(default=None, ge=.1, le=1)
    power_factor: float | None = Field(default=None, ge=.7, le=1)
    vk_percent: float | None = Field(default=None, gt=.1, le=30)
    vkr_percent: float | None = Field(default=None, gt=0, le=5)
    pfe_kw: float | None = Field(default=None, ge=0, le=1000)
    i0_percent: float | None = Field(default=None, ge=0, le=10)
    ups_loss_percent: float | None = Field(default=None, ge=0, le=10)
    rated_current_a: float | None = Field(default=None, gt=0, le=100000)

    @model_validator(mode='after')
    def impedance(self):
        if self.vkr_percent is not None and self.vk_percent is not None and self.vkr_percent>self.vk_percent:
            raise ValueError('电阻分量不能大于短路阻抗')
        return self

class Circuit(Strict):
    id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')
    source: str = Field(max_length=64)
    target: str = Field(max_length=64)
    port: Literal['powerA','powerB']
    length_m: float = Field(gt=0, le=100000)
    r_ohm_km: float = Field(gt=0, le=50)
    x_ohm_km: float = Field(ge=0, le=50)
    max_i_ka: float = Field(gt=0, le=30)
    parallel: int = Field(default=1, ge=1, le=100)
    in_service: bool = True

class Device(Strict):
    id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')
    kind: Kind
    x: float = Field(ge=-200, le=200)
    z: float = Field(ge=-200, le=200)
    yaw: float = Field(default=0, ge=-10000, le=10000)
    installed: bool = True
    enabled: bool = True
    operating: bool | None = None
    cooling_ready: bool | None = None
    capacity: float = Field(gt=0, le=100000)
    pod: int = Field(default=-1, ge=-1, le=3)
    cooling_mode: Literal['air','liquid'] = 'air'
    power_a: bool = True
    power_b: bool = True
    custom_connections: bool = False
    connections: dict[Literal['powerA','powerB','supply','return','network'], str] = Field(default_factory=dict)
    demand_kw: float = Field(default=0, ge=0, le=100000)
    heat_air_kw: float = Field(default=0, ge=0, le=100000)
    heat_water_kw: float = Field(default=0, ge=0, le=100000)
    flow_lpm: float = Field(default=0, ge=0, le=100000)
    nameplate: Nameplate | None = None

class Snapshot(Strict):
    revision: str = Field(default='', max_length=128)
    devices: list[Device] = Field(default_factory=list, max_length=2500)
    load_percent: float = Field(default=70, ge=0, le=100)
    scenario: str = Field(default='baseline', max_length=40)
    seconds: float = Field(default=0, ge=0, le=36000)

    @model_validator(mode='after')
    def unique_ids(self):
        ids = [d.id for d in self.devices]
        if len(ids) != len(set(ids)):
            raise ValueError('设备编号重复')
        return self

class Electrical(Strict):
    analysis: Literal['power_flow','power_flow_short_circuit'] = 'power_flow'
    hv_kv: float = Field(default=10, ge=1, le=500)
    lv_kv: float = Field(default=.415, ge=.1, le=1)
    power_factor: float = Field(default=.98, ge=.7, le=1)
    transformer_vk_percent: float = Field(default=6, gt=.1, le=30)
    transformer_vkr_percent: float = Field(default=.7, gt=0, le=5)
    cable_r_ohm_km: float = Field(default=.08, gt=0, le=10)
    cable_x_ohm_km: float = Field(default=.08, ge=0, le=10)
    cable_max_i_ka: float = Field(default=1, gt=.01, le=20)
    ups_loss_percent: float = Field(default=2, ge=0, le=10)
    circuits: list[Circuit] = Field(default_factory=list, max_length=5000)
    explicit_circuits: bool = False
    grid_short_circuit_mva: float = Field(default=500, gt=0, le=100000)
    @model_validator(mode='after')
    def transformer_impedance(self):
        if self.transformer_vkr_percent>self.transformer_vk_percent:raise ValueError('变压器电阻分量不能大于短路阻抗')
        return self

class DispatchSite(Strict):
    id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')
    name: str = Field(max_length=80)
    capacity_mw: float = Field(gt=0, le=1000)
    grid_mw: float = Field(gt=0, le=2000)
    price_yuan_kwh: float = Field(gt=0, le=10)
    pue: float = Field(default=1.25, ge=1, le=3)
    solar_mw: float = Field(default=0, ge=0, le=1000)
    hourly_prices: list[float] | None = Field(default=None, min_length=24, max_length=24)
    hourly_it_mw: list[float] | None = Field(default=None, min_length=24, max_length=24)
    hourly_solar_mw: list[float] | None = Field(default=None, min_length=24, max_length=24)
    battery_mwh: float | None = Field(default=None, ge=0, le=10000)
    battery_mw: float | None = Field(default=None, ge=0, le=1000)

    @model_validator(mode='after')
    def hourly_bounds(self):
        for key,limit in [('hourly_prices',10),('hourly_it_mw',1000),('hourly_solar_mw',1000)]:
            values=getattr(self,key)
            if values is not None and any(not __import__('math').isfinite(v) or v<0 or v>limit for v in values):raise ValueError(key+' 超出允许范围')
        return self

def default_sites():
    return [DispatchSite(id='A',name='当前园区',capacity_mw=12,grid_mw=18,price_yuan_kwh=.68,pue=1.3,solar_mw=2),
            DispatchSite(id='B',name='候选节点 B',capacity_mw=16,grid_mw=20,price_yuan_kwh=.42,pue=1.2,solar_mw=5),
            DispatchSite(id='C',name='候选节点 C',capacity_mw=10,grid_mw=14,price_yuan_kwh=.61,pue=1.25,solar_mw=3)]

class Dispatch(Strict):
    sites: list[DispatchSite] = Field(default_factory=default_sites, min_length=1, max_length=12)
    demand_mw: float = Field(default=20, gt=0, le=1000)
    demand_profile: list[float] = Field(default_factory=lambda:[1.0]*24, min_length=24, max_length=24)
    price_profile: list[float] = Field(default_factory=lambda:[.55 if h<7 else 1.45 if 17<=h<=21 else 1 for h in range(24)],min_length=24,max_length=24)
    flexible_percent: float = Field(default=35, ge=0, le=100)
    migration_limit_mw: float = Field(default=10, ge=0, le=1000)
    migration_cost_yuan_mwh: float = Field(default=20, ge=0, le=10000)
    grid_limit_mw: float = Field(default=26, gt=0, le=3000)
    battery_mwh: float = Field(default=20, ge=0, le=10000)
    battery_mw: float = Field(default=5, ge=0, le=1000)
    reserve_percent: float = Field(default=20, ge=0, le=50)
    @model_validator(mode='after')
    def validate_profiles(self):
        import math
        if any(not math.isfinite(x) or x<0 or x>10 for x in self.demand_profile+self.price_profile):
            raise ValueError('时序系数必须在 0–10 之间')
        if len({s.id for s in self.sites}) != len(self.sites):
            raise ValueError('节点编号重复')
        return self

class Thermal(Strict):
    mode: Literal['room_airflow','local_cht'] = 'room_airflow'
    cells_x: int = Field(default=32, ge=8, le=80)
    cells_y: int = Field(default=20, ge=6, le=48)
    cells_z: int = Field(default=8, ge=4, le=20)
    iterations: int = Field(default=400, ge=50, le=2000)
    inlet_c: float = Field(default=20, ge=5, le=40)
    air_speed_m_s: float = Field(default=1, gt=.01, le=10)
    water_c: float = Field(default=22, ge=5, le=50)
    water_speed_m_s: float = Field(default=.1, gt=.001, le=2)
    liquid_capture_fraction: float = Field(default=.9, ge=0, le=.98)
    local_heat_w: float = Field(default=500, gt=0, le=10000)

class Fem(Strict):
    component: Literal['cold_plate','rear_door','cdu_plate'] = 'cold_plate'
    target_device: str = Field(default='', max_length=64)
    length_m: float = Field(default=.3, gt=.01, le=3)
    width_m: float = Field(default=.2, gt=.01, le=3)
    thickness_m: float = Field(default=.006, gt=.0001, le=.1)
    conductivity_w_mk: float = Field(default=380, gt=.1, le=1000)
    heat_w: float = Field(default=500, gt=0, le=100000)
    water_c: float = Field(default=22, ge=0, le=90)
    air_c: float = Field(default=24, ge=0, le=60)
    water_h_w_m2k: float = Field(default=5000, gt=1, le=100000)
    air_h_w_m2k: float = Field(default=10, ge=0, le=1000)
    cells: int = Field(default=24, ge=8, le=64)
    chip_fraction: float = Field(default=.4, gt=.05, le=1)

class JobRequest(Strict):
    engine: Engine
    snapshot: Snapshot = Field(default_factory=Snapshot)
    electrical: Electrical = Field(default_factory=Electrical)
    dispatch: Dispatch = Field(default_factory=Dispatch)
    thermal: Thermal = Field(default_factory=Thermal)
    fem: Fem = Field(default_factory=Fem)
    timeout_seconds: int = Field(default=300, ge=30, le=900)
    data_center_ids: list[str] = Field(default_factory=list, max_length=12)
    data_hour: int = Field(default=12, ge=0, le=23)
    data_sources: list[dict[str, str | int]] = Field(default_factory=list, max_length=12)
    @model_validator(mode='after')
    def bounded_mesh(self):
        if self.thermal.cells_x*self.thermal.cells_y*self.thermal.cells_z>80000:
            raise ValueError('机房网格上限为 80000 单元')
        ny=max(4,int(self.fem.cells*self.fem.width_m/self.fem.length_m))
        if self.fem.cells*ny*4*6>250000:
            raise ValueError('有限元网格上限为 250000 四面体，请降低网格密度或调整长宽比')
        return self
