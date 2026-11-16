import {useEffect,useMemo,useState} from 'react'
import {ArrowUpRight,Download,RefreshCw,Waypoints} from 'lucide-react'
import {platformApi,type PlatformOverview,type RegisteredCenter} from '../neoPlatform'
import {usePortalStore} from '../usePortalStore'
import {useDesignerStore} from '../useDesignerStore'
import {useFoundationStore} from '../foundationData'
import './neo-power-topology.css'

type PathRow={rack_id:string;room:string;status:'separate'|'shared'|'missing';shared_node:string;path_a:string[];path_b:string[];issues:string[];source:string}
type Topology={center_id:string;center_name:string;revision:number;baseline:{version:number}|null;rack_count:number;counts:{separate:number;shared:number;missing:number};rows:PathRow[];scope:string}

function download(value:Topology){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`${value.center_id}-供电路径审计-r${value.revision}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}

export function NeoPowerTopology(){
  const activeCenterId=usePortalStore(s=>s.activeCenterId)
  const [centers,setCenters]=useState<RegisteredCenter[]>([]),[topology,setTopology]=useState<Topology|null>(null),[selectedRack,setSelectedRack]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState<'risk'|'all'>('risk'),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{let alive=true;void platformApi<PlatformOverview>('/overview').then(data=>{if(!alive)return;const list=data.centers.filter(c=>!c.archived);setCenters(list);if(!list.some(c=>c.id===usePortalStore.getState().activeCenterId)&&list[0])usePortalStore.getState().update({activeCenterId:list[0].id})}).catch(e=>{if(alive)setError((e as Error).message)});return()=>{alive=false}},[])
  const refresh=async(id:string)=>{if(!id)return;setBusy(true);setError('');try{const result=await platformApi<Topology>(`/centers/${encodeURIComponent(id)}/power-topology`);setTopology(result);setSelectedRack(previous=>result.rows.some(row=>row.rack_id===previous)?previous:result.rows[0]?.rack_id??'')}catch(e){setError((e as Error).message);setTopology(null)}finally{setBusy(false)}}
  useEffect(()=>{void refresh(activeCenterId)},[activeCenterId])
  const groups=useMemo(()=>{const counts=new Map<string,number>();for(const row of topology?.rows??[])if(row.shared_node)counts.set(row.shared_node,(counts.get(row.shared_node)??0)+1);return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,8)},[topology])
  const filtered=useMemo(()=>topology?.rows.filter(row=>(filter==='all'||row.status!=='separate')&&(!query||`${row.rack_id} ${row.room} ${row.shared_node}`.toLowerCase().includes(query.trim().toLowerCase())))??[],[topology,filter,query])
  const selected=topology?.rows.find(row=>row.rack_id===selectedRack)
  const openConnections=()=>{usePortalStore.getState().setCenter('assets');useDesignerStore.getState().setTwinMode('browse');useFoundationStore.getState().open(activeCenterId,'cables')}
  return <section className="neo-topology" aria-label="供电路径审计">
    <header className="neo-topology-head"><div><span>POWER PATH AUDIT</span><h2>机柜 A/B 供电路径</h2><p>从机柜逐级追溯到变压器，识别两路共用设备与断链。</p></div><div className="neo-topology-controls"><label>数据中心<select aria-label="供电路径数据中心" value={activeCenterId} onChange={e=>usePortalStore.getState().update({activeCenterId:e.target.value})}><option value="">选择基地</option>{centers.map(center=><option key={center.id} value={center.id}>{center.name}</option>)}</select></label><button disabled={busy||!activeCenterId} onClick={()=>void refresh(activeCenterId)}><RefreshCw size={14}/>重新审计</button></div></header>
    {error&&<p className="neo-topology-error" role="alert">{error}</p>}
    {topology&&<><div className="neo-topology-status"><span>档案 r{topology.revision}</span><span>{topology.baseline?`生效基线 B${topology.baseline.version}`:'尚未发布基线'}</span><span>{topology.rack_count} 台已启用机柜</span><button onClick={()=>download(topology)}><Download size={13}/>导出审计</button></div>
      <div className="neo-topology-summary"><div data-tone="good"><span>路径分离</span><strong>{topology.counts.separate}</strong></div><div data-tone="warning"><span>共用上级设备</span><strong>{topology.counts.shared}</strong></div><div data-tone="danger"><span>断链 / 接线歧义</span><strong>{topology.counts.missing}</strong></div></div>
      {selected&&<div className="neo-topology-paths"><header><strong>{selected.rack_id}</strong><span>{selected.source} · {selected.issues.join('；')||'未发现拓扑共点'}</span></header><div><section><span>A 路</span><p>{selected.path_a.join(' → ')}</p></section><section><span>B 路</span><p>{selected.path_b.join(' → ')}</p></section></div></div>}
      <div className="neo-topology-grid"><aside className="neo-topology-groups"><h3>风险集中位置</h3>{groups.length?groups.map(([node,count])=><button key={node} onClick={()=>{setFilter('risk');setQuery(node)}}><Waypoints size={14}/><span>{node}</span><strong>{count} 台机柜</strong></button>):<p>未发现两路共用的上级设备。</p>}<button className="neo-topology-edit" onClick={openConnections}>核对接线资料<ArrowUpRight size={13}/></button><small>{topology.scope}</small></aside>
        <div className="neo-topology-main"><div className="neo-topology-filter"><input aria-label="搜索机柜或共用设备" placeholder="搜索机柜、房间或共用设备" value={query} onChange={e=>setQuery(e.target.value)}/><div role="group" aria-label="路径筛选"><button aria-pressed={filter==='risk'} onClick={()=>setFilter('risk')}>风险项</button><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>全部</button></div></div><div className="neo-topology-list" aria-label="机柜路径列表">{filtered.slice(0,40).map(row=><button key={row.rack_id} aria-pressed={selectedRack===row.rack_id} onClick={()=>setSelectedRack(row.rack_id)}><strong>{row.rack_id}</strong><span>{row.room||'房间待核实'}</span><em data-status={row.status}>{row.status==='shared'?`共用 ${row.shared_node}`:row.status==='missing'?'路径不完整':'路径分离'}</em></button>)}{!filtered.length&&<p>当前筛选下没有机柜。</p>}</div>{filtered.length>40&&<small className="neo-topology-count">显示前 40 / {filtered.length} 项，请搜索机柜编号缩小范围</small>}</div>
      </div></>}
    {!topology&&!busy&&!error&&<p className="neo-topology-empty">选择已登记的数据中心，检查机柜供电路径。</p>}
  </section>
}
