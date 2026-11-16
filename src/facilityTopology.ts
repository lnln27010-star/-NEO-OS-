import { dimensions,type EquipmentLayout } from './equipmentModel'
import {connections} from './equipmentConnections'
import type { OperationFrame } from './operationsModel'
export type FlowChannel='power'|'water'|'heat'|'information'
export type Vec3=[number,number,number]
export type FlowEdge={id:string;from:string;to:string;channel:FlowChannel;loop:string;label:string;color:string;value:number;unit:string;active:boolean;points:Vec3[]}
export function buildFlowGraph(layout:EquipmentLayout,frame:OperationFrame,selectedId?:string):FlowEdge[]{
  const edges:FlowEdge[]=[]
  const point=(id:string,y?:number):Vec3=>{const d=layout[id];return [d.x,y??Math.min(2.8,dimensions(d)[1]+.15),d.z]}
  const add=(from:string,to:string,channel:FlowChannel,loop:string,label:string,value:number,unit:string,color:string,height:number,enabled=true,points?:Vec3[])=>{
    const a=layout[from],b=layout[to];if(!a||!b||!a.installed||!b.installed||a.deleted||b.deleted)return
    const start=point(from),end=point(to),route=points??[start,[start[0],height,start[2]],[end[0],height,start[2]],[end[0],height,end[2]],end]
    edges.push({id:`${channel}/${loop}/${from}/${to}`,from,to,channel,loop,label,value,unit,color,active:enabled&&a.enabled&&b.enabled&&value>0,points:route})
  }
  for(const bus of ['A','B']){
    const live=bus==='A'?frame.electrical.mainsA:frame.electrical.mainsB,ready=bus==='A'?frame.electrical.upsAReady:frame.electrical.upsBReady,battery=bus==='A'?frame.electrical.batteryA:frame.electrical.batteryB
    const colour=bus==='A'?'#e8b859':'#e1d7a1',busKw=frame.runtime[`BUS-${bus}`]?.powerKw??0
    add(`TX-${bus}`,`LV-${bus}`,'power',`bus-${bus}`,`${bus} 路变压器 → 低压总配`,frame.runtime[`TX-${bus}`]?.powerKw??0,'kW',colour,4.9,live)
    const ups=Object.values(layout).filter(d=>d.kind==='ups'&&d.id.startsWith(`UPS-${bus}`)&&d.installed&&d.enabled)
    for(const d of ups)add(`LV-${bus}`,d.id,'power',`bus-${bus}`,`${bus} 路低压 → UPS 模块`,busKw/Math.max(1,ups.length),'kW',colour,4.9,live||frame.electrical.generatorReady)
    for(const d of Object.values(layout).filter(d=>d.kind==='battery'&&d.id.startsWith(`BAT-${bus}`)))add(battery?d.id:`UPS-${bus}`,battery?`UPS-${bus}`:d.id,'power',`battery-${bus}`,battery?'UPS 电池放电':'UPS 电池浮充',Math.abs(frame.runtime[d.id]?.powerKw??0),'kW',battery?'#ffa45d':'#e1d7a1',3.5,battery||live||frame.electrical.generatorReady)
    for(const d of ups)add(d.id,`BUS-${bus}`,'power',`bus-${bus}`,`${bus} 路 UPS 模块 → 共用母线`,frame.runtime[d.id]?.powerKw??0,'kW',colour,3.6,ready)
    for(let pod=0;pod<4;pod++){
      const group=frame.racks.filter(r=>r.pod===pod),power=group.reduce((s,r)=>s+r.powerKw,0)
      add(`BUS-${bus}`,`RPP-0${pod+1}`,'power',`bus-${bus}`,`${bus} 路 UPS → 数据厅汇流柜`,power/(frame.electrical.upsAReady&&frame.electrical.upsBReady?2:1),'kW',colour,3.6+(bus==='B'?.12:0),ready)
    }
  }
  for(const d of Object.values(layout).filter(d=>['chiller','chw-pump','cw-pump','cooling-tower','crac','cdu','network'].includes(d.kind))){
    const utilityKind=['chiller','chw-pump','cw-pump','cooling-tower','crac','cdu'].includes(d.kind)
    const source=utilityKind?(frame.electrical.mainsA?'LV-A':'LV-B'):(frame.electrical.upsAReady?'BUS-A':'BUS-B')
    if(d.kind==='network'){
      const buses=['A','B'].filter(bus=>(frame.runtime[`BUS-${bus}`]?.powerKw??0)>0&&layout[`BUS-${bus}`]?.enabled)
      for(const bus of buses)add(`BUS-${bus}`,d.id,'power',`network-${bus}`,`UPS ${bus} 路 → ${d.id}`,(frame.runtime[d.id]?.powerKw??0)/Math.max(1,buses.length),'kW','#d3c6a8',3.6)
    }else add(source,d.id,'power','mechanical-feed',`供电 → ${d.id}`,frame.runtime[d.id]?.powerKw??0,'kW','#d0b976',5.1)

  }
  for(const gen of Object.values(layout).filter(d=>d.kind==='generator'))for(const bus of ['A','B'])add(gen.id,`LV-${bus}`,'power','standby-generation','备用发电 → 低压母线',(frame.runtime[gen.id]?.powerKw??0)/2,'kW','#e6a06c',5.3,frame.electrical.generatorReady)
  for(const feeder of frame.feeders){
    const group=frame.racks.filter(r=>r.feeder===feeder.id),middle=group[Math.floor(group.length/2)];if(!middle)continue;const rpp=`RPP-0${middle.pod+1}`
    add(rpp,feeder.id,'power','row-feed',`${feeder.id} 列配电`,feeder.powerKw,'kW','#e8b859',3.6,!feeder.open)
    const d=layout[middle.id],a=point(feeder.id),first=layout[group[0].id],last=layout[group.at(-1)!.id]
    add(feeder.id,middle.id,'power','row-bus',`${String.fromCharCode(65+middle.row)} 排机柜母线`,feeder.powerKw,'kW','#ebc971',3.3,true,[a,[a[0],3.3,a[2]],[last.x,3.3,d.z],[first.x,3.3,d.z]])
    const net=middle.networkNode,gbps=group.reduce((s,r)=>s+r.onlineServers*10*frame.load/100,0)
    add(net,middle.id,'information','spine-tor',`核心网络 → ${String.fromCharCode(65+middle.row)} 排 ToR`,gbps,'Gb/s','#ac9af0',4.1,gbps>0)
    const crah=Object.values(layout).find(u=>u.kind==='crac'&&u.pod===middle.pod&&u.installed&&u.enabled)
    if(crah){const forward=new VecOffset(d.yaw),frontZ=d.z+forward.z*.85,frontX=d.x+forward.x*.85,backZ=d.z-forward.z*.85,backX=d.x-forward.x*.85,airKw=group.reduce((s,r)=>s+r.heatToAirKw,0)
      add(crah.id,middle.id,'heat','cold-air',`${String.fromCharCode(65+middle.row)} 排冷通道送风`,group.filter(r=>r.powerKw>0).length*(middle.coolingMode==='air'?.9:2),'m³/s',(frame.runtime[crah.id]?.temperatureC??24)>30?'#d5a183':'#6dcddf',.8,frame.runtime[crah.id]?.active,[point(crah.id,1.0),[frontX,.8,point(crah.id)[2]],[frontX,.8,frontZ],[first.x,.8,frontZ],[last.x,.8,frontZ]])
      add(middle.id,crah.id,'heat','hot-air',`${String.fromCharCode(65+middle.row)} 排余热回风`,airKw,'kW','#e98c68',4.6,frame.runtime[crah.id]?.active,[[backX,1.4,backZ],[backX,4.6,backZ],[point(crah.id)[0],4.6,backZ],point(crah.id,2.6)])
    }
    if(middle.coolingMode==='liquid'){
      const supply=`PIPE-SUP-${middle.pod}`,ret=`PIPE-RET-${middle.pod}`,lpm=group.reduce((s,r)=>s+r.flowLpm,0),sp=point(supply,4.3),rp=point(ret,4.3)
      add(supply,middle.id,'water','secondary-supply',`${String.fromCharCode(65+middle.row)} 排液冷供水`,lpm,'L/min','#68c3ec',3.85,lpm>0,[sp,[d.x,3.85,sp[2]],[d.x,3.85,d.z],[first.x,3.85,d.z],[last.x,3.85,d.z]])
      add(middle.id,ret,'water','secondary-return',`${String.fromCharCode(65+middle.row)} 排液冷回水`,lpm,'L/min','#de9b76',4.0,lpm>0,[[first.x,4.0,d.z+.22],[last.x,4.0,d.z+.22],[d.x,4.0,rp[2]],rp])
    }
  }
  const chillers=Object.values(layout).filter(d=>d.kind==='chiller'),towers=Object.values(layout).filter(d=>d.kind==='cooling-tower')
  for(let i=0;i<8;i++){
    const ch=chillers[i],ct=towers[i],chw=`CHWP-${String(i+1).padStart(2,'0')}`,cw=`CWP-${String(i+1).padStart(2,'0')}`
    if(ch){add(ch.id,'HDR-CHW-PUMP-IN','water','chw-supply','蒸发器 → 冷冻泵吸水总管',frame.runtime[ch.id]?.flowM3h??0,'m³/h','#74bce9',3.8);add('HDR-CHW-PUMP-IN',chw,'water','chw-supply','吸水总管 → 冷冻水泵',frame.runtime[chw]?.flowM3h??0,'m³/h','#74bce9',3.8);add(chw,'HDR-CHW-SUP','water','chw-supply','并联冷冻泵 → 供水主管',frame.runtime[chw]?.flowM3h??0,'m³/h','#74bce9',4.3);add('HDR-CHW-RET',ch.id,'water','chw-return','回水主管 → 蒸发器',frame.runtime[ch.id]?.flowM3h??0,'m³/h','#c48f72',4.3);add(ch.id,'HDR-CW-RET','water','cw-return','冷凝器 → 冷却回水主管',frame.actualCwM3h*(frame.runtime[ch.id]?.powerKw??0)/Math.max(.001,Object.values(layout).filter(d=>d.kind==='chiller').reduce((sum,d)=>sum+(frame.runtime[d.id]?.powerKw??0),0)),'m³/h','#d59a6c',4.25);add('HDR-CW-RET',cw,'water','cw-return','冷却回水主管 → 并联冷却泵',frame.runtime[cw]?.flowM3h??0,'m³/h','#d59a6c',4.3)}
    if(ct){add(cw,'HDR-CW-TOWER-FEED','water','cw-return','并联冷却泵 → 冷却塔进水总管',frame.runtime[cw]?.flowM3h??0,'m³/h','#d59a6c',4.25);add('HDR-CW-TOWER-FEED',ct.id,'water','cw-return','进水总管 → 冷却塔',frame.runtime[ct.id]?.flowM3h??0,'m³/h','#d59a6c',4.25);add(ct.id,'HDR-CW-SUP','water','cw-supply','冷却塔 → 冷却供水主管',frame.runtime[ct.id]?.flowM3h??0,'m³/h','#74bfc8',4.3);if(ch)add('HDR-CW-SUP',ch.id,'water','cw-supply','冷却供水主管 → 冷凝器',frame.actualCwM3h*(frame.runtime[ch.id]?.powerKw??0)/Math.max(.001,Object.values(layout).filter(d=>d.kind==='chiller').reduce((sum,d)=>sum+(frame.runtime[d.id]?.powerKw??0),0)),'m³/h','#74bfc8',4.4)}
  }
  const primaryPump='HDR-CHW-SUP'
  for(const crac of Object.values(layout).filter(d=>d.kind==='crac')){
    const pod=frame.racks.filter(r=>r.pod===crac.pod),count=Object.values(layout).filter(d=>d.kind==='crac'&&d.pod===crac.pod&&d.installed&&d.enabled).length
    const volume=frame.actualChwM3h*pod.reduce((s,r)=>s+r.heatToAirKw,0)/Math.max(1,frame.totalPowerKw)/Math.max(1,count)
    add(primaryPump,crac.id,'water','chw-supply','冷冻水 → 精密空调盘管',volume,'m³/h','#74bce9',4.7,frame.actualChwM3h>0&&frame.runtime[crac.id]?.active)
    add(crac.id,'HDR-CHW-RET','water','chw-return','精密空调盘管 → 冷水机组',volume,'m³/h','#c48f72',4.85,frame.actualChwM3h>0&&frame.runtime[crac.id]?.active)
  }
  for(const cdu of Object.values(layout).filter(d=>d.kind==='cdu')){
    const group=frame.racks.filter(r=>r.cooling===cdu.id),load=group.reduce((s,r)=>s+r.heatToWaterKw,0),volume=frame.actualChwM3h*load/Math.max(1,frame.totalPowerKw),flow=group.reduce((s,r)=>s+r.flowLpm,0)
    add(primaryPump,cdu.id,'water','chw-supply','设施冷冻水 → CDU 一次侧',volume,'m³/h','#74bce9',4.7,frame.actualChwM3h>0&&flow>0)
    add(cdu.id,'HDR-CHW-RET','water','chw-return','CDU 一次侧回水 → 冷水机组',volume,'m³/h','#c48f72',4.85,frame.actualChwM3h>0&&flow>0)
    add(cdu.id,`PIPE-SUP-${cdu.pod}`,'water','secondary-supply','CDU 二次侧 → 液冷供水干管',flow,'L/min','#68c3ec',4.3,flow>0)
    add(`PIPE-RET-${cdu.pod}`,cdu.id,'water','secondary-return','液冷回水干管 → CDU 二次侧',flow,'L/min','#de9b76',4.4,flow>0)
  }
  for(const d of Object.values(layout).filter(d=>d.kind==='network'&&!['NET-01','NET-02','NET-03','NET-04'].includes(d.id))){const master=`NET-0${d.pod+1}`,throughput=frame.racks.filter(r=>r.pod===d.pod).reduce((sum,r)=>sum+r.onlineServers*10*frame.load/100,0)/5;add(d.id,master,'information','core-services','核心 / 共享服务互联',throughput,'Gb/s','#91b7da',4.15,throughput>0)}
  for(const d of Object.values(layout).filter(d=>!['rack','pipe','busbar','network'].includes(d.kind))){add(d.id,'NET-01','information','telemetry','设备状态 / BMS 虚拟监测',frame.electrical.upsAReady||frame.electrical.upsBReady?1:0,'路监测','#769aad',4.25)}
  const selected=frame.racks.find(r=>r.id===selectedId)
  if(selected){add(selected.feeder,selected.id,'power','device-feed',`${selected.id} PDU → 机柜`,selected.powerKw,'kW','#eed272',3.3,selected.status!=='offline');add(selected.networkNode,selected.id,'information','device-network',`${selected.id} 网络链路`,selected.onlineServers*10*frame.load/100,'Gb/s','#af99ee',4.1,selected.networkOnline);if(selected.coolingMode==='liquid'){add(`PIPE-SUP-${selected.pod}`,selected.id,'water','device-supply',`${selected.id} 背板供水`,selected.flowLpm,'L/min','#68c3ec',3.85);add(selected.id,`PIPE-RET-${selected.pod}`,'water','device-return',`${selected.id} 背板回水`,selected.flowLpm,'L/min','#de9b76',4.0)}}
  for(const d of Object.values(layout).filter(d=>d.connections&&!d.deleted)){
    const c=connections(d),channels=new Set<FlowChannel>(Object.keys(c).map(p=>p.startsWith('power')?'power':p==='network'?'information':'water'))
    for(let i=edges.length-1;i>=0;i--){const e=edges[i];if(channels.has(e.channel)&&(e.to===d.id||e.from===d.id&&e.channel==='water'))edges.splice(i,1)}
    for(const [port,source] of Object.entries(c)){
      if(!source)continue
      const r=frame.racks.find(r=>r.id===d.id),runtime=frame.runtime[d.id],channel=port.startsWith('power')?'power':port==='network'?'information':d.kind==='rack'&&d.coolingMode==='air'?'heat':'water',reverse=port==='return'||d.kind==='generator'
      const power=r?(port==='powerA'?r.powerAActive:r.powerBActive):runtime?.active,flow=r?r.flowLpm:runtime?.flowM3h??0,value=channel==='power'?(runtime?.powerKw??0)/(r&&r.redundantPower?2:1):channel==='information'?(r?.onlineServers??0)*10*frame.load/100:channel==='heat'?r?.heatToAirKw??0:flow
      add(reverse?d.id:source,reverse?source:d.id,channel,`custom-${port}`,`${source} ↔ ${d.id}`,value,channel==='power'||channel==='heat'?'kW':channel==='information'?'Gb/s':r?'L/min':'m³/h',channel==='power'?'#e3c17b':channel==='information'?'#ad9dde':reverse?'#d39a78':'#80c7df',port==='powerA'?3.4:port==='powerB'?3.55:port==='network'?4.1:3.8,channel==='power'?Boolean(power):channel==='information'?Boolean(r?.networkOnline):Boolean(runtime?.active))
    }
  }
  return edges
}
class VecOffset{ x:number;z:number;constructor(yaw:number){this.x=Math.sin(yaw);this.z=Math.cos(yaw)}}
