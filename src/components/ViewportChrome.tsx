import {
  Box,
  Building2,
  Camera,
  Droplets,
  Flame,
  Grid3X3,
  Layers3,
  Map,
  Maximize,
  Power,
  Rotate3D,
  Snowflake,
} from 'lucide-react'
import type { CameraPreset, OverlayMode } from '../domain'
import { ROOM } from '../domain'
import { assetById } from '../assets'
import { useDesignerStore } from '../useDesignerStore'

const overlays: Array<{ id: OverlayMode; label: string; icon: typeof Power }> = [
  { id: 'none', label: '综合', icon: Layers3 },
  { id: 'power', label: '电力', icon: Power },
  { id: 'cooling', label: '冷却', icon: Droplets },
  { id: 'heat', label: '热风险', icon: Flame },
]

const cameras: Array<{ id: CameraPreset; label: string }> = [
  { id: 'iso', label: '等轴' },
  { id: 'top', label: '俯视' },
  { id: 'aisle', label: '通道' },
  { id: 'front', label: '前视' },
]

export function ViewportChrome() {
  const overlayMode = useDesignerStore((state) => state.overlayMode)
  const setOverlayMode = useDesignerStore((state) => state.setOverlayMode)
  const cameraPreset = useDesignerStore((state) => state.cameraPreset)
  const setCameraPreset = useDesignerStore((state) => state.setCameraPreset)
  const instances = useDesignerStore((state) => state.instances)
  const allIssues = useDesignerStore((state) => state.issues)
  const preview = useDesignerStore((state) => state.placementPreview)
  const draggingId = useDesignerStore((state) => state.draggingDefinitionId)

  const rackCount = instances.filter((item) => assetById[item.definitionId]?.kind.endsWith('rack')).length
  const gpuCount = instances.reduce((sum, item) => sum + (assetById[item.definitionId]?.gpuCount ?? 0), 0)
  const liveIds = new Set(instances.map((item) => item.id))
  const issues = allIssues.filter((issue) => liveIds.has(issue.targetId))
  const totalPowerMw = instances.reduce((sum, item) => {
    const definition = assetById[item.definitionId]
    if (!definition || !['compute', 'network'].includes(definition.category)) return sum
    return sum + (definition.ratedPowerKw ?? 0) * item.loadPercent / 100
  }, 0) / 1000

  return (
    <div className="viewport-chrome" aria-hidden="false">
      <div className="viewport-title-card">
        <div className="title-icon"><Building2 size={17} /></div>
        <div><strong>2F · A2 液冷机房</strong><span>{ROOM.width.toFixed(1)} × {ROOM.depth.toFixed(1)} m · 净高 {ROOM.height.toFixed(1)} m</span></div>
      </div>
      <div className="viewport-kpis">
        <div><span>已部署</span><strong>{rackCount} 柜</strong></div>
        <div><span>IT 负载</span><strong>{totalPowerMw.toFixed(2)} MW</strong></div>
        <div><span>GPU</span><strong>{gpuCount.toLocaleString()}</strong></div>
        <div className={issues.length ? 'has-warning' : ''}><span>未解决问题</span><strong>{issues.length}</strong></div>
      </div>
      <div className="overlay-toolbar">
        {overlays.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={overlayMode === id ? 'is-active' : ''} aria-pressed={overlayMode === id} onClick={() => setOverlayMode(id)} title={`切换至${label}叠加层`}><Icon size={15} /><span>{label}</span></button>
        ))}
      </div>
      <div className="camera-toolbar">
        <div className="camera-toolbar-label"><Camera size={14} />相机</div>
        {cameras.map((camera) => (
          <button key={camera.id} type="button" className={cameraPreset === camera.id ? 'is-active' : ''} aria-pressed={cameraPreset === camera.id} title={`切换至${camera.label}视角`} onClick={() => setCameraPreset(camera.id)}>{camera.label}</button>
        ))}
      </div>
      <button className="view-cube" type="button" onClick={() => setCameraPreset('iso')} title="恢复等轴视图" aria-label="顶前右，恢复等轴视图">
        <span className="cube-top">顶</span><span className="cube-front">前</span><span className="cube-side">右</span>
      </button>
      <div className="viewport-left-tools">
        <button type="button" title="区域工具暂未开放" aria-label="区域工具暂未开放" disabled><Box size={15} /></button>
        <button type="button" title="网格设置暂未开放" aria-label="网格设置暂未开放" disabled><Grid3X3 size={15} /></button>
        <button type="button" title="视图旋转工具暂未开放，请使用鼠标右键" aria-label="视图旋转工具暂未开放，请使用鼠标右键" disabled><Rotate3D size={15} /></button>
        <button type="button" title="适配场景暂未开放" aria-label="适配场景暂未开放" disabled><Maximize size={15} /></button>
      </div>
      <div className="scene-legend">
        <span><i className="legend-compute" />算力</span>
        <span><i className="legend-power" />电力</span>
        <span><i className="legend-cooling" />冷却</span>
        {overlayMode === 'heat' && <span><Snowflake size={12} />入口温度风险示意</span>}
      </div>
      <div className="minimap">
        <div className="minimap-title"><Map size={12} />平面定位</div>
        <div className="minimap-room">
          {instances.map((item) => <i key={item.id} style={{ left: `${50 + item.position[0] / ROOM.width * 86}%`, top: `${50 + item.position[2] / ROOM.depth * 80}%` }} />)}
          <span />
        </div>
      </div>
      <div className="viewport-help">左键拖动 · 右键旋转 · R 旋转 · 方向键微调 · Shift 大步进 · Esc 取消 · Delete 删除</div>
      {preview && (
        <div className={`placement-readout ${preview.valid ? preview.warnings.length ? 'is-warning' : 'is-valid' : 'is-invalid'}`} role="status" aria-live="polite">
          <strong>{preview.valid ? draggingId ? '可以放置' : '可以移动' : draggingId ? '无法放置' : '无法移动'}</strong>
          <span>{preview.valid
            ? `已吸附至 X ${preview.position[0].toFixed(1)} m · Y ${preview.position[2].toFixed(1)} m${preview.warnings[0] ? ` · ${preview.warnings[0]}` : ''}`
            : preview.reasons[0]}</span>
        </div>
      )}
    </div>
  )
}
