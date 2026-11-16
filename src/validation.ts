import { assetById } from './assets'
import type { AssetDefinition, AssetInstance, DesignIssue, Severity } from './domain'
import { ROOM } from './domain'
import { validatePlacement } from './scene/sceneMath'

const LOAD_WARNING_PERCENT = 80
const LOAD_ERROR_PERCENT = 90
const LOAD_BLOCKER_PERCENT = 100
const CAPACITY_WARNING_RATIO = 0.8
const CAPACITY_ERROR_RATIO = 0.9

const formatPower = (powerKw: number) => (
  powerKw >= 1000
    ? `${(powerKw / 1000).toFixed(2)} MW`
    : `${Math.round(powerKw)} kW`
)

const formatPosition = (instance: AssetInstance) => (
  `X ${instance.position[0].toFixed(1)} m · Z ${instance.position[2].toFixed(1)} m`
)

const getLoadPercent = (instance: AssetInstance) => (
  Number.isFinite(instance.loadPercent) ? Math.max(0, instance.loadPercent) : 0
)

const getLiveLoadRatio = (instance: AssetInstance) => (
  instance.status === 'offline' ? 0 : getLoadPercent(instance) / 100
)

const getLoadSeverity = (loadPercent: number): Severity | null => {
  if (loadPercent > LOAD_BLOCKER_PERCENT) return 'blocker'
  if (loadPercent > LOAD_ERROR_PERCENT) return 'error'
  if (loadPercent > LOAD_WARNING_PERCENT) return 'warning'
  return null
}

const getCapacitySeverity = (demand: number, capacity: number): Severity | null => {
  if (demand <= 0) return null
  if (capacity <= 0 || demand > capacity) return 'blocker'
  const ratio = demand / capacity
  if (ratio > CAPACITY_ERROR_RATIO) return 'error'
  if (ratio > CAPACITY_WARNING_RATIO) return 'warning'
  return null
}

const derivePlacementIssue = (
  instance: AssetInstance,
  definition: AssetDefinition,
  reason: string,
  index: number,
): DesignIssue => {
  if (reason.includes('超出机房')) {
    return {
      id: `space:${instance.id}:boundary:${index}`,
      severity: 'blocker',
      targetId: instance.id,
      targetName: instance.name,
      title: '设备超出机房可布置边界',
      current: formatPosition(instance),
      limit: `${ROOM.width} m × ${ROOM.depth} m 净边界`,
      ruleId: 'SPACE-BND-001',
      suggestion: '将设备移回机房边界内，并重新检查前后维护区。',
    }
  }

  if (reason.startsWith('前维护区不足') || reason.startsWith('后维护区不足')) {
    const isFront = reason.startsWith('前')
    const requiredMm = Math.round((isFront ? definition.clearance.front : definition.clearance.rear) * 1000)
    return {
      id: `space:${instance.id}:maintenance-${isFront ? 'front' : 'rear'}:${index}`,
      severity: 'error',
      targetId: instance.id,
      targetName: instance.name,
      title: `${isFront ? '前' : '后'}维护距离不足`,
      current: '维护区超出机房可用范围',
      limit: `≥ ${requiredMm} mm`,
      ruleId: `SPACE-MNT-${isFront ? '001' : '002'}`,
      suggestion: '调整设备位置或朝向，确保维护区完整保留在机房内。',
    }
  }

  if (reason.includes('运输通道')) {
    return {
      id: `space:${instance.id}:transport:${index}`,
      severity: 'blocker',
      targetId: instance.id,
      targetName: instance.name,
      title: '设备占用运输通道',
      current: '南侧设备运输开口被占用',
      limit: '运输通道必须保持畅通',
      ruleId: 'SPACE-ACC-001',
      suggestion: '将设备移离南侧运输开口范围。',
    }
  }

  if (reason.includes('结构柱')) {
    return {
      id: `space:${instance.id}:column:${index}`,
      severity: 'blocker',
      targetId: instance.id,
      targetName: instance.name,
      title: '设备与结构柱碰撞',
      current: formatPosition(instance),
      limit: '设备本体不得与结构柱重叠',
      ruleId: 'SPACE-COL-001',
      suggestion: '将设备移至相邻可用网格，避开结构柱。',
    }
  }

  if (reason.includes('发生碰撞')) {
    return {
      id: `space:${instance.id}:collision:${index}`,
      severity: 'blocker',
      targetId: instance.id,
      targetName: instance.name,
      title: '设备本体发生碰撞',
      current: reason,
      limit: '设备本体不得重叠',
      ruleId: 'SPACE-COL-002',
      suggestion: '移动其中一台设备，直到本体不再重叠。',
    }
  }

  return {
    id: `space:${instance.id}:placement:${index}`,
    severity: 'error',
    targetId: instance.id,
    targetName: instance.name,
    title: reason,
    current: formatPosition(instance),
    limit: '满足当前空间布置规则',
    ruleId: 'SPACE-PLC-001',
    suggestion: '调整设备位置或朝向后重新校核。',
  }
}

const deriveMaintenanceWarning = (
  instance: AssetInstance,
  warning: string,
  index: number,
): DesignIssue => ({
  id: `space:${instance.id}:maintenance-warning:${index}`,
  severity: 'warning',
  targetId: instance.id,
  targetName: instance.name,
  title: '维护区与相邻设备重叠',
  current: warning,
  limit: '前后维护区不被设备本体占用',
  ruleId: 'SPACE-MNT-003',
  suggestion: '增大设备间距或调整朝向，保留维护操作空间。',
})

const deriveLoadIssue = (
  instance: AssetInstance,
  definition: AssetDefinition,
): DesignIssue | null => {
  if (instance.status === 'offline') return null
  const loadPercent = getLoadPercent(instance)
  const severity = getLoadSeverity(loadPercent)
  if (!severity) return null
  const livePower = (definition.ratedPowerKw ?? 0) * loadPercent / 100
  return {
    id: `load:${instance.id}`,
    severity,
    targetId: instance.id,
    targetName: instance.name,
    title: severity === 'blocker' ? '设备负载超过额定值' : '设备负载率偏高',
    current: definition.ratedPowerKw
      ? `${loadPercent.toFixed(0)}% · ${formatPower(livePower)}`
      : `${loadPercent.toFixed(0)}%`,
    limit: `≤ ${LOAD_WARNING_PERCENT}%`,
    ruleId: 'OPS-LOAD-001',
    suggestion: '降低该设备负载，或将部分工作负载迁移到其他设备。',
  }
}

const getCapacityTarget = (
  preferred: AssetInstance[],
  fallback: AssetInstance[],
) => preferred[0] ?? fallback[0] ?? null

export const deriveDesignIssues = (instances: AssetInstance[]): DesignIssue[] => {
  const issues: DesignIssue[] = []
  const maintenancePairs = new Set<string>()
  const itInstances: AssetInstance[] = []
  const upsInstances: AssetInstance[] = []
  const coolingInstances: AssetInstance[] = []
  let itLoadKw = 0
  let coolingDemandKw = 0
  let upsCapacityKw = 0
  let coolingCapacityKw = 0

  for (const instance of instances) {
    const definition = assetById[instance.definitionId]
    if (!definition) continue

    const placement = validatePlacement(
      definition,
      instance.position,
      instance.rotationY,
      instances,
      instance.id,
    )
    placement.reasons.forEach((reason, index) => {
      issues.push(derivePlacementIssue(instance, definition, reason, index))
    })
    placement.warnings.forEach((warning, index) => {
      const otherName = warning.match(/^维护区与 (.+) 接近$/)?.[1]
      const pairKey = otherName ? [instance.name, otherName].sort().join('::') : `${instance.id}:${warning}`
      if (maintenancePairs.has(pairKey)) return
      maintenancePairs.add(pairKey)
      issues.push(deriveMaintenanceWarning(instance, warning, index))
    })

    const loadIssue = deriveLoadIssue(instance, definition)
    if (loadIssue) issues.push(loadIssue)

    const liveLoadRatio = getLiveLoadRatio(instance)
    const isIt = definition.category === 'compute' || definition.category === 'network'
    if (isIt) {
      itInstances.push(instance)
      itLoadKw += (definition.ratedPowerKw ?? 0) * liveLoadRatio
      coolingDemandKw += (definition.coolingKw ?? definition.ratedPowerKw ?? 0) * liveLoadRatio
    }
    if (definition.kind === 'ups') {
      upsInstances.push(instance)
      upsCapacityKw += definition.ratedPowerKw ?? 0
    }
    if (definition.category === 'cooling') {
      coolingInstances.push(instance)
      coolingCapacityKw += definition.coolingKw ?? 0
    }
  }

  const upsSeverity = getCapacitySeverity(itLoadKw, upsCapacityKw)
  const upsTarget = getCapacityTarget(upsInstances, itInstances)
  if (upsSeverity && upsTarget) {
    const upsOverCapacity = upsCapacityKw <= 0 || itLoadKw > upsCapacityKw
    issues.push({
      id: 'capacity:ups',
      severity: upsSeverity,
      targetId: upsTarget.id,
      targetName: upsTarget.name,
      title: upsCapacityKw <= 0
        ? '未部署 UPS 容量'
        : upsOverCapacity ? 'UPS 总容量不足' : 'UPS 容量余量偏低',
      current: `${formatPower(itLoadKw)} IT 当前设计负载`,
      limit: `${formatPower(upsCapacityKw)} UPS 已安装容量`,
      ruleId: 'ELEC-CAP-001',
      suggestion: upsCapacityKw <= 0
        ? '部署可覆盖当前 IT 负载并留有余量的 UPS。'
        : '降低 IT 负载或增加 UPS 容量，并预留运行余量。',
    })
  }

  const coolingSeverity = getCapacitySeverity(coolingDemandKw, coolingCapacityKw)
  const coolingTarget = getCapacityTarget(coolingInstances, itInstances)
  if (coolingSeverity && coolingTarget) {
    const coolingOverCapacity = coolingCapacityKw <= 0 || coolingDemandKw > coolingCapacityKw
    issues.push({
      id: 'capacity:cooling',
      severity: coolingSeverity,
      targetId: coolingTarget.id,
      targetName: coolingTarget.name,
      title: coolingCapacityKw <= 0
        ? '未部署冷却容量'
        : coolingOverCapacity ? '冷却总容量不足' : '冷却容量余量偏低',
      current: `${formatPower(coolingDemandKw)} 当前设计冷却需求`,
      limit: `${formatPower(coolingCapacityKw)} 已安装冷量`,
      ruleId: 'COOL-CAP-001',
      suggestion: coolingCapacityKw <= 0
        ? '部署可覆盖当前热负荷并留有余量的冷却设备。'
        : '降低 IT 热负荷或增加可用冷量，并预留运行余量。',
    })
  }

  return issues
}
