import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Parts, TestCampusServices } from './EngineeringSite'
import { AmapSharedRenderer } from './AmapSharedRenderer'
import * as THREE from 'three'
import { useDesignerStore } from '../useDesignerStore'
import { useVisualTheme } from '../useVisualTheme'
import { CampusNightDetails } from './CampusNightDetails'
import './campus-atlas.css'
import { CampusPaving } from './CampusPaving'
import { loadBimScene } from './loadScenes'

declare global { interface Window { AMap?: any; THREE?: any; _AMapSecurityConfig?: { securityJsCode?: string } } }
const AMAP_KEY = import.meta.env.VITE_AMAP_KEY as string | undefined
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE as string | undefined
const NANJING: [number, number] = [118.767413, 32.041544]
type SiteAlignment = { longitude: number; latitude: number; elevation: number; heading: number; scale: number; source: string }
const DEFAULT_ALIGNMENT: SiteAlignment = { longitude: 119.8123, latitude: 31.892168, elevation: 0, heading: 0, scale: 1, source: '常州市罗溪新南村 · 截图红框空地效果设计' }
const readAlignment = (): SiteAlignment => { try { const stored = JSON.parse(localStorage.getItem('northbridge-alignment') ?? 'null'); return stored && localStorage.getItem('northbridge-alignment-version') === '5' ? { ...DEFAULT_ALIGNMENT, ...stored } : DEFAULT_ALIGNMENT } catch { return DEFAULT_ALIGNMENT } }

let amapPromise: Promise<any> | undefined
function loadAmap() {
  if (window.AMap?.GLCustomLayer) return Promise.resolve(window.AMap)
  if (amapPromise) return amapPromise
  let timeout:ReturnType<typeof setTimeout>
  amapPromise = new Promise<any>((resolve, reject) => {
    timeout=setTimeout(()=>reject(new Error('高德地图加载超时，请重试或切换三维仿真')),20000)
    if (window.AMap) { window.AMap.plugin(['AMap.GLCustomLayer'], () => resolve(window.AMap)); return }
    if (AMAP_SECURITY_CODE) window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE }
    const load = (src: string, done: () => void) => { const script = document.createElement('script'); script.src = src; script.async = true; script.onload = done; script.onerror = () => reject(new Error('高德依赖加载失败')); document.head.appendChild(script) }
    const loadMap = () => load(`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(AMAP_KEY ?? '')}&plugin=AMap.Scale,AMap.ToolBar,AMap.GLCustomLayer`, () => window.AMap ? resolve(window.AMap) : reject(new Error('高德 API 未返回')))
    loadMap()
  }).finally(()=>clearTimeout(timeout)).catch(error=>{amapPromise=undefined;throw error})
  return amapPromise
}

export function AmapCampusViewport() {
  const theme = useVisualTheme(s => s.theme)
  const basemapTone=useVisualTheme(s=>s.basemapTone)
  const dark = theme === 'dark'
  const node = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const picking = useRef(false)
  const setSceneScope = useDesignerStore((s) => s.setSceneScope)
  const [alignment, setAlignment] = useState<SiteAlignment>(readAlignment)
  const [draft, setDraft] = useState<SiteAlignment>(alignment)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mapInstance, setMapInstance] = useState<any>(null)
  const [sharedReady, setSharedReady] = useState(false)
  const [loadError,setLoadError]=useState('')
  const [retry,setRetry]=useState(0)
  const onSharedReady = useCallback(() => setSharedReady(true), [])
  const [status, setStatus] = useState(AMAP_KEY ? '加载园区…' : '未配置高德 Key')
  useEffect(()=>{
    if(!sharedReady)return
    // Reuse the parsed GLTF cache when the visitor enters the data hall.
    const warm=()=>{void loadBimScene().catch(()=>{})}
    if('requestIdleCallback' in window){const id=window.requestIdleCallback(warm,{timeout:4000});return ()=>window.cancelIdleCallback(id)}
    const id=setTimeout(warm,1200);return ()=>clearTimeout(id)
  },[sharedReady])
  useEffect(() => {
    if (!node.current || !AMAP_KEY) return
    let disposed = false
    setSharedReady(false)
    setLoadError('')
    loadAmap().then((AMap) => {
      if (disposed || !node.current) return
      const isDark = useVisualTheme.getState().theme === 'dark'
      const buildings = new AMap.Buildings({ zIndex: 130, zooms: [16, 20], heightFactor: 1, wallColor: isDark ? 'rgba(54,70,84,.92)' : 'rgba(190,202,207,1)', roofColor: isDark ? 'rgba(86,104,117,.95)' : 'rgba(226,232,235,.9)' })
      const darkStyle=useVisualTheme.getState().basemapTone==='blueblack'?'amap://styles/darkblue':'amap://styles/dark'
      const map = new AMap.Map(node.current, { center: [alignment.longitude, alignment.latitude], zoom: 18.7, pitch: 48, rotation: -25, viewMode: '3D', mapStyle: isDark ? darkStyle : 'amap://styles/normal', showBuildingBlock: false, buildingAnimation: false, features: ['bg', 'road', 'point'], layers: [AMap.createDefaultLayer(), buildings] })
      // The campus replaces only the map's generic building blocks inside its footprint.
      const dLat = 85 * alignment.scale / 111320, dLon = 98 * alignment.scale / (111320 * Math.cos(alignment.latitude * Math.PI / 180))
      buildings.setStyle({ hideWithoutStyle: false, areas: [{ visible: false, path: [[alignment.longitude-dLon,alignment.latitude-dLat],[alignment.longitude+dLon,alignment.latitude-dLat],[alignment.longitude+dLon,alignment.latitude+dLat],[alignment.longitude-dLon,alignment.latitude+dLat]] }] })
      map.on('complete', () => setStatus(AMAP_SECURITY_CODE ? '' : '高德 API 已启动，但缺少 securityJsCode，地图瓦片/楼块可能为空白'))
      map.addControl(new AMap.Scale()); map.addControl(new AMap.ToolBar({ position: 'RB' }))
      setMapInstance(map)
      const offset = (dx: number, dy: number): [number, number] => [alignment.longitude + dx / (111320 * Math.cos(alignment.latitude * Math.PI / 180)), alignment.latitude + dy / 111320]
      const facilities = [
        { name: '数据中心', p: [0, 0], size: [150, 95], color: '#a9c77d' },
        { name: '能源中心 / 变电站', p: [-170, 40], size: [60, 42], color: '#d19c67' },
        { name: '集中冷却站', p: [170, 42], size: [74, 42], color: '#6eabc2' },
        { name: '综合运维楼', p: [-150, -100], size: [56, 38], color: '#9b9ecb' },
        { name: '备用机房 B1', p: [165, -105], size: [88, 50], color: '#8fa9b4' },
      ]
      // Research facility placeholders are intentionally not rendered as flat polygons.
      // Only validated 3D assets should be added to the map layer.
      const marker = new AMap.Marker({ position: [alignment.longitude, alignment.latitude], title: '数据中心', label: { content: '<div class="amap-northbridge-label">数据中心</div>', direction: 'top' }, offset: new AMap.Pixel(-12, -30) })
      marker.on('click', () => setSceneScope('room')); marker.setMap(map)
      mapRef.current = map; setStatus('')
      map.on('click', (e:any) => { if(!picking.current) return; picking.current=false; const next={...alignment,longitude:e.lnglat.lng,latitude:e.lnglat.lat,source:'常州市罗溪新南村 · 红框空地演示选址'}; localStorage.setItem('northbridge-alignment-version','5');localStorage.setItem('northbridge-alignment',JSON.stringify(next));setAlignment(next) })
    }).catch((error) => { if (!disposed) {setStatus(error.message);setLoadError(error.message)} })
    return () => { disposed = true; setMapInstance(null); mapRef.current?.destroy(); mapRef.current = null }
  }, [setSceneScope, alignment,retry])
  useEffect(() => { mapInstance?.setMapStyle(dark ? basemapTone==='blueblack'?'amap://styles/darkblue':'amap://styles/dark' : 'amap://styles/normal') }, [mapInstance, dark,basemapTone])
  const saveSettings = () => { if (![draft.longitude,draft.latitude,draft.elevation,draft.heading,draft.scale].every(Number.isFinite) || Math.abs(draft.longitude)>180 || Math.abs(draft.latitude)>85 || draft.scale<=0) { setStatus('参数无效，请检查坐标和比例'); return } localStorage.setItem('northbridge-alignment-version', '5'); localStorage.setItem('northbridge-alignment', JSON.stringify(draft)); setAlignment({...draft}); setSettingsOpen(false) }
  const field = (key: keyof SiteAlignment, label: string, step = '0.000001') => <label key={key}><span>{label}</span><input type={key === 'source' ? 'text' : 'number'} step={step} value={String(draft[key])} onChange={(event) => setDraft({ ...draft, [key]: key === 'source' ? event.target.value : Number(event.target.value) })} /></label>
  return <div className={`amap-campus-viewport campus-atlas is-${theme}`}><div ref={node} className="amap-campus-map" />
    {!sharedReady&&<div className="scene-module-loading" role={loadError?'alert':'status'}><div><strong>{loadError||'正在准备园区底图与建筑模型…'}</strong>{loadError&&<p><button onClick={()=>setRetry(v=>v+1)}>重试加载</button><button onClick={()=>useDesignerStore.getState().setCampusPresentation('model')}>打开三维仿真</button></p>}</div></div>}
    <div className="amap-overlay-model" style={{ visibility: sharedReady ? 'hidden' : 'visible' }} aria-label="Northbridge 地理坐标三维园区">{mapInstance && <Canvas frameloop={sharedReady?'never':'demand'} dpr={[1,1.5]} camera={{ near: .1, far: 100000 }} gl={{ alpha: true, antialias: true }} style={{ pointerEvents: 'none' }}><MapCamera map={mapInstance} alignment={alignment} /><ambientLight intensity={dark?.48:.8} color={dark?'#a3bdd5':'#ffffff'}/><directionalLight position={[100, -150, 200]} intensity={dark?2.4:2} color={dark?'#b4d3f0':'#ffffff'}/><Suspense fallback={null}><SiteOverlayModel alignment={alignment} dark={dark}/><AmapSharedRenderer map={mapInstance} longitude={alignment.longitude} latitude={alignment.latitude} onReady={onSharedReady} theme={theme}/></Suspense></Canvas>}</div>
    <div className="campus-atlas-vignette"/>
    <div className="amap-campus-head"><strong>数据中心园区</strong><em>{status}</em></div>
    <button className="amap-reset-site" type="button" onClick={() => { mapRef.current?.setZoomAndCenter(18.7, [alignment.longitude, alignment.latitude]); mapRef.current?.setPitch(48); mapRef.current?.setRotation(-25) }}>园区总览</button>
    <button className="amap-settings-button" type="button" onClick={() => { setDraft(alignment); setSettingsOpen(true) }}>坐标对齐设置</button>
    <button style={{position:'absolute',right:22,top:108,zIndex:5}} className="map-provider-link" onClick={()=>{setAlignment({...DEFAULT_ALIGNMENT});localStorage.setItem('northbridge-alignment-version','5');localStorage.setItem('northbridge-alignment',JSON.stringify(DEFAULT_ALIGNMENT))}}>定位园区</button>
    <button style={{position:'absolute',right:22,top:148,zIndex:5}} className="map-provider-link" onClick={()=>{picking.current=true;setStatus('请点击空地设置园区中心')}}>地图选点放置</button>
    <div style={{position:'absolute',right:22,top:66,zIndex:5,display:'flex',gap:6}}><button className="map-provider-link" onClick={() => mapRef.current?.setRotation(mapRef.current.getRotation()+45)}>旋转 45°</button><button className="map-provider-link" onClick={() => mapRef.current?.setZoom(mapRef.current.getZoom()+.5)}>放大园区</button></div>
    {settingsOpen && <aside className="amap-settings-panel" aria-label="数据中心坐标对齐设置"><header><strong>数据中心对齐参数</strong><button aria-label="关闭坐标设置" type="button" onClick={() => setSettingsOpen(false)}>×</button></header>{field('longitude', '经度')}{field('latitude', '纬度')}{field('elevation', '离地高度（米）', '0.1')}{field('heading', '朝向角', '1')}{field('scale', '模型缩放', '0.01')}{field('source', '参数来源')}<div className="amap-settings-actions"><button type="button" onClick={() => setDraft(DEFAULT_ALIGNMENT)}>恢复截图位置</button><button type="button" onClick={saveSettings}>保存并应用</button></div></aside>}
    
    {!AMAP_KEY && <div className="amap-campus-missing">请配置高德地图 Key。</div>}</div>
}

function MapCamera({ map, alignment }: { map: any; alignment: SiteAlignment }) {
  const invalidate=useThree(s=>s.invalidate)
  useEffect(()=>{const events=['mapmove','zoomchange','rotatechange','pitchchange','resize'];events.forEach(e=>map.on(e,invalidate));return()=>events.forEach(e=>map.off(e,invalidate))},[map,invalidate])
  useFrame(({ camera, size }) => {
    const coords = map.customCoords
    coords.setCenter([alignment.longitude, alignment.latitude])
    const p = coords.getCameraParams()
    const c = camera as THREE.PerspectiveCamera
    c.near = p.near; c.far = p.far; c.fov = p.fov; c.aspect = size.width / size.height
    c.position.fromArray(p.position); c.up.fromArray(p.up); c.lookAt(new THREE.Vector3().fromArray(p.lookAt)); c.updateProjectionMatrix()
  })
  return null
}

function SiteOverlayModel({ alignment, dark }: { alignment: SiteAlignment; dark: boolean }) {
  const { scene } = useGLTF('/models/northbridge/building.glb')
  const logo = useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256
    const c=canvas.getContext('2d')!;c.fillStyle='#3489ef';c.textAlign='center';c.font='800 132px "Microsoft YaHei",sans-serif'
    c.save();c.translate(512,122);c.scale(820/c.measureText('数据中心').width,1);c.fillText('数据中心',0,0);c.restore()
    c.font='800 92px Arial,sans-serif';c.textAlign='left';const chars=[...'AIDC'],tracking=28,width=chars.reduce((sum,ch)=>sum+c.measureText(ch).width,0)+tracking*3
    c.save();c.translate(512,233);c.scale(640/width,1);let x=-width/2;for(const ch of chars){c.fillText(ch,x,0);x+=c.measureText(ch).width+tracking}c.restore()
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture
  },[])
  useEffect(()=>()=>logo.dispose(),[logo])
  const building = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((object) => {
      const type = object.userData.type ?? object.parent?.userData.type
      if (object instanceof THREE.Mesh && ['IfcWall','IfcSlab','IfcColumn','IfcBeam'].includes(type)) {
        const material = (Array.isArray(object.material) ? object.material[0] : object.material).clone() as THREE.MeshStandardMaterial
        material.color.set(dark ? '#758794' : '#f3f5f5'); material.roughness=dark?.52:.8; material.metalness=dark?.25:.05; material.userData.atlasOwned=true; object.material=material
      }
      if (type === 'IfcRoof') object.visible = false
      if (type === 'IfcBeam') object.position.y += 8.05
      if (type === 'IfcCovering' || type === 'IfcStructuralSurfaceMember') object.visible = false
    })
    copy.position.set(-48, 0, 30.5)
    return copy
  }, [scene, dark])
  useEffect(() => () => { building.traverse(object => { if(object instanceof THREE.Mesh) { const materials=Array.isArray(object.material)?object.material:[object.material]; materials.forEach(material=>{if(material.userData.atlasOwned)material.dispose()}) } }) }, [building])
  return <group name="georeferenced-campus" position={[0, 0, alignment.elevation]} rotation={[Math.PI / 2, 0, 0]}><group rotation={[0, alignment.heading * Math.PI / 180, 0]} scale={alignment.scale}>
    <mesh position={[0, -.15, 4]}><boxGeometry args={[196, .3, 170]} /><meshStandardMaterial color={dark?'#252f38':'#cbd0d2'} roughness={.85} /></mesh>
    <CampusPaving dark={dark} elevation={.005}/>
    <mesh position={[0, .025, 4]}><boxGeometry args={[156, .05, 136]} /><meshStandardMaterial color={dark?'#3d4d58':'#e3e7e7'} roughness={dark?.6:.92} metalness={dark?.16:0} /></mesh>
    <mesh position={[0, 8.55, 0]}><boxGeometry args={[96, .22, 61]} /><meshStandardMaterial color={dark?'#627583':'#fafcfc'} roughness={dark?.42:.85} metalness={dark?.32:.1} /></mesh>
    <primitive object={building} /><TestCampusServices roofVisible roofDetail />
    <Parts parts={Array.from({length:40},(_,i)=>({p:[-46+i*2.35,4.5,30.78] as [number,number,number],s:[.11,7.8,.12] as [number,number,number]}))} color={dark?'#a0b1bf':'#ffffff'} metalness={.35} />
    <mesh position={[0,2.5,33.5]}><boxGeometry args={[13,5,6]} /><meshStandardMaterial color={dark?'#5d7384':'#eaf0f2'} roughness={.4} /></mesh>
    <mesh position={[0,2.6,36.55]}><boxGeometry args={[10,4,.1]} /><meshStandardMaterial color={dark?'#274c61':'#739aaa'} metalness={.35} roughness={.22} emissive={dark?'#233e46':'#000000'} emissiveIntensity={.25}/></mesh>
    <mesh position={[0,5.3,34]}><boxGeometry args={[16,.35,8]} /><meshStandardMaterial color={dark?'#8da1af':'#ffffff'} /></mesh>
    <mesh position={[-28,6.2,30.96]}><planeGeometry args={[22,5.3]} /><meshStandardMaterial map={logo} transparent alphaTest={.1} roughness={.7} /></mesh>
    <mesh position={[20,8.69,4]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[32,8]} /><meshStandardMaterial map={logo} transparent alphaTest={.1} roughness={.7} /></mesh>
    <CampusNightDetails dark={dark}/>
  </group></group>
}

