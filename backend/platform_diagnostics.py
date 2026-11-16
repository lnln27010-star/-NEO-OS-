"""Read-only engineering diagnostics over a center's recorded power graph."""
from collections import defaultdict


def power_topology(data:dict, revision:int, baseline:dict|None)->dict:
    assets={asset['id']:asset for asset in data['assets']}
    incoming=defaultdict(list)
    for cable in data['cables']:
        if cable.get('in_service') and cable.get('port') in {'powerA','powerB'}:
            incoming[(cable['target'],cable['port'])].append(cable)

    def trace(rack_id:str,lane:str):
        path=[rack_id]
        problems=[]
        seen={rack_id}
        node=rack_id
        for _ in range(32):
            links=incoming.get((node,lane),[])
            if not links and node!=rack_id:
                other=incoming.get((node,'powerA' if lane=='powerB' else 'powerB'),[])
                if len(other)==1:links=other
            if not links:
                if node==rack_id:problems.append(f'{lane} 未接线')
                elif assets.get(node,{}).get('kind') not in {'transformer','generator'}:problems.append(f'{node} 上级断链')
                break
            if len(links)!=1:
                problems.append(f'{node} {lane} 有 {len(links)} 条有效输入')
                break
            upstream=links[0]['source']
            if upstream not in assets:
                problems.append(f'{node} 上级设备 {upstream} 未登记')
                break
            if upstream in seen:
                problems.append(f'{upstream} 构成供电环路')
                break
            path.append(upstream)
            seen.add(upstream)
            node=upstream
        else:problems.append('路径超过 32 级')
        return path,problems

    rows=[]
    for rack in (asset for asset in data['assets'] if asset['kind']=='rack' and asset.get('installed') and asset.get('enabled')):
        path_a,issues_a=trace(rack['id'],'powerA')
        path_b,issues_b=trace(rack['id'],'powerB')
        common=set(path_b[1:])
        shared=next((node for node in path_a[1:] if node in common),'')
        issues=issues_a+issues_b
        if shared:issues.append(f'A/B 共用 {shared}')
        status='missing' if issues_a or issues_b else 'shared' if shared else 'separate'
        modeled=any(assets[node].get('source') in {'model','document'} for node in set(path_a+path_b) if node in assets)
        rows.append({'rack_id':rack['id'],'room':rack.get('room',''),'status':status,'shared_node':shared,'path_a':path_a,'path_b':path_b,'issues':issues,'source':'待现场核实' if modeled or baseline is None else '已发布资料'})

    counts={status:sum(row['status']==status for row in rows) for status in ('separate','shared','missing')}
    return {'center_id':data['id'],'center_name':data['name'],'revision':revision,'baseline':baseline,'rack_count':len(rows),'counts':counts,'rows':rows,'scope':'仅校核已登记的在役 A/B 连接拓扑；不代表断路器容量、保护整定或现场供电已验证'}


def dispatch_readiness(data:dict,baseline:dict|None,latest_revision:int,basis_revision:int)->dict:
    checks=[]
    def add(key,label,missing,target,detail):checks.append({'key':key,'label':label,'missing':missing,'target':target,'detail':detail,'state':'blocked' if missing else 'ready'})
    add('baseline','已发布生效基线',0 if baseline else 1,'audit',f"B{baseline['version']} · 档案 r{basis_revision}" if baseline else '草稿不能提交专业求解')
    fields=[('it_capacity_mw','IT 容量'),('grid_capacity_mw','购电容量'),('pue','PUE'),('solar_mw','光伏容量'),('battery_mwh','储能容量'),('battery_mw','储能功率')]
    missing=[label for key,label in fields if data.get(key) is None]
    add('capacity','容量与能源边界',len(missing),'overview','、'.join(missing) if missing else '6 项参数齐全；无设备须明确填写 0')
    for key,label in [('price','逐时电价'),('it_kw','逐时 IT 负载'),('solar_kw','逐时光伏出力')]:
        gaps=[hour for hour,row in enumerate(data['hourly']) if row.get(key) is None]
        add(key,label,len(gaps),'profiles',f"缺 {len(gaps)} / 24 小时" if gaps else '24 / 24 小时齐全')
    warnings=[]
    if baseline and latest_revision!=basis_revision:warnings.append('草稿修订已变化，当前求解仍读取已发布基线')
    if data.get('source') in {'model','document'}:warnings.append('资料来源为模型或图纸提取，尚需按现场核实')
    return {'center_id':data['id'],'center_name':data['name'],'baseline':baseline,'basis_revision':basis_revision,'latest_revision':latest_revision,'checks':checks,'warnings':warnings,'can_run':all(check['missing']==0 for check in checks)}


def model_coverage(data:dict,revision:int,baseline:dict|None,servers:int,components:int,sources:int)->dict:
    assets=data['assets']
    active=[asset for asset in assets if asset.get('installed') and asset.get('enabled')]
    powered=[asset for asset in active if asset['kind'] in {'rack','network','chiller','chw-pump','cw-pump','crac','cdu','cooling-tower'}]
    racks=[asset for asset in active if asset['kind']=='rack']
    cables=[cable for cable in data['cables'] if cable['port'] in {'powerA','powerB'} and cable.get('in_service')]
    fields=('length_m','r_ohm_km','x_ohm_km','max_i_ka')
    checks=[
        {'key':'identity','label':'设备厂家与型号','complete':sum(bool(a.get('manufacturer') and a.get('model')) for a in active),'total':len(active),'target':'assets'},
        {'key':'load','label':'设备功率或逐时负载','complete':sum(a.get('measured_kw') is not None or a.get('load_profile_kw') is not None for a in powered),'total':len(powered),'target':'profiles'},
        {'key':'position','label':'机柜位置已核实','complete':sum(a.get('position_verified',False) for a in racks),'total':len(racks),'target':'assets'},
        {'key':'cable','label':'供电电缆参数齐全','complete':sum(all(c.get(field) is not None for field in fields) for c in cables),'total':len(cables),'target':'cables'},
        {'key':'hourly','label':'逐时电价与负载','complete':sum(h.get('price') is not None and h.get('it_kw') is not None for h in data['hourly']),'total':24,'target':'profiles'},
    ]
    return {'center_id':data['id'],'center_name':data['name'],'revision':revision,'baseline':baseline,'sources':{'model':sum(a['source']=='model' for a in assets),'document':sum(a['source']=='document' for a in assets),'manual':sum(a['source']=='manual' for a in assets),'measured':sum(a['source']=='measured' for a in assets),'discovered':sum(a['source']=='discovered' for a in assets)},'inventory':{'assets':len(assets),'servers':servers,'components':components,'spaces':len(data['spaces']),'measurement_sources':sources},'checks':checks,'note':'覆盖率仅反映已登记字段，不等于现场真实性或专业模型已校准'}
