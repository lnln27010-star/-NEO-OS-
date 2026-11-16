"""AC equivalent circuits generated from current A/B port connections."""
import math
from pathlib import Path
from backend.models import JobRequest
from .common import metric, write_json

def solve(request: JobRequest, folder: Path):
    import pandapower as pp
    import numpy as np
    p=request.electrical
    devices={d.id:d.model_copy(deep=True) for d in request.snapshot.devices}
    if request.snapshot.seconds>=20:
        for d in devices.values():
            if request.snapshot.scenario=='feeder-trip' and d.id=='PDU-C':d.enabled=False
            if request.snapshot.scenario=='ups-a-loss' and d.kind=='ups' and d.id.startswith('UPS-A'):d.enabled=False
    net=pp.create_empty_network(sn_mva=100)
    nodes={}; ancestry={}; lines=[]; transformers={}; loads={}; warnings=[]
    alive=lambda d:bool(d and d.installed and d.enabled)
    consumers={'rack','network','chiller','chw-pump','cw-pump','crac','cdu','cooling-tower'}
    kinds=consumers|{'transformer','lv-panel','ups','busbar','rpp','pdu'}
    circuits={(c.source,c.target,c.port):c for c in p.circuits}
    def np_value(d,key,default):
        value=getattr(d.nameplate,key,None) if d.nameplate else None
        return value if value is not None else default
    def pf(d):return np_value(d,'power_factor',p.power_factor)
    def rated_kw(d):return d.capacity if d.kind not in consumers-{'rack'} else max(2.4,d.demand_kw*1.25)
    def resolve(id,side,seen=None):
        d=devices.get(id);seen=set() if seen is None else set(seen)
        if not alive(d) or d.kind not in kinds or id in seen:return None
        if d.kind=='ups' and d.id.startswith('UPS-'+('B' if side=='A' else 'A')):return None
        key=(id,side)
        if key in nodes:return nodes[key]
        if d.kind=='transformer':
            if id not in transformers:
                hv_kv=np_value(d,'hv_kv',p.hv_kv);lv_kv=np_value(d,'lv_kv',p.lv_kv)
                hv=pp.create_bus(net,vn_kv=hv_kv,name=id+'/HV')
                lv=pp.create_bus(net,vn_kv=lv_kv,name=id+'/LV')
                pp.create_ext_grid(net,bus=hv,vm_pu=1,s_sc_max_mva=p.grid_short_circuit_mva,s_sc_min_mva=p.grid_short_circuit_mva/2,rx_max=.1,rx_min=.1)
                idx=pp.create_transformer_from_parameters(net,hv,lv,sn_mva=np_value(d,'rated_kva',d.capacity/pf(d))/1000,vn_hv_kv=hv_kv,vn_lv_kv=lv_kv,vk_percent=np_value(d,'vk_percent',p.transformer_vk_percent),vkr_percent=np_value(d,'vkr_percent',p.transformer_vkr_percent),pfe_kw=np_value(d,'pfe_kw',12),i0_percent=np_value(d,'i0_percent',.2),name=id,shift_degree=0)
                transformers[id]=(lv,idx)
            nodes[key]=transformers[id][0];ancestry[key]={id};return nodes[key]
        seen.add(id)
        sources=[d.connections.get('powerA' if side=='A' else 'powerB','')]
        if d.kind in {'lv-panel','ups','busbar'}:sources=[d.connections.get('powerA','')]
        if d.kind=='busbar' and not d.custom_connections and id in {'BUS-A','BUS-B'}:
            bank=id[-1];sources=[u.id for u in devices.values() if u.kind=='ups' and u.id.startswith('UPS-'+bank) and alive(u)]
        parents=[]
        for source in sources:
            port='powerA' if d.kind in {'lv-panel','ups','busbar'} else 'power'+side
            circuit=circuits.get((source,id,port))
            if p.explicit_circuits and (not circuit or not circuit.in_service):continue
            node=resolve(source,side,seen)
            if node is not None:parents.append((source,node))
        if not parents:return None
        voltage=float(net.bus.at[parents[0][1],'vn_kv'])
        if any(abs(float(net.bus.at[parent,'vn_kv'])-voltage)>1e-6 for _,parent in parents):raise ValueError(id+'：不能直接连接不同电压等级')
        node=pp.create_bus(net,vn_kv=voltage,name=f'{id}/{side}')
        nodes[key]=node;ancestry[key]={id}
        for source,parent in parents:
            s=devices[source];ancestry[key]|=ancestry.get((source,side),{source})
            length=max(2,abs(d.x-s.x)+abs(d.z-s.z)+2)/1000
            rating=min(rated_kw(d),rated_kw(s))
            current_ka=rating/1000/(math.sqrt(3)*p.lv_kv*p.power_factor)
            parallel=max(1,math.ceil(current_ka/p.cable_max_i_ka))
            port='powerA' if d.kind in {'lv-panel','ups','busbar'} else 'power'+side
            cable=circuits.get((source,id,port))
            line=pp.create_line_from_parameters(net,parent,node,length_km=cable.length_m/1000 if cable else length,r_ohm_per_km=cable.r_ohm_km if cable else p.cable_r_ohm_km,x_ohm_per_km=cable.x_ohm_km if cable else p.cable_x_ohm_km,c_nf_per_km=0,max_i_ka=cable.max_i_ka if cable else p.cable_max_i_ka,parallel=cable.parallel if cable else parallel,name=cable.id if cable else f'{source}>{id}/{side}')
            lines.append((line,id,side))
        return node
    for d in devices.values():
        if d.kind=='transformer' and alive(d):resolve(d.id,'B' if d.id.startswith('TX-B') else 'A')
    for d in devices.values():
        if d.kind not in {'lv-panel','ups','busbar','rpp','pdu'} or not alive(d):continue
        for side in ['A','B']:
            if d.kind in {'lv-panel','ups','busbar'}:
                prefix={'lv-panel':'LV-','ups':'UPS-','busbar':'BUS-'}[d.kind]
                if d.id.startswith(prefix+('B' if side=='A' else 'A')):continue
            resolve(d.id,side)
    for d in devices.values():
        if d.kind not in consumers or not d.installed:continue
        demand=d.demand_kw if d.enabled else 0
        available=[]
        if d.enabled:
            for side,flag in [('A',d.power_a),('B',d.power_b)]:
                if flag:
                    node=resolve(d.id,side)
                    if node is not None:available.append((side,node))
        loads[d.id]=[]
        for side,node in available:
            mw=demand/1000/len(available)
            idx=pp.create_load(net,node,p_mw=mw,q_mvar=mw*math.tan(math.acos(pf(d))),name=f'{d.id}/{side}')
            loads[d.id].append(idx)
    if not len(net.ext_grid):raise ValueError('当前接线没有有效变压器与市电供电路径')
    pp.runpp(net,algorithm='nr',numba=False,max_iteration=60,tolerance_mva=1e-8)
    # UPS losses are an explicit load on converter inputs, not a fictitious UPS solver.
    for id,d in devices.items():
        if d.kind!='ups' or not alive(d):continue
        for side in ['A','B']:
            node=nodes.get((id,side))
            if node is None:continue
            delivered=sum(max(0,float(net.res_line.at[i,'p_from_mw'])) for i,to,s in lines if s==side and net.line.at[i,'from_bus']==node)
            if delivered>0:pp.create_load(net,node,p_mw=delivered*np_value(d,'ups_loss_percent',p.ups_loss_percent)/100,q_mvar=0,name=id+'/conversion-loss')
    pp.runpp(net,algorithm='nr',numba=False,max_iteration=60,tolerance_mva=1e-8)
    def finite(value):return float(value) if np.isfinite(value) else None
    assets=[]
    for d in devices.values():
        if not d.installed or d.kind not in kinds:continue
        ports=[(side,nodes[(d.id,side)]) for side in ['A','B'] if (d.id,side) in nodes]
        volts=[float(net.res_bus.at[node,'vm_pu']) for _,node in ports if np.isfinite(net.res_bus.at[node,'vm_pu'])]
        incoming=[i for i,to,side in lines if to==d.id]
        loading=max([float(net.res_line.at[i,'loading_percent']) for i in incoming]+[0])
        if d.kind=='transformer' and d.id in transformers:loading=float(net.res_trafo.at[transformers[d.id][1],'loading_percent'])
        demand=d.demand_kw if d.enabled else 0
        supplied=sum(float(net.res_load.at[i,'p_mw'])*1000 for i in loads.get(d.id,[]) if np.isfinite(net.res_load.at[i,'p_mw']))
        if d.kind=='rack':loading=max(loading,supplied/d.capacity*100)
        if d.kind in {'lv-panel','ups','busbar','rpp','pdu'}:
            apparent=sum(math.hypot(float(net.res_line.at[i,'p_to_mw']),float(net.res_line.at[i,'q_to_mvar'])) for i in incoming)
            if d.nameplate and d.nameplate.rated_current_a:
                voltage=float(net.bus.at[ports[0][1],'vn_kv']) if ports else np_value(d,'lv_kv',p.lv_kv)
                rating_mva=math.sqrt(3)*voltage*d.nameplate.rated_current_a/1000
            elif d.nameplate and d.nameplate.rated_kva:rating_mva=d.nameplate.rated_kva/1000
            else:rating_mva=d.capacity/1000/pf(d)
            loading=max(loading,apparent/rating_mva*100)
        a_roots={v for v in ancestry.get((d.id,'A'),set()) if devices[v].kind=='transformer'}
        b_roots={v for v in ancestry.get((d.id,'B'),set()) if devices[v].kind=='transformer'}
        redundant=len(ports)>1 and not a_roots.intersection(b_roots)
        asset={'id':d.id,'kind':d.kind,'x':d.x,'z':d.z,'voltage_pu':min(volts) if volts else None,'loading_percent':loading,'power_kw':supplied if d.kind in consumers else None,'demand_kw':demand if d.kind in consumers else None,'redundant':redundant if d.kind=='rack' else None}
        asset['status']='offline' if not volts else 'warning' if min(volts)<.95 or max(volts)>1.05 or loading>100 or d.kind=='rack' and not redundant else 'normal'
        assets.append(asset)
    served=sum(a['power_kw'] or 0 for a in assets if a['kind']=='rack')
    requested=sum(d.demand_kw for d in devices.values() if d.kind=='rack' and d.installed and d.enabled)
    total_load=float(net.res_load.p_mw.sum());grid=float(net.res_ext_grid.p_mw.sum());loss=float(net.res_line.pl_mw.sum()+net.res_trafo.pl_mw.sum())
    balance=abs(grid-total_load-loss)
    voltages=net.res_bus.vm_pu.dropna()
    short=[]
    if p.analysis=='power_flow_short_circuit':
        from pandapower.shortcircuit import calc_sc
        targets=list(dict.fromkeys(v[0] for v in transformers.values()))
        calc_sc(net,bus=targets,case='max',ip=True,ith=True)
        short=[{'bus':str(net.bus.at[i,'name']),'ikss_ka':finite(net.res_bus_sc.at[i,'ikss_ka'])} for i in targets]
    pp.to_json(net,str(folder/'electrical-network.json'))
    write_json(folder/'electrical-results.json',{'assets':assets,'short_circuit':short})
    return {'engine_version':pp.__version__,'converged':bool(net.converged),'metrics':[metric('voltage_min',float(voltages.min()),'pu','最低电压'),metric('voltage_max',float(voltages.max()),'pu','最高电压'),metric('served_mw',served/1000,'MW','已供 IT 功率'),metric('unserved_kw',max(0,requested-served),'kW','未供负载'),metric('loss_kw',loss*1000,'kW','线路与变压器损耗'),metric('balance_error_kw',balance*1000,'kW','功率平衡误差')], 'assets':assets,'series':[],'checks':[{'name':'潮流收敛','passed':bool(net.converged)},{'name':'功率平衡','passed':balance<1e-5},{'name':'负载全部供电','passed':requested-served<.01},{'name':'电压 0.95–1.05pu','passed':bool(voltages.between(.95,1.05).all())},{'name':'设备容量限值','passed':all(a['loading_percent']<=100.01 for a in assets)}], 'short_circuit':short,'assumptions':{'model':'稳态 AC 等效网络；UPS 用通过支路、容量限值与附加损耗表示，不计算逆变器开关暂态；机柜有效双输入等分负载','electrical':p.model_dump(),'data_sources':request.data_sources,'validation':'采用保存的逐设备铭牌、功率、逐线路参数；资料来源见修订记录。' if p.explicit_circuits else '导线并联数由设备容量估算；辅助设备支路用当前功率加 25% 余量；需用实际电缆和变压器铭牌校准'},'artifacts':['electrical-network.json','electrical-results.json']}
