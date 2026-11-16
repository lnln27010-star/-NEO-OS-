/** Reference layout, not an owner's as-built drawing. Dimensions are metres. */
export type DeviceKind='rack'|'cdu'|'ups'|'rpp'|'network'|'chiller'|'generator'|'transformer'|'lv-panel'|'battery'|'chw-pump'|'cw-pump'|'crac'|'pdu'|'cooling-tower'|'pipe'|'busbar'
export type Port='powerA'|'powerB'|'supply'|'return'|'network'
export type Equipment={deleted?:boolean;connections?:Partial<Record<Port,string>>;id:string;kind:DeviceKind;x:number;z:number;yaw:number;installed:boolean;enabled:boolean;modules:boolean[];powerA:boolean;powerB:boolean;cooling:boolean;network:boolean;doorOpen:boolean;extracted:number|null;coolingMode:'air'|'liquid';pod:number;capacity:number}
export type EquipmentLayout=Record<string,Equipment>
export const SERVER_BAYS=20,ROOM_LIMIT={x:47,z:29}
export const KIND_LABEL:Record<DeviceKind,string>={rack:'服务器机柜',cdu:'CDU 液冷分配单元',ups:'模块化 UPS 系统',rpp:'汇流配电柜',network:'核心网络柜',chiller:'冷水机组',generator:'备用发电机组',transformer:'三相变压器','lv-panel':'低压配电柜',battery:'UPS 电池柜','chw-pump':'冷冻水泵','cw-pump':'冷却水泵',crac:'精密空调 / CRAH',pdu:'PDU 配电柜','cooling-tower':'冷却塔',pipe:'供回水汇流主管',busbar:'UPS 双路母线'}
export const PODS=[{name:'风冷数据厅 A',x:-31.9,z:-17.9,startX:-44,startZ:-23,mode:'air'},{name:'风冷数据厅 B',x:.3,z:-17.9,startX:-11.8,startZ:-23,mode:'air'},{name:'液冷数据厅 A',x:-31.9,z:12.3,startX:-44,startZ:7.2,mode:'liquid'},{name:'液冷数据厅 B',x:.3,z:12.3,startX:-11.8,startZ:7.2,mode:'liquid'}] as const
// Column grid converted from the bundled IFC: X 0..96, Z 0..-61; origin -48/+30.5.
export const BUILDING_COLUMNS=Array.from({length:45},(_,i)=>({x:-48+Math.floor(i/5)*12,z:30.5-(i%5)*15.25}))
export const RACK_LAYOUT=Array.from({length:384},(_,i)=>{
  const row=Math.floor(i/24),column=i%24,pod=Math.floor(row/4),localRow=row%4,zone=PODS[pod]
  return {id:`R-${String.fromCharCode(65+row)}${String(column+1).padStart(2,'0')}`,row,column,pod,x:zone.startX+column*1.05,z:zone.startZ+[0,3.8,6.4,10.2][localRow],yaw:localRow%2?Math.PI:0,coolingMode:zone.mode,feeder:`PDU-${String.fromCharCode(65+row)}`,cooling:zone.mode==='liquid'?`CDU-0${1+Math.floor((row-8)/2)}`:`CRAC-${String(pod*12+1).padStart(2,'0')}`,networkNode:`NET-0${pod+1}`}
})
export function defaultEquipment():EquipmentLayout{
  const devices:Equipment[]=[]
  const add=(id:string,kind:DeviceKind,x:number,z:number,pod=-1,capacity=0,yaw=0)=>devices.push({id,kind,x,z,yaw,pod,capacity,installed:true,enabled:true,modules:kind==='rack'?Array(SERVER_BAYS).fill(true):[],powerA:true,powerB:true,cooling:true,network:true,doorOpen:false,extracted:null,coolingMode:pod>=2?'liquid':'air'})
  for(const r of RACK_LAYOUT)add(r.id,'rack',r.x,r.z,r.pod,r.coolingMode==='air'?16:60,r.yaw)
  for(let row=0;row<16;row++){const r=RACK_LAYOUT[row*24];add(r.feeder,'pdu',r.pod%2?15.3:-17.1,r.z,r.pod,2400)}
  for(const bus of ['A','B']){
    const sign=bus==='A'?-1:1
    add(`TX-${bus}`,'transformer',26,sign*26,-1,16000)
    for(let i=0;i<3;i++)add(i?`LV-${bus}0${i+1}`:`LV-${bus}`,'lv-panel',37+i*4,sign*26,-1,i?9000:20000)
    for(let i=0;i<4;i++){add(i?`UPS-${bus}0${i+1}`:`UPS-${bus}`,'ups',24+i*5,sign*18.7,-1,3500);add(`BAT-${bus}0${i+1}`,'battery',24+i*5,sign*13,-1,400)}
  }
  for(let i=0;i<4;i++){add(`RPP-0${i+1}`,'rpp',44,[-18,-13,13,18][i],i,5000);add(`CDU-0${i+1}`,'cdu',[-40,-23,-8,9][i],21.2,i<2?2:3,2500)}
  for(let i=0;i<24;i++)add(`NET-${String(i+1).padStart(2,'0')}`,'network',-44+(i%8)*1.7,-7+Math.floor(i/8)*4,i<4?i:(i-4)%4,i<4?20000:4000)
  for(let i=0;i<24;i++){const pod=Math.floor(i/12),n=i%12;add(`CRAC-${String(i+1).padStart(2,'0')}`,'crac',PODS[pod].startX+1+(n%6)*4.7,n<6?-27:-10,pod,250)}
  for(let i=0;i<8;i++)add(`CRAC-${String(i+25).padStart(2,'0')}`,'crac',-43+i*8,26.2,i<4?2:3,250)
  for(let i=0;i<8;i++){add(`CHWP-${String(i+1).padStart(2,'0')}`,'chw-pump',24+(i%4)*5,i<4?-6:-1.4,-1,250);add(`CWP-${String(i+1).padStart(2,'0')}`,'cw-pump',24+(i%4)*5,i<4?4:9,-1,350)}
  for(let i=0;i<8;i++)add(`CH-${String(i+1).padStart(2,'0')}`,'chiller',i<4?-12+i*8:i<6?-64:64,i<4?-4:i%2?-12:12,-1,2000)
  for(let i=0;i<8;i++){add(`CT-${String(i+1).padStart(2,'0')}`,'cooling-tower',-43+i*12.5,-47,-1,2500);add(`GEN-${String(i+1).padStart(2,'0')}`,'generator',-43+i*12.5,61,-1,3000)}
  for(const pod of [2,3])for(const circuit of ['SUP','RET'])add(`PIPE-${circuit}-${pod}`,'pipe',PODS[pod].x,circuit==='SUP'?18:18.5,pod,26)
  for(const circuit of ['CHW','CW'])for(const type of ['SUP','RET'])add(`HDR-${circuit}-${type}`,'pipe',33,circuit==='CHW'?(type==='SUP'?-8:-7.5):(type==='SUP'?10.5:11),-1,26)
  add('HDR-CHW-PUMP-IN','pipe',33,-9,-1,26);add('HDR-CW-TOWER-FEED','pipe',33,12,-1,26)
  add('BUS-A','busbar',33,-11.3,-1,16000);add('BUS-B','busbar',33,11.3,-1,16000)
  return Object.fromEntries(devices.map(d=>[d.id,d]))
}
export function dimensions(d:Equipment):[number,number,number]{switch(d.kind){case'rack':return [.96,2.34,1.4];case'cdu':return [1.9,2.4,1.3];case'ups':return [2.4,2.2,1.6];case'transformer':return [3.4,2.9,2.4];case'battery':return [1.3,2.1,1.4];case'chiller':return [6.6,2.3,3.4];case'generator':return [9,4.5,3.6];case'cooling-tower':return [7,5,5];case'chw-pump':case'cw-pump':return [2.4,1.5,1.5];case'crac':return [2.2,2.7,1.2];case'pipe':return [26,.25,.25];case'busbar':return [20,.25,.45];default:return [1.3,2.3,1.1]}}
export function elevation(d:Equipment){return d.kind==='pipe'?4.3:d.kind==='busbar'?3.6:dimensions(d)[1]/2+.2}
export function footprint(d:Equipment):[number,number]{const [w,,z]=dimensions(d),c=Math.abs(Math.cos(d.yaw)),s=Math.abs(Math.sin(d.yaw));return [w*c+z*s,z*c+w*s]}
export function isExterior(d:Equipment){return d.kind==='generator'||d.kind==='cooling-tower'||d.kind==='chiller'&&Math.abs(d.x)>47}
export function placementError(layout:EquipmentLayout,id:string,x:number,z:number,yaw:number,ignore:string[]=[]):{message:string;collider?:string}{
  if(![x,z,yaw].every(Number.isFinite))return {message:'位置参数无效'}
  const d=layout[id];if(!d)return {message:'设备不存在'}
  const [w,depth]=footprint({...d,yaw}),exterior=isExterior(d)
  if(exterior){if(Math.abs(x)+w/2>95||Math.abs(z)+depth/2>83)return {message:'设备超出园区设备区'};if(Math.abs(x)<49+w/2&&Math.abs(z)<32+depth/2)return {message:'室外设备不能进入建筑'}}
  else if(Math.abs(x)+w/2>47||Math.abs(z)+depth/2>29)return {message:'设备超出机房边界'}
  if(!exterior)for(const column of BUILDING_COLUMNS)if(Math.abs(column.x-x)<w/2+.185&&Math.abs(column.z-z)<depth/2+.256)return {message:'与建筑结构柱或保护间距冲突'}
  for(const other of Object.values(layout)){
    if(other.id===id||ignore.includes(other.id)||!other.installed||['pipe','busbar'].includes(other.kind)||['pipe','busbar'].includes(d.kind))continue
    const [ow,od]=footprint(other)
    if(Math.abs(other.x-x)<(w+ow)/2-.015&&Math.abs(other.z-z)<(depth+od)/2-.015)return {message:`与 ${other.id} 重叠`,collider:other.id}
  }
  return {message:''}
}
export function validatePlacement(layout:EquipmentLayout,id:string,x:number,z:number,yaw:number){return placementError(layout,id,x,z,yaw).message}
export function alignPosition(layout:EquipmentLayout,id:string,x:number,z:number,enabled=true){
  const d=layout[id];let snapX:number|undefined,snapZ:number|undefined,dx=.24,dz=.24
  if(enabled&&d)for(const other of Object.values(layout)){
    if(other.id===id||!other.installed||other.kind!==d.kind)continue
    if(Math.abs(other.x-x)<dx){dx=Math.abs(other.x-x);snapX=other.x}
    if(Math.abs(other.z-z)<dz){dz=Math.abs(other.z-z);snapZ=other.z}
  }
  return {x:Math.round((snapX??x)*20)/20,z:Math.round((snapZ??z)*20)/20,snapX,snapZ}
}

export function rackDescriptors(layout:EquipmentLayout){
  return Object.values(layout).filter(d=>d.kind==='rack'&&!d.deleted).map(d=>{
    const r=RACK_LAYOUT.find(r=>r.id===d.id),pod=Math.max(0,d.pod)
    return {...(r??{row:16,column:0,pod,x:d.x,z:d.z,yaw:d.yaw,coolingMode:d.coolingMode,feeder:'',cooling:'',networkNode:''}),id:d.id,pod,x:d.x,z:d.z,yaw:d.yaw,coolingMode:d.coolingMode,feeder:d.connections?.powerA??r?.feeder??'',cooling:d.connections?.supply??r?.cooling??'',networkNode:d.connections?.network??r?.networkNode??''}
  })
}
