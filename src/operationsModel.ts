/** Deterministic engineering reference model; empirical room heat response, not CFD. */
import { defaultEquipment, RACK_LAYOUT, rackDescriptors, type EquipmentLayout, type DeviceKind } from './equipmentModel'
import {connections,powerReachable,waterConnected,networkReachable} from './equipmentConnections'
export type Scenario='baseline'|'cooling-loss'|'feeder-trip'|'network-loss'|'ups-a-loss'
export type OperationLayer='thermal'|'electrical'|'network'
export const MODEL_VERSION='NB-OPS-5.0',DURATION=120,FAULT_AT=20
export const RACKS=RACK_LAYOUT
export const DEFAULT_PARAMETERS={rackRatedKw:60,airRackRatedKw:16,flowLpm:60,supplyC:22,feederCapacityKw:2400,primaryVolumeM3:20,secondaryVolumeM3:2,podThermalMassKjK:14000,airSetpointC:24}
export type SimulationParameters=typeof DEFAULT_PARAMETERS
export type RackResult=typeof RACKS[number]&{powerKw:number;currentA:number;inletC:number;outletC:number;waterReturnC:number|null;flowLpm:number;installed:boolean;serverCount:number;onlineServers:number;redundantPower:boolean;networkOnline:boolean;heatToWaterKw:number;heatToAirKw:number;rearDoorOutletC:number;powerAActive:boolean;powerBActive:boolean;status:'normal'|'warning'|'critical'|'offline'}
export type OperationAlert={id:string;rackId:string;severity:'warning'|'critical';message:string}
export type DeviceRuntime={active:boolean;powerKw:number;flowM3h:number;temperatureC:number|null;utilization:number;state:string}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,Number.isFinite(v)?v:min))
const reference=defaultEquipment()
export function calculateFrame(input:{scenario:Scenario;load:number;seconds:number;layout?:EquipmentLayout;parameters?:SimulationParameters;batteryRemaining?:{A:number;B:number};gridOutageSeconds?:number}){
  const layout=input.layout??reference,devices=Object.values(layout).filter(d=>!d.deleted),rackList=rackDescriptors(layout),params=input.parameters??DEFAULT_PARAMETERS
  const load=clamp(input.load,30,100),seconds=clamp(input.seconds,0,DURATION),faultActive=seconds>=FAULT_AT&&input.scenario!=='baseline'
  const growth=faultActive?1-Math.exp(-(seconds-FAULT_AT)/18):0,settle=1-Math.exp(-seconds/35)
  const ready=(id:string)=>Boolean(layout[id]?.installed&&layout[id]?.enabled&&!layout[id]?.deleted)
  const memberCache=new Map<DeviceKind,typeof devices>()
  const members=(kind:DeviceKind)=>{if(!memberCache.has(kind))memberCache.set(kind,devices.filter(d=>d.kind===kind&&d.installed&&d.enabled&&waterConnected(layout,d)&&(d.kind!=='generator'||[connections(d).powerA,connections(d).powerB].some(id=>id&&ready(id)))&&(!['battery','ups'].includes(kind)||Boolean(connections(d).powerA&&layout[connections(d).powerA!]?.installed&&!layout[connections(d).powerA!]?.deleted))&&(!['chiller','chw-pump','cw-pump','cooling-tower','crac','cdu'].includes(kind)||powerReachable(layout,d.id,undefined,new Set(),generatorReady?new Set(['LV-A','LV-B']):undefined))));return memberCache.get(kind)!}
  const capacity=(kind:DeviceKind)=>members(kind).reduce((s,d)=>s+d.capacity,0)
  const totalEstimated=rackList.reduce((s,r)=>s+(r.coolingMode==='air'?params.airRackRatedKw:params.rackRatedKw)*load/100*(layout[r.id]?.installed?layout[r.id].modules.filter((v,i)=>v&&i!==layout[r.id].extracted).length/20:0),0)
  const mainsA=devices.some(d=>d.kind==='lv-panel'&&d.id.startsWith('LV-A')&&powerReachable(layout,d.id)),mainsB=devices.some(d=>d.kind==='lv-panel'&&d.id.startsWith('LV-B')&&powerReachable(layout,d.id))
  const generatorReady=!mainsA&&!mainsB&&(input.gridOutageSeconds??seconds)>=30&&capacity('generator')>=totalEstimated*1.2
  const utility=mainsA||mainsB||generatorReady
  const batteryEnergy=(bus:string)=>members('battery').filter(d=>d.id.startsWith(`BAT-${bus}`)).reduce((s,d)=>s+d.capacity,0)
  const batteryA=!mainsA&&!generatorReady&&(input.batteryRemaining?.A??batteryEnergy('A')-totalEstimated/2*seconds/3600)>0
  const batteryB=!mainsB&&!generatorReady&&(input.batteryRemaining?.B??batteryEnergy('B')-totalEstimated/2*seconds/3600)>0
  const upsModules=(bus:string)=>members('ups').filter(d=>d.id.startsWith(`UPS-${bus}`)&&(generatorReady||(bus==='A'?batteryA:batteryB)||powerReachable(layout,connections(d).powerA??'')))
  const upsAReady=upsModules('A').length>0&&(mainsA||generatorReady||batteryA)&&!(faultActive&&input.scenario==='ups-a-loss')
  const upsBReady=upsModules('B').length>0&&(mainsB||generatorReady||batteryB)
  const chwCapacity=utility?capacity('chw-pump'):0,cwCapacity=utility?capacity('cw-pump'):0
  const coldCapacity=utility&&chwCapacity>0&&cwCapacity>0?Math.min(capacity('chiller'),capacity('cooling-tower')/1.2,chwCapacity/3.6*4.186*6,cwCapacity/3.6*4.186*5/1.2):0
  const roots=new Set([...(upsAReady?upsModules('A'):[]),...(upsBReady?upsModules('B'):[])].map(d=>d.id));if(generatorReady){roots.add('LV-A');roots.add('LV-B')}
  const pathCache=new Map<string,boolean>()
  const path=(source:string|undefined,bus:'A'|'B')=>{if(!source)return false;const key=source+bus;if(!pathCache.has(key))pathCache.set(key,powerReachable(layout,source,bus,new Set(),roots));return pathCache.get(key)!}
  const rackPower=(d:typeof devices[number],bus:'A'|'B')=>{const c=connections(d);return Boolean((bus==='A'?d.powerA&&upsAReady:d.powerB&&upsBReady)&&path(bus==='A'?c.powerA:c.powerB,bus))}
  const effectiveDemand=rackList.reduce((sum,r)=>{const d=layout[r.id],powered=d?.installed&&d.enabled&&(rackPower(d,'A')||rackPower(d,'B'))&&!(faultActive&&input.scenario==='feeder-trip'&&r.feeder==='PDU-C'),network=d?.network&&ready(r.networkNode)&&networkReachable(layout,r.networkNode)&&powerReachable(layout,r.networkNode,undefined,new Set(),roots)&&!(faultActive&&input.scenario==='network-loss'&&r.pod===3);return sum+(powered?(r.coolingMode==='air'?params.airRackRatedKw:params.rackRatedKw)*load/100*d.modules.filter((v,i)=>v&&i!==d.extracted).length/20*(network?1:.2):0)},0)
  const plantShortfall=effectiveDemand>0?Math.max(0,1-coldCapacity/effectiveDemand):0
  const chwSupplyC=12+20*plantShortfall*settle
  const secondarySupplyC=clamp(params.supplyC,15,40)+20*plantShortfall*settle
  const racks:RackResult[]=rackList.map(r=>{
    const d=layout[r.id],installed=d?.installed??false,serverCount=d?.modules.filter((v,i)=>v&&i!==d.extracted).length??0
    const powerA=rackPower(d,'A'),powerB=rackPower(d,'B')
    const branch=(powerA||powerB)&&!(faultActive&&input.scenario==='feeder-trip'&&r.feeder==='PDU-C')
    const disconnected=!installed||!d.enabled||!branch||!powerA&&!powerB
    const networkOnline=Boolean(d?.network&&(upsAReady||upsBReady)&&ready(r.networkNode)&&networkReachable(layout,r.networkNode)&&powerReachable(layout,r.networkNode,undefined,new Set(),roots)&&!(faultActive&&input.scenario==='network-loss'&&r.pod===3))
    const rated=clamp(!reference[d.id]?d.capacity:r.coolingMode==='air'?params.airRackRatedKw:params.rackRatedKw,2,200)
    const powerKw=disconnected?0:rated*load/100*serverCount/20*(networkOnline?1:.2)
    const cduActive=ready(r.cooling)&&waterConnected(layout,layout[r.cooling])&&utility,pipeActive=ready(connections(d).return??r.cooling)&&(d.connections?true:ready(`PIPE-SUP-${r.pod}`)&&ready(`PIPE-RET-${r.pod}`))
    const impaired=faultActive&&input.scenario==='cooling-loss'&&r.cooling==='CDU-02'
    const liquid=r.coolingMode==='liquid'
    const baseCdu=reference[r.cooling],currentCdu=layout[r.cooling],baseLength=baseCdu?Math.hypot(r.x-baseCdu.x,r.z-baseCdu.z):0,currentLength=currentCdu?Math.hypot(d.x-currentCdu.x,d.z-currentCdu.z):baseLength
    const hydraulic=Math.sqrt((15+baseLength)/(15+Math.max(baseLength,currentLength)))
    const flowLpm=!disconnected&&serverCount&&liquid&&d.cooling&&cduActive&&pipeActive?clamp(params.flowLpm,10,250)*(impaired?1-.65*growth:1)*hydraulic:0
    const cracs=members('crac').filter(c=>c.pod===r.pod)
    const airSupply=utility&&chwCapacity>0&&cracs.length>0&&(liquid||d.cooling&&ready(r.cooling)&&waterConnected(layout,layout[r.cooling]))
    const liquidCapture=liquid&&flowLpm>0?.9*Math.min(1,flowLpm/Math.max(10,params.flowLpm)):0
    const heatToWaterKw=powerKw*liquidCapture,heatToAirKw=powerKw-heatToWaterKw
    const inletC=24+(chwSupplyC-12)*.55+(liquid?(secondarySupplyC-22)*.3:0)+(!airSupply?20*settle*powerKw/rated:0)+(liquid&&flowLpm===0?15*settle*powerKw/rated:0)+(impaired?12*growth:0)
    const outletC=inletC+powerKw/(1.2*1.006*(liquid?2:.9)),rearDoorOutletC=inletC+heatToAirKw/(1.2*1.006*(liquid?2:.9))
    const waterReturnC=flowLpm>0?secondarySupplyC+heatToWaterKw/(flowLpm/60*4.186):null
    const status=!installed||disconnected||!serverCount?'offline':inletC>=35?'critical':inletC>=30||!airSupply||liquid&&flowLpm<clamp(params.flowLpm,10,250)*.55||!networkOnline?'warning':'normal'
    return {...r,x:d?.x??r.x,z:d?.z??r.z,yaw:d?.yaw??r.yaw,powerKw,currentA:powerKw*1000/(Math.sqrt(3)*415*.98),inletC,outletC,waterReturnC,flowLpm,installed,serverCount,onlineServers:disconnected||!networkOnline?0:serverCount,redundantPower:powerA&&powerB,networkOnline,heatToWaterKw,heatToAirKw,rearDoorOutletC,powerAActive:powerA,powerBActive:powerB,status}
  })
  for(const cdu of devices.filter(d=>d.kind==='cdu')){const served=racks.filter(r=>r.cooling===cdu.id),heat=served.reduce((s,r)=>s+r.heatToWaterKw,0),factor=Math.min(1,cdu.capacity/Math.max(1,heat));if(factor<1)for(const r of served){r.heatToWaterKw*=factor;r.heatToAirKw=r.powerKw-r.heatToWaterKw;r.waterReturnC=r.flowLpm>0?secondarySupplyC+r.heatToWaterKw/(r.flowLpm/60*4.186):null;r.rearDoorOutletC=r.inletC+r.heatToAirKw/(1.2*1.006*2);if(r.status==='normal'&&factor<.85)r.status='warning'}}
  const feeders=Array.from({length:16},(_,row)=>{const group=racks.filter(r=>r.feeder===`PDU-${String.fromCharCode(65+row)}`),powerKw=group.reduce((s,r)=>s+r.powerKw,0),capacityKw=Math.min(clamp(params.feederCapacityKw,100,10000),layout[`PDU-${String.fromCharCode(65+row)}`]?.capacity??params.feederCapacityKw);return {id:`PDU-${String.fromCharCode(65+row)}`,powerKw,capacityKw,loadPercent:powerKw/capacityKw*100,currentA:powerKw*1000/(Math.sqrt(3)*415*.98),open:group.every(r=>r.status==='offline'),members:group.map(r=>r.id)}})
  for(const d of devices.filter(d=>d.kind==='pdu'&&!feeders.some(f=>f.id===d.id))){const group=racks.filter(r=>r.feeder===d.id),powerKw=group.reduce((s,r)=>s+r.powerKw,0);feeders.push({id:d.id,powerKw,capacityKw:d.capacity,loadPercent:powerKw/d.capacity*100,currentA:powerKw*1000/(Math.sqrt(3)*415*.98),open:group.every(r=>r.status==='offline'),members:group.map(r=>r.id)})}
  for(const r of racks){const index=feeders.findIndex(f=>f.id===r.feeder);r.row=index>=0?index:0}
  const totalPowerKw=racks.reduce((s,r)=>s+r.powerKw,0),heatToWaterKw=racks.reduce((s,r)=>s+r.heatToWaterKw,0),heatToAirKw=totalPowerKw-heatToWaterKw
  const coolingDeliveredKw=Math.min(totalPowerKw,coldCapacity)
  const actualChwM3h=utility?Math.min(chwCapacity,totalPowerKw*3.6/(4.186*6)):0
  const chillerKw=utility&&coldCapacity>0?Math.min(totalPowerKw,coldCapacity)/5.5:0
  const actualCwM3h=utility?Math.min(cwCapacity,(coolingDeliveredKw+chillerKw)*3.6/(4.186*5)):0
  const airFanKw=utility?heatToAirKw*.035:0,pumpKw=(actualChwM3h+actualCwM3h)/3600*9.81*35/.75
  const netA=upsAReady&&ready('BUS-A'),netB=upsBReady&&ready('BUS-B')
  const networkKw=devices.filter(d=>d.kind==='network'&&powerReachable(layout,d.id,undefined,new Set(),roots)).length*2.4,upsLossKw=totalPowerKw*.03
  const cduPumpKw=racks.reduce((s,r)=>s+r.flowLpm*.06,0)/3600*9.81*25/.7,towerFanKw=actualCwM3h*.015
  const facilityPowerKw=(totalPowerKw+chillerKw+airFanKw+pumpKw+networkKw+upsLossKw+cduPumpKw+towerFanKw)*1.012
  const airCapacityByPod=[0,1,2,3].map(p=>utility&&chwCapacity>0?members('crac').filter(d=>d.pod===p).reduce((s,d)=>s+d.capacity,0):0)
  const heatByPod=[0,1,2,3].map(p=>racks.filter(r=>r.pod===p).reduce((s,r)=>s+r.heatToAirKw,0))
  const rackLookup=new Map(racks.map(r=>[r.id,r]))
  const alerts:OperationAlert[]=[]
  for(const r of racks){if(!r.installed)continue;const f=feeders[r.row]
    if(r.status==='offline')alerts.push({id:`${r.id}:offline`,rackId:r.id,severity:'critical',message:r.serverCount?`${r.feeder} 无有效供电 / 设备关闭`:'没有已安装服务器'})
    else if(r.status==='critical'||r.status==='warning')alerts.push({id:`${r.id}:thermal`,rackId:r.id,severity:r.status==='critical'?'critical':'warning',message:!r.networkOnline?'网络中断 · 业务停止':`进风 ${r.inletC.toFixed(1)} °C · ${r.coolingMode==='liquid'?`流量 ${r.flowLpm.toFixed(0)} L/min`:'风冷运行'}`})
    else if(!r.redundantPower)alerts.push({id:`${r.id}:redundancy`,rackId:r.id,severity:'warning',message:'单路 PDU 供电 · 冗余丢失'})
    else if(f.loadPercent>100)alerts.push({id:`${r.id}:overload`,rackId:r.id,severity:'warning',message:`${f.id} 配电负载 ${f.loadPercent.toFixed(0)}%`})
    else if(airCapacityByPod[r.pod]<heatByPod[r.pod])alerts.push({id:`${r.id}:capacity`,rackId:r.id,severity:'warning',message:'本数据厅精密空调容量不足'})
  }
  alerts.sort((a,b)=>Number(b.severity==='critical')-Number(a.severity==='critical')||a.rackId.localeCompare(b.rackId))
  const busPowerA=racks.reduce((s,r)=>s+(r.powerAActive?r.powerKw/(r.powerBActive?2:1):0),0)+(netA?networkKw/(netB?2:1):0)
  const busPowerB=racks.reduce((s,r)=>s+(r.powerBActive?r.powerKw/(r.powerAActive?2:1):0),0)+(netB?networkKw/(netA?2:1):0)
  const mechanicalKw=chillerKw+airFanKw+pumpKw+cduPumpKw+towerFanKw
  const gridPowerA=(mainsA||generatorReady)?((batteryA?0:busPowerA*1.03)+mechanicalKw/(mainsB||generatorReady?2:1))*1.012:0
  const gridPowerB=(mainsB||generatorReady)?((batteryB?0:busPowerB*1.03)+mechanicalKw/(mainsA||generatorReady?2:1))*1.012:0
  const runtime:Record<string,DeviceRuntime>={}
  for(const d of devices){const active=d.installed&&d.enabled&&(d.kind!=='generator'||members('generator').some(g=>g.id===d.id))&&waterConnected(layout,d)&&(d.kind!=='generator'||[connections(d).powerA,connections(d).powerB].some(id=>id&&ready(id)))&&(!['chiller','chw-pump','cw-pump','cooling-tower','crac','cdu','network'].includes(d.kind)||powerReachable(layout,d.id,undefined,new Set(),roots))&&(!['ups','battery'].includes(d.kind)||Boolean(connections(d).powerA&&layout[connections(d).powerA!]?.installed));let powerKw=0,flowM3h=0,temperatureC:number|null=null,utilization=0,state=active?'就绪':'停用'
    const rack=rackLookup.get(d.id)
    if(rack){powerKw=rack.powerKw;flowM3h=rack.flowLpm*.06;temperatureC=rack.inletC;utilization=rack.powerKw/Math.max(1,d.capacity);state=rack.status==='offline'?'停运':rack.networkOnline?'运行':'网络中断'}
    else if(active){
      if(d.kind==='chw-pump'||d.kind==='cw-pump'){const kind=d.kind,all=members(kind);flowM3h=(kind==='chw-pump'?actualChwM3h:actualCwM3h)*d.capacity/Math.max(1,capacity(kind));powerKw=flowM3h/3600*9.81*35/.75;temperatureC=kind==='chw-pump'?chwSupplyC:29;utilization=flowM3h/Math.max(1,d.capacity)}
      if(d.kind==='chiller'){powerKw=chillerKw*d.capacity/Math.max(1,capacity('chiller'));flowM3h=actualChwM3h*d.capacity/Math.max(1,capacity('chiller'));temperatureC=chwSupplyC;utilization=powerKw*5.5/Math.max(1,d.capacity)}
      if(d.kind==='cooling-tower'){flowM3h=actualCwM3h*d.capacity/Math.max(1,capacity('cooling-tower'));powerKw=utility?flowM3h*.015:0;temperatureC=29;utilization=(totalPowerKw+chillerKw)/Math.max(1,capacity('cooling-tower'))}
      if(d.kind==='crac'){powerKw=utility?airFanKw/Math.max(1,members('crac').length):0;flowM3h=powerKw/.035*3600/(1.2*1.006*12);temperatureC=24+(chwSupplyC-12)*.55;utilization=powerKw/.035/Math.max(1,d.capacity)}
      if(d.kind==='cdu'){const served=racks.filter(r=>r.cooling===d.id);flowM3h=served.reduce((s,r)=>s+r.flowLpm*.06,0);powerKw=flowM3h/3600*9.81*25/.7;temperatureC=secondarySupplyC;utilization=served.reduce((s,r)=>s+r.heatToWaterKw,0)/Math.max(1,d.capacity)}
      if(d.kind==='pdu'){powerKw=feeders.find(f=>f.id===d.id)?.powerKw??0;utilization=powerKw/Math.max(1,d.capacity)}
      if(d.kind==='network'){powerKw=netA||netB?2.4:0;utilization=racks.filter(r=>r.networkNode===d.id).reduce((s,r)=>s+r.onlineServers*10*load/100,0)/Math.max(1,d.capacity)}
      if(d.kind==='transformer'||d.kind==='lv-panel'||d.kind==='ups'){const bus=d.id.includes('-A')?'A':'B',has=bus==='A'?upsAReady:upsBReady;powerKw=d.kind==='transformer'&&!devices.some(s=>connections(s).powerA===d.id||connections(s).powerB===d.id)?0:d.kind==='ups'?(has?(bus==='A'?busPowerA:busPowerB)/Math.max(1,upsModules(bus).length):0):(bus==='A'?gridPowerA:gridPowerB)/(d.kind==='lv-panel'&&d.id!==`LV-${bus}`?2:1);utilization=powerKw/Math.max(1,d.capacity);state=d.kind==='ups'&&(bus==='A'?batteryA:batteryB)?'电池供电':has?'运行':'无有效上游'}
      if(d.kind==='battery'){const supplying=d.id.startsWith('BAT-A')?batteryA:batteryB;powerKw=supplying?(d.id.startsWith('BAT-A')?busPowerA:busPowerB)*d.capacity/Math.max(1,batteryEnergy(d.id.startsWith('BAT-A')?'A':'B')):0;utilization=supplying?Math.min(1,powerKw*seconds/3600/Math.max(1,d.capacity)):0;state=supplying?'放电':'浮充 / 待命'}
      if(d.kind==='generator'){powerKw=generatorReady?facilityPowerKw/Math.max(1,members('generator').length):0;state=generatorReady?'备用供电':'待命';utilization=powerKw/Math.max(1,d.capacity)}
      if(d.kind==='rpp'){powerKw=racks.filter(r=>r.pod===d.pod).reduce((s,r)=>s+r.powerKw,0);utilization=powerKw/Math.max(1,d.capacity)}
      if(d.kind==='busbar'){powerKw=d.id.startsWith('BUS-A')?busPowerA:busPowerB;utilization=powerKw/Math.max(1,d.capacity)}
      if(d.kind==='pipe'){flowM3h=racks.filter(r=>r.pod===d.pod).reduce((s,r)=>s+r.flowLpm*.06,0);temperatureC=d.id.includes('SUP')?secondarySupplyC:secondarySupplyC+heatToWaterKw/Math.max(1,racks.reduce((s,r)=>s+r.flowLpm/60*4.186,0));if(d.id.startsWith('HDR-CHW')){flowM3h=actualChwM3h;temperatureC=(d.id.includes('SUP')||d.id.includes('PUMP-IN'))?chwSupplyC:actualChwM3h>0?chwSupplyC+coolingDeliveredKw/(actualChwM3h/3.6*4.186):null}if(d.id.startsWith('HDR-CW')){flowM3h=actualCwM3h;temperatureC=d.id.includes('SUP')?29:actualCwM3h>0?29+(coolingDeliveredKw+chillerKw)/(actualCwM3h/3.6*4.186):null}}
    }
    runtime[d.id]={active:active&&(rack?rack.status!=='offline':d.kind==='battery'||d.kind==='generator'?powerKw>0:powerKw>0||flowM3h>0||d.kind==='pipe'),powerKw,flowM3h,temperatureC,utilization,state}
  }
  const deviceAlerts=devices.filter(d=>d.installed&&d.enabled&&runtime[d.id].utilization>1.01).map(d=>({deviceId:d.id,severity:runtime[d.id].utilization>1.2?'critical' as const:'warning' as const,message:`模拟负载率 ${(runtime[d.id].utilization*100).toFixed(0)}% · 超过额定容量`}))
  if(coolingDeliveredKw<totalPowerKw-.1)deviceAlerts.push({deviceId:'CH-01',severity:coolingDeliveredKw<totalPowerKw*.5?'critical':'warning',message:`可用制冷 ${coolingDeliveredKw.toFixed(0)} kW，需求 ${totalPowerKw.toFixed(0)} kW · 检查冷机、水泵及主管`})
  const thermal={primaryC:chwSupplyC,secondaryC:Object.fromEntries(devices.filter(d=>d.kind==='cdu').map(d=>[d.id,secondarySupplyC])),podC:[24,24,24,24],batteryKwhA:input.batteryRemaining?.A??batteryEnergy('A'),batteryKwhB:input.batteryRemaining?.B??batteryEnergy('B'),gridOutageSeconds:input.gridOutageSeconds??0}
  return {thermal,seconds,scenario:input.scenario,load,faultActive,racks,feeders,alerts,deviceAlerts,runtime,totalPowerKw,maxInletC:Math.max(...racks.filter(r=>r.installed).map(r=>r.inletC),24),totalFlowLpm:racks.reduce((s,r)=>s+r.flowLpm,0),offlineCount:racks.filter(r=>r.installed&&r.status==='offline').length,installedRackCount:racks.filter(r=>r.installed).length,activeChillers:members('chiller').length,backupReserveKw:capacity('generator'),onlineServers:racks.reduce((s,r)=>s+r.onlineServers,0),installedServers:racks.filter(r=>r.installed).reduce((s,r)=>s+r.serverCount,0),facilityPowerKw,pue:totalPowerKw>0?facilityPowerKw/totalPowerKw:null,heatToWaterKw,heatToAirKw,chwSupplyC,chwReturnC:actualChwM3h>0?chwSupplyC+coolingDeliveredKw/(actualChwM3h/3.6*4.186):null,cwSupplyC:29,cwReturnC:actualCwM3h>0?29+(coolingDeliveredKw+chillerKw)/(actualCwM3h/3.6*4.186):null,actualChwM3h,actualCwM3h,coolingDeliveredKw,coldCapacityKw:coldCapacity,networkThroughputTbps:racks.reduce((s,r)=>s+r.onlineServers*10*load/100,0)/1000,electrical:{mainsA,mainsB,upsAReady,upsBReady,batteryA,batteryB,generatorReady,busPowerA,busPowerB}}
}
export type OperationFrame=ReturnType<typeof calculateFrame>
export function rackColor(r:RackResult,frame:OperationFrame,layer:OperationLayer){if(r.status==='offline')return '#65727c';if(layer==='network')return r.networkOnline?'#72bb8d':'#b38fd9';if(layer==='electrical')return frame.feeders[r.row].loadPercent>100?'#c27add':!r.redundantPower?'#d7ad6d':'#72bb8d';return r.inletC>=35?'#e16c53':r.inletC>=30?'#dfa456':'#66b4cf'}
