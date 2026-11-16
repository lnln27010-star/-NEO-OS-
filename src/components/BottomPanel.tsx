import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CircleGauge, Clock3, Info, ListChecks, TerminalSquare } from 'lucide-react'
import { useMemo, useState } from 'react'
import { assetById } from '../assets'
import { ROOM } from '../domain'
import type { Severity } from '../domain'
import { getFootprint } from '../scene/sceneMath'
import { useDesignerStore } from '../useDesignerStore'

const severityMeta: Record<Severity, { label: string; icon: typeof AlertTriangle }> = {
  blocker: { label: '阻断', icon: AlertOctagon },
  error: { label: '错误', icon: AlertOctagon },
  warning: { label: '警告', icon: AlertTriangle },
  advice: { label: '建议', icon: Info },
}

const severityOrder: Record<Severity, number> = {
  blocker: 0,
  error: 1,
  warning: 2,
  advice: 3,
}

export function BottomPanel() {
  const allIssues = useDesignerStore((state) => state.issues)
  const instances = useDesignerStore((state) => state.instances)
  const bottomOpen = useDesignerStore((state) => state.bottomOpen)
  const toggleBottom = useDesignerStore((state) => state.toggleBottom)
  const activeTab = useDesignerStore((state) => state.activeBottomTab)
  const setActiveTab = useDesignerStore((state) => state.setActiveBottomTab)
  const focusIssue = useDesignerStore((state) => state.focusIssue)
  const lastValidation = useDesignerStore((state) => state.lastValidation)
  const lastSavedAt = useDesignerStore((state) => state.lastSavedAt)
  const validationDirty = useDesignerStore((state) => state.validationDirty)
  const [severity, setSeverity] = useState<'all' | Severity>('all')

  const issues = useMemo(() => {
    const liveIds = new Set(instances.map((item) => item.id))
    return allIssues.filter((issue) => liveIds.has(issue.targetId))
  }, [allIssues, instances])

  const counts = useMemo(() => ({
    blocker: issues.filter((item) => item.severity === 'blocker').length,
    error: issues.filter((item) => item.severity === 'error').length,
    warning: issues.filter((item) => item.severity === 'warning').length,
    advice: issues.filter((item) => item.severity === 'advice').length,
  }), [issues])

  const filtered = (severity === 'all' ? issues : issues.filter((item) => item.severity === severity))
    .slice()
    .sort((a, b) => (
      severityOrder[a.severity] - severityOrder[b.severity]
      || a.ruleId.localeCompare(b.ruleId)
      || a.targetName.localeCompare(b.targetName, 'zh-CN')
    ))

  const capacity = useMemo(() => {
    let itLoadKw = 0
    let itRatedKw = 0
    let coolingDemandKw = 0
    let coolingCapacityKw = 0
    let upsCapacityKw = 0
    let footprintArea = 0
    let rackCount = 0

    for (const instance of instances) {
      const definition = assetById[instance.definitionId]
      if (!definition) continue
      const loadRatio = instance.loadPercent / 100
      const isIt = definition.category === 'compute' || definition.category === 'network'
      if (isIt) {
        itLoadKw += (definition.ratedPowerKw ?? 0) * loadRatio
        itRatedKw += definition.ratedPowerKw ?? 0
        coolingDemandKw += (definition.coolingKw ?? definition.ratedPowerKw ?? 0) * loadRatio
      }
      if (definition.category === 'cooling') coolingCapacityKw += definition.coolingKw ?? 0
      if (definition.kind === 'ups') upsCapacityKw += definition.ratedPowerKw ?? 0
      if (definition.kind.endsWith('rack')) rackCount += 1
      const footprint = getFootprint(definition, instance.rotationY)
      footprintArea += footprint.width * footprint.depth
    }

    const percent = (value: number, total: number) => total > 0 ? Math.round(value / total * 100) : 0
    return {
      itLoadKw,
      itRatedKw,
      coolingDemandKw,
      coolingCapacityKw,
      upsCapacityKw,
      footprintArea,
      rackCount,
      itPercent: percent(itLoadKw, itRatedKw),
      coolingPercent: percent(coolingDemandKw, coolingCapacityKw),
      upsPercent: percent(itLoadKw, upsCapacityKw),
      footprintPercent: percent(footprintArea, ROOM.width * ROOM.depth),
    }
  }, [instances])

  return (
    <section className={`bottom-panel panel-surface ${bottomOpen ? 'is-open' : 'is-collapsed'}`}>
      <div className="bottom-panel-header">
        <div className="bottom-tabs">
          <button type="button" className={activeTab === 'issues' ? 'is-active' : ''} aria-pressed={activeTab === 'issues'} onClick={() => setActiveTab('issues')}><ListChecks size={15} />问题 <span>{issues.length}</span></button>
          <button type="button" className={activeTab === 'capacity' ? 'is-active' : ''} aria-pressed={activeTab === 'capacity'} onClick={() => setActiveTab('capacity')}><CircleGauge size={15} />容量总览</button>
          <button type="button" className={activeTab === 'history' ? 'is-active' : ''} aria-pressed={activeTab === 'history'} onClick={() => setActiveTab('history')}><TerminalSquare size={15} />会话摘要</button>
        </div>
        <div className="validation-state">
          {validationDirty ? <><AlertTriangle size={13} />结果已过期 · 当前设计有变更</> : <><CheckCircle2 size={13} />校核完成 · {lastValidation}</>}
        </div>
        <button className="collapse-button" type="button" aria-expanded={bottomOpen} aria-label={bottomOpen ? '折叠底部面板' : '展开底部面板'} onClick={toggleBottom} title={bottomOpen ? '折叠' : '展开'}>{bottomOpen ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button>
      </div>

      {bottomOpen && activeTab === 'issues' && (
        <div className="issues-content">
          <div className="severity-filter">
            <button type="button" aria-pressed={severity === 'all'} className={severity === 'all' ? 'is-active' : ''} onClick={() => setSeverity('all')}>全部 {issues.length}</button>
            <button type="button" aria-pressed={severity === 'blocker'} className={severity === 'blocker' ? 'is-active' : ''} onClick={() => setSeverity('blocker')}>阻断 {counts.blocker}</button>
            <button type="button" aria-pressed={severity === 'error'} className={severity === 'error' ? 'is-active' : ''} onClick={() => setSeverity('error')}>错误 {counts.error}</button>
            <button type="button" aria-pressed={severity === 'warning'} className={severity === 'warning' ? 'is-active' : ''} onClick={() => setSeverity('warning')}>警告 {counts.warning}</button>
            <button type="button" aria-pressed={severity === 'advice'} className={severity === 'advice' ? 'is-active' : ''} onClick={() => setSeverity('advice')}>建议 {counts.advice}</button>
          </div>
          <div className="issue-table-wrap">
            <table className="issue-table">
              <thead><tr><th>级别</th><th>对象</th><th>问题</th><th>当前值</th><th>阈值</th><th>规则</th></tr></thead>
              <tbody>
                {filtered.map((issue) => {
                  const meta = severityMeta[issue.severity]
                  const Icon = meta.icon
                  return (
                    <tr
                      key={issue.id}
                      tabIndex={0}
                      aria-label={`定位 ${issue.targetName}：${issue.title}`}
                      onClick={() => focusIssue(issue)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          focusIssue(issue)
                        }
                      }}
                    >
                      <td><span className={`severity-pill severity-${issue.severity}`}><Icon size={12} />{meta.label}</span></td>
                      <td className="object-cell">{issue.targetName}</td>
                      <td>{issue.title}</td>
                      <td>{issue.current}</td>
                      <td>{issue.limit}</td>
                      <td><code>{issue.ruleId}</code></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bottomOpen && activeTab === 'capacity' && (
        <div className="capacity-content">
          <CapacityMetric label="当前 IT 负载" value={`${(capacity.itLoadKw / 1000).toFixed(2)} MW`} note={`设备额定 ${(capacity.itRatedKw / 1000).toFixed(2)} MW · ${capacity.itPercent}%`} progress={capacity.itPercent} color="green" />
          <CapacityMetric label="冷却负荷" value={`${(capacity.coolingDemandKw / 1000).toFixed(2)} MW`} note={`已部署冷量 ${(capacity.coolingCapacityKw / 1000).toFixed(2)} MW · ${capacity.coolingPercent}%`} progress={capacity.coolingPercent} color="cyan" />
          <CapacityMetric label="UPS 负载率" value={`${capacity.upsPercent}%`} note={`IT ${capacity.itLoadKw.toFixed(0)} kW / UPS ${capacity.upsCapacityKw.toFixed(0)} kW`} progress={capacity.upsPercent} color={capacity.upsPercent > 100 ? 'red' : 'orange'} />
          <CapacityMetric label="设备本体占地" value={`${capacity.footprintArea.toFixed(1)} m²`} note={`${capacity.rackCount} 个机柜 · 机房 ${ROOM.width * ROOM.depth} m²`} progress={capacity.footprintPercent} color="purple" />
        </div>
      )}

      {bottomOpen && activeTab === 'history' && (
        <div className="history-content">
          <HistoryItem time={lastValidation} text={`最近一次校核 · 当前关联 ${issues.length} 个问题`} />
          <HistoryItem time={lastSavedAt} text={lastSavedAt === '尚未保存' ? '当前方案尚未保存到本机' : '最近一次本地保存'} />
          <HistoryItem time="当前" text={`场景包含 ${instances.length} 个设备，${capacity.rackCount} 个机柜`} />
          <HistoryItem time="说明" text="完整操作审计将在接入版本服务后开放" />
        </div>
      )}
    </section>
  )
}

function CapacityMetric({ label, value, note, progress, color }: { label: string; value: string; note: string; progress: number; color: string }) {
  return (
    <div className="capacity-metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className={`metric-progress metric-${color}`} role="progressbar" aria-label={label} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={Math.max(100, progress)}><i style={{ width: `${Math.min(100, progress)}%` }} /></div>
      <div className="metric-note">{note}</div>
    </div>
  )
}

function HistoryItem({ time, text }: { time: string; text: string }) {
  return <div className="history-item"><Clock3 size={14} /><time>{time}</time><span>{text}</span></div>
}
