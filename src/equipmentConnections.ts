import {RACK_LAYOUT,type Equipment,type EquipmentLayout,type Port} from './equipmentModel'
export const PORT_NAMES:Record<Port,string>={powerA:'电源 A',powerB:'电源 B',supply:'供水 / 送风',return:'回水',network:'网络上联'}
export function ports(d:Equipment):Port[]{
  if(d.kind==='transformer')return []
  if(d.kind==='generator')return ['powerA','powerB']
  if(d.kind==='pipe')return ['supply','return']
  if(d.kind==='rack')return d.coolingMode==='liquid'?['powerA','powerB','supply','return','network']:['powerA','powerB','supply','network']
  if(d.kind==='chiller')return ['powerA','powerB','supply','return']
  if(['cdu','crac','chw-pump','cw-pump','cooling-tower'].includes(d.kind))return ['powerA','powerB','supply','return']
  if(d.kind==='network')return ['powerA','powerB','network']
  if(['rpp','pdu'].includes(d.kind))return ['powerA','powerB']
  return ['powerA']
}
const connectionCache=new WeakMap<Equipment,Partial<Record<Port,string>>>()
export function connections(d:Equipment):Partial<Record<Port,string>>{const cached=connectionCache.get(d);if(cached)return cached;const result=defaultConnections(d);connectionCache.set(d,result);return result}
function defaultConnections(d:Equipment):Partial<Record<Port,string>>{
  if(d.connections)return d.connections
  const bus=d.id.includes('-B')?'B':'A',r=RACK_LAYOUT.find(r=>r.id===d.id)
  if(r)return {powerA:r.feeder,powerB:r.feeder,supply:r.cooling,return:r.coolingMode==='liquid'?r.cooling:'',network:r.networkNode}
  switch(d.kind){
    case 'generator':return {powerA:'LV-A',powerB:'LV-B'}
    case 'lv-panel':return {powerA:`TX-${bus}`}
    case 'ups':return {powerA:`LV-${bus}`}
    case 'battery':return {powerA:`UPS-${bus}`}
    case 'busbar':return {powerA:`UPS-${bus}`}
    case 'rpp':return {powerA:'BUS-A',powerB:'BUS-B'}
    case 'pdu':return {powerA:`RPP-0${d.pod+1}`,powerB:`RPP-0${d.pod+1}`}
    case 'network':return {powerA:'BUS-A',powerB:'BUS-B',network:d.id==='NET-01'||d.id==='NET-02'||d.id==='NET-03'||d.id==='NET-04'?'':`NET-0${d.pod+1}`}
    case 'chiller':return {powerA:'LV-A',powerB:'LV-B',supply:'HDR-CW-SUP',return:'HDR-CW-RET'}
    case 'chw-pump':return {powerA:'LV-A',powerB:'LV-B',supply:'HDR-CHW-PUMP-IN',return:'HDR-CHW-SUP'}
    case 'cw-pump':return {powerA:'LV-A',powerB:'LV-B',supply:'HDR-CW-RET',return:'HDR-CW-TOWER-FEED'}
    case 'cooling-tower':return {powerA:'LV-A',powerB:'LV-B',supply:'HDR-CW-TOWER-FEED',return:'HDR-CW-SUP'}
    case 'cdu':case 'crac':return {powerA:'LV-A',powerB:'LV-B',supply:'HDR-CHW-SUP',return:'HDR-CHW-RET'}
    default:return {}
  }
}
export function candidates(layout:EquipmentLayout,d:Equipment,port:Port){
  return Object.values(layout).filter(s=>!s.deleted&&s.id!==d.id&&compatible(d,s,port))
}
export function compatible(d:Equipment,s:Equipment,port:Port){
  if(port==='network')return s.kind==='network'
  if(port==='supply'||port==='return')return d.kind==='rack'?(d.coolingMode==='air'?s.kind==='crac':s.kind==='cdu'):['pipe','chiller','chw-pump','cw-pump','cooling-tower','cdu'].includes(s.kind)
  const allowed:Partial<Record<Equipment['kind'],Equipment['kind'][]>>={'generator':['lv-panel'],'lv-panel':['transformer'],'ups':['lv-panel'],'battery':['ups'],'busbar':['ups'],'rpp':['busbar','ups'],'pdu':['rpp','busbar'],'rack':['pdu'],'network':['busbar','ups','pdu']}
  return (allowed[d.kind]??['lv-panel','pdu','rpp']).includes(s.kind)
}
export function connectionError(layout:EquipmentLayout,id:string,port:Port,target:string){
  const d=layout[id],s=layout[target];if(!d||d.deleted||!ports(d).includes(port))return '端口不可用'
  if(!target)return ''
  if(!s||s.deleted||id===target||!compatible(d,s,port))return '设备类型与端口不兼容'
  if(port==='powerA'||port==='powerB'||port==='network'){
    const seen=new Set<string>();const reaches=(next:string):boolean=>{if(next===id)return true;if(seen.has(next)||!layout[next])return false;seen.add(next);const c=connections(layout[next]);return (port==='network'?[c.network]:[c.powerA,c.powerB]).some(v=>v?reaches(v):false)}
    if(reaches(target))return '连接形成循环，请选择有效上游'
  }
  return ''
}
export function powerReachable(layout:EquipmentLayout,id:string,bus?:'A'|'B',seen=new Set<string>(),liveRoots?:Set<string>):boolean{
  const d=layout[id];if(!d?.installed||!d.enabled||d.deleted||seen.has(id))return false
  if(bus&&(d.id===`BUS-${bus==='A'?'B':'A'}`||d.kind==='ups'&&d.id.startsWith(`UPS-${bus==='A'?'B':'A'}`)))return false
  if(liveRoots?.has(id))return true
  if(d.kind==='transformer')return true
  if(d.kind==='generator')return false
  const c=connections(d),next=new Set(seen).add(id)
  return [c.powerA,c.powerB].some(source=>source?powerReachable(layout,source,bus,next,liveRoots):false)
}
export function waterConnected(layout:EquipmentLayout,d:Equipment){
  if(!['cdu','crac','chiller','chw-pump','cw-pump','cooling-tower'].includes(d.kind))return true
  const c=connections(d);return [c.supply,c.return].every(id=>id&&layout[id]?.installed&&layout[id].enabled&&!layout[id].deleted)
}

export function networkReachable(layout:EquipmentLayout,id:string,seen=new Set<string>()):boolean{
  const d=layout[id];if(!d?.installed||!d.enabled||d.deleted||d.kind!=='network'||seen.has(id))return false
  const source=connections(d).network
  if(!source)return /^NET-0[1-4]$/.test(id)
  return networkReachable(layout,source,new Set(seen).add(id))
}
