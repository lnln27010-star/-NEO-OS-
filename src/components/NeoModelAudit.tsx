import {useEffect,useState} from 'react'
import {ArrowUpRight,RefreshCw} from 'lucide-react'
import {platformApi,type PlatformOverview,type RegisteredCenter} from '../neoPlatform'
import {usePortalStore} from '../usePortalStore'
import {useDesignerStore} from '../useDesignerStore'
import {useFoundationStore} from '../foundationData'
import './neo-model-audit.css'

type Coverage={center_id:string;center_name:string;revision:number;baseline:{version:number}|null;sources:Record<'model'|'document'|'manual'|'measured'|'discovered',number>;inventory:{assets:number;servers:number;components:number;spaces:number;measurement_sources:number};checks:{key:string;label:string;complete:number;total:number;target:string}[];note:string}

export function NeoModelAudit(){
  const centerId=usePortalStore(s=>s.activeCenterId)
  const [centers,setCenters]=useState<RegisteredCenter[]>([]),[coverage,setCoverage]=useState<Coverage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{let alive=true;void platformApi<PlatformOverview>('/overview').then(data=>{if(!alive)return;const list=data.centers.filter(c=>!c.archived);setCenters(list);if(!list.some(c=>c.id===usePortalStore.getState().activeCenterId)&&list[0])usePortalStore.getState().update({activeCenterId:list[0].id})}).catch(e=>{if(alive)setError((e as Error).message)});return()=>{alive=false}},[])
  const refresh=async(id:string)=>{if(!id)return;setBusy(true);setError('');try{setCoverage(await platformApi<Coverage>(`/centers/${encodeURIComponent(id)}/model-coverage`))}catch(e){setError((e as Error).message);setCoverage(null)}finally{setBusy(false)}}
  useEffect(()=>{void refresh(centerId)},[centerId])
  const open=(target:string)=>{usePortalStore.getState().setCenter('assets');useDesignerStore.getState().setTwinMode('browse');useFoundationStore.getState().open(centerId,target)}
  return <section className="neo-model-audit" aria-label="模型资料审计"><header><div><span>MODEL DATA AUDIT</span><h2>模型资料审计</h2></div><div><select aria-label="模型审计数据中心" value={centerId} onChange={e=>usePortalStore.getState().update({activeCenterId:e.target.value})}><option value="">选择基地</option>{centers.map(center=><option key={center.id} value={center.id}>{center.name}</option>)}</select><button disabled={!centerId||busy} onClick={()=>void refresh(centerId)}><RefreshCw size={13}/>复查</button></div></header>
    {error&&<p className="neo-model-audit-error" role="alert">{error}</p>}
    {coverage&&<><div className="neo-model-audit-summary"><div><span>设备档案</span><strong>{coverage.inventory.assets}</strong></div><div><span>服务器 / 部件</span><strong>{coverage.inventory.servers} / {coverage.inventory.components}</strong></div><div><span>空间 / 测点来源</span><strong>{coverage.inventory.spaces} / {coverage.inventory.measurement_sources}</strong></div><div><span>版本</span><strong>r{coverage.revision}{coverage.baseline?` · B${coverage.baseline.version}`:''}</strong></div></div><div className="neo-model-audit-layout"><div className="neo-model-audit-checks"><h3>关键字段覆盖</h3>{coverage.checks.map(check=><div key={check.key}><div><strong>{check.label}</strong><span>{check.complete} / {check.total}</span></div><progress max={Math.max(1,check.total)} value={check.complete}/><button onClick={()=>open(check.target)}>维护数据<ArrowUpRight size={12}/></button></div>)}</div><aside className="neo-model-audit-sources"><h3>设备来源</h3>{([['model','三维模型'],['document','图纸提取'],['manual','人工录入'],['measured','现场实测'],['discovered','设备发现']] as const).map(([key,label])=><div key={key}><span>{label}</span><strong>{coverage.sources[key]}</strong></div>)}<button onClick={()=>open('quality')}>查看校验问题<ArrowUpRight size={13}/></button><p>{coverage.note}</p></aside></div></>}
  </section>
}
