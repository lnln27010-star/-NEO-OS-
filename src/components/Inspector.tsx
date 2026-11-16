import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  Cable,
  CheckCircle2,
  CircleGauge,
  Copy,
  Database,
  Droplets,
  Gauge,
  MoreHorizontal,
  Network,
  Power,
  RotateCw,
  Server,
  Trash2,
  Weight,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { assetById } from '../assets'
import { ROOM } from '../domain'
import type { Domain } from '../domain'
import { useDesignerStore } from '../useDesignerStore'

const domainMeta: Record<Domain, { label: string; icon: typeof Power }> = {
  power: { label: '电力', icon: Power },
  cooling: { label: '冷却', icon: Droplets },
  network: { label: '网络', icon: Network },
}

export function Inspector() {
  const selectedId = useDesignerStore((state) => state.selectedId)
  const instances = useDesignerStore((state) => state.instances)
  const instance = useDesignerStore((state) => state.instances.find((item) => item.id === selectedId))
  const select = useDesignerStore((state) => state.select)
  const allIssues = useDesignerStore((state) => state.issues)
  const issues = useMemo(() => allIssues.filter((issue) => issue.targetId === selectedId), [allIssues, selectedId])
  const activeTab = useDesignerStore((state) => state.activeInspectorTab)
  const validationDirty = useDesignerStore((state) => state.validationDirty)
  const setActiveTab = useDesignerStore((state) => state.setActiveInspectorTab)
  const updateSelected = useDesignerStore((state) => state.updateSelected)
  const rotate = useDesignerStore((state) => state.rotateSelected)
  const duplicate = useDesignerStore((state) => state.duplicateSelected)
  const remove = useDesignerStore((state) => state.removeSelected)
  const nudgeSelected = useDesignerStore((state) => state.nudgeSelected)

  const [draftName, setDraftName] = useState('')
  const [draftLoad, setDraftLoad] = useState(0)

  useEffect(() => {
    if (!instance) return
    setDraftName(instance.name)
    setDraftLoad(instance.loadPercent)
  }, [instance?.id, instance?.name, instance?.loadPercent])

  const objectPicker = (
    <label className="inspector-object-picker">
      <span>场景对象</span>
      <select name="scene-object-picker" value={selectedId ?? ''} onChange={(event) => select(event.target.value || null)}>
        <option value="">请选择设备</option>
        {instances.map((item) => (
          <option key={item.id} value={item.id}>{item.name} · {assetById[item.definitionId]?.name ?? item.definitionId}</option>
        ))}
      </select>
    </label>
  )

  if (!instance) {
    return (
      <aside className="inspector panel-surface inspector-empty">
        <div className="empty-orbit"><Box size={30} /></div>
        <strong>尚未选择对象</strong>
        <span>在三维场景中选择设备，或从左侧资产库拖入一个新模块。</span>
        {objectPicker}
      </aside>
    )
  }

  const definition = assetById[instance.definitionId]
  const power = definition.ratedPowerKw ?? 0
  const currentPower = power * draftLoad / 100
  const statusLabel = instance.status === 'normal' ? '正常' : instance.status === 'warning' ? '需关注' : '离线'
  const powerLabel = definition.category === 'compute' || definition.category === 'network' ? '当前 IT 功率' : '当前设备功率'

  return (
    <aside className="inspector panel-surface">
      <div className="inspector-object-head">
        <div className="object-avatar" style={{ '--asset-accent': definition.visual.accent } as React.CSSProperties}>
          <Server size={22} />
        </div>
        <div className="object-identification">
          <strong>{definition.name} {definition.model}</strong>
          <span>{instance.name}</span>
          <div className="object-status"><i />已布置 · 参数有覆盖</div>
        </div>
        <button className="icon-button" type="button" title="更多对象操作将在后续版本开放" aria-label="更多对象操作将在后续版本开放" disabled><MoreHorizontal size={17} /></button>
      </div>
      {objectPicker}
      <div className="inspector-tabs">
        <button type="button" aria-pressed={activeTab === 'properties'} className={activeTab === 'properties' ? 'is-active' : ''} onClick={() => setActiveTab('properties')}>属性</button>
        <button type="button" aria-pressed={activeTab === 'ports'} className={activeTab === 'ports' ? 'is-active' : ''} onClick={() => setActiveTab('ports')}>端口 <span>{definition.ports.length}</span></button>
        <button type="button" aria-pressed={activeTab === 'checks'} className={activeTab === 'checks' ? 'is-active' : ''} onClick={() => setActiveTab('checks')}>校核 <span className={issues.length ? 'has-issues' : ''}>{issues.length}</span></button>
      </div>

      <div className="inspector-scroll">
        {activeTab === 'properties' && (
          <>
            <section className="property-section">
              <div className="section-title">基本信息</div>
              <label className="field-row editable">
                <span>对象编号</span>
                <input
                  id="selected-object-name"
                  name="selected-object-name"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={() => draftName !== instance.name && updateSelected({ name: draftName })}
                  onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                />
              </label>
              <div className="field-row"><span>资产版本</span><strong>{definition.model} v3.2</strong></div>
              <div className="field-row"><span>状态</span><strong className={instance.status === 'normal' ? 'value-success' : ''}>{statusLabel}</strong></div>
            </section>
            <section className="property-section">
              <div className="section-title">几何与安装</div>
              <div className="coordinate-grid">
                <div><span>X</span><strong>{instance.position[0].toFixed(2)} m</strong></div>
                <div><span>Y</span><strong>{instance.position[2].toFixed(2)} m</strong></div>
                <div><span>旋转</span><strong>{Math.round(instance.rotationY * 180 / Math.PI)}°</strong></div>
              </div>
              <div className="nudge-row">
                <span>位置微调 · {Math.round(ROOM.grid * 1000)} mm</span>
                <div className="nudge-controls" role="group" aria-label="微调所选设备位置">
                  <button className="nudge-up" type="button" aria-label={`Y 减少 ${Math.round(ROOM.grid * 1000)} 毫米`} title="向北微调" onClick={() => nudgeSelected(0, -ROOM.grid)}><ArrowUp size={13} /></button>
                  <button className="nudge-left" type="button" aria-label={`X 减少 ${Math.round(ROOM.grid * 1000)} 毫米`} title="向左微调" onClick={() => nudgeSelected(-ROOM.grid, 0)}><ArrowLeft size={13} /></button>
                  <button className="nudge-down" type="button" aria-label={`Y 增加 ${Math.round(ROOM.grid * 1000)} 毫米`} title="向南微调" onClick={() => nudgeSelected(0, ROOM.grid)}><ArrowDown size={13} /></button>
                  <button className="nudge-right" type="button" aria-label={`X 增加 ${Math.round(ROOM.grid * 1000)} 毫米`} title="向右微调" onClick={() => nudgeSelected(ROOM.grid, 0)}><ArrowRight size={13} /></button>
                </div>
              </div>
              <div className="field-row"><span>尺寸</span><strong>{definition.dimensions.width * 1000} × {definition.dimensions.depth * 1000} × {definition.dimensions.height * 1000} mm</strong></div>
              <div className="field-row"><span><Weight size={13} />总重量</span><strong>{definition.weightKg.toLocaleString()} kg</strong></div>
              {definition.rackUnits && <div className="field-row"><span>机柜高度</span><strong>{definition.rackUnits} U</strong></div>}
            </section>
            <section className="property-section">
              <div className="section-title">运行参数</div>
              <div className="load-summary">
                <div><CircleGauge size={17} /><span>当前负载</span><strong>{draftLoad}%</strong></div>
                <div className="load-track"><i style={{ width: `${draftLoad}%` }} /></div>
              </div>
              <input
                className="range-input"
                id="selected-object-load"
                name="selected-object-load"
                type="range"
                aria-label="当前负载百分比"
                min="0"
                max="100"
                value={draftLoad}
                onChange={(event) => setDraftLoad(Number(event.target.value))}
                onPointerUp={() => draftLoad !== instance.loadPercent && updateSelected({ loadPercent: draftLoad })}
                onKeyUp={() => draftLoad !== instance.loadPercent && updateSelected({ loadPercent: draftLoad })}
              />
              {!!power && <div className="field-row"><span><Power size={13} />{powerLabel}</span><strong>{currentPower.toFixed(1)} kW</strong></div>}
              {!!power && <div className="field-row"><span>额定功率</span><strong>{power} kW</strong></div>}
              {!!definition.coolingKw && <div className="field-row"><span><Droplets size={13} />设计冷量</span><strong>{definition.coolingKw} kW</strong></div>}
              {!!definition.flowLpm && <div className="field-row"><span>设计流量</span><strong>{definition.flowLpm.toLocaleString()} L/min</strong></div>}
              {!!definition.gpuCount && <div className="field-row"><span><Gauge size={13} />GPU 数量</span><strong>{definition.gpuCount}</strong></div>}
            </section>
            <section className="property-section">
              <div className="section-title">数据来源</div>
              <div className="source-card">
                <Database size={16} />
                <div><strong>原型示例参数</strong><span>待替换为厂商规格书</span></div>
                <AlertTriangle size={15} />
              </div>
            </section>
          </>
        )}

        {activeTab === 'ports' && (
          <section className="port-list">
            <div className="section-intro">端口由资产定义生成。当前原型尚未保存连接拓扑，因此这里只展示端口类型和额定能力，不推断连接状态。</div>
            {definition.ports.map((port) => {
              const meta = domainMeta[port.domain]
              const Icon = meta.icon
              return (
                <div className={`port-card domain-${port.domain}`} key={port.id}>
                  <div className="port-domain-icon"><Icon size={16} /></div>
                  <div className="port-info"><strong>{port.name}</strong><span>{meta.label} · {port.capacity}</span></div>
                  <div className="port-state">
                    <Cable size={14} />
                    连接未建模
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {activeTab === 'checks' && (
          <section className="checks-list">
            {validationDirty && <div className="checks-stale"><AlertTriangle size={14} /><span>设计已变更，以下为上一次校核结果。请重新运行校核。</span></div>}
            {issues.length ? issues.map((issue) => (
              <div className={`check-card severity-${issue.severity}`} key={issue.id}>
                <div className="check-icon"><AlertTriangle size={16} /></div>
                <div>
                  <strong>{issue.title}</strong>
                  <span>{issue.ruleId}</span>
                  <p>当前值 {issue.current}，要求 {issue.limit}</p>
                  <em>{issue.suggestion}</em>
                </div>
              </div>
            )) : (
              <div className="checks-empty">{validationDirty ? <AlertTriangle size={28} /> : <CheckCircle2 size={28} />}<strong>{validationDirty ? '校核结果已过期' : '当前对象未发现问题'}</strong><span>{validationDirty ? '重新运行校核后更新结果' : '仅覆盖当前已实现的空间、负载和容量规则'}</span></div>
            )}
          </section>
        )}
      </div>

      <div className="inspector-actions">
        <button type="button" onClick={rotate}><RotateCw size={15} />旋转</button>
        <button type="button" onClick={duplicate}><Copy size={15} />复制</button>
        <button className="danger" type="button" onClick={remove}><Trash2 size={15} />删除</button>
      </div>
    </aside>
  )
}
