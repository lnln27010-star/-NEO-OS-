import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF } from '@react-three/drei'
import { Activity, Building2, Camera, FileBox, Layers3, RotateCcw, Upload, X } from 'lucide-react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useDesignerStore } from '../useDesignerStore'
import { Parts, TestCampusServices, TestDataHall } from './EngineeringSite'
import { OperationsPanel } from '../components/OperationsPanel'
import { RackOperationsOverlay } from './RackOperationsOverlay'
import { useOperationsStore } from '../useOperationsStore'
import { useEquipmentStore } from '../useEquipmentStore'
import { DigitalEquipmentHall } from './DigitalEquipmentHall'
import { FacilityLayout } from './FacilityLayout'
import { EquipmentNames } from './EquipmentNames'
import { FacilityFlows } from './FacilityFlows'
import { FacilityToolbar } from '../components/FacilityToolbar'
import { EquipmentPanel } from '../components/EquipmentPanel'
import {useEngineeringStore} from '../useEngineeringStore'
import {useActiveEngineeringResult} from '../useActiveEngineeringResult'
import {useSyncEngineeringModel} from '../useSyncEngineeringModel'
import {EngineeringOverlay,EngineeringOverlayControls} from './EngineeringOverlay'
import { useVisualTheme } from '../useVisualTheme'
import { CampusNightDetails } from './CampusNightDetails'
import './campus-atlas.css'
import { CampusPaving } from './CampusPaving'

const MODEL_URL = '/models/northbridge/building.glb'
const EngineeringWorkbench=lazy(()=>import('../components/EngineeringWorkbench').then(m=>({default:m.EngineeringWorkbench})))
useGLTF.preload(MODEL_URL)
type View = 'overview' | 'exterior' | 'cutaway' | 'interior' | 'operations' | 'plan'
type ElementInfo = { expressId: number; globalId: string; type: string; name: string; bounds: { min: number[]; max: number[] } }
type ModelInfo = { elementCount: number; unsupportedGeometryParts: number; sourceSha256: string; typeSummary: Record<string, number>; elements: ElementInfo[] }
const labels: Record<string, string> = { IfcWall: '外墙', IfcRoof: '屋顶', IfcSlab: '楼板', IfcColumn: '结构柱', IfcBeam: '钢梁', IfcWindow: '窗', IfcDuctSegment: '风管', IfcPipeSegment: '管道', IfcDoor: '门', IfcPlate: '连接板', IfcMechanicalFastener: '紧固件' }
const cameras: Record<View, { p: [number, number, number]; t: [number, number, number]; fov: number }> = {
  overview: { p: [126, 112, 155], t: [0, 0, 3], fov: 45 },
  exterior: { p: [86, 21, 93], t: [4, 4, 13], fov: 48 },
  cutaway: { p: [69, 73, 84], t: [-5, 1, 0], fov: 49 },
  interior: { p: [-45.5, 1.9, 9.1], t: [-20, 1.8, 9.1], fov: 60 },
  operations: { p: [48, 59, 65], t: [0, 0, 0], fov: 52 },
  plan: {p:[0,88,.01],t:[0,0,0],fov:50},
}
function CameraRig({ view, sequence, fit }: { view: View; sequence: number; fit: [number, number, number] | null }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, invalidate } = useThree()
  const focusSequence = useOperationsStore((state) => state.focusSequence)
  const equipmentFocus=useEquipmentStore(s=>s.focusSequence)
  useEffect(() => {
    const preset = cameras[view]
    if (fit && camera instanceof THREE.PerspectiveCamera) {
      const radius = Math.max(.01, Math.hypot(...fit) / 2)
      camera.fov = 45
      const vfov = THREE.MathUtils.degToRad(camera.fov)
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect)
      const distance = radius / Math.sin(Math.min(vfov, hfov) / 2) * 1.2
      const target = new THREE.Vector3(0, fit[1] / 2, 0)
      camera.position.copy(new THREE.Vector3(.85, .65, 1).normalize().multiplyScalar(distance).add(target))
      camera.near = Math.max(.001, distance / 10000); camera.far = Math.max(1800, distance * 10)
      camera.updateProjectionMatrix(); controls.current?.target.copy(target)
    } else {
      camera.position.set(...preset.p)
      if (camera instanceof THREE.PerspectiveCamera) { camera.fov = preset.fov; camera.near = view === 'interior' ? .06 : 1; camera.far = 1800; camera.updateProjectionMatrix() }
      controls.current?.target.set(...preset.t)
    }
    controls.current?.update(); invalidate()
  }, [camera, invalidate, view, sequence, fit])
  useEffect(() => {
    if (!focusSequence || fit) return
    const rack = useEquipmentStore.getState().layout[useOperationsStore.getState().selectedRackId]
    if (!rack) return
    camera.position.set(rack.x - 1.4, 3.25, rack.z + 3.2)
    if (camera instanceof THREE.PerspectiveCamera) { camera.fov = 57; camera.near = .05; camera.updateProjectionMatrix() }
    controls.current?.target.set(rack.x, 1.65, rack.z); controls.current?.update(); invalidate()
  }, [camera, invalidate, focusSequence, fit])
  useEffect(()=>{
    if(!equipmentFocus||fit)return
    const state=useEquipmentStore.getState(),d=state.layout[state.selectedId]
    if(!d?.installed)return
    const y=state.focusBay===null?1.26:.36+(state.focusBay*2+1)*.04445
    const distance=state.focusBay===null?3.6:1.8
    camera.position.set(d.x+Math.sin(d.yaw)*distance-.7*Math.cos(d.yaw),y+(state.focusBay===null?.9:.55),d.z+Math.cos(d.yaw)*distance+.7*Math.sin(d.yaw))
    if(camera instanceof THREE.PerspectiveCamera){camera.fov=48;camera.near=.03;camera.updateProjectionMatrix()}
    controls.current?.target.set(d.x,y,d.z+(state.focusBay===null?0:.55));controls.current?.update();invalidate()
  },[equipmentFocus,camera,invalidate,fit])
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.12} minDistance={fit ? .01 : view === 'interior' || view === 'operations' || view === 'plan' ? .4 : 10} maxDistance={fit ? Math.max(380, Math.hypot(...fit) * 10) : 380} maxPolarAngle={Math.PI * .49} />
}
// Explicit presentation corrections: the sample IFC puts its roof/beams/ducts
// at ground elevation. Source GLB/GlobalIds/bounding boxes are not modified.
function testElevation(type: string, name: string, minY: number) {
  if (type === 'IfcRoof') return 8.5
  if (type === 'IfcBeam') return 8.05
  if (type === 'IfcDuctSegment') return 6.35
  if (['IfcAirTerminal', 'IfcSensor', 'IfcFireSuppressionTerminal'].includes(type)) return 6.1
  if (type === 'IfcCableCarrierSegment') return 5.25
  if (type === 'IfcPipeSegment' && name === 'Pipe' && minY < 0) return 5.6
  return 0
}
function BimBuilding({ view, roof, structure, mep, selected, onSelect, url, onReady, onEnter, transparentWalls }: {
  view: View; roof: boolean; structure: boolean; mep: boolean; selected: number | null;
  onSelect: (element: ElementInfo) => void; url: string; onReady: (size: [number, number, number] | null) => void
  onEnter: () => void; transparentWalls:boolean
}) {
  const dark=useVisualTheme(s=>s.theme==='dark')
  const invalidate=useThree(s=>s.invalidate)
  const { scene } = useGLTF(url)
  const imported = url !== MODEL_URL
  const meshes = useMemo(() => {
    const result: { key: string; geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4; info: ElementInfo }[] = []
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene), center = box.getCenter(new THREE.Vector3())
    const origin = new THREE.Matrix4().makeTranslation(imported ? -center.x : -48, imported ? -box.min.y : 0, imported ? -center.z : 30.5)
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const source = object.userData.expressId ? object.userData : object.parent?.userData
      const info = (source?.expressId ? source : { expressId: result.length + 1, name: object.name || 'Imported mesh', type: 'GLBMesh', globalId: '未提供 IFC GlobalId', bounds: { min: [0, 0, 0], max: [0, 0, 0] } }) as ElementInfo
      const base = Array.isArray(object.material) ? object.material[0] : object.material
      const material = base.clone() as THREE.MeshStandardMaterial
      material.side = THREE.DoubleSide
      if (info.type === 'IfcRoof') { material.polygonOffset = true; material.polygonOffsetFactor = 1; material.polygonOffsetUnits = 1 }
      if (info.type === 'IfcSlab') material.color.set(dark?'#526472':'#c9cbc5')
      if(dark && !imported && ['IfcWall','IfcRoof','IfcColumn','IfcBeam'].includes(info.type)) { material.color.set(info.type==='IfcRoof'?'#435968':'#6b8190');material.roughness=.48;material.metalness=.22 }
      const matrix = origin.clone().multiply(object.matrixWorld)
      matrix.elements[13] += imported ? 0 : testElevation(info.type, info.name, info.bounds.min[1])
      result.push({ key: object.uuid, geometry: object.geometry, material, matrix, info })
    })
    return result
  }, [scene, imported, dark])
  useEffect(() => {
    const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3())
    onReady(imported ? [size.x, size.y, size.z] : null)
    return () => meshes.forEach((mesh) => mesh.material.dispose())
  }, [meshes, onReady, scene, imported])
  useEffect(()=>{for(const mesh of meshes)if(!imported&&mesh.info.type==='IfcWall'){const material=mesh.material as THREE.MeshStandardMaterial;material.transparent=transparentWalls;material.opacity=transparentWalls?.18:1;material.depthWrite=!transparentWalls;material.needsUpdate=true}invalidate()},[meshes,imported,transparentWalls,invalidate])
  const highlight = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a1bd63', roughness: .55, metalness: .1 }), [])
  useEffect(() => () => highlight.dispose(), [highlight])
  return <group name="IFC derived building" onDoubleClick={(event) => { if (!imported && useDesignerStore.getState().twinMode === 'browse') { event.stopPropagation(); onEnter() } }}>
    {meshes.map((mesh) => {
      const type = mesh.info.type
      const structural = /IfcBeam|IfcColumn|IfcPlate|IfcMechanicalFastener|IfcFooting/.test(type)
      const mechanical = /IfcDuct|IfcPipe|IfcSensor|IfcAirTerminal|IfcFireSuppression|IfcCable/.test(type)
      const hide = ((view==='plan'||view==='operations') && structural && type!=='IfcColumn') || (!roof && type === 'IfcRoof') || type === 'IfcCovering' || type === 'IfcStructuralSurfaceMember' || (!structure && structural) || (!mep && mechanical)

      return <mesh key={mesh.key} visible={!hide} matrixAutoUpdate={false} matrix={mesh.matrix} geometry={mesh.geometry} material={selected === mesh.info.expressId ? highlight : mesh.material} castShadow={!/IfcMechanicalFastener|IfcPlate|IfcSensor/.test(type)&&!(type==='IfcWall'&&transparentWalls)} receiveShadow={type !== 'IfcRoof'} onClick={(event) => { if (useDesignerStore.getState().twinMode === 'operate'||useEquipmentStore.getState().editMode) return; event.stopPropagation(); onSelect(mesh.info) }} />
    })}
  </group>
}
const paving: { p: [number, number, number]; s: [number, number, number]; color?: string }[] = []
for (let x = -87; x < 91; x += 6) for (let z = -56; z < 70; z += 6) {
  if (Math.abs(x) < 49 && Math.abs(z) < 32) continue
  const tint = .34 + (((x * 17 + z * 31) % 7) + 7) % 7 * .004
  paving.push({ p: [x, -.165, z], s: [5.97, .12, 5.97], color: new THREE.Color(tint, tint + .008, tint - .012).getStyle() })
}
const cladding = Array.from({ length: 81 }, (_, i) => ({ p: [-47.5 + i * 1.19, 5.2, 30.66] as [number, number, number], s: [.028, 6.2, .027] as [number, number, number] }))
function DragFeedback(){const message=useEquipmentStore(s=>s.message);return message?<div className="facility-drag-feedback" role="status">{message}</div>:null}
function SceneTone({dark}:{dark:boolean}) {
  const {gl,invalidate}=useThree()
  useEffect(()=>{gl.toneMappingExposure=dark?1.02:1.05;invalidate()},[dark,gl,invalidate])
  return null
}
class SceneErrorBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { this.props.onError(error.message) }
  render() { return this.state.failed ? null : this.props.children }
}
export function CampusViewport({active:surfaceActive=true}:{active?:boolean}) {
  const engineeringOpen=useEngineeringStore(s=>s.visible)
  const engineeringResult=useActiveEngineeringResult()
  const theme=useVisualTheme(s=>s.theme)
  const dark=theme==='dark'
  const equipmentEditing=useEquipmentStore(s=>s.editMode)
  const darkPaving=useMemo(()=>paving.map(p=>({...p,color:'#33424c'})),[])
  const placementId=useEquipmentStore(s=>s.placementId)
  const movementId=useEquipmentStore(s=>s.movementId)
  const transparentWalls=useEquipmentStore(s=>s.transparentWalls)
  const [view, setView] = useState<View>(()=>useDesignerStore.getState().sceneScope==='room' ? useDesignerStore.getState().twinMode==='operate'?'operations':'plan' : 'overview'), [roof, setRoof] = useState(true), [structure, setStructure] = useState(true), [mep, setMep] = useState(false), [equipment, setEquipment] = useState(true)
  const [selected, setSelected] = useState<ElementInfo | null>(null), [info, setInfo] = useState<ModelInfo | null>(null)
  const [panel, setPanel] = useState(true), [tree, setTree] = useState(false), [sequence, setSequence] = useState(0)
  const [modelUrl, setModelUrl] = useState(MODEL_URL), [filename, setFilename] = useState('数据中心'), [loaded, setLoaded] = useState(false), [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [fit, setFit] = useState<[number, number, number] | null>(null)
  const isReference = modelUrl === MODEL_URL
  const fileInput = useRef<HTMLInputElement>(null), objectUrl = useRef<string | null>(null)
  const ready = useCallback((size: [number, number, number] | null) => { setLoaded(true); setFit(size) }, [])
  const setSiteAsset = useDesignerStore((state) => state.setSiteAsset)
  const setSceneScope = useDesignerStore((state) => state.setSceneScope)
  const sceneScope = useDesignerStore((state) => state.sceneScope)
  const twinMode = useDesignerStore((state) => state.twinMode)
  const setTwinMode = useDesignerStore((state) => state.setTwinMode)
  const operationMode = twinMode === 'operate'
  const active = surfaceActive && (sceneScope === 'campus' || sceneScope === 'room')
  useSyncEngineeringModel(active)
  const chooseView = (next: View) => { setView(next); setRoof(next === 'overview' || next === 'exterior'); setSequence((s) => s + 1) }
  useEffect(()=>{if(placementId){chooseView('plan');setEquipment(true)}},[placementId])
  useEffect(() => {
    if (sceneScope === 'campus') chooseView('overview')
    if (sceneScope === 'room') {chooseView(twinMode === 'operate' ? 'operations' : 'plan');setPanel(false)}
    useEquipmentStore.getState().setEditMode(sceneScope==='room' && twinMode==='browse')
    if (twinMode === 'operate') { setEquipment(true); setSelected(null); setTree(false) }
  }, [sceneScope, twinMode])
  useEffect(() => {
    if (!active || !operationMode || !isReference || !loaded || error) { useOperationsStore.getState().pause(); return }
    const timer = window.setInterval(() => useOperationsStore.getState().tick(), 1000)
    return () => { window.clearInterval(timer); useOperationsStore.getState().pause() }
  }, [active, operationMode, isReference, loaded, error])
  useEffect(() => {
    const controller = new AbortController()
    fetch('/models/northbridge/elements.json', { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error('模型目录读取失败'); return r.json() }).then(setInfo).catch((e) => { if (e.name !== 'AbortError') setError(String(e.message)) })
    return () => controller.abort()
  }, [attempt])
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current) }, [])
  const reset = () => {
    useGLTF.clear(MODEL_URL)
    setModelUrl(MODEL_URL); setFilename('数据中心'); setError(''); setLoaded(false); setSelected(null); setFit(null); chooseView('overview')
    setSiteAsset({ url: '', name: '', type: null })
    setAttempt((value) => value + 1)
    if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null }
  }
  const importModel = async (file?: File) => {
    if (!file) return
    if (!/\.glb$/i.test(file.name)) { setError('此入口接收自包含 GLB；IFC 请先使用项目转换脚本。'); return }
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    if (header.length < 12 || new DataView(header.buffer).getUint32(0, true) !== 0x46546c67) { setError('文件不是有效 GLB，原场景已保留。'); return }
    const previous = objectUrl.current
    objectUrl.current = URL.createObjectURL(file)
    setModelUrl(objectUrl.current); setFilename(file.name); setLoaded(false); setError(''); setSelected(null); setTree(false); chooseView('overview')
    setSiteAsset({ url: objectUrl.current, name: file.name, type: 'glb' })
    if (previous) URL.revokeObjectURL(previous)
  }
  return <div className={`bim-workbench campus-bim is-${theme} ${operationMode ? 'is-operating' : ''}`} aria-label={isReference ? 'IFC 数据厅与场地三维查看器' : '本地 GLB 三维查看器'}>
    <Canvas frameloop={active ? 'demand' : 'never'} shadows dpr={[1, 1.5]} camera={{ position: cameras.overview.p, fov: 45, near: .08, far: 1800 }} gl={{ antialias: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; gl.shadowMap.type = THREE.PCFSoftShadowMap; gl.domElement.setAttribute('aria-label', '数据中心三维场景'); gl.domElement.setAttribute('role', 'img') }}>
      <color attach="background" args={[dark ? '#0b1119' : view === 'interior' ? '#41484a' : '#e1e7eb']} /><fog attach="fog" args={[dark?'#0b1119':'#e1e7eb', 280, 1000]} />
      <SceneTone dark={dark}/>
      <ambientLight intensity={dark?.22:.18} color={dark?'#aac5dd':'#ffffff'}/><hemisphereLight args={[dark?'#bcd5e8':'#e6eef3', dark?'#15202c':'#868779', dark?.65:.8]} />
      <directionalLight position={[-65, 125, 70]} intensity={dark?1.45:1.8} color={dark?'#c1d9ed':'#fff5e5'} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-130} shadow-camera-right={130} shadow-camera-top={130} shadow-camera-bottom={-130} shadow-camera-far={400} shadow-normalBias={.06} />
      {dark&&<directionalLight position={[100,35,-50]} intensity={.45} color="#f4cca0"/>}
      {view === 'interior' && <><pointLight position={[-22, 4.4, 10]} intensity={50} distance={23} /><pointLight position={[-22, 4.4, -8]} intensity={50} distance={23} /></>}
      <Suspense fallback={null}><Environment files="/textures/industrial-workshop.hdr" environmentIntensity={dark?.3:.38} /></Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.25, 0]} receiveShadow><planeGeometry args={[2400, 2400]} /><meshStandardMaterial color={dark?'#101924':'#b3c1ca'} roughness={.88} metalness={dark?.12:0} /></mesh>
      <mesh position={[0, -.2, 4]} receiveShadow><boxGeometry args={[196, .08, 170]} /><meshStandardMaterial color={dark?'#293640':'#555b58'} roughness={.8} /></mesh>
      <Suspense fallback={null}><CampusPaving dark={dark}/></Suspense>
      <Parts parts={dark?darkPaving:paving} color="#b3b5ae" roughness={dark?.72:.96} metalness={dark?.12:0} />
      {modelUrl === MODEL_URL && <><Parts parts={cladding} color={dark?'#96acba':'#b9bcb6'} metalness={.3} /><TestCampusServices roofVisible={roof} roofDetail={view !== 'interior'} /><CampusNightDetails dark={dark} roof={roof}/>{equipment && <><FacilityLayout plan={view==='plan'}/><DigitalEquipmentHall/>{sceneScope==='room'&&<EquipmentNames exterior={view==='exterior'||view==='overview'}/>}<TestDataHall ceilingVisible={roof} /></>}</>}
      {operationMode && !engineeringResult && isReference && equipment && view!=='exterior'&&view!=='overview' && <RackOperationsOverlay />}
      {sceneScope==='room'&&engineeringResult&&<EngineeringOverlay/>}
      <SceneErrorBoundary key={`${modelUrl}-${attempt}`} onError={setError}><Suspense fallback={null}><BimBuilding url={modelUrl} view={view} roof={roof} structure={structure} mep={mep} selected={selected?.expressId ?? null} onSelect={setSelected} onReady={ready} transparentWalls={sceneScope==='room'&&transparentWalls} onEnter={() => setSceneScope('room')} /></Suspense></SceneErrorBoundary>
      {isReference && sceneScope==='room' && equipment && !engineeringResult && <FacilityFlows active={active&&!engineeringOpen}/>}
      <CameraRig view={view} sequence={sequence} fit={fit} />
    </Canvas>
    {(sceneScope!=='room'||!isReference)&&<div className="bim-title"><strong>{filename}</strong></div>}
    {sceneScope!=='room'&&(<div className="bim-tools" aria-label="场景工具">
      {!operationMode && <><button type="button" aria-label="显示配置面板" aria-pressed={panel} onClick={() => setPanel(!panel)}><Layers3 size={18} /></button>
      <button type="button" aria-label="显示构件目录" disabled={!isReference} aria-pressed={tree} onClick={() => setTree(!tree)}><FileBox size={18} /></button></>}
      <button type="button" aria-label={operationMode ? '恢复机柜总览' : '恢复园区总览'} onClick={() => chooseView(operationMode ? 'operations' : 'overview')}><RotateCcw size={18} /></button>
      <button type="button" aria-label="进入新版机房" onClick={() => setSceneScope('room')}><Building2 size={18} /></button>
      <button type="button" aria-label="打开运营仿真" onClick={() => setTwinMode('operate')}><Activity size={18} /></button>
    </div>)}
    {panel && !operationMode && !equipmentEditing && <aside className="bim-config" aria-label="园区模型配置">
      <header><strong>场景配置</strong><button type="button" aria-label="收起配置面板" onClick={() => setPanel(false)}><X size={15} /></button></header>
      {isReference && <><div className="bim-tabs"><button aria-pressed={sceneScope === 'campus'} onClick={() => setSceneScope('campus')}>场地</button><button aria-pressed={sceneScope === 'room'} onClick={() => setSceneScope('room')}>数据厅</button></div>
      <label className="bim-field">视点<select value={view} onChange={(e) => chooseView(e.target.value as View)}><option value="plan">机房俯视布局</option><option value="overview">园区鸟瞰</option><option value="exterior">建筑近景</option><option value="cutaway">移除屋顶 · BIM 剖切</option><option value="interior">机房通道 · 人眼高度</option><option value="operations">机柜阵列总览</option></select></label>
      <div className="bim-layer-controls">
        <label><input type="checkbox" checked={roof} onChange={(e) => setRoof(e.target.checked)} />屋面 / 顶部构造</label>
        <label><input type="checkbox" checked={structure} onChange={(e) => setStructure(e.target.checked)} />钢结构 / 紧固件</label>
        <label><input type="checkbox" checked={mep} onChange={(e) => setMep(e.target.checked)} />IFC 机电构件</label>
        <label><input type="checkbox" checked={equipment} onChange={(e) => setEquipment(e.target.checked)} />机柜与设备</label>
      </div>
      </>}
      {modelUrl === MODEL_URL ? <div className="bim-model-facts"><span>建筑包络</span><strong>96 × 61 × 8.5 m</strong><span>已转换构件</span><strong>{info?.elementCount ?? '…'} 个</strong><span>转换未输出</span><strong>{info?.unsupportedGeometryParts ?? '…'} 个几何片段</strong></div> : null}
      <button className="bim-import" type="button" onClick={() => fileInput.current?.click()}><Upload size={14} />加载本地 GLB</button>
      <input ref={fileInput} type="file" accept=".glb" aria-label="选择本地 GLB 模型" className="bim-file-input" onChange={(e) => { void importModel(e.target.files?.[0]); e.target.value = '' }} />
      {modelUrl !== MODEL_URL && <button className="bim-import" type="button" onClick={reset}>恢复场景</button>}
      
      {isReference && <div className="bim-entry-actions"><button className="bim-import" type="button" onClick={() => setSceneScope('room')}>进入数据厅</button><button className="bim-import" type="button" onClick={() => setTwinMode('operate')}>启动运营仿真</button></div>}
    </aside>}
    {tree && !operationMode && modelUrl === MODEL_URL && <aside className="bim-tree" aria-label="IFC 构件目录"><header><strong>IFC 构件目录</strong><button onClick={() => setTree(false)} aria-label="关闭构件目录"><X size={14} /></button></header>
      <label className="bim-field">选择构件<select value={selected?.expressId ?? ''} onChange={(e) => setSelected(info?.elements.find((element) => element.expressId === Number(e.target.value)) ?? null)}><option value="">选择 IFC 构件</option>{info?.elements.map((e) => <option key={e.expressId} value={e.expressId}>{labels[e.type] ?? e.type} · #{e.expressId}</option>)}</select></label>
      {Object.entries(info?.typeSummary ?? {}).map(([type, count]) => <div className="bim-type-row" key={type}><span>{labels[type] ?? type.replace('Ifc', '')}</span><span>{count}</span></div>)}
    </aside>}
    {selected && !operationMode && <section className="bim-selection" aria-label={isReference ? '所选 IFC 构件' : '所选模型网格'}><button aria-label="清除构件选择" onClick={() => setSelected(null)}><X size={14} /></button><strong>{labels[selected.type] ?? selected.name} <span>#{selected.expressId}</span></strong><span>{selected.type}</span><code>{selected.globalId}</code><small>{selected.type === 'GLBMesh' ? '本地网格 · 未提供 IFC 元数据' : '源 IFC GlobalId · 点击实体查看'}</small></section>}
    {operationMode && !equipmentEditing && !engineeringResult && <OperationsPanel enabled={isReference && loaded && !error} onBrowse={() => setTwinMode('browse')} />}
    {active&&sceneScope==='room'&&<EngineeringOverlayControls/>}
    {active&&sceneScope==='room'&&engineeringOpen&&<Suspense fallback={<div className="engineering-backdrop" role="status">加载工程求解工作台…</div>}><EngineeringWorkbench/></Suspense>}
    {movementId&&sceneScope==='room'&&<div className="movement-banner">{movementId} · 拖动 X / Z 轴 · Esc 结束</div>}
    {active && sceneScope==='room' && isReference && loaded && <><EquipmentPanel/><FacilityToolbar plan={view==='plan'} onPlan={()=>chooseView('plan')} onPerspective={()=>chooseView('operations')} exterior={view==='exterior'||view==='overview'} onExterior={()=>{chooseView('exterior');useEquipmentStore.getState().setEditMode(false)}} onInterior={()=>chooseView('interior')}/></>}
    {sceneScope!=='room'&&<div className="bim-cameras" aria-label="园区相机预设"><Camera size={15} />{isReference ? (operationMode ? [['operations', '机房总览'], ['interior', '机房通道']] as const : [['overview', '园区鸟瞰'], ['exterior', '建筑近景'], ['cutaway', 'BIM 剖切'], ['interior', '机房通道']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => chooseView(id)}>{label}</button>) : <button type="button" onClick={() => setSequence((s) => s + 1)}>适配导入模型</button>}</div>}
    {active&&sceneScope==='room'&&equipmentEditing&&<DragFeedback/>}
    
    {!loaded && !error && <div className="bim-loading" role="status">加载场景…</div>}
    {error && <div className="bim-error" role="alert"><strong>模型未能加载</strong><span>{error}</span><button onClick={reset}>恢复场景</button></div>}
  </div>
}
export default CampusViewport
