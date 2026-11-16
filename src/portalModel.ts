export type Center='assets'|'planning'|'engineering'|'simulation'|'operations'|'maintenance'|'models'
export const CENTERS:Record<Center,string>={assets:'全域算电驾驶舱',planning:'规划与选址中心',engineering:'设计与工程中心',simulation:'仿真与验证中心',operations:'算电协同运营中心',maintenance:'智能运维中心',models:'模型与能力中心'}
export const ENABLED_CENTERS:Center[]=['assets','planning','engineering','simulation','operations','maintenance','models']
export function isCenterEnabled(center:string|null):center is Center{return ENABLED_CENTERS.includes(center as Center)}
export type Site={id:string;name:string;gridMw:number;price:number;green:number;latency:number;area:number;waterM3d?:number|null;summerC?:number|null;networkGbps?:number|null;landReady?:boolean|null;basis?:string}
export const INITIAL_SITES:Site[]=[{id:'S01',name:'长三角候选站点',gridMw:28,price:.68,green:40,latency:8,area:18000},{id:'S02',name:'西部候选站点',gridMw:36,price:.42,green:75,latency:35,area:24000},{id:'S03',name:'华南候选站点',gridMw:24,price:.61,green:55,latency:18,area:16000}]
export function rankSites(sites:Site[],demand:number,maxLatency:number,minArea:number,weights:number[]){
  const sum=weights.reduce((s,n)=>s+Math.max(0,n),0)||1
  return sites.map(s=>{const reasons=[s.gridMw<demand?'电力容量不足':'',s.latency>maxLatency?'时延超限':'',s.area<minArea?'可用面积不足':''].filter(Boolean),parts=[Math.max(0,100*(1-s.price/1.5)),Math.min(100,s.gridMw/Math.max(1,demand)*55),s.green,Math.max(0,100-s.latency/maxLatency*70)]
    return {...s,eligible:!reasons.length,reasons,score:parts.reduce((v,n,i)=>v+n*Math.max(0,weights[i]),0)/sum}
  }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.score-a.score)
}
export function assessSite(site:Site,demand:number,maxLatency:number,minArea:number){
  const checks=[
    {key:'grid',label:'电力容量',passed:site.gridMw>=demand,detail:`${site.gridMw} / ${demand} MW`,blocking:true},
    {key:'area',label:'可用面积',passed:site.area>=minArea,detail:`${site.area} / ${minArea} m²`,blocking:true},
    {key:'latency',label:'业务时延',passed:site.latency<=maxLatency,detail:`${site.latency} / ${maxLatency} ms`,blocking:true},
    {key:'water',label:'水资源与冷却方案',passed:site.waterM3d!==null&&site.waterM3d!==undefined&&site.waterM3d>=0,detail:site.waterM3d==null?'未录入':`${site.waterM3d} m³/天`,blocking:false},
    {key:'temperature',label:'夏季设计温度',passed:site.summerC!==null&&site.summerC!==undefined&&Number.isFinite(site.summerC),detail:site.summerC==null?'未录入':`${site.summerC} °C`,blocking:false},
    {key:'network',label:'网络带宽',passed:site.networkGbps!==null&&site.networkGbps!==undefined&&site.networkGbps>0,detail:site.networkGbps==null?'未录入':`${site.networkGbps} Gbps`,blocking:false},
    {key:'land',label:'土地条件',passed:site.landReady===true,detail:site.landReady==null?'待核实':site.landReady?'已填写符合':'明确不符合',blocking:site.landReady===false},
    {key:'basis',label:'资料依据',passed:Boolean(site.basis?.trim()),detail:site.basis?.trim()?'已填写来源':'未填写来源或日期',blocking:false},
  ]
  const failed=checks.filter(check=>check.blocking&&!check.passed)
  return {checks,status:failed.length?'不满足当前边界':checks.some(check=>!check.passed)?'资料待补齐':'可进入设计复核',ready:checks.every(check=>check.passed)}
}
export function designCapacity(racks:number,liquid:number,kwAir:number,kwLiquid:number,pue:number,redundancy:'N+1'|'2N'){
  const liquidRacks=Math.round(racks*liquid/100),airRacks=racks-liquidRacks,itMw=(airRacks*kwAir+liquidRacks*kwLiquid)/1000,waterMw=liquidRacks*kwLiquid*.9/1000,airMw=itMw-waterMw,n=Math.ceil(itMw/2),ups=redundancy==='2N'?n*2:n+1
  return {racks,airRacks,liquidRacks,itMw,facilityMw:itMw*pue,waterMw,airMw,ups,cdu:Math.ceil(waterMw/2.5),crac:Math.ceil(airMw/.25),chillers:Math.ceil(itMw/2)+1,area:Math.ceil(racks*7+500),redundancy}
}
export type DispatchInput={loadMw:number;flex:number;gridLimit:number;batteryMwh:number;batteryMw:number;reserve:number}
export type DispatchSite={id:string;name:string;capacity:number;price:number;pue:number;solar:number}
export const DISPATCH_SITES:DispatchSite[]=[{id:'D01',name:'东部节点',capacity:12,price:.68,pue:1.3,solar:2},{id:'D02',name:'西部节点',capacity:16,price:.42,pue:1.2,solar:5},{id:'D03',name:'南部节点',capacity:10,price:.61,pue:1.25,solar:3}]
export function dispatchDay(sites:DispatchSite[],input:DispatchInput){
  let soc=input.batteryMwh*.5,rows=[]
  for(let hour=0;hour<24;hour++){
    const factor=hour<7?.55:hour>=17&&hour<=21?1.45:1,solarFactor=Math.max(0,Math.sin((hour-6)/12*Math.PI)),fixed=input.loadMw*(1-input.flex/100)/sites.length
    const allocations=sites.map(s=>({id:s.id,name:s.name,mw:Math.min(s.capacity,fixed),price:s.price*factor,pue:s.pue,solar:s.solar*solarFactor,capacity:s.capacity})),fixedServed=allocations.reduce((n,s)=>n+s.mw,0)
    let remaining=input.loadMw-fixedServed
    // Only the declared flexible load can move; unmet pinned demand remains an explicit deficit.
    let movable=Math.min(remaining,input.loadMw*input.flex/100)
    for(const s of [...allocations].sort((a,b)=>a.price*a.pue-b.price*b.pue)){const add=Math.min(movable,s.capacity-s.mw);s.mw+=add;movable-=add;remaining-=add}
    const rawGrid=allocations.reduce((n,s)=>n+Math.max(0,s.mw*s.pue-s.solar),0),charge=factor<1?Math.min(input.batteryMw,Math.max(0,input.batteryMwh-soc)/.95,Math.max(0,input.gridLimit-rawGrid)):0
    const discharge=factor>1||rawGrid>input.gridLimit?Math.min(input.batteryMw,Math.max(0,soc-input.batteryMwh*input.reserve/100)*.95,rawGrid):0
    soc=Math.max(0,Math.min(input.batteryMwh,soc+charge*.95-discharge/.95))
    const grid=rawGrid+charge-discharge,weighted=rawGrid>0?allocations.reduce((n,s)=>n+Math.max(0,s.mw*s.pue-s.solar)*s.price,0)/rawGrid:allocations.reduce((n,s)=>n+s.price,0)/Math.max(1,allocations.length)
    rows.push({hour,allocations,grid,charge,discharge,soc,cost:(grid*weighted)*1000,baselineCost:allocations.reduce((n,s)=>n+Math.max(0,Math.min(s.capacity,input.loadMw/sites.length)*s.pue-s.solar)*s.price*1000,0),unserved:remaining,overLimit:Math.max(0,grid-input.gridLimit)})
  }
  const terminalAdjustment=(input.batteryMwh*.5-soc)*sites.reduce((n,s)=>n+s.price,0)/Math.max(1,sites.length)/.95*1000
  return {rows,terminalAdjustment,cost:rows.reduce((n,r)=>n+r.cost,0)+terminalAdjustment,baselineCost:rows.reduce((n,r)=>n+r.baselineCost,0),unserved:rows.reduce((n,r)=>n+r.unserved,0),overHours:rows.filter(r=>r.overLimit>.001).length,finalSoc:soc}
}
