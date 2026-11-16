import type {Capability} from './engineeringSimulation'
export type RegisteredCenter={id:string;code:string;name:string;region:string;latitude:number|null;longitude:number|null;source:string;archived:boolean;it_capacity_mw:number|null;grid_capacity_mw:number|null;pue:number|null;asset_count:number;server_count:number;component_count:number;telemetry_source_count:number;latest_measurement_at:string|null;revision:number;updated_at:string;quality_errors:number;quality_warnings:number;baseline:null|{version:number;center_revision:number;inventory_revision:number};inventory_revision:number}
export type RecentEngineeringJob={id:string;engine:string;status:string;created_at:string;data_sources:{id:string;name:string;baseline?:number}[]}
export type PlatformOverview={centers:RegisteredCenter[];jobs:RecentEngineeringJob[];registered:number;published:number;measured:number;source:string}
export type RegisteredCapability=Capability&{inputs:string;outputs:string;calibration:string;interface:string}
export type CapabilityDirectory={capabilities:RegisteredCapability[];agent_runtime:string;data_interfaces:{name:string;status:string}[]}
export async function platformApi<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch('/api/platform'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(18000)})
  if(!response.ok){let detail='平台服务请求失败';try{const parsed=await response.json();detail=typeof parsed.detail==='string'?parsed.detail:JSON.stringify(parsed.detail)}catch{}throw new Error(detail)}
  return response.json()
}
