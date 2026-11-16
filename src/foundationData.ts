import type {DeviceKind,EquipmentLayout} from './equipmentModel'
import {KIND_LABEL} from './equipmentModel'
import {connections} from './equipmentConnections'
import {create} from 'zustand'
export type Origin='model'|'manual'|'measured'|'document'|'discovered'
export const ORIGIN_LABEL={model:'模型待核实',manual:'人工录入',measured:'现场实测',document:'资料提取待核实',discovered:'接口快照'}
export const PORT_LABEL={powerA:'供电 A 路',powerB:'供电 B 路',supply:'供水',return:'回水',network:'网络'}
export type Plate={rated_kva:number|null;hv_kv:number|null;lv_kv:number|null;power_factor:number|null;vk_percent:number|null;vkr_percent:number|null;pfe_kw:number|null;i0_percent:number|null;ups_loss_percent:number|null;rated_current_a:number|null}
export type FoundationAsset={id:string;name:string;kind:DeviceKind;manufacturer:string;model:string;serial:string;room:string;source:Origin;reference:string;capacity:number;x:number;z:number;yaw:number;pod:number;installed:boolean;enabled:boolean;cooling_mode:'air'|'liquid';nameplate:Plate;measured_kw:number|null;load_profile_kw:(number|null)[]|null;heat_air_kw:number|null;heat_water_kw:number|null;flow_lpm:number|null;connections:Partial<Record<keyof typeof PORT_LABEL,string>>;rack_units?:number;position_verified?:boolean;provenance?:Record<string,string>}
export type FoundationCable={id:string;source:string;target:string;port:keyof typeof PORT_LABEL;specification:string;material:'copper'|'aluminium'|'other';cross_section_mm2:number|null;cores:number;installation:string;length_m:number|null;r_ohm_km:number|null;x_ohm_km:number|null;max_i_ka:number|null;parallel:number;in_service:boolean;origin:Origin}
export type FoundationHour={price:number|null;it_kw:number|null;solar_kw:number|null}
export type FoundationCooling={room_length_m:number;room_width_m:number;room_height_m:number;inlet_c:number;air_speed_m_s:number;water_c:number;water_speed_m_s:number;liquid_capture_fraction:number;conductivity_w_mk:number;water_h_w_m2k:number;air_h_w_m2k:number}
export type SpaceData={id:string;name:string;building:string;floor:string;category:'server-room'|'power-room'|'plant-room'|'office'|'other';area_m2:number|null;height_m:number|null;reference:string}
export type CenterData={id:string;code:string;name:string;region:string;address:string;owner:string;reference:string;effective_date:string;latitude:number|null;longitude:number|null;it_capacity_mw:number|null;grid_capacity_mw:number|null;pue:number|null;solar_mw:number|null;battery_mwh:number|null;battery_mw:number|null;grid_short_circuit_mva:number|null;source:Origin;archived:boolean;assets:FoundationAsset[];cables:FoundationCable[];hourly:FoundationHour[];cooling:FoundationCooling;spaces:SpaceData[];timezone:string}
export type DataIssue={section:string;record:string;field:string;message:string;severity:'error'|'warning'}
export type Quality={errors:number;warnings:number;issues:DataIssue[]}
export type CenterRecord={data:CenterData;revision:number;updated_at:string;quality:Quality}
export type CenterSummary={id:string;name:string;code:string;region:string;archived:boolean;revision:number;updated_at:string;asset_count:number;cable_count:number;errors:number;warnings:number;baseline?:{version:number;center_revision:number;inventory_revision:number}|null;inventory_revision?:number}
export const EMPTY_PLATE:Plate={rated_kva:null,hv_kv:null,lv_kv:null,power_factor:null,vk_percent:null,vkr_percent:null,pfe_kw:null,i0_percent:null,ups_loss_percent:null,rated_current_a:null}
export const DEFAULT_COOLING:FoundationCooling={room_length_m:96,room_width_m:61,room_height_m:8.5,inlet_c:20,air_speed_m_s:1,water_c:22,water_speed_m_s:.1,liquid_capture_fraction:.9,conductivity_w_mk:380,water_h_w_m2k:5000,air_h_w_m2k:10}
export const newId=()=>`DC-${crypto.randomUUID().slice(0,8)}`
export function emptyCenter():CenterData{return {id:newId(),code:'DC-001',name:'新建数据中心',region:'',address:'',owner:'',reference:'',effective_date:'',latitude:null,longitude:null,it_capacity_mw:null,grid_capacity_mw:null,pue:null,solar_mw:null,battery_mwh:null,battery_mw:null,grid_short_circuit_mva:null,source:'manual',archived:false,assets:[],cables:[],hourly:Array.from({length:24},()=>({price:null,it_kw:null,solar_kw:null})),cooling:{...DEFAULT_COOLING},spaces:[],timezone:'Asia/Shanghai'}}
export function emptyAsset(id='DEV-001'):FoundationAsset{return {id,name:'',kind:'rack',manufacturer:'',model:'',serial:'',room:'',source:'manual',reference:'',capacity:16,x:0,z:0,yaw:0,pod:0,installed:true,enabled:true,cooling_mode:'air',nameplate:{...EMPTY_PLATE},measured_kw:null,load_profile_kw:null,heat_air_kw:null,heat_water_kw:null,flow_lpm:null,connections:{}}}
export function emptyCable(id='CBL-001'):FoundationCable{return {id,source:'',target:'',port:'powerA',specification:'',material:'copper',cross_section_mm2:null,cores:4,installation:'',length_m:null,r_ohm_km:null,x_ohm_km:null,max_i_ka:null,parallel:1,in_service:true,origin:'manual'}}
export function syncLayout(center:CenterData,layout:EquipmentLayout):CenterData{
  const old=new Map(center.assets.map(a=>[a.id,a])),assets=Object.values(layout).filter(d=>!d.deleted).map(d=>{
    const preserved=old.get(d.id)
    return {...emptyAsset(d.id),...preserved,id:d.id,name:preserved?.name||KIND_LABEL[d.kind],kind:d.kind,x:d.x,z:d.z,yaw:d.yaw,pod:d.pod,installed:d.installed,enabled:d.enabled,cooling_mode:d.coolingMode,capacity:preserved?.source!=='model'&&preserved?preserved.capacity:d.capacity,source:preserved?.source??'model',connections:preserved?.connections??connections(d)}
  })
  // Existing engineering records survive synchronization; only missing edges are added.
  const ids=new Set(assets.map(a=>a.id)),cables=[...center.cables];let n=1
  for(const d of assets)for(const [port,source] of Object.entries(d.connections)){
    if(!source||!ids.has(source)||cables.some(c=>c.target===d.id&&c.port===port))continue
    while(cables.some(c=>c.id===`CBL-${String(n).padStart(5,'0')}`))n++
    cables.push({...emptyCable(`CBL-${String(n++).padStart(5,'0')}`),source,target:d.id,port:port as FoundationCable['port'],origin:'model'})
  }
  return {...center,assets:[...assets,...center.assets.filter(a=>!ids.has(a.id))],cables}
}
export const useFoundationStore=create<{visible:boolean;preferredId:string;tabHint:string;open:(id?:string,tabHint?:string)=>void;close:()=>void}>((set)=>({visible:new URLSearchParams(location.search).get('page')==='data',preferredId:'',tabHint:new URLSearchParams(location.search).get('section')??'',open:(id,tabHint)=>set({visible:true,preferredId:id??'',tabHint:tabHint??''}),close:()=>set({visible:false})}))
export function downloadData(name:string,content:string,type='application/json'){
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export function encodeCsv(rows:Record<string,unknown>[]){
  const keys=Object.keys(rows[0]??{}),cell=(v:unknown)=>{let s=v==null?'':String(v);if(typeof v==='string'&&/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
  return '\uFEFF'+[keys,...rows.map(row=>keys.map(k=>row[k]))].map(row=>row.map(cell).join(',')).join('\r\n')
}
export function parseCsv(text:string){
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false
  text=text.replace(/^\uFEFF/,'')
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(quoted||!cell)quoted=!quoted;else throw new Error('CSV 引号格式错误')}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell=''}else cell+=c}
  if(quoted)throw new Error('CSV 引号未闭合');row.push(cell);if(row.some(x=>x!==''))rows.push(row)
  const keys=rows.shift()??[]
  if(!keys.length||new Set(keys).size!==keys.length)throw new Error('CSV 表头为空或重复')
  if(rows.length>6000)throw new Error('单次导入最多 6000 行')
  return rows.map((r,i)=>{if(r.length!==keys.length)throw new Error(`第 ${i+2} 行列数不匹配`);return Object.fromEntries(keys.map((k,j)=>[k.trim(),r[j].trim()]))})
}
export const csvNumber=(v:string|undefined)=>{if(v===undefined||v==='')return null;const n=Number(v);if(!Number.isFinite(n))throw new Error('数值格式错误：'+v);return n}
export const ASSET_CSV=['id','name','kind','manufacturer','model','serial','room','source','reference','capacity','measured_kw','x','z',...Object.keys(EMPTY_PLATE)]
export const CABLE_CSV=Object.keys(emptyCable())
export function assetCsv(a:FoundationAsset):Record<string,unknown>{return Object.fromEntries(ASSET_CSV.map(k=>[k,k in a.nameplate?a.nameplate[k as keyof Plate]:a[k as keyof FoundationAsset]]))}
export function importAssets(rows:Record<string,string>[],existing:FoundationAsset[]){
  if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('导入文件中设备编号重复')
  const result=new Map(existing.map(a=>[a.id,a]))
  for(const row of rows){if(!row.id||!row.kind||!(row.kind in KIND_LABEL))throw new Error('设备编号或设备类型无效');const a={...emptyAsset(row.id),...result.get(row.id),nameplate:{...EMPTY_PLATE,...result.get(row.id)?.nameplate}}
    for(const [k,v] of Object.entries(row)){if(!ASSET_CSV.includes(k))throw new Error('未知设备列：'+k);if(k in EMPTY_PLATE)a.nameplate[k as keyof Plate]=csvNumber(v);else if(['capacity','measured_kw','x','z'].includes(k)){const n=csvNumber(v);if(n!==null||k==='measured_kw')Object.assign(a,{[k]:n})}else Object.assign(a,{[k]:v})}result.set(a.id,a)
  }return [...result.values()]
}
export function importCables(rows:Record<string,string>[],existing:FoundationCable[]){
  if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('导入文件中线路编号重复')
  const result=new Map(existing.map(a=>[a.id,a]))
  for(const row of rows){if(!row.id)throw new Error('线路编号不能为空');const a={...emptyCable(row.id),...result.get(row.id)}
    for(const [k,v] of Object.entries(row)){if(!CABLE_CSV.includes(k))throw new Error('未知线路列：'+k);if(['cores','parallel','length_m','r_ohm_km','x_ohm_km','max_i_ka','cross_section_mm2'].includes(k))Object.assign(a,{[k]:csvNumber(v)});else if(k==='in_service'){if(!['true','false','1','0'].includes(v))throw new Error('in_service 应为 true/false');a.in_service=v==='true'||v==='1'}else Object.assign(a,{[k]:v})}result.set(a.id,a)
  }return [...result.values()]
}
