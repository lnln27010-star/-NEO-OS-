"""Multi-site compute allocation and storage optimization with a real HiGHS MILP."""
import math
from pathlib import Path
from backend.models import JobRequest
from .common import metric, write_json

def solve(request:JobRequest,folder:Path):
    import pypsa
    import pandas as pd
    import numpy as np
    p=request.dispatch
    n=pypsa.Network();n.set_snapshots(pd.date_range('2026-01-01',periods=24,freq='h'))
    n.add('Carrier','electricity');n.add('Carrier','compute')
    n.add('Bus','compute-pool',carrier='compute')
    maintained=all(s.hourly_it_mw is not None for s in p.sites)
    baseline_by_site={s.id:np.array(s.hourly_it_mw) if s.hourly_it_mw is not None else np.array(p.demand_profile)*p.demand_mw/len(p.sites) for s in p.sites}
    demand=sum(baseline_by_site.values())
    flex=demand*p.flexible_percent/100
    fixed_by_site={id:values*(1-p.flexible_percent/100) for id,values in baseline_by_site.items()}
    n.add('Load','flexible-workload',bus='compute-pool',p_set=flex)
    storage=[]
    storage_sizes={}
    for s in p.sites:
        bus='site-'+s.id
        n.add('Bus',bus,carrier='electricity')
        prices=np.array(s.hourly_prices) if s.hourly_prices is not None else np.array(p.price_profile)*s.price_yuan_kwh
        n.add('Generator','grid-'+s.id,bus=bus,p_nom=s.grid_mw,marginal_cost=prices*1000,carrier='electricity')
        solar=np.maximum(0,np.sin((np.arange(24)-6)/12*math.pi))
        if s.hourly_solar_mw is not None:solar=np.array(s.hourly_solar_mw)/s.solar_mw if s.solar_mw else np.zeros(24)
        n.add('Generator','solar-'+s.id,bus=bus,p_nom=s.solar_mw,p_max_pu=solar,marginal_cost=0,carrier='electricity')
        n.add('Load','pinned-'+s.id,bus=bus,p_set=fixed_by_site[s.id]*s.pue)
        n.add('Link','compute-'+s.id,bus0=bus,bus1='compute-pool',p_nom=s.capacity_mw*s.pue,efficiency=1/s.pue)
        battery_mw=s.battery_mw if s.battery_mw is not None else p.battery_mw/len(p.sites)
        battery_mwh=s.battery_mwh if s.battery_mwh is not None else p.battery_mwh/len(p.sites)
        if battery_mw>0 and battery_mwh>0:
            name='battery-'+s.id;storage.append(name)
            storage_sizes[name]=(battery_mw,battery_mwh)
            n.add('StorageUnit',name,bus=bus,p_nom=battery_mw,max_hours=battery_mwh/battery_mw,efficiency_store=.95,efficiency_dispatch=.95,cyclic_state_of_charge=True,carrier='electricity')
    def constraints(network,snapshots):
        import xarray as xr
        m=network.model
        grid=m.variables['Generator-p'].sel(name=['grid-'+s.id for s in p.sites])
        m.add_constraints(grid.sum('name')<=p.grid_limit_mw,name='network-grid-limit')
        moves=[]
        for s in p.sites:
            assigned=m.variables['Link-p'].sel(name='compute-'+s.id)/s.pue
            pinned=xr.DataArray(fixed_by_site[s.id],coords={'snapshot':snapshots},dims='snapshot')
            baseline=xr.DataArray(baseline_by_site[s.id],coords={'snapshot':snapshots},dims='snapshot')
            m.add_constraints(assigned+pinned<=s.capacity_mw,name='it-capacity-'+s.id)
            positive=m.add_variables(lower=0,coords=[snapshots],name='migration-'+s.id)
            m.add_constraints(positive>=assigned+pinned-baseline,name='migration-positive-'+s.id)
            moves.append(positive)
            m.objective+=positive.sum()*p.migration_cost_yuan_mwh
        m.add_constraints(sum(moves)<=p.migration_limit_mw,name='migration-limit')
        for name,(mw,mwh) in storage_sizes.items():
            soc=m.variables['StorageUnit-state_of_charge'].sel(name=name)
            m.add_constraints(soc>=mwh*p.reserve_percent/100,name='battery-reserve-'+name)
            m.add_constraints(soc.isel(snapshot=-1)==mwh*.5,name='battery-terminal-soc-'+name)
            mode=m.add_variables(binary=True,coords=[snapshots],name='battery-mode-'+name)
            m.add_constraints(m.variables['StorageUnit-p_dispatch'].sel(name=name)<=mode*mw,name='battery-discharge-mode-'+name)
            m.add_constraints(m.variables['StorageUnit-p_store'].sel(name=name)<=(1-mode)*mw,name='battery-charge-mode-'+name)
    status,termination=n.optimize(solver_name='highs',extra_functionality=constraints,log_to_console=False,threads=2)
    if status!='ok' or termination!='optimal':raise ValueError(f'调度无最优可行解：{status} / {termination}，请检查节点容量、不可迁移负载、购电限值和储能边界')
    rows=[];balance_error=0;cost=0;baseline_cost=0
    for hour,t in enumerate(n.snapshots):
        nodes=[]
        for s in p.sites:
            grid=float(n.generators_t.p.at[t,'grid-'+s.id]);solar=float(n.generators_t.p.at[t,'solar-'+s.id]);compute_input=float(n.links_t.p0.at[t,'compute-'+s.id])
            has_storage='battery-'+s.id in storage_sizes
            battery=float(n.storage_units_t.p.at[t,'battery-'+s.id]) if has_storage else 0
            soc=float(n.storage_units_t.state_of_charge.at[t,'battery-'+s.id]) if has_storage else 0
            assigned=compute_input/s.pue+fixed_by_site[s.id][hour]
            balance=grid+solar+battery-compute_input-fixed_by_site[s.id][hour]*s.pue
            balance_error=max(balance_error,abs(balance))
            tariff=s.hourly_prices[hour] if s.hourly_prices is not None else s.price_yuan_kwh*p.price_profile[hour]
            cost+=grid*tariff*1000
            solar_available=s.hourly_solar_mw[hour] if s.hourly_solar_mw is not None else s.solar_mw*max(0,math.sin((hour-6)/12*math.pi))
            baseline_cost+=max(0,baseline_by_site[s.id][hour]*s.pue-solar_available)*tariff*1000
            nodes.append({'id':s.id,'name':s.name,'it_mw':assigned,'grid_mw':grid,'solar_mw':solar,'battery_mw':battery,'soc_mwh':soc,'price_yuan_kwh':tariff})
        rows.append({'hour':hour,'demand_mw':float(demand[hour]),'grid_mw':sum(s['grid_mw'] for s in nodes),'solar_mw':sum(s['solar_mw'] for s in nodes),'soc_mwh':sum(s['soc_mwh'] for s in nodes),'battery_mw':sum(s['battery_mw'] for s in nodes),'sites':nodes})
    served_error=max(abs(sum(s['it_mw'] for s in r['sites'])-r['demand_mw']) for r in rows)
    storage_error=abs(rows[-1]['soc_mwh']-sum(size[1] for size in storage_sizes.values())*.5) if storage else 0
    write_json(folder/'dispatch-results.json',rows)
    pd.DataFrame([{k:v for k,v in row.items() if k!='sites'} for row in rows]).to_csv(folder/'dispatch-hourly.csv',index=False)
    # NetCDF's native Windows library cannot reliably create files under CJK paths.
    # Export to an ASCII temporary path, then copy through Python's Unicode file API.
    import tempfile,shutil
    with tempfile.TemporaryDirectory(prefix='aidc-netcdf-') as temp:
        exported=Path(temp)/'network.nc'
        n.export_to_netcdf(exported)
        shutil.copyfile(exported,folder/'dispatch-network.nc')
    return {'engine_version':pypsa.__version__,'converged':True,'metrics':[metric('grid_cost',cost,'元/日','优化购电费用'),metric('baseline_cost',baseline_cost,'元/日','原站负载基准费用'),metric('objective',float(n.objective),'元','目标函数含迁移成本'),metric('peak_grid',max(r['grid_mw'] for r in rows),'MW','最大购电功率'),metric('terminal_soc',rows[-1]['soc_mwh'],'MWh','期末储能'),metric('balance_error',balance_error,'MW','节点能量平衡误差')],'series':rows,'assets':[],'checks':[{'name':'HiGHS 最优解','passed':True},{'name':'算力需求守恒','passed':served_error<1e-6},{'name':'节点能量平衡','passed':balance_error<1e-6},{'name':'储能首末 SOC 相等','passed':storage_error<1e-6}], 'assumptions':{'model':'24 小时混合整数优化；节点为等效 IT 负载，灵活部分可以跨站迁移','inputs':p.model_dump(),'data_sources':request.data_sources,'prices':'已保存的站点逐小时电价' if maintained else '用户输入的基准电价和峰谷系数，不是在线市场报价','storage':'充、放效率各 95%，首末 SOC 50%，禁止透支最低 SOC；无设备退化成本'},'artifacts':['dispatch-results.json','dispatch-hourly.csv','dispatch-network.nc']}
