import { create } from 'zustand'
import { defaultEquipment, validatePlacement, placementError, type Equipment, type EquipmentLayout, type DeviceKind, type Port } from './equipmentModel'
import {connections,connectionError} from './equipmentConnections'

type State={movementId:string|null;setMovement:(id:string|null)=>void;transparentWalls:boolean;setTransparentWalls:(value:boolean)=>void;addDevice:(kind:DeviceKind,mode?:'air'|'liquid',pod?:number,bus?:'A'|'B')=>string;removeDevice:(id:string)=>void;connect:(id:string,port:Port,target:string)=>boolean;layout:EquipmentLayout;selectedId:string;editMode:boolean;showNames:boolean;setShowNames:(value:boolean)=>void;autoAlign:boolean;setAutoAlign:(value:boolean)=>void;panelOpen:boolean;setPanelOpen:(value:boolean)=>void;message:string;history:EquipmentLayout[];focusSequence:number;focusBay:number|null;placementId:string|null;dragging:boolean
  beginInstall:(id:string)=>void;place:(x:number,z:number)=>boolean;cancelPlacement:()=>void;setDragging:(value:boolean)=>void
  focus:(id:string,bay?:number)=>void
  setCapacity:(id:string,value:number)=>void
  select:(id:string)=>void;setEditMode:(value:boolean)=>void
  patch:(id:string,patch:Partial<Pick<Equipment,'enabled'|'powerA'|'powerB'|'cooling'|'network'|'doorOpen'|'extracted'>>)=>void
  move:(id:string,x:number,z:number,yaw?:number,swap?:boolean)=>boolean
  install:(id:string,installed:boolean)=>void;module:(id:string,bay:number,installed:boolean)=>void
  transfer:(id:string,bay:number,target:string,targetBay:number)=>boolean
  undo:()=>void;reset:()=>void;exportLayout:()=>string;importLayout:(text:string)=>boolean
}
const kindNames=Object.fromEntries(Object.values(defaultEquipment()).map(d=>[d.kind,true]))
const STORAGE='northbridge-equipment-v3'
function parseLayout(text:string):EquipmentLayout {
  const parsed=JSON.parse(text);if(!parsed||Array.isArray(parsed.layout)||typeof parsed.layout!=='object')throw new Error('布局结构无效');if(parsed.version===2&&!parsed.layout?.['R-A01'])throw new Error('旧布局缺少机柜记录');if(![2,3,4].includes(parsed.version)||!parsed.layout)throw new Error('需要版本 2 / 3 / 4 的设备布局文件')
  const base=defaultEquipment(),result:EquipmentLayout={}
  for(const [id,original] of Object.entries((parsed.version===4?Object.fromEntries([...new Set([...Object.keys(base),...Object.keys(parsed.layout)])].map(id=>[id,base[id]??parsed.layout[id]])):base) as EquipmentLayout)){
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(id))throw new Error('设备编号无效')
    const previous=parsed.layout[id]
    const d=parsed.version===2?{...original,...previous,kind:original.kind,x:original.x,z:original.z,yaw:original.yaw,coolingMode:original.coolingMode,pod:original.pod}:previous??(parsed.version===4?{...original,installed:false,enabled:false,deleted:true}:id.startsWith('HDR-')||id.startsWith('BUS-')?original:undefined)
    if(!d||!Object.prototype.hasOwnProperty.call(kindNames,d.kind)||d.kind!==original.kind||![d.x,d.z,d.yaw].every(Number.isFinite)||!Array.isArray(d.modules)||d.modules.length!==(d.kind==='rack'?20:0)||d.modules.some((v:unknown)=>typeof v!=='boolean'))throw new Error(`设备 ${id} 数据不完整`)
    for(const key of ['installed','enabled','powerA','powerB','cooling','network','doorOpen'])if(typeof d[key]!=='boolean')throw new Error(`设备 ${id} 状态无效`)
    if(d.extracted!==null&&(!Number.isInteger(d.extracted)||d.extracted<0||d.extracted>=d.modules.length||!d.modules[d.extracted]))throw new Error(`设备 ${id} 抽出位置无效`)
    if(!['air','liquid'].includes(d.coolingMode)||!Number.isInteger(d.pod)||d.pod< -1||d.pod>3||d.kind==='rack'&&d.pod<0||!Number.isFinite(d.capacity)||d.capacity<=0)throw new Error(`${id} 分区或容量无效`)
    result[id]={...original,...d,id,kind:original.kind}
  }
  for(const d of Object.values(result)){if(d.connections&&(typeof d.connections!=='object'||Array.isArray(d.connections)))throw new Error(`${d.id} 连接格式无效`);if(d.deleted!==undefined&&typeof d.deleted!=='boolean')throw new Error(`${d.id} 删除状态无效`);if(d.connections&&!d.deleted)for(const [port,target] of Object.entries(d.connections)){if(typeof target!=='string'||connectionError(result,d.id,port as Port,target))throw new Error(`${d.id} 连接无效`)}}
  for(const d of Object.values(result))if(d.installed&&!d.deleted){const error=validatePlacement(result,d.id,d.x,d.z,d.yaw);if(error)throw new Error(`${d.id}：${error}`)}
  return result
}
function initial(){try{return typeof localStorage!=='undefined'?parseLayout(localStorage.getItem(STORAGE)||''):defaultEquipment()}catch{return defaultEquipment()}}
const bootLayout=initial()
const encode=(layout:EquipmentLayout)=>JSON.stringify({version:4,layout},null,2)
export const useEquipmentStore=create<State>((set,get)=>{
  const commit=(layout:EquipmentLayout,message:string)=>{const old=get();set({layout,message,history:[...old.history.slice(-19),old.layout]});try{localStorage.setItem(STORAGE,encode(layout))}catch{/* Storage is optional. */}}
  return {movementId:null,setMovement:movementId=>set({movementId,editMode:true}),transparentWalls:false,setTransparentWalls:transparentWalls=>set({transparentWalls}),layout:bootLayout,selectedId:Object.values(bootLayout).find(d=>!d.deleted)?.id??'R-A01',editMode:false,showNames:true,setShowNames:showNames=>set({showNames}),autoAlign:true,setAutoAlign:autoAlign=>set({autoAlign}),panelOpen:false,setPanelOpen:panelOpen=>set({panelOpen}),message:'',history:[],focusSequence:0,focusBay:null,placementId:null,dragging:false,

    addDevice:(kind,mode='air',pod=0,bus='A')=>{const state=get(),prototype=Object.values(defaultEquipment()).find(d=>d.kind===kind)!;const prefix=({rack:'R-NEW',ups:`UPS-${bus}-NEW`,battery:`BAT-${bus}-NEW`,transformer:`TX-${bus}-NEW`,'lv-panel':`LV-${bus}-NEW`,busbar:`BUS-${bus}-NEW`} as Partial<Record<DeviceKind,string>>)[kind]??`${kind.toUpperCase()}-NEW`;let n=1;while(state.layout[`${prefix}-${String(n).padStart(3,'0')}`])n++;const id=`${prefix}-${String(n).padStart(3,'0')}`,d:Equipment={...prototype,id,x:0,z:0,installed:false,deleted:false,enabled:true,modules:kind==='rack'?Array(20).fill(true):[],pod:['rack','pdu','rpp','network','cdu','crac'].includes(kind)?pod:-1,coolingMode:mode,capacity:kind==='rack'?(mode==='air'?16:60):prototype.capacity,connections:{},doorOpen:false,extracted:null};commit({...state.layout,[id]:d},`${id} 已加入设备库`);set({selectedId:id,editMode:true,panelOpen:true,movementId:null});return id},
    removeDevice:id=>{const state=get(),d=state.layout[id];if(!d||d.deleted)return;const layout={...state.layout,[id]:{...d,installed:false,enabled:false,deleted:true}};for(const other of Object.values(layout)){if(other.id===id||other.deleted)continue;const c=connections(other);if(Object.values(c).includes(id))layout[other.id]={...other,connections:Object.fromEntries(Object.entries(c).map(([p,v])=>[p,v===id?'':v]))}}commit(layout,`${id} 已删除，可撤销`);const next=Object.values(layout).find(d=>!d.deleted);set({selectedId:next?.id??id,placementId:null,movementId:null})},
    connect:(id,port,target)=>{const state=get(),error=connectionError(state.layout,id,port,target);if(error){set({message:error});return false}const d=state.layout[id];commit({...state.layout,[id]:{...d,connections:{...connections(d),[port]:target,...(d.kind==='rack'&&d.coolingMode==='liquid'&&(port==='supply'||port==='return')?{supply:target,return:target}:{})}}},target?`${id} 已连接 ${target}`:`${id} 端口已断开`);return true},
    setDragging:dragging=>set({dragging}),
    beginInstall:id=>{if(get().layout[id])set({placementId:id,selectedId:id,editMode:true,message:`点击空地安装 ${id} · Esc 取消`})},
    cancelPlacement:()=>set({placementId:null,message:'已取消放置'}),
    place:(x,z)=>{const {placementId:id,layout}=get();if(!id)return false;const d=layout[id];x=Math.round(x*20)/20;z=Math.round(z*20)/20;const error=validatePlacement(layout,id,x,z,d.yaw);if(error){set({message:error});return false}commit({...layout,[id]:{...d,x,z,installed:true}},`${id} 已安装到选定位置`);set({placementId:null});return true},
    focus:(id,bay)=>{if(get().layout[id])set(s=>({selectedId:id,focusBay:bay??null,focusSequence:s.focusSequence+1}))},
    setCapacity:(id,value)=>{const d=get().layout[id];if(d&&Number.isFinite(value)&&value>=1&&value<=100000)commit({...get().layout,[id]:{...d,capacity:value}},`${id} 模拟额定参数已更新`)},
    select:id=>{if(get().layout[id]&&!get().layout[id].deleted)set({selectedId:id,movementId:null})},setEditMode:editMode=>set({editMode,...(!editMode?{placementId:null,movementId:null}:{})}),
    patch:(id,patch)=>{const d=get().layout[id];if(!d)return;if(patch.doorOpen===false&&d.extracted!==null){set({message:'请先推入抽出的服务器，再关闭机柜门'});return}if(patch.extracted!==undefined&&patch.extracted!==null){if(!Number.isInteger(patch.extracted)||!d.modules[patch.extracted]||!d.installed){set({message:'只能抽出已安装的服务器'});return}patch={...patch,doorOpen:true}}commit({...get().layout,[id]:{...d,...patch}},`${id} 状态已更新`)},
    move:(id,x,z,yaw,swap=false)=>{const layout=get().layout,d=layout[id];if(!d)return false;x=Math.round(x*20)/20;z=Math.round(z*20)/20;const angle=yaw??d.yaw,error=placementError(layout,id,x,z,angle);if(error.message){const other=error.collider?layout[error.collider]:undefined;if(swap&&d.kind==='rack'&&other?.kind==='rack'&&Math.hypot(other.x-x,other.z-z)<.7){const exchanged={...layout,[id]:{...d,x:other.x,z:other.z,yaw:other.yaw},[other.id]:{...other,x:d.x,z:d.z,yaw:d.yaw}};if(!validatePlacement(exchanged,id,other.x,other.z,other.yaw)&&!validatePlacement(exchanged,other.id,d.x,d.z,d.yaw)){commit(exchanged,`${id} 与 ${other.id} 已交换位置`);return true}}set({message:error.message});return false}commit({...layout,[id]:{...d,x,z,yaw:angle}},`${id} 已落位`);return true},
    install:(id,installed)=>{const d=get().layout[id];if(!d)return;if(installed){const error=validatePlacement(get().layout,id,d.x,d.z,d.yaw);if(error){set({message:error});return}}commit({...get().layout,[id]:{...d,installed}},`${id} 已${installed?'安装':'拆卸至设备库'}`)},
    module:(id,bay,installed)=>{const d=get().layout[id];if(!d||!Number.isInteger(bay)||bay<0||bay>=d.modules.length)return;const modules=d.modules.map((v,i)=>i===bay?installed:v);commit({...get().layout,[id]:{...d,modules,extracted:d.extracted===bay?null:d.extracted}},`${id} · 服务器 ${bay+1} 已${installed?'安装':'拆卸'}`)},
    transfer:(id,bay,target,targetBay)=>{if(id===target){set({message:'请移装到其他机柜'});return false}const source=get().layout[id],dest=get().layout[target];if(!source?.modules[bay]||!source.installed||!dest?.installed||!Number.isInteger(targetBay)||targetBay<0||targetBay>=dest.modules.length||dest.modules[targetBay]){set({message:'移装需要已安装的源服务器和目标机柜空槽位'});return false}commit({...get().layout,[id]:{...source,modules:source.modules.map((v,i)=>i===bay?false:v),extracted:null},[target]:{...dest,modules:dest.modules.map((v,i)=>i===targetBay?true:v)}},`服务器已从 ${id} 移装到 ${target} · 槽 ${targetBay+1}`);return true},
    undo:()=>{const state=get(),layout=state.history.at(-1);if(layout){set({layout,selectedId:layout[state.selectedId]&&!layout[state.selectedId].deleted?state.selectedId:Object.values(layout).find(d=>!d.deleted)?.id??state.selectedId,movementId:null,history:state.history.slice(0,-1),message:'已撤销最近一次设备操作'});try{localStorage.setItem(STORAGE,encode(layout))}catch{}}},
    reset:()=>{commit(defaultEquipment(),'已恢复参考数据中心分区布局');set({placementId:null,movementId:null,selectedId:'R-A01'})},exportLayout:()=>encode(get().layout),
    importLayout:text=>{try{const layout=parseLayout(text);commit(layout,'设备布局导入成功');return true}catch(error){set({message:`导入失败：${(error as Error).message}`});return false}},
  }
})
