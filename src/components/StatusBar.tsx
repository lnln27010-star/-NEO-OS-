import { CircleDot, Grid3X3, Magnet, MonitorDot } from 'lucide-react'
import { ROOM } from '../domain'
import { useDesignerStore } from '../useDesignerStore'

export function StatusBar() {
  const selectedId = useDesignerStore((state) => state.selectedId)
  const selected = useDesignerStore((state) => state.instances.find((item) => item.id === selectedId))
  const instanceCount = useDesignerStore((state) => state.instances.length)
  const validationDirty = useDesignerStore((state) => state.validationDirty)
  const lastValidation = useDesignerStore((state) => state.lastValidation)
  const viewMode = useDesignerStore((state) => state.viewMode)
  const gridMillimeters = Math.round(ROOM.grid * 1000)

  return (
    <footer className="status-bar">
      <span><CircleDot size={12} />X {selected?.position[0].toFixed(2) ?? '0.00'} m&nbsp;&nbsp; Y {selected?.position[2].toFixed(2) ?? '0.00'} m&nbsp;&nbsp; Z 0.00 m</span>
      <span><Grid3X3 size={12} />网格 {gridMillimeters} mm</span>
      <span><Magnet size={12} />吸附 · 网格</span>
      <span>场景 {instanceCount} 个设备</span>
      <span><MonitorDot size={12} />视图 {viewMode.toUpperCase()}</span>
      <div className="status-spacer" />
      <span className={validationDirty ? 'status-outdated' : 'status-current'} aria-live="polite">{validationDirty ? '校核结果已过期 · 设计有变更' : `校核完成 · ${lastValidation}`}</span>
    </footer>
  )
}
