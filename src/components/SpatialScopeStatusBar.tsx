import { Building2, Globe2, MapPin, MapPinned } from 'lucide-react'
import { campusFacilities, chinaProvinces, getCityByAdcode, getFacilityById, getProvinceByAdcode, jiangsuCities } from '../siteData'
import { useDesignerStore } from '../useDesignerStore'

export function SpatialScopeStatusBar() {
  const sceneScope = useDesignerStore((state) => state.sceneScope)
  const selectedCityAdcode = useDesignerStore((state) => state.selectedCityAdcode)
  const selectedFacilityId = useDesignerStore((state) => state.selectedFacilityId)
  const selectedProvinceAdcode = useDesignerStore((state) => state.selectedProvinceAdcode)
  const city = getCityByAdcode(selectedCityAdcode) ?? jiangsuCities[0]
  const facility = getFacilityById(selectedFacilityId) ?? campusFacilities[0]
  const province = getProvinceByAdcode(selectedProvinceAdcode) ?? chinaProvinces[0]

  if (sceneScope === 'china') {
    return (
      <footer className="status-bar">
        <span><Globe2 size={12} />中国省级总览</span>
        <span>省级节点 {chinaProvinces.length}</span>
        <span><MapPin size={12} />当前 {province.name} · {province.center[0].toFixed(3)}°E, {province.center[1].toFixed(3)}°N</span>
        <div className="status-spacer" />
        <span className="status-outdated">离线边界 · 原型用途</span>
      </footer>
    )
  }

  if (sceneScope === 'campus') {
    return (
      <footer className="status-bar">
        <span><Building2 size={12} />南京建模示例园区</span>
        <span>设施 {campusFacilities.length}</span>
        <span><MapPin size={12} />当前 {facility.name}</span>
        <div className="status-spacer" />
        <span className="status-outdated">合成园区模型 · 非真实站点</span>
      </footer>
    )
  }

  return (
    <footer className="status-bar">
      <span><MapPinned size={12} />江苏省域</span>
      <span>城市 {jiangsuCities.length}</span>
      <span><MapPin size={12} />{city.name} · {city.center[0].toFixed(3)}°E, {city.center[1].toFixed(3)}°N</span>
      <div className="status-spacer" />
      <span className="status-outdated">离线 GeoJSON · 原型用途</span>
    </footer>
  )
}
