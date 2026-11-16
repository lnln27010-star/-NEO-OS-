import {ArrowUpRight,Building2,ChevronDown,ChevronUp,Crosshair,RefreshCw} from 'lucide-react'
import type {PlatformOverview,RegisteredCenter} from '../neoPlatform'
import {ORIGIN_LABEL,type Origin,useFoundationStore} from '../foundationData'
import './global-cockpit.css'

type Props={overview:PlatformOverview|null;selected:RegisteredCenter|null;selectedId:string;open:boolean;compact:boolean;busy:boolean;error:string;onToggle:()=>void;onSelect:(id:string)=>void;onRefresh:()=>void;onLocate:(center:RegisteredCenter)=>void}

export function GlobalCockpitPanel({overview,selected,selectedId,open,compact,busy,error,onToggle,onSelect,onRefresh,onLocate}:Props){
  const centers=overview?.centers.filter(center=>!center.archived)??[]
  const hasLocation=selected?.latitude!==null&&selected?.longitude!==null&&Number.isFinite(selected?.latitude)&&Number.isFinite(selected?.longitude)
  return <aside className={`global-cockpit ${open&&!compact?'is-open':''} ${compact?'is-compact':''}`} aria-label="全域基地与运行概览">
    <header><span className="global-cockpit-kicker"><Building2 size={14}/>基地与运行</span><button type="button" aria-label={open&&!compact?'收起基地概览':'展开基地概览'} aria-expanded={open&&!compact} onClick={onToggle}>{open&&!compact?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button></header>
    {!compact&&<div className="global-cockpit-totals"><div><strong>{overview?.registered??'—'}</strong><span>已登记</span></div><div><strong>{overview?.published??'—'}</strong><span>已发布</span></div><div><strong>{overview?.measured??'—'}</strong><span>有测点</span></div><div><strong>{overview?.jobs.length??'—'}</strong><span>近期计算</span></div></div>}
    {open&&!compact&&<div className="global-cockpit-body">
      <div className="global-cockpit-section-title"><span>数据中心</span><button type="button" title="刷新基地资料" aria-label="刷新基地资料" disabled={busy} onClick={onRefresh}><RefreshCw size={13}/></button></div>
      {error&&<p className="global-cockpit-error" role="alert">{error}</p>}
      <div className="global-cockpit-sites">{centers.map(center=><button key={center.id} type="button" aria-pressed={center.id===selectedId} onClick={()=>onSelect(center.id)}><span className="global-cockpit-site-dot"/><span><strong>{center.name}</strong><small>{center.region||'位置待录入'} · {center.asset_count} 台资产</small></span><ArrowUpRight size={12}/></button>)}{!centers.length&&<span className="global-cockpit-empty">尚无已登记基地</span>}</div>
      {selected&&<div className="global-cockpit-detail"><div className="global-cockpit-detail-head"><strong>{selected.code||selected.name}</strong><span>{selected.baseline?`基线 B${selected.baseline.version}`:'资料未发布'}</span></div><div className="global-cockpit-metrics"><div><span>IT 容量</span><strong>{selected.it_capacity_mw===null?'待录入':`${selected.it_capacity_mw.toFixed(2)} MW`}</strong></div><div><span>供电容量</span><strong>{selected.grid_capacity_mw===null?'待录入':`${selected.grid_capacity_mw.toFixed(2)} MW`}</strong></div></div><div className="global-cockpit-provenance"><span>{ORIGIN_LABEL[selected.source as Origin]??selected.source}</span><span>{selected.telemetry_source_count?`${selected.telemetry_source_count} 份离线测点`:'无运行测点'}</span></div><div className="global-cockpit-actions"><button type="button" disabled={!hasLocation} title={hasLocation?'定位到已登记坐标':'请先在基本信息登记并核对经纬度'} onClick={()=>onLocate(selected)}><Crosshair size={13}/>定位</button><button type="button" onClick={()=>useFoundationStore.getState().open(selected.id)}>基本信息<ArrowUpRight size={12}/></button></div></div>}
    </div>}
  </aside>
}
