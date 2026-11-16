import { ArrowRight, Building2, Database, MapPin, MapPinned, Navigation } from 'lucide-react'
import { chinaProvinces, getCityByAdcode, getProvinceByAdcode, jiangsuCities } from '../siteData'
import { useDesignerStore } from '../useDesignerStore'

const cityButtonStyle = (active: boolean): React.CSSProperties => ({
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

export function ProvinceLeftPanel() {
  const selectedCityAdcode = useDesignerStore((state) => state.selectedCityAdcode)
  const selectedProvinceAdcode = useDesignerStore((state) => state.selectedProvinceAdcode)
  const province = getProvinceByAdcode(selectedProvinceAdcode) ?? chinaProvinces[0]
  const setSelectedCityAdcode = useDesignerStore((state) => state.setSelectedCityAdcode)

  return (
    <aside className="asset-library panel-surface" aria-label={`${province.name}省域信息`}>
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">{province.name}省域</div>
          <div className="panel-subtitle">真实省级边界 · {province.adcode}</div>
        </div>
        <MapPinned size={17} aria-hidden="true" />
      </div>
      <div className="section-intro" style={{ margin: '8px -12px 10px' }}>
        {province.adcode === 320000 ? '点击地图上的设区市查看中心点；南京连接建模示例园区。' : '已进入全国地图直接选中的省份。该省的城市与园区模型将在接入真实数据后展开。'}
      </div>
      {province.adcode === 320000 && <div aria-label="选择城市" style={{ minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '1px 0 14px' }}>
        {jiangsuCities.map((city) => {
          const active = city.adcode === selectedCityAdcode
          return (
            <button
              key={city.adcode}
              className="button button-ghost"
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedCityAdcode(city.adcode)}
              style={cityButtonStyle(active)}
            >
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', color: 'inherit', fontSize: 12 }}>{city.name}</strong>
                <span style={{ display: 'block', marginTop: 2, color: '#8ba0b5', fontSize: 9.5 }}>{city.adcode}</span>
              </span>
              {city.candidate && <span className="demo-badge">建模示例</span>}
            </button>
          )
        })}
      </div>}
    </aside>
  )
}

export function ProvinceRightPanel() {
  const selectedCityAdcode = useDesignerStore((state) => state.selectedCityAdcode)
  const selectedProvinceAdcode = useDesignerStore((state) => state.selectedProvinceAdcode)
  const province = getProvinceByAdcode(selectedProvinceAdcode) ?? chinaProvinces[0]
  const setSceneScope = useDesignerStore((state) => state.setSceneScope)
  const city = getCityByAdcode(selectedCityAdcode) ?? jiangsuCities[0]
  if (province.adcode !== 320000) return <aside className="inspector panel-surface" aria-label="省级信息"><div className="inspector-object-head"><div className="object-identification"><strong>{province.name}</strong><span>行政区划代码 {province.adcode}</span><div className="object-status"><i />真实省级边界已选中</div></div></div><div className="inspector-scroll"><section className="property-section"><div className="section-title">省级属性</div><div className="field-row"><span><MapPin size={13} />中心经度</span><strong>{province.center[0].toFixed(6)}°E</strong></div><div className="field-row"><span><Navigation size={13} />中心纬度</span><strong>{province.center[1].toFixed(6)}°N</strong></div><div className="field-row"><span>区域分组</span><strong>{province.region}</strong></div></section></div></aside>
  const canEnterCampus = Boolean(city.candidate)

  return (
    <aside className="inspector panel-surface" aria-label="城市信息">
      <div className="inspector-object-head">
        <div className="object-avatar" style={{ '--asset-accent': '#4594ff' } as React.CSSProperties}><Building2 size={22} /></div>
        <div className="object-identification">
          <strong>{city.name}</strong>
          <span>行政区划代码 {city.adcode}</span>
          <div className="object-status"><i />{city.role ?? '省域公开数据节点'}</div>
        </div>
      </div>
      <div className="inspector-scroll">
        <section className="property-section">
          <div className="section-title">公开属性</div>
          <div className="field-row"><span><MapPin size={13} />中心经度</span><strong>{city.center[0].toFixed(6)}°E</strong></div>
          <div className="field-row"><span><Navigation size={13} />中心纬度</span><strong>{city.center[1].toFixed(6)}°N</strong></div>
          <div className="field-row"><span>数据层级</span><strong>地级市</strong></div>
        </section>
        <section className="property-section">
          <div className="section-title">建模入口</div>
          <div className="source-card">
            <Database size={16} />
            <div>
              <strong>{canEnterCampus ? '南京建模示例园区' : '当前城市尚无园区模型'}</strong>
              <span>{canEnterCampus ? '原型设施与容量均为交互示例，不代表真实园区。' : '可继续在省域地图查看城市中心与边界。'}</span>
            </div>
          </div>
          <button
            className="button button-primary"
            type="button"
            disabled={!canEnterCampus}
            title={canEnterCampus ? '进入南京建模示例园区' : '当前仅南京市提供建模示例园区'}
            onClick={() => setSceneScope('campus')}
            style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
          >
            进入示例园区 <ArrowRight size={14} />
          </button>
        </section>
      </div>
    </aside>
  )
}

export function ProvinceBottomPanel() {
  const selectedCityAdcode = useDesignerStore((state) => state.selectedCityAdcode)
  const selectedProvinceAdcode = useDesignerStore((state) => state.selectedProvinceAdcode)
  const province = getProvinceByAdcode(selectedProvinceAdcode) ?? chinaProvinces[0]
  const city = getCityByAdcode(selectedCityAdcode) ?? jiangsuCities[0]
  if (province.adcode !== 320000) return <section className="bottom-panel panel-surface is-open" aria-label="省域数据说明"><div className="bottom-panel-header"><div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', color: '#dbe7f3', fontSize: 11 }}><MapPinned size={15} />省域概览</div><div className="validation-state">全国 GeoJSON · 直接省级选址</div></div><div className="history-content"><div className="history-item"><MapPinned size={14} /><time>当前</time><span>{province.name} · {province.center[0].toFixed(3)}°E, {province.center[1].toFixed(3)}°N</span></div><div className="history-item"><Building2 size={14} /><time>下一步</time><span>接入该省真实城市边界和业主园区 BIM 后即可继续下钻。</span></div></div></section>

  return (
    <section className="bottom-panel panel-surface is-open" aria-label="省域数据说明">
      <div className="bottom-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', color: '#dbe7f3', fontSize: 11 }}><MapPinned size={15} />省域概览</div>
        <div className="validation-state">离线 GeoJSON · 原型选址视图</div>
      </div>
      <div className="history-content">
        <div className="history-item"><MapPinned size={14} /><time>范围</time><span>江苏省 13 个设区市，名称、中心点和边界来自打包离线 GeoJSON。</span></div>
        <div className="history-item"><MapPin size={14} /><time>当前</time><span>{city.name} · {city.center[0].toFixed(3)}°E, {city.center[1].toFixed(3)}°N</span></div>
        <div className="history-item"><Building2 size={14} /><time>模型</time><span>仅南京连接一个合成园区示例，设施、状态与容量不对应真实项目。</span></div>
      </div>
    </section>
  )
}
