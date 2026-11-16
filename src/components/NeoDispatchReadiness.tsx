import {useEffect,useState} from 'react'
import {ArrowUpRight,RefreshCw} from 'lucide-react'
import {platformApi,type PlatformOverview,type RegisteredCenter} from '../neoPlatform'
import {usePortalStore} from '../usePortalStore'
import {useDesignerStore} from '../useDesignerStore'
import {useFoundationStore} from '../foundationData'
import './neo-dispatch-readiness.css'

type Check={key:string;label:string;missing:number;target:string;detail:string;state:'ready'|'blocked'}
type Readiness={center_id:string;center_name:string;baseline:{version:number}|null;basis_revision:number;latest_revision:number;checks:Check[];warnings:string[];can_run:boolean}

export function NeoDispatchReadiness(){
  const centerId=usePortalStore(s=>s.activeCenterId)
  const [centers,setCenters]=useState<RegisteredCenter[]>([]),[result,setResult]=useState<Readiness|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{let alive=true;void platformApi<PlatformOverview>('/overview').then(value=>{if(!alive)return;const active=value.centers.filter(c=>!c.archived);setCenters(active);if(!active.some(c=>c.id===usePortalStore.getState().activeCenterId)&&active[0])usePortalStore.getState().update({activeCenterId:active[0].id})}).catch(e=>{if(alive)setError((e as Error).message)});return()=>{alive=false}},[])
  const refresh=async(id:string)=>{if(!id)return;setBusy(true);setError('');try{setResult(await platformApi<Readiness>(`/centers/${encodeURIComponent(id)}/dispatch-readiness`))}catch(e){setError((e as Error).message);setResult(null)}finally{setBusy(false)}}
  useEffect(()=>{void refresh(centerId)},[centerId])
  const openData=(target:string)=>{usePortalStore.getState().setCenter('assets');useDesignerStore.getState().setTwinMode('browse');useFoundationStore.getState().open(centerId,target)}
  return <section className="neo-dispatch-readiness" aria-label="多站优化数据准入"><header><div><span>RUN READINESS</span><h2>专业优化数据准入</h2></div><div><select aria-label="准入检查数据中心" value={centerId} onChange={e=>usePortalStore.getState().update({activeCenterId:e.target.value})}><option value="">选择基地</option>{centers.map(center=><option key={center.id} value={center.id}>{center.name}</option>)}</select><button disabled={!centerId||busy} onClick={()=>void refresh(centerId)}><RefreshCw size={13}/>复查</button></div></header>
    {error&&<p className="neo-dispatch-error" role="alert">{error}</p>}
    {result&&<><div className="neo-dispatch-verdict" data-ready={result.can_run}><strong>{result.can_run?'输入齐备，可提交求解':'尚不能提交专业求解'}</strong><span>读取 {result.baseline?`基线 B${result.baseline.version}`:'当前草稿'} · {result.checks.filter(check=>check.state==='blocked').length} 项待补</span></div><div className="neo-dispatch-checks">{result.checks.map(check=><div key={check.key} data-state={check.state}><i>{check.state==='ready'?'✓':'!'}</i><span><strong>{check.label}</strong><small>{check.detail}</small></span><button onClick={()=>openData(check.target)}>{check.state==='ready'?'查看':'补齐'}<ArrowUpRight size={12}/></button></div>)}</div>{result.warnings.map(warning=><p className="neo-dispatch-warning" key={warning}>{warning}</p>)}</>}
  </section>
}
