import { ArrowRight, Database, Globe2, MapPin, MapPinned, Navigation, Search } from 'lucide-react'
import { chinaProvinces, getProvinceByAdcode, JIANGSU_ADCODE } from '../siteData'
import { useDesignerStore } from '../useDesignerStore'

const provinceButtonStyle = (active: boolean): React.CSSProperties => ({
  width: '100%',
  minHeight: 44,
  height: 'auto',
  justifyContent: 'space-between',
  padding: '7px 9px',
  borderColor: active ? 'rgba(69,148,255,.42)' : '#263749',
  background: active ? 'rgba(69,148,255,.11)' : '#0b151f',
  color: active ? '#dcebfa' : '#93a5b8',
  textAlign: 'left',
})

export function ChinaLeftPanel() {
  const selectedProvinceAdcode = useDesignerStore((state) => state.selectedProvinceAdcode)
  const province = getProvinceByAdcode(selectedProvinceAdcode) ?? chinaProvinces[0]

  return (
    <aside className="asset-library panel-surface" aria-label="基础设施地图说明">
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">基础设施地图</div>
          <div className="panel-subtitle">OpenInfraMap · OSM 电力网络</div>
        </div>
        <Globe2 size={17} aria-hidden="true" />
      </div>
      <div className="section-intro" style={{ margin: '8px -12px 10px' }}>地图已切换为真实省界交互。直接点击地图上的省界或标记完成选址，不需要逐个翻列表。</div>
      <div className="map-current-selection"><Search size={16} /><div><span>当前地图标记</span><strong>{province.name}</strong><small>{province.center[0].toFixed(3)}°E · {province.center[1].toFixed(3)}°N</small></div></div>
      <div className="section-intro" style={{ margin: '12px -12px 0' }}>省界来自项目内 GeoJSON；接入 MapTiler / 高德 Key 后可叠加专业道路与卫星底图。</div>
    </aside>
  )
}

export function ChinaRightPanel() {
  const selectedProvinceAdcode = useDesignerStore((state) => state.selectedProvinceAdcode)
  const setSceneScope = useDesignerStore((state) => state.setSceneScope)
  const province = getProvinceByAdcode(selectedProvinceAdcode) ?? chinaProvinces[0]
  const canEnterProvince = Boolean(province)

  return (
    <aside className="inspector panel-surface" aria-label="地图标记信息">
      <div className="inspector-object-head">
        <div className="object-avatar" style={{ '--asset-accent': '#4594ff' } as React.CSSProperties}><MapPinned size={22} /></div>
        <div className="object-identification">
          <strong>{province.name}</strong>
          <span>行政区划代码 {province.adcode}</span>
          <div className="object-status"><i />{province.role ?? `${province.region}省级节点`}</div>
        </div>
      </div>
      <div className="inspector-scroll">
        <section className="property-section">
          <div className="section-title">行政区属性</div>
          <div className="field-row"><span><MapPin size={13} />中心经度</span><strong>{province.center[0].toFixed(6)}°E</strong></div>
          <div className="field-row"><span><Navigation size={13} />中心纬度</span><strong>{province.center[1].toFixed(6)}°N</strong></div>
          <div className="field-row"><span>区域分组</span><strong>{province.region}</strong></div>
        </section>
        <section className="property-section">
          <div className="section-title">地图标记说明</div>
          <div className="source-card">
            <Database size={16} />
            <div>
              <strong>{province.name}省级边界</strong>
              <span>省界与地名已叠加在当前基础设施地图中，点击线路和图标查看对象属性。</span>
            </div>
          </div>
          <span className="section-intro" style={{ display: 'block', marginTop: 10 }}>省级边界、基础设施和数据中心均在当前地图内完成选择。</span>
        </section>
      </div>
    </aside>
  )
}

export function ChinaBottomPanel() {
  const selectedProvinceAdcode = useDesignerStore((state) => state.selectedProvinceAdcode)
  const province = getProvinceByAdcode(selectedProvinceAdcode) ?? chinaProvinces[0]
  const regions = new Set(chinaProvinces.map((item) => item.region)).size

  return (
    <section className="bottom-panel panel-surface is-open" aria-label="中国层级数据说明">
      <div className="bottom-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', color: '#dbe7f3', fontSize: 11 }}><Globe2 size={15} />基础设施概览</div>
        <div className="validation-state">省界与地名图层 · OpenInfraMap 电力底图</div>
      </div>
      <div className="history-content">
        <div className="history-item"><Globe2 size={14} /><time>图层</time><span>输电线路、变电站、发电厂、太阳能、省级边界与地名。</span></div>
        <div className="history-item"><MapPin size={14} /><time>当前</time><span>{province.name} · {province.center[0].toFixed(3)}°E, {province.center[1].toFixed(3)}°N</span></div>
        <div className="history-item"><MapPinned size={14} /><time>数据中心</time><span>点击 Northbridge A2 标记直接进入现有园区模型。</span></div>
      </div>
    </section>
  )
}
