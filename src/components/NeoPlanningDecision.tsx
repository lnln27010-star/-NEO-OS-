import {ArrowUpRight,Download,MapPin} from 'lucide-react'
import {assessSite} from '../portalModel'
import {usePortalStore} from '../usePortalStore'
import './neo-planning-decision.css'

export function NeoPlanningDecision({onCompare}:{onCompare:()=>void}){
  const s=usePortalStore(),site=s.sites.find(item=>item.id===s.focusedSite)??s.sites[0]
  if(!site)return <section className="neo-site-gates"><h2>尚无候选站点</h2><button onClick={onCompare}>建立候选站点<ArrowUpRight size={13}/></button></section>
  const result=assessSite(site,s.demand,s.latency,s.area)
  const exportEvidence=()=>{const blob=new Blob([JSON.stringify({candidate:site,requirements:{demand_mw:s.demand,max_latency_ms:s.latency,min_area_m2:s.area},assessment:result,source:'本机候选草案；依据字段由用户录入'},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${site.id}-选址尽调.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  return <section className="neo-site-gates" aria-label="站点准入检查"><header><div><span>DEVELOPMENT GATES</span><h2>站点准入检查</h2></div><div className="neo-site-gates-actions"><label><MapPin size={14}/><select aria-label="选择尽调候选站点" value={site.id} onChange={e=>s.update({focusedSite:e.target.value})}>{s.sites.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button onClick={exportEvidence}><Download size={13}/>导出检查</button></div></header><div className="neo-site-decision" data-ready={result.ready}><strong>{result.status}</strong><span>{result.checks.filter(check=>check.passed).length} / {result.checks.length} 项满足 · {site.basis?.trim()?'已填写资料依据':'尚无资料依据'} · 本机候选草案</span><button onClick={onCompare}>调整初筛条件<ArrowUpRight size={13}/></button></div><div className="neo-site-checks">{result.checks.map(check=><div key={check.key} data-pass={check.passed}><i>{check.passed?'✓':'!'}</i><strong>{check.label}</strong><span>{check.detail}</span></div>)}</div></section>
}
