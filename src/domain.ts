export type AssetCategory = 'compute' | 'power' | 'cooling' | 'network' | 'space'

export type AssetKind =
  | 'gpu-rack'
  | 'server-rack'
  | 'network-rack'
  | 'ups'
  | 'pdu'
  | 'rpp'
  | 'cdu'
  | 'crah'

export type Domain = 'power' | 'cooling' | 'network'
export type OverlayMode = 'none' | 'power' | 'cooling' | 'heat'
export type WorkspaceMode = 'layout' | 'connect' | 'analyse'
export type CameraPreset = 'iso' | 'top' | 'aisle' | 'front'
export type Severity = 'blocker' | 'error' | 'warning' | 'advice'
export type SceneScope = 'china' | 'province' | 'campus' | 'room' | 'layout'

export type Vec3 = [number, number, number]

export type AssetPort = {
  id: string
  name: string
  domain: Domain
  direction: 'in' | 'out' | 'bidirectional'
  capacity: string
}

export type AssetDefinition = {
  id: string
  kind: AssetKind
  category: AssetCategory
  name: string
  model: string
  summary: string
  dimensions: {
    width: number
    height: number
    depth: number
  }
  weightKg: number
  rackUnits?: number
  ratedPowerKw?: number
  coolingKw?: number
  gpuCount?: number
  flowLpm?: number
  clearance: {
    front: number
    rear: number
    side: number
  }
  visual: {
    body: string
    accent: string
    emissive: string
  }
  ports: AssetPort[]
  published: boolean
}

export type AssetInstance = {
  id: string
  definitionId: string
  name: string
  position: Vec3
  rotationY: number
  loadPercent: number
  status: 'normal' | 'warning' | 'offline'
  locked?: boolean
}

export type PlacementPreview = {
  definitionId: string
  position: Vec3
  rotationY: number
  valid: boolean
  reasons: string[]
  warnings: string[]
}

export type DesignIssue = {
  id: string
  severity: Severity
  targetId: string
  targetName: string
  title: string
  current: string
  limit: string
  ruleId: string
  suggestion: string
}

export const ROOM = {
  width: 28,
  depth: 18,
  height: 4.8,
  grid: 0.1,
  tile: 0.6,
  columns: [
    [-8.4, -6],
    [8.4, -6],
    [-8.4, 6],
    [8.4, 6],
  ] as Array<[number, number]>,
}
