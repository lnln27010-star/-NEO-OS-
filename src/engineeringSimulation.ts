import {connections} from './equipmentConnections'
import type {EquipmentLayout} from './equipmentModel'
import type {OperationFrame} from './operationsModel'

export type EngineId='pandapower'|'pypsa'|'openfoam'|'fenicsx'
export type Capability={id:EngineId;name:string;available:boolean;runtime:string|null;version:string|null;reason:string;can_prepare:boolean}
export type EngineeringMetric={key:string;label:string;value:number;unit:string}
export type EngineeringAsset={id:string;kind:string;x:number;z:number;voltage_pu:number|null;loading_percent:number;power_kw:number|null;demand_kw:number|null;redundant:boolean|null;status:string}
export type DispatchRow={hour:number;demand_mw:number;grid_mw:number;solar_mw:number;battery_mw:number;soc_mwh:number;sites:{id:string;name:string;it_mw:number;grid_mw:number;solar_mw:number;battery_mw:number;soc_mwh:number;price_yuan_kwh:number}[]}
export type EngineeringResult={engine:EngineId;engine_version:string;converged:boolean;executed:boolean;model_revision:string;input_sha256:string;elapsed_seconds:number;metrics:EngineeringMetric[];assets:EngineeringAsset[];series:DispatchRow[];checks:{name:string;passed:boolean}[];artifacts:string[];field_file?:string;short_circuit?:{bus:string;ikss_ka:number|null}[];data_sources?:{id:string;name:string;revision:number;baseline?:number;inventory_revision?:number;sha256:string}[];assumptions:unknown}
export type EngineeringJob={id:string;engine:EngineId;status:'prepared'|'queued'|'running'|'succeeded'|'failed'|'cancelled';created_at:string;updated_at:string;model_revision:string;input_sha256:string;error:string|null;result?:EngineeringResult;log_tail?:string;data_sources?:EngineeringResult['data_sources']}
export type EngineeringField={kind:'room_temperature'|'local_temperature';coordinates:string;points:number[][];values:number[];velocity?:number[][];unit:string;target_device?:string;bounds?:number[]}

export const ENGINE_LABELS:Record<EngineId,{name:string;domain:string}>={pandapower:{name:'pandapower',domain:'供电校核'},pypsa:{name:'PyPSA',domain:'多站协同优化'},openfoam:{name:'OpenFOAM',domain:'气流与风液耦合'},fenicsx:{name:'FEniCSx',domain:'局部热有限元'}}
export const DEFAULT_ENGINE_OPTIONS={
  electrical:{analysis:'power_flow',hv_kv:10,lv_kv:.415,power_factor:.98,transformer_vk_percent:6,transformer_vkr_percent:.7,cable_r_ohm_km:.08,cable_x_ohm_km:.08,cable_max_i_ka:1,ups_loss_percent:2},
  dispatch:{sites:[{id:'A',name:'当前园区',capacity_mw:12,grid_mw:18,price_yuan_kwh:.68,pue:1.3,solar_mw:2},{id:'B',name:'候选节点 B',capacity_mw:16,grid_mw:20,price_yuan_kwh:.42,pue:1.2,solar_mw:5},{id:'C',name:'候选节点 C',capacity_mw:10,grid_mw:14,price_yuan_kwh:.61,pue:1.25,solar_mw:3}],demand_mw:20,flexible_percent:35,migration_limit_mw:10,migration_cost_yuan_mwh:20,grid_limit_mw:26,battery_mwh:20,battery_mw:5,reserve_percent:20},
  thermal:{mode:'room_airflow',cells_x:32,cells_y:20,cells_z:8,iterations:400,inlet_c:20,air_speed_m_s:1,water_c:22,water_speed_m_s:.1,liquid_capture_fraction:.9,local_heat_w:500},
  fem:{component:'cold_plate',target_device:'',length_m:.3,width_m:.2,thickness_m:.006,conductivity_w_mk:380,heat_w:500,water_c:22,air_c:24,water_h_w_m2k:5000,air_h_w_m2k:10,cells:24,chip_fraction:.4},
}
export type EngineOptions=typeof DEFAULT_ENGINE_OPTIONS
export function createEngineeringSnapshot(layout:EquipmentLayout,frame:OperationFrame){
  const racks=new Map(frame.racks.map(r=>[r.id,r]))
  const devices=Object.values(layout).filter(d=>!d.deleted).map(d=>{
    const r=racks.get(d.id)
    const auxiliary=['network','chiller','chw-pump','cw-pump','crac','cdu','cooling-tower'].includes(d.kind)?Math.max(0,frame.runtime[d.id]?.powerKw??0):0
    return {id:d.id,kind:d.kind,x:d.x,z:d.z,yaw:d.yaw,capacity:d.capacity,pod:d.pod,installed:d.installed,enabled:d.enabled,operating:frame.runtime[d.id]?.active??null,cooling_ready:d.kind==='crac'?frame.coldCapacityKw>0&&frame.actualChwM3h>0&&(frame.runtime[d.id]?.active??false):null,cooling_mode:d.coolingMode,power_a:d.powerA,power_b:d.powerB,custom_connections:Boolean(d.connections),connections:connections(d),demand_kw:d.kind==='rack'&&d.enabled?d.capacity*frame.load/100*d.modules.filter((v,i)=>v&&i!==d.extracted).length/20:auxiliary,heat_air_kw:r?.heatToAirKw??0,heat_water_kw:r?.heatToWaterKw??0,flow_lpm:r?.flowLpm??0}
  })
  const body={devices,load_percent:frame.load,scenario:frame.scenario,seconds:frame.faultActive?frame.seconds:0}
  // A compact UI revision guard. The service separately records a cryptographic SHA-256 of the complete input.
  const encoded=JSON.stringify(body);let a=2166136261,b=5381
  for(let i=0;i<encoded.length;i++){a=Math.imul(a^encoded.charCodeAt(i),16777619);b=Math.imul(b,33)^encoded.charCodeAt(i)}
  return {...body,revision:`asset-${(a>>>0).toString(16)}-${(b>>>0).toString(16)}`}
}
export async function simulationApi<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch('/api/simulation'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)})
  if(!response.ok){let detail='求解服务请求失败';try{const error=await response.json();detail=typeof error.detail==='string'?error.detail:JSON.stringify(error.detail)}catch{}throw new Error(detail)}
  return response.json()
}
export function simulationArtifact(id:string,name:string){return `/api/simulation/jobs/${id}/artifacts/${name.split('/').map(encodeURIComponent).join('/')}`}
