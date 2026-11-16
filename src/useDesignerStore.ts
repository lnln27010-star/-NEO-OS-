import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { assetById, initialInstances } from './assets'
import { makeSnappedPosition, validatePlacement } from './scene/sceneMath'
import type {
  AssetInstance,
  CameraPreset,
  DesignIssue,
  OverlayMode,
  PlacementPreview,
  SceneScope,
  Vec3,
  WorkspaceMode,
} from './domain'
import { ROOM } from './domain'
import { deriveDesignIssues } from './validation'

type ToastState = { id: number; message: string; tone: 'success' | 'info' | 'warning' }

type DesignerState = {
  sceneScope: SceneScope
  campusPresentation: 'map' | 'model'
  setCampusPresentation: (view: 'map' | 'model') => void
  twinMode: 'browse' | 'operate'
  setTwinMode: (mode: 'browse' | 'operate') => void
  selectedProvinceAdcode: number
  selectedCityAdcode: number
  selectedFacilityId: string
  siteAssetUrl: string | null
  siteAssetName: string | null
  siteAssetType: 'glb' | 'gltf' | 'ifc' | 'pointcloud' | 'metadata' | null
  instances: AssetInstance[]
  past: AssetInstance[][]
  future: AssetInstance[][]
  selectedId: string | null
  draggingDefinitionId: string | null
  placementPreview: PlacementPreview | null
  workspaceMode: WorkspaceMode
  overlayMode: OverlayMode
  cameraPreset: CameraPreset
  viewMode: '3d' | '2d'
  showWalls: boolean
  showPipes: boolean
  bottomOpen: boolean
  activeBottomTab: 'issues' | 'capacity' | 'history'
  activeInspectorTab: 'properties' | 'ports' | 'checks'
  isManipulating: boolean
  isValidating: boolean
  lastValidation: string
  lastSavedAt: string
  designDirty: boolean
  validationDirty: boolean
  issues: DesignIssue[]
  focusSequence: number
  toast: ToastState | null
  setSceneScope: (scope: SceneScope) => void
  setSelectedProvinceAdcode: (adcode: number) => void
  setSelectedCityAdcode: (adcode: number) => void
  setSelectedFacilityId: (id: string) => void
  setSiteAsset: (asset: { url: string; name: string; type: DesignerState['siteAssetType'] }) => void
  select: (id: string | null) => void
  setDraggingDefinition: (id: string | null) => void
  setPlacementPreview: (preview: PlacementPreview | null) => void
  addAsset: (definitionId: string, position: Vec3, rotationY?: number) => string
  addAssetAutomatically: (definitionId: string) => void
  removeSelected: () => void
  duplicateSelected: () => void
  rotateSelected: () => void
  rotatePlacementPreview: () => void
  cancelPlacement: () => void
  moveAsset: (id: string, position: Vec3) => void
  nudgeSelected: (dx: number, dz: number) => void
  updateSelected: (patch: Partial<AssetInstance>) => void
  undo: () => void
  redo: () => void
  setWorkspaceMode: (mode: WorkspaceMode) => void
  setOverlayMode: (mode: OverlayMode) => void
  setCameraPreset: (preset: CameraPreset) => void
  setViewMode: (mode: '3d' | '2d') => void
  toggleWalls: () => void
  togglePipes: () => void
  toggleBottom: () => void
  setActiveBottomTab: (tab: DesignerState['activeBottomTab']) => void
  setActiveInspectorTab: (tab: DesignerState['activeInspectorTab']) => void
  setManipulating: (value: boolean) => void
  runValidation: () => void
  focusIssue: (issue: DesignIssue) => void
  saveDesign: () => void
  clearToast: () => void
}

const STORAGE_KEY = 'compute-power-twin-scene-v1'

const loadSavedScene = (): { instances: AssetInstance[]; savedAt: string } => {
  if (typeof window === 'undefined') return { instances: initialInstances, savedAt: '尚未保存' }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { instances: initialInstances, savedAt: '尚未保存' }
    const parsed = JSON.parse(raw) as { instances?: AssetInstance[]; savedAt?: string }
    if (!Array.isArray(parsed.instances)) {
      return { instances: initialInstances, savedAt: '尚未保存' }
    }
    const validInstances = parsed.instances.filter((item) => (
      item
      && typeof item.id === 'string'
      && Boolean(assetById[item.definitionId])
      && Array.isArray(item.position)
      && item.position.length === 3
    ))
    return {
      instances: validInstances,
      savedAt: typeof parsed.savedAt === 'string' && parsed.savedAt
        ? parsed.savedAt
        : '已恢复本地方案',
    }
  } catch {
    return { instances: initialInstances, savedAt: '尚未保存' }
  }
}

const persistScene = (instances: AssetInstance[]) => {
  if (typeof window === 'undefined') return ''
  const savedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, savedAt, instances }))
  return savedAt
}

const findAutomaticPlacement = (definitionId: string, instances: AssetInstance[]) => {
  const definition = assetById[definitionId]
  if (!definition) return null
  const step = ROOM.tile
  for (let ring = 0; ring <= 18; ring += 1) {
    const candidates: Vec3[] = ring === 0
      ? [[0, 0, 0]]
      : [
          [ring * step, 0, 0], [-ring * step, 0, 0], [0, 0, ring * step], [0, 0, -ring * step],
          [ring * step, 0, ring * step], [ring * step, 0, -ring * step],
          [-ring * step, 0, ring * step], [-ring * step, 0, -ring * step],
        ]
    for (const candidate of candidates) {
      const snapped = makeSnappedPosition(candidate[0], candidate[2])
      if (validatePlacement(definition, snapped, 0, instances).valid) return snapped
    }
  }
  return null
}

const withHistory = (state: DesignerState, next: AssetInstance[]) => ({
  past: [...state.past.slice(-24), state.instances],
  future: [],
  instances: next,
  designDirty: true,
  validationDirty: true,
})

const keepSelectedId = (instances: AssetInstance[], selectedId: string | null) => (
  selectedId && instances.some((item) => item.id === selectedId) ? selectedId : null
)

const getInitialSelectedId = (instances: AssetInstance[]) => (
  instances.some((item) => item.id === 'rack-a-4')
    ? 'rack-a-4'
    : instances[0]?.id ?? null
)

let toastCounter = 0
let autosaveTimer: number | undefined
const savedScene = loadSavedScene()
const initialValidationAt = new Date().toLocaleTimeString('zh-CN', { hour12: false })

export const useDesignerStore = create<DesignerState>((set, get) => ({
  // The global energy scene is the portfolio entry point. Explicit scene links remain intact.
  sceneScope: new URLSearchParams(window.location.search).get('scene') === 'room' ? 'room' : new URLSearchParams(window.location.search).get('scene') === 'campus' ? 'campus' : 'china',
  campusPresentation: 'map',
  setCampusPresentation: (view) => set({campusPresentation:view}),
  twinMode: 'browse',
  setTwinMode: (mode) => set((state) => ({ twinMode: mode, sceneScope: mode === 'operate' ? 'room' : state.sceneScope })),
  selectedProvinceAdcode: 320000,
  selectedCityAdcode: 320100,
  selectedFacilityId: 'hall-a2',
  siteAssetUrl: null,
  siteAssetName: null,
  siteAssetType: null,
  instances: savedScene.instances,
  past: [],
  future: [],
  selectedId: getInitialSelectedId(savedScene.instances),
  draggingDefinitionId: null,
  placementPreview: null,
  workspaceMode: 'layout',
  overlayMode: 'none',
  cameraPreset: 'iso',
  viewMode: '3d',
  showWalls: false,
  showPipes: true,
  // DSX keeps the 3D view dominant; evidence panels open on demand.
  bottomOpen: false,
  activeBottomTab: 'issues',
  activeInspectorTab: 'properties',
  isManipulating: false,
  isValidating: false,
  lastValidation: initialValidationAt,
  lastSavedAt: savedScene.savedAt,
  designDirty: false,
  validationDirty: false,
  issues: deriveDesignIssues(savedScene.instances),
  focusSequence: 0,
  toast: null,
  setSceneScope: (scope) => set({
    sceneScope: scope,
    twinMode: 'browse',
    draggingDefinitionId: null,
    placementPreview: null,
    isManipulating: false,
  }),
  setSelectedProvinceAdcode: (adcode) => set({ selectedProvinceAdcode: adcode }),
  setSelectedCityAdcode: (adcode) => set({ selectedCityAdcode: adcode }),
  setSelectedFacilityId: (id) => set({ selectedFacilityId: id }),
  setSiteAsset: (asset) => set({ siteAssetUrl: asset.url, siteAssetName: asset.name, siteAssetType: asset.type }),
  select: (id) => set({ selectedId: id }),
  setDraggingDefinition: (id) => set({ draggingDefinitionId: id }),
  setPlacementPreview: (preview) => set({ placementPreview: preview }),
  addAsset: (definitionId, position, rotationY = 0) => {
    const definition = assetById[definitionId]
    const id = nanoid(8)
    const sequence = get().instances.filter((item) => item.definitionId === definitionId).length + 1
    const name = `${definition.model}-${String(sequence).padStart(2, '0')}`
    const instance: AssetInstance = {
      id,
      definitionId,
      name,
      position,
      rotationY,
      loadPercent: 70,
      status: 'normal',
    }
    set((state) => ({
      ...withHistory(state, [...state.instances, instance]),
      selectedId: id,
      placementPreview: null,
      draggingDefinitionId: null,
      toast: { id: ++toastCounter, message: `已添加 ${definition.name} ${name}`, tone: 'success' },
    }))
    return id
  },
  addAssetAutomatically: (definitionId) => {
    const definition = assetById[definitionId]
    const position = findAutomaticPlacement(definitionId, get().instances)
    if (!definition || !position) {
      set({ toast: { id: ++toastCounter, message: '当前机房没有可用落位，请先腾出空间', tone: 'warning' } })
      return
    }
    get().addAsset(definitionId, position, 0)
    set({ toast: { id: ++toastCounter, message: `已将 ${definition.name} 放入最近可用网格`, tone: 'success' } })
  },
  removeSelected: () => {
    set((state) => {
      const id = state.selectedId
      if (!id) return state
      if (!state.instances.some((item) => item.id === id)) {
        return { selectedId: null }
      }
      return {
        ...withHistory(state, state.instances.filter((item) => item.id !== id)),
        selectedId: null,
        toast: { id: ++toastCounter, message: '已从当前方案移除设备', tone: 'info' },
      }
    })
  },
  duplicateSelected: () => {
    const selected = get().instances.find((item) => item.id === get().selectedId)
    if (!selected) return
    const definition = assetById[selected.definitionId]
    let position: Vec3 | null = null
    for (let radius = 1; radius <= 6 && !position; radius += 1) {
      const offsets = [
        [radius, 0], [-radius, 0], [0, radius], [0, -radius],
        [radius, radius], [radius, -radius], [-radius, radius], [-radius, -radius],
      ]
      for (const [dx, dz] of offsets) {
        const candidate = makeSnappedPosition(selected.position[0] + dx * ROOM.tile, selected.position[2] + dz * ROOM.tile)
        if (validatePlacement(definition, candidate, selected.rotationY, get().instances).valid) {
          position = candidate
          break
        }
      }
    }
    if (!position) {
      set({ toast: { id: ++toastCounter, message: '附近没有可用位置，未能复制设备', tone: 'warning' } })
      return
    }
    const copy = {
      ...selected,
      id: nanoid(8),
      name: `${selected.name}-副本`,
      position,
    }
    set((state) => ({
      ...withHistory(state, [...state.instances, copy]),
      selectedId: copy.id,
      toast: { id: ++toastCounter, message: '已复制所选设备', tone: 'success' },
    }))
  },
  rotateSelected: () => {
    const id = get().selectedId
    if (!id) return
    const state = get()
    const current = state.instances.find((item) => item.id === id)
    if (!current) return
    if (current.locked) {
      set({ toast: { id: ++toastCounter, message: '设备已锁定，无法旋转', tone: 'warning' } })
      return
    }
    const definition = assetById[current.definitionId]
    const rotationY = (current.rotationY + Math.PI / 2) % (Math.PI * 2)
    const preview = validatePlacement(definition, current.position, rotationY, state.instances, current.id)
    if (!preview.valid) {
      set({ toast: { id: ++toastCounter, message: `无法旋转，${preview.reasons[0]}`, tone: 'warning' } })
      return
    }
    set((latest) => ({
      ...withHistory(
        latest,
        latest.instances.map((item) => item.id === id ? { ...item, rotationY } : item),
      ),
      toast: { id: ++toastCounter, message: '设备已旋转 90°并重新校核', tone: 'info' },
    }))
  },
  rotatePlacementPreview: () => {
    const state = get()
    const preview = state.placementPreview
    if (!preview) return
    const definition = assetById[preview.definitionId]
    if (!definition) return
    const next = validatePlacement(
      definition,
      preview.position,
      preview.rotationY + Math.PI / 2,
      state.instances,
    )
    set({ placementPreview: next })
  },
  cancelPlacement: () => set({ placementPreview: null, draggingDefinitionId: null }),
  moveAsset: (id, position) => set((state) => {
    const current = state.instances.find((item) => item.id === id)
    if (!current || current.position.every((value, index) => Math.abs(value - position[index]) < 0.0001)) return state
    return withHistory(state, state.instances.map((item) => item.id === id ? { ...item, position } : item))
  }),
  nudgeSelected: (dx, dz) => {
    const state = get()
    const id = state.selectedId
    if (!id) return
    const current = state.instances.find((item) => item.id === id)
    if (!current) return
    if (current.locked) {
      set({ toast: { id: ++toastCounter, message: '设备已锁定，无法移动', tone: 'warning' } })
      return
    }
    const definition = assetById[current.definitionId]
    if (!definition) return
    const position = makeSnappedPosition(current.position[0] + dx, current.position[2] + dz)
    if (current.position.every((value, index) => Math.abs(value - position[index]) < 0.0001)) return
    const preview = validatePlacement(definition, position, current.rotationY, state.instances, current.id)
    if (!preview.valid) {
      set({ toast: { id: ++toastCounter, message: `无法移动，${preview.reasons[0]}`, tone: 'warning' } })
      return
    }
    set((latest) => ({
      ...withHistory(
        latest,
        latest.instances.map((item) => item.id === id ? { ...item, position } : item),
      ),
      toast: { id: ++toastCounter, message: `已微调 ${current.name} 的位置`, tone: 'info' },
    }))
  },
  updateSelected: (patch) => {
    const id = get().selectedId
    if (!id) return
    set((state) => ({
      ...withHistory(state, state.instances.map((item) => item.id === id ? { ...item, ...patch } : item)),
    }))
  },
  undo: () => set((state) => {
    const previous = state.past.at(-1)
    if (!previous) return state
    return {
      instances: previous,
      past: state.past.slice(0, -1),
      future: [state.instances, ...state.future].slice(0, 25),
      selectedId: keepSelectedId(previous, state.selectedId),
      designDirty: true,
      validationDirty: true,
      toast: { id: ++toastCounter, message: '已撤销上一步操作', tone: 'info' },
    }
  }),
  redo: () => set((state) => {
    const next = state.future[0]
    if (!next) return state
    return {
      instances: next,
      past: [...state.past, state.instances].slice(-25),
      future: state.future.slice(1),
      selectedId: keepSelectedId(next, state.selectedId),
      designDirty: true,
      validationDirty: true,
      toast: { id: ++toastCounter, message: '已重做操作', tone: 'info' },
    }
  }),
  setWorkspaceMode: (mode) => set({ workspaceMode: mode }),
  setOverlayMode: (mode) => set({ overlayMode: mode, workspaceMode: mode === 'none' ? get().workspaceMode : 'analyse' }),
  setCameraPreset: (preset) => set({ cameraPreset: preset, viewMode: preset === 'top' ? '2d' : '3d' }),
  setViewMode: (mode) => set({ viewMode: mode, cameraPreset: mode === '2d' ? 'top' : 'iso' }),
  toggleWalls: () => set((state) => ({ showWalls: !state.showWalls })),
  togglePipes: () => set((state) => ({ showPipes: !state.showPipes })),
  toggleBottom: () => set((state) => ({ bottomOpen: !state.bottomOpen })),
  setActiveBottomTab: (tab) => set({ activeBottomTab: tab, bottomOpen: true }),
  setActiveInspectorTab: (tab) => set({ activeInspectorTab: tab }),
  setManipulating: (value) => set({ isManipulating: value }),
  runValidation: () => {
    if (get().isValidating) return
    set({ isValidating: true, toast: { id: ++toastCounter, message: '正在检查空间布置、设备负载与容量余量', tone: 'info' } })
    const finishValidation = () => set((state) => {
      const issues = deriveDesignIssues(state.instances)
      const blockers = issues.filter((item) => item.severity === 'blocker').length
      const errors = issues.filter((item) => item.severity === 'error').length
      return {
        issues,
        isValidating: false,
        validationDirty: false,
        lastValidation: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        bottomOpen: true,
        activeBottomTab: 'issues',
        toast: { id: ++toastCounter, message: `校核完成，发现 ${blockers} 项阻断和 ${errors} 项错误`, tone: blockers || errors ? 'warning' : 'success' },
      }
    })
    if (typeof window === 'undefined') {
      finishValidation()
      return
    }
    window.setTimeout(finishValidation, 1350)
  },
  focusIssue: (issue) => set((state) => ({
    selectedId: issue.targetId,
    activeInspectorTab: 'checks',
    focusSequence: state.focusSequence + 1,
    toast: { id: ++toastCounter, message: `已定位 ${issue.targetName}`, tone: 'info' },
  })),
  saveDesign: () => {
    if (typeof window !== 'undefined') window.clearTimeout(autosaveTimer)
    autosaveTimer = undefined
    const instances = get().instances
    const savedAt = persistScene(instances)
    set((state) => ({
      lastSavedAt: savedAt,
      designDirty: state.instances === instances ? false : state.designDirty,
      toast: { id: ++toastCounter, message: `方案已保存到本机 · ${savedAt}`, tone: 'success' },
    }))
  },
  clearToast: () => set({ toast: null }),
}))

useDesignerStore.subscribe((state, previous) => {
  if (state.instances === previous.instances || typeof window === 'undefined') return
  window.clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = undefined
    const instances = useDesignerStore.getState().instances
    const savedAt = persistScene(instances)
    useDesignerStore.setState((latest) => ({
      lastSavedAt: savedAt,
      designDirty: latest.instances === instances ? false : latest.designDirty,
    }))
  }, 600)
})
