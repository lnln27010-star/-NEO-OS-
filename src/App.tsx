import { lazy, Suspense, useEffect, useState } from 'react'
import {usePortalStore} from './usePortalStore'
import {useEngineeringStore} from './useEngineeringStore'
import {useFoundationStore} from './foundationData'
import './components/foundation-workspace.css'
import './components/centers.css'
import {useBuildRefresh} from './useBuildRefresh'
import { SceneBoundary } from './components/SceneBoundary'
import { MonitorUp } from 'lucide-react'
import { AppNav } from './components/AppNav'
import { CommandBar } from './components/CommandBar'
import { HeaderBar } from './components/HeaderBar'
import { ProvinceBottomPanel, ProvinceLeftPanel, ProvinceRightPanel } from './components/ProvincePanels'
import { SpatialScopeStatusBar } from './components/SpatialScopeStatusBar'
import { StatusBar } from './components/StatusBar'
import { Toast } from './components/Toast'
import { ViewportChrome } from './components/ViewportChrome'
import { ROOM } from './domain'
import {loadEnergyScene,loadAmapScene,loadBimScene,loadLayoutScene,loadProvinceScene} from './scene/loadScenes'
import { useDesignerStore } from './useDesignerStore'
import { useVisualTheme } from './useVisualTheme'
import './scene/campus-atlas.css'

const CenterWorkspace=lazy(()=>import('./components/CenterWorkspace').then(m=>({default:m.CenterWorkspace})))
const ChinaMapViewport=lazy(()=>loadEnergyScene().then(m=>({default:m.ChinaMapViewport})))
const AmapCampusViewport=lazy(()=>loadAmapScene().then(m=>({default:m.AmapCampusViewport})))
const CampusViewport=lazy(()=>loadBimScene().then(m=>({default:m.CampusViewport})))
const DataCenterViewport=lazy(()=>loadLayoutScene().then(m=>({default:m.DataCenterViewport})))
const ProvinceMapViewport=lazy(()=>loadProvinceScene().then(m=>({default:m.ProvinceMapViewport})))
const AssetLibrary=lazy(()=>import('./components/AssetLibrary').then(m=>({default:m.AssetLibrary})))
const Inspector=lazy(()=>import('./components/Inspector').then(m=>({default:m.Inspector})))
const BottomPanel=lazy(()=>import('./components/BottomPanel').then(m=>({default:m.BottomPanel})))
const FoundationWorkspace=lazy(()=>import('./components/FoundationWorkspace').then(m=>({default:m.FoundationWorkspace})))

function App() {
  useBuildRefresh()
  const center=usePortalStore(s=>s.center)
  useEffect(()=>{if(new URLSearchParams(window.location.search).get('center')==='dashboard')usePortalStore.getState().setCenter('assets')},[])
  const navExpanded=usePortalStore(s=>s.navExpanded)
  const dataVisible=useFoundationStore(s=>s.visible)
  const [dataVisited,setDataVisited]=useState(dataVisible)
  const [sceneEntered,setSceneEntered]=useState(!dataVisible)
  useEffect(()=>{if(dataVisible)setDataVisited(true)},[dataVisible])
  useEffect(()=>{if(!dataVisible)setSceneEntered(true)},[dataVisible])
  useEffect(()=>{if(center==='simulation'){useDesignerStore.getState().setTwinMode('operate');useEngineeringStore.getState().setVisible(true)}},[center])
  const theme = useVisualTheme(s => s.theme)
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 639px)').matches)
  const sceneScope = useDesignerStore((state) => state.sceneScope)
  const campusPresentation = useDesignerStore(s=>s.campusPresentation)
  const mountedScope = sceneScope
  const [visited, setVisited] = useState(() => new Set([sceneScope]))
  const [campusVisited,setCampusVisited]=useState(()=>new Set<string>(sceneScope==='campus'?[campusPresentation]:sceneScope==='room'?['model']:[]))
  const rotate = useDesignerStore((state) => state.rotateSelected)
  const remove = useDesignerStore((state) => state.removeSelected)
  const duplicate = useDesignerStore((state) => state.duplicateSelected)
  const undo = useDesignerStore((state) => state.undo)
  const redo = useDesignerStore((state) => state.redo)
  const placementPreview = useDesignerStore((state) => state.placementPreview)
  const rotatePlacementPreview = useDesignerStore((state) => state.rotatePlacementPreview)
  const cancelPlacement = useDesignerStore((state) => state.cancelPlacement)
  const nudgeSelected = useDesignerStore((state) => state.nudgeSelected)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)')
    const update = () => setIsNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // Mount a scene on first visit and keep its camera/state across navigation.
  useEffect(() => {
    setVisited((current) => current.has(sceneScope) ? current : new Set([...current, sceneScope]))
    const presentation=sceneScope==='campus'?campusPresentation:sceneScope==='room'?'model':null
    if(presentation)setCampusVisited(current=>current.has(presentation)?current:new Set([...current,presentation]))
  }, [sceneScope,campusPresentation])

  useEffect(() => {
    if (dataVisible || isNarrow || sceneScope !== 'layout'||center!=='assets'&&center!=='simulation') return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'Escape' && placementPreview) {
        event.preventDefault()
        cancelPlacement()
        return
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        placementPreview ? rotatePlacementPreview() : rotate()
      }
      if (!placementPreview && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault()
        const step = event.shiftKey ? ROOM.tile : ROOM.grid
        if (event.key === 'ArrowLeft') nudgeSelected(-step, 0)
        if (event.key === 'ArrowRight') nudgeSelected(step, 0)
        if (event.key === 'ArrowUp') nudgeSelected(0, -step)
        if (event.key === 'ArrowDown') nudgeSelected(0, step)
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        remove()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicate()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? redo() : undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cancelPlacement, duplicate, isNarrow, nudgeSelected, placementPreview, redo, remove, rotate, rotatePlacementPreview, sceneScope, center, undo, dataVisible])

  if (isNarrow) {
    return (
      <div className="mobile-guard" role="status">
        <div className="mobile-guard-icon"><MonitorUp size={28} /></div>
        <strong>请使用桌面端打开设计器</strong>
        <span>三维机房搭建需要宽屏、鼠标或触控板。当前窄屏仅提供使用说明，完整编辑请使用宽度至少 1024px 的屏幕。</span>
      </div>
    )
  }

  if(center!=='assets'&&center!=='simulation')return <div data-nav-expanded={navExpanded} data-theme={theme} className="app-shell platform-shell"><HeaderBar/><div className="app-content"><AppNav/><Suspense fallback={<div className="scene-module-loading">加载业务中心…</div>}><CenterWorkspace/></Suspense></div></div>
  return (
    <div data-nav-expanded={navExpanded} data-theme={theme} className={`app-shell platform-shell ${sceneScope === 'china' ? 'is-energy-workspace' : ''} ${sceneScope === 'campus' || sceneScope === 'room' ? 'is-bim-workspace' : ''}`}>
      <HeaderBar />
      {(dataVisited||dataVisible)&&<Suspense fallback={dataVisible?<div className="scene-module-loading">正在读取基础数据…</div>:null}><FoundationWorkspace/></Suspense>}
      <div className="app-content">
        <AppNav />
        <main className="workspace">
          <CommandBar />
          {sceneEntered&&<>
          <div inert={dataVisible} className={`designer-grid ${mountedScope === 'china' ? 'is-global-map' : ''} ${mountedScope ? '' : 'is-switching'}`}>
            {mountedScope === 'province' && <ProvinceLeftPanel />}
            {mountedScope === 'layout' && <Suspense fallback={null}><AssetLibrary /></Suspense>}
            <section className="viewport-shell">
              <div className="viewport-scene-stack">
                <div className={`viewport-scene-pane ${mountedScope === 'china' ? 'is-active' : ''}`}><SceneBoundary><Suspense fallback={<div className="scene-module-loading" role="status">正在准备能源地图…</div>}>{(visited.has('china') || mountedScope==='china') && <ChinaMapViewport />}</Suspense></SceneBoundary></div>
                <div className={`viewport-scene-pane ${mountedScope === 'province' ? 'is-active' : ''}`}><SceneBoundary><Suspense fallback={<div className="scene-module-loading" role="status">正在准备省域场景…</div>}>{(visited.has('province') || mountedScope==='province') && <ProvinceMapViewport />}</Suspense></SceneBoundary></div>
                <div className={`viewport-scene-pane ${mountedScope==='campus'&&campusPresentation==='map'?'is-active':''}`}><SceneBoundary><Suspense fallback={<div className="scene-module-loading" role="status">正在准备园区场景…</div>}>{(campusVisited.has('map') || mountedScope==='campus' && campusPresentation==='map')&&<AmapCampusViewport/>}</Suspense></SceneBoundary></div>
                <div className={`viewport-scene-pane ${mountedScope==='room'||mountedScope==='campus'&&campusPresentation==='model'?'is-active':''}`}><SceneBoundary><Suspense fallback={<div className="scene-module-loading" role="status">正在准备三维模型…</div>}>{(campusVisited.has('model') || mountedScope==='room' || mountedScope==='campus' && campusPresentation==='model')&&<CampusViewport active={!dataVisible&&(mountedScope==='room'||mountedScope==='campus'&&campusPresentation==='model')}/>}</Suspense></SceneBoundary></div>
                <div className={`viewport-scene-pane ${mountedScope === 'layout' ? 'is-active' : ''}`}><SceneBoundary><Suspense fallback={<div className="scene-module-loading" role="status">正在准备布局编辑器…</div>}>{(visited.has('layout') || mountedScope==='layout') && <DataCenterViewport />}</Suspense></SceneBoundary></div>
              </div>
              {mountedScope === 'layout' && <ViewportChrome />}
              {!mountedScope && <div className="scene-switching-state">切换场景…</div>}
            </section>
            {mountedScope === 'province' && <ProvinceRightPanel />}
            {mountedScope === 'layout' && <Suspense fallback={null}><Inspector /></Suspense>}
            {mountedScope === 'province' && <ProvinceBottomPanel />}
            {mountedScope === 'layout' && <Suspense fallback={null}><BottomPanel /></Suspense>}
          </div>
          {sceneScope === 'layout' ? <StatusBar /> : sceneScope === 'campus' || sceneScope === 'room' ? null : sceneScope === 'china' ? null : <SpatialScopeStatusBar />}
          </>}
        </main>
      </div>
      <Toast />
    </div>
  )
}

export default App
