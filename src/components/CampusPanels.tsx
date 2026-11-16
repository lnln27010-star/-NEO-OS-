import { ArrowRight, Box, Building2, Database, MapPin, Server, Zap } from 'lucide-react'
import { campusFacilities, getFacilityById } from '../siteData'
import { useDesignerStore } from '../useDesignerStore'
import { SiteAssetIntake } from './SiteAssetIntake'

const typeLabels: Record<string, string> = {
  'data-hall': '数据楼',
  power: '供配电',
  cooling: '冷却',
  operations: '运维辅助',
}

const facilityButtonStyle = (active: boolean): React.CSSProperties => ({
  width: '100%',
  minHeight: 50,
  height: 'auto',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  padding: '8px 9px',
  borderColor: active ? 'rgba(66,207,250,.42)' : '#263749',
  background: active ? 'rgba(66,207,250,.09)' : '#0b151f',
  color: active ? '#dff8ff' : '#93a5b8',
  textAlign: 'left',
})

export function CampusLeftPanel() {
  const selectedFacilityId = useDesignerStore((state) => state.selectedFacilityId)
  const setSelectedFacilityId = useDesignerStore((state) => state.setSelectedFacilityId)

  return (
    <aside className="asset-library panel-surface" aria-label="示例园区设施列表">
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">园区设施</div>
          <div className="panel-subtitle">建模示例 · 非真实园区</div>
        </div>
        <Building2 size={17} aria-hidden="true" />
      </div>
      <div className="section-intro" style={{ margin: '8px -12px 10px' }}>
        选择设施查看模型属性。只有 A2 液冷数据楼提供房间级原型入口。
      </div>
      <div aria-label="选择园区设施" style={{ minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '1px 0 14px' }}>
        {campusFacilities.map((facility) => {
          const active = facility.id === selectedFacilityId
          return (
            <button
              key={facility.id}
              className="button button-ghost"
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedFacilityId(facility.id)}
              style={facilityButtonStyle(active)}
            >
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', color: 'inherit', fontSize: 11.5 }}>{facility.name}</strong>
                <span style={{ display: 'block', marginTop: 3, color: '#8ba0b5', fontSize: 9.5 }}>{typeLabels[facility.type] ?? facility.type}</span>
              </span>
              <span style={{ color: facility.enterable ? '#62d99b' : '#71869a', fontSize: 9.5, whiteSpace: 'nowrap' }}>{facility.status}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

export function CampusRightPanel() {
  const selectedFacilityId = useDesignerStore((state) => state.selectedFacilityId)
  const setSceneScope = useDesignerStore((state) => state.setSceneScope)
  const facility = getFacilityById(selectedFacilityId) ?? campusFacilities[0]
  const canEnterRoom = facility.type === 'data-hall' && Boolean(facility.enterable)

  return (
    <aside className="inspector panel-surface" aria-label="园区设施信息">
      <div className="inspector-object-head">
        <div className="object-avatar" style={{ '--asset-accent': facility.type === 'power' ? '#ff9f43' : facility.type === 'cooling' ? '#42cffa' : '#43d487' } as React.CSSProperties}>
          {facility.type === 'data-hall' ? <Server size={22} /> : facility.type === 'power' ? <Zap size={22} /> : <Building2 size={22} />}
        </div>
        <div className="object-identification">
          <strong>{facility.name}</strong>
          <span>{typeLabels[facility.type] ?? facility.type}</span>
          <div className="object-status"><i />{facility.status}</div>
        </div>
      </div>
      <div className="inspector-scroll">
        <section className="property-section">
          <div className="section-title">模型属性</div>
          <div className="field-row"><span><MapPin size={13} />园区坐标</span><strong>X {facility.position[0]} · Z {facility.position[2]} m</strong></div>
          <div className="field-row"><span><Box size={13} />示意尺寸</span><strong>{facility.size[0]} × {facility.size[2]} × {facility.size[1]} m</strong></div>
          <div className="field-row"><span>模型编号</span><strong>{facility.id}</strong></div>
        </section>
        <SiteAssetIntake />
        <section className="property-section">
          <div className="section-title">原型说明</div>
          <div className="source-card">
            <Database size={16} />
            <div><strong>合成园区设施</strong><span>{facility.summary}</span></div>
          </div>
          <button
            className="button button-primary"
            type="button"
            disabled={!canEnterRoom}
            title={canEnterRoom ? '进入 2F A2 液冷机房原型' : '当前设施没有可进入的房间级模型'}
            onClick={() => setSceneScope('room')}
            style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
          >
            进入机房原型 <ArrowRight size={14} />
          </button>
        </section>
        <section className="property-section">
          <div className="section-title">DSX 数据血缘</div>
          <div className="lineage-list">
            <div><span>卫星场地底图</span><strong className="lineage-ready">已接入参考</strong></div>
            <div><span>业主 BIM / 点云</span><strong className="lineage-pending">待导入</strong></div>
            <div><span>设备几何</span><strong className="lineage-reference">GLB 参考资产</strong></div>
            <div><span>热电数据</span><strong className="lineage-test">测试时序</strong></div>
          </div>
        </section>
      </div>
    </aside>
  )
}

export function CampusBottomPanel() {
  const selectedFacilityId = useDesignerStore((state) => state.selectedFacilityId)
  const facility = getFacilityById(selectedFacilityId) ?? campusFacilities[0]
  const dataHallCount = campusFacilities.filter((item) => item.type === 'data-hall').length

  return (
    <section className="bottom-panel panel-surface is-open" aria-label="示例园区说明">
      <div className="bottom-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', color: '#dbe7f3', fontSize: 11 }}><Building2 size={15} />园区总图</div>
        <div className="validation-state">建模示例 · 不代表真实站点</div>
      </div>
      <div className="history-content">
        <div className="history-item"><Building2 size={14} /><time>设施</time><span>{campusFacilities.length} 个示意设施，其中 {dataHallCount} 个数据楼体量模型。</span></div>
        <div className="history-item"><MapPin size={14} /><time>当前</time><span>{facility.name} · {facility.status}</span></div>
        <div className="history-item"><Server size={14} /><time>下钻</time><span>A2 液冷数据楼连接现有 2F A2 液冷机房高保真原型。</span></div>
      </div>
    </section>
  )
}
