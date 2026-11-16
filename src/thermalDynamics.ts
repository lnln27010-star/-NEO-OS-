import {calculateFrame,DEFAULT_PARAMETERS,type OperationFrame,type Scenario,type SimulationParameters} from './operationsModel'
import {PODS,type EquipmentLayout} from './equipmentModel'
import {waterConnected,powerReachable,connections} from './equipmentConnections'
export type OperatingEvent={seconds:number;layout:EquipmentLayout;load:number;parameters:SimulationParameters}
export type DynamicInput=OperatingEvent&{scenario:Scenario}
const bound=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x))
const fullBattery=(layout:EquipmentLayout,bus:string)=>Object.values(layout).filter(d=>!d.deleted).filter(d=>d.kind==='battery'&&d.installed&&d.enabled&&!d.deleted&&Boolean(connections(d).powerA&&layout[connections(d).powerA!]?.installed)&&d.id.startsWith(`BAT-${bus}`)).reduce((s,d)=>s+d.capacity,0)

/** 1s integration of stored thermal energy and battery energy. Electrical topology is instantaneous. */
export function advanceOperatingFrame(input:DynamicInput,previous?:OperationFrame,dt=0):OperationFrame{
  const p=input.parameters??DEFAULT_PARAMETERS,layout=input.layout,ready=(id:string)=>Boolean(layout[id]?.installed&&layout[id]?.enabled)
  const old=previous?.thermal??{primaryC:12,secondaryC:{},podC:[p.airSetpointC,p.airSetpointC,p.airSetpointC,p.airSetpointC],batteryKwhA:fullBattery(layout,'A'),batteryKwhB:fullBattery(layout,'B'),gridOutageSeconds:0}
  const mains=ready('TX-A')&&ready('LV-A')||ready('TX-B')&&ready('LV-B'),outage=mains?0:old.gridOutageSeconds+dt
  const frame=calculateFrame({...input,batteryRemaining:{A:Math.min(old.batteryKwhA,fullBattery(layout,'A')),B:Math.min(old.batteryKwhB,fullBattery(layout,'B'))},gridOutageSeconds:outage})
  const t={...old,secondaryC:{...old.secondaryC},podC:[...old.podC],gridOutageSeconds:outage}
  const primaryMass=Math.max(1,p.primaryVolumeM3)*1000*4.186
  let heatToPrimaryKw=0
  const previousRacks=new Map(previous?.racks.map(r=>[r.id,r])??[])
  for(const r of frame.racks){
    const supplied=old.secondaryC[r.cooling]??p.supplyC,air=previousRacks.get(r.id)?.inletC??p.airSetpointC
    if(r.coolingMode==='liquid'){
      const nominalOutlet=air+r.powerKw/(1.2*1.006*2),effectiveness=bound((nominalOutlet-supplied)/Math.max(1,nominalOutlet-p.supplyC),0,1)
      r.heatToWaterKw*=effectiveness;r.heatToAirKw=r.powerKw-r.heatToWaterKw
    }
  }
  for(const cdu of Object.values(layout).filter(d=>!d.deleted).filter(d=>d.kind==='cdu')){
    const group=frame.racks.filter(r=>r.cooling===cdu.id),heat=group.reduce((s,r)=>s+r.heatToWaterKw,0),mass=Math.max(.05,p.secondaryVolumeM3)*1000*4.186,current=old.secondaryC[cdu.id]??p.supplyC
    const target=Math.max(p.supplyC,old.primaryC+4),transferRatio=frame.totalPowerKw>0?Math.min(1,frame.actualChwM3h/(frame.totalPowerKw*3.6/(4.186*6))):1
    const removal=ready(cdu.id)&&frame.actualChwM3h>0?bound(heat+mass*(current-target)/45,0,cdu.capacity*transferRatio):0
    heatToPrimaryKw+=removal
    t.secondaryC[cdu.id]=bound(current+dt*(heat-removal)/mass,10,85)
  }
  const roots=frame.electrical.generatorReady?new Set(['LV-A','LV-B']):undefined
  const plantReady=(d:typeof layout[string])=>d.installed&&d.enabled&&!d.deleted&&waterConnected(layout,d)&&powerReachable(layout,d.id,undefined,new Set(),roots)
  const cracs=Object.values(layout).filter(d=>!d.deleted).filter(d=>d.kind==='crac'&&plantReady(d))
  const utility=frame.electrical.mainsA||frame.electrical.mainsB||frame.electrical.generatorReady
  for(let pod=0;pod<4;pod++){
    const group=frame.racks.filter(r=>r.pod===pod),heat=group.reduce((s,r)=>s+r.heatToAirKw,0),capacity=utility&&frame.actualChwM3h>0?cracs.filter(d=>d.pod===pod).reduce((s,d)=>s+d.capacity,0)*bound(frame.actualChwM3h/Math.max(1,frame.totalPowerKw*3.6/(4.186*6)),0,1):0
    const supply=p.airSetpointC+Math.max(0,old.primaryC-12)*.45,mass=Math.max(1000,p.podThermalMassKjK),removal=bound(heat+mass*(old.podC[pod]-supply)/25,0,capacity)
    heatToPrimaryKw+=removal
    t.podC[pod]=bound(old.podC[pod]+dt*(heat-removal)/mass,15,90)
    for(const r of group){
      const d=layout[r.id],zone=PODS[pod],frontZ=d.z+Math.cos(d.yaw)*.7,frontX=d.x+Math.sin(d.yaw)*.7,coldDistance=Math.min(Math.abs(frontZ-zone.startZ-1.9),Math.abs(frontZ-zone.startZ-8.3))
      const placementPenalty=(frontX<zone.startX-.8||frontX>zone.startX+25.2||coldDistance>1.35||Math.abs(Math.sin(d.yaw))>.5)?4*r.powerKw/Math.max(1,d.capacity):0
      const residual=r.coolingMode==='liquid'?Math.max(0,r.heatToAirKw-r.powerKw*.1):capacity>0&&d.cooling&&layout[connections(d).supply??'']?.installed&&layout[connections(d).supply??'']?.enabled?0:r.heatToAirKw
      const recirculation=.45*residual/(1.2*1.006*(r.coolingMode==='liquid'?2:.9)),target=t.podC[pod]+recirculation+placementPenalty,current=previousRacks.get(r.id)?.inletC??p.airSetpointC
      r.inletC=bound(current+Math.min(1,dt/12)*(target-current),10,95)
      r.outletC=r.inletC+r.powerKw/(1.2*1.006*(r.coolingMode==='liquid'?2:.9));r.rearDoorOutletC=r.inletC+r.heatToAirKw/(1.2*1.006*(r.coolingMode==='liquid'?2:.9))
      r.waterReturnC=r.flowLpm>0?(t.secondaryC[r.cooling]??p.supplyC)+r.heatToWaterKw/(r.flowLpm/60*4.186):null
      if(r.status!=='offline')r.status=r.inletC>=35?'critical':r.inletC>=30||!r.networkOnline||r.coolingMode==='liquid'&&r.flowLpm<p.flowLpm*.55||r.coolingMode==='air'&&(!d.cooling||capacity===0)?'warning':'normal'
      Object.assign(frame.runtime[r.id],{temperatureC:r.inletC,state:r.status==='offline'?'停运':!r.networkOnline?'网络中断':'运行'})
    }
  }
  const removedKw=bound(heatToPrimaryKw+Math.max(0,old.primaryC-12)*primaryMass/90,0,frame.coldCapacityKw)
  t.primaryC=bound(old.primaryC+dt*(heatToPrimaryKw-removedKw)/primaryMass,8,80)
  const oldDelivered=frame.coolingDeliveredKw;frame.coolingDeliveredKw=removedKw
  frame.facilityPowerKw+=(removedKw-oldDelivered)/5.5*1.012;frame.pue=frame.totalPowerKw>0?frame.facilityPowerKw/frame.totalPowerKw:null
  for(const bus of ['A','B'] as const){
    const key=bus==='A'?'batteryKwhA':'batteryKwhB',discharging=bus==='A'?frame.electrical.batteryA:frame.electrical.batteryB,grid=bus==='A'?frame.electrical.mainsA:frame.electrical.mainsB
    const draw=bus==='A'?frame.electrical.busPowerA:frame.electrical.busPowerB
    t[key]=bound(old[key]+dt*(discharging?-draw/3600:grid||frame.electrical.generatorReady?80/3600:0),0,fullBattery(layout,bus))
    for(const d of Object.values(layout).filter(d=>!d.deleted).filter(d=>d.kind==='battery'&&d.id.startsWith(`BAT-${bus}`))){frame.runtime[d.id].utilization=fullBattery(layout,bus)>0?1-t[key]/fullBattery(layout,bus):0;if(d.installed&&d.enabled&&!discharging&&(grid||frame.electrical.generatorReady)&&t[key]<fullBattery(layout,bus)){frame.runtime[d.id].powerKw=-80*d.capacity/Math.max(1,fullBattery(layout,bus));frame.runtime[d.id].state='充电';frame.runtime[d.id].active=true}}
  }
  const oldAir=frame.heatToAirKw;frame.heatToWaterKw=frame.racks.reduce((s,r)=>s+r.heatToWaterKw,0);frame.heatToAirKw=frame.totalPowerKw-frame.heatToWaterKw
  frame.facilityPowerKw+=(utility?(frame.heatToAirKw-oldAir)*.035:0)*1.012;frame.pue=frame.totalPowerKw>0?frame.facilityPowerKw/frame.totalPowerKw:null
  const oldCw=frame.actualCwM3h,cwPumps=Object.values(layout).filter(d=>!d.deleted).filter(d=>d.kind==='cw-pump'&&plantReady(d)),cwCapacity=cwPumps.reduce((sum,d)=>sum+d.capacity,0)
  frame.actualCwM3h=utility?Math.min(cwCapacity,removedKw*(1+1/5.5)*3.6/(4.186*5)):0
  frame.facilityPowerKw+=(frame.actualCwM3h-oldCw)*(9.81*35/(3600*.75)+.015)*1.012;frame.pue=frame.totalPowerKw>0?frame.facilityPowerKw/frame.totalPowerKw:null
  frame.thermal=t;frame.chwSupplyC=t.primaryC;frame.chwReturnC=frame.actualChwM3h>0?t.primaryC+heatToPrimaryKw/(frame.actualChwM3h/3.6*4.186):null
  frame.cwReturnC=frame.actualCwM3h>0?29+removedKw*(1+1/5.5)/(frame.actualCwM3h/3.6*4.186):null
  frame.maxInletC=Math.max(p.airSetpointC,...frame.racks.filter(r=>r.installed).map(r=>r.inletC))
  const chillers=Object.values(layout).filter(d=>!d.deleted).filter(d=>d.kind==='chiller'&&plantReady(d)),chCapacity=chillers.reduce((sum,d)=>sum+d.capacity,0),towers=Object.values(layout).filter(d=>!d.deleted).filter(d=>d.kind==='cooling-tower'&&plantReady(d)),towerCap=towers.reduce((sum,d)=>sum+d.capacity,0)
  for(const d of Object.values(layout).filter(d=>!d.deleted)){
    if(d.installed&&d.enabled&&(!['chiller','cw-pump','cooling-tower','crac','cdu'].includes(d.kind)||plantReady(d))){
      if(d.kind==='chiller'){frame.runtime[d.id].powerKw=removedKw/5.5*d.capacity/Math.max(1,chCapacity);frame.runtime[d.id].state=frame.actualCwM3h===0?'无冷却水':removedKw>0?'制冷运行':'待机'}
      if(d.kind==='cw-pump'){const volume=frame.actualCwM3h*d.capacity/Math.max(1,cwCapacity);frame.runtime[d.id].flowM3h=volume;frame.runtime[d.id].powerKw=volume/3600*9.81*35/.75}
      if(d.kind==='cooling-tower'){frame.runtime[d.id].flowM3h=frame.actualCwM3h*d.capacity/Math.max(1,towerCap);frame.runtime[d.id].powerKw=frame.runtime[d.id].flowM3h*.015}
      if(d.kind==='crac'){const total=cracs.filter(c=>c.pod===d.pod).length,heat=frame.racks.filter(r=>r.pod===d.pod).reduce((sum,r)=>sum+r.heatToAirKw,0);frame.runtime[d.id].powerKw=utility?heat*.035/Math.max(1,total):0;frame.runtime[d.id].state=frame.actualChwM3h>0?'制冷运行':'仅送风'}
      if(d.kind==='cdu')frame.runtime[d.id].utilization=frame.racks.filter(r=>r.cooling===d.id).reduce((sum,r)=>sum+r.heatToWaterKw,0)/Math.max(1,d.capacity)
      if(d.id.startsWith('HDR-CW'))frame.runtime[d.id].flowM3h=frame.actualCwM3h
    }
    if(['chiller','chw-pump'].includes(d.kind))frame.runtime[d.id].temperatureC=t.primaryC
    if(d.kind==='cdu')frame.runtime[d.id].temperatureC=t.secondaryC[d.id]
    if(d.kind==='crac')frame.runtime[d.id].temperatureC=frame.actualChwM3h>0?p.airSetpointC+Math.max(0,t.primaryC-12)*.45:t.podC[Math.max(0,d.pod)]
    if(!['rack','battery','generator','pipe','busbar'].includes(d.kind))frame.runtime[d.id].active=d.installed&&d.enabled&&(frame.runtime[d.id].powerKw>0||frame.runtime[d.id].flowM3h>0)
    if(d.id.startsWith('HDR-CW'))frame.runtime[d.id].temperatureC=d.id.includes('SUP')?29:frame.cwReturnC
    if(d.id.startsWith('HDR-CHW'))frame.runtime[d.id].temperatureC=d.id.includes('RET')?frame.chwReturnC:t.primaryC
  }
  frame.alerts=frame.alerts.filter(a=>!a.id.endsWith(':thermal'))
  for(const r of frame.racks)if(r.installed&&r.status!=='offline'&&(r.status==='warning'||r.status==='critical'))frame.alerts.push({id:`${r.id}:thermal`,rackId:r.id,severity:r.status==='critical'?'critical':'warning',message:!r.networkOnline?'网络中断':`进风 ${r.inletC.toFixed(1)} °C${r.coolingMode==='liquid'?` · ${r.flowLpm.toFixed(0)} L/min`:''}`})
  frame.alerts.sort((a,b)=>Number(b.severity==='critical')-Number(a.severity==='critical')||a.rackId.localeCompare(b.rackId))
  return frame
}
let cache:{events:OperatingEvent[];scenario:Scenario;frames:OperationFrame[]}|undefined
export function replayOperatingFrames(events:OperatingEvent[],scenario:Scenario,seconds:number){
  if(!cache||cache.events!==events||cache.scenario!==scenario)cache={events,scenario,frames:[advanceOperatingFrame({...events[0],scenario,seconds:0})]}
  for(let time=cache.frames.length;time<=seconds;time++){
    const previous=cache.frames[time-1],before=[...events].reverse().find(e=>e.seconds<time)??events[0]
    let frame=advanceOperatingFrame({...before,scenario,seconds:time},previous,1)
    const at=events.filter(e=>e.seconds===time).at(-1);if(at)frame=advanceOperatingFrame({...at,scenario,seconds:time},frame,0)
    cache.frames.push(frame)
  }
  return cache.frames.slice(0,seconds+1)
}
