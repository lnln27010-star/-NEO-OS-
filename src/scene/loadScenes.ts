export const loadEnergyScene=()=>import('./ChinaMapViewport')
export const loadAmapScene=()=>import('./AmapCampusViewport')
export const loadBimScene=()=>import('./BimCampusViewport')
let warmAssets:Promise<Response>|undefined
export const warmBimAssets=()=>{warmAssets??=fetch('/models/northbridge/building.glb',{cache:'force-cache'});void warmAssets.then(r=>{if(!r.ok)warmAssets=undefined}).catch(()=>{warmAssets=undefined})}
export const loadLayoutScene=()=>import('./DataCenterViewport')
export const loadProvinceScene=()=>import('./ProvinceMapViewport')
export function prewarmScene(scope:string) {
  const promise=scope==='china'?loadEnergyScene():scope==='campus'?loadAmapScene():scope==='room'?loadBimScene():scope==='layout'?loadLayoutScene():loadProvinceScene()
  if(scope==='room'||scope==='campus')warmBimAssets()
  void promise.catch(()=>{})
}
