import {
  BoxSelect,
  Cable,
  Copy,
  Eye,
  Grid3X3,
  Layers,
  Maximize2,
  MousePointer2,
  Move,
  Redo2,
  RotateCw,
  Ruler,
  ScanLine,
  Trash2,
  Undo2,
} from 'lucide-react'
import type { SceneScope, WorkspaceMode } from '../domain'
import { prewarmScene,loadBimScene } from '../scene/loadScenes'
import { getCityByAdcode, getFacilityById, getProvinceByAdcode } from '../siteData'
import { useDesignerStore } from '../useDesignerStore'
import {useFoundationStore} from '../foundationData'

const modeLabels: Array<{ id: WorkspaceMode; label: string; available: boolean }> = [
  { id: 'layout', label: '布局', available: true },
  { id: 'connect', label: '连接', available: false },
  { id: 'analyse', label: '分析', available: true },
]

const scopeLabels: Array<{ id: SceneScope; label: string }> = [
  { id: 'china', label: '全球能源网' },
  { id: 'campus', label: '园区' },
  { id: 'room', label: '机房' },
]

export function CommandBar() {
  const dataVisible=useFoundationStore(s=>s.visible)
  const sceneScope = useDesignerStore((state) => state.sceneScope)
  const twinMode = useDesignerStore((state) => state.twinMode)
  const setTwinMode = useDesignerStore((state) => state.setTwinMode)
  const campusPresentation=useDesignerStore(s=>s.campusPresentation)
  const setCampusPresentation=useDesignerStore(s=>s.setCampusPresentation)
  const importedSiteName = useDesignerStore((state) => state.siteAssetName)
  const selectedCityAdcode = useDesignerStore((state) => state.selectedCityAdcode)
  const selectedFacilityId = useDesignerStore((state) => state.selectedFacilityId)
  const selectedProvinceAdcode = useDesignerStore((state) => state.selectedProvinceAdcode)
  const setSceneScope = useDesignerStore((state) => state.setSceneScope)
  const selectedId = useDesignerStore((state) => state.selectedId)
  const past = useDesignerStore((state) => state.past)
  const future = useDesignerStore((state) => state.future)
  const undo = useDesignerStore((state) => state.undo)
  const redo = useDesignerStore((state) => state.redo)
  const rotate = useDesignerStore((state) => state.rotateSelected)
  const duplicate = useDesignerStore((state) => state.duplicateSelected)
  const remove = useDesignerStore((state) => state.removeSelected)
  const workspaceMode = useDesignerStore((state) => state.workspaceMode)
  const setWorkspaceMode = useDesignerStore((state) => state.setWorkspaceMode)
  const viewMode = useDesignerStore((state) => state.viewMode)
  const setViewMode = useDesignerStore((state) => state.setViewMode)
  const showWalls = useDesignerStore((state) => state.showWalls)
  const toggleWalls = useDesignerStore((state) => state.toggleWalls)
  const showPipes = useDesignerStore((state) => state.showPipes)
  const togglePipes = useDesignerStore((state) => state.togglePipes)
  const selectedCity = getCityByAdcode(selectedCityAdcode)
  const selectedFacility = getFacilityById(selectedFacilityId)
  const selectedProvince = getProvinceByAdcode(selectedProvinceAdcode)
  const canEnterProvince = selectedProvinceAdcode === 320000 && Boolean(selectedProvince?.candidate)
  const canEnterCampus = canEnterProvince && Boolean(selectedCity?.candidate)
  const canEnterRoom = canEnterCampus && Boolean(selectedFacility?.enterable)

  const scopeAvailable = (scope: SceneScope) => (
    scope === 'china'
    || scope === 'province'
    || (scope === 'campus' && canEnterCampus)
    || (scope === 'room' && canEnterRoom)
    || scope === 'layout'
  )

  const scopeTitle = (scope: SceneScope) => {
    if (scope === 'china') return '查看全球能源网'
    if (scope === 'province') return '省级视图由全球能源网直接承载'
    if (scope === 'campus') return canEnterCampus ? '进入 Northbridge 园区' : '请先在省域选择南京市'
    return canEnterRoom ? '进入 Northbridge 新版机房' : '请先选择可进入的数据楼'
  }

  return (
    <div className="command-bar">
      <div className="segmented-control compact" role="group" aria-label="空间层级">
        {scopeLabels.map((scope) => (
          <button
            key={scope.id}
            type="button"
            className={!dataVisible&&sceneScope === scope.id ? 'is-selected' : ''}
            aria-pressed={!dataVisible&&sceneScope === scope.id}
            disabled={!scopeAvailable(scope.id)}
            title={scopeTitle(scope.id)}
            onPointerEnter={()=>{if(scopeAvailable(scope.id))prewarmScene(scope.id)}}
            onFocus={()=>{if(scopeAvailable(scope.id))prewarmScene(scope.id)}}
            onClick={() => {useFoundationStore.getState().close();setSceneScope(scope.id)}}
          >
            {scope.label}
          </button>
        ))}
        <button type="button" className={dataVisible?'is-selected':''} aria-pressed={dataVisible} onClick={()=>useFoundationStore.getState().open()}>基本信息</button>
      </div>
      {!dataVisible&&<div className="tool-divider" />}

      {dataVisible?<div className="toolbar-spacer"/>:sceneScope === 'layout' ? (
        <>
          <div className="tool-group">
            <button className={`tool-button ${workspaceMode === 'layout' ? 'is-active' : ''}`} type="button" title="选择与布局" aria-label="选择与布局" aria-pressed={workspaceMode === 'layout'} onClick={() => setWorkspaceMode('layout')}><MousePointer2 size={16} /></button>
            <button className="tool-button" type="button" title="移动工具暂未开放，请直接拖动设备" aria-label="移动工具暂未开放，请直接拖动设备" disabled><Move size={16} /></button>
            <button className="tool-button" type="button" title={selectedId ? '旋转所选设备 90°（R）' : '请先选择要旋转的设备'} aria-label="旋转所选设备 90 度" onClick={rotate} disabled={!selectedId}><RotateCw size={16} /></button>
            <button className="tool-button" type="button" title="测距工具暂未开放" aria-label="测距工具暂未开放" disabled><Ruler size={16} /></button>
            <button className="tool-button" type="button" title="端口连接模式将在后续版本开放" aria-label="端口连接模式将在后续版本开放" disabled><Cable size={16} /></button>
          </div>
          <div className="tool-divider" />
          <div className="tool-group">
            <button className="tool-button" type="button" title={past.length ? '撤销上一步（Ctrl+Z）' : '没有可撤销的操作'} aria-label="撤销上一步" onClick={undo} disabled={!past.length}><Undo2 size={16} /></button>
            <button className="tool-button" type="button" title={future.length ? '重做下一步（Ctrl+Shift+Z）' : '没有可重做的操作'} aria-label="重做下一步" onClick={redo} disabled={!future.length}><Redo2 size={16} /></button>
            <button className="tool-button" type="button" title={selectedId ? '复制所选设备（Ctrl+D）' : '请先选择要复制的设备'} aria-label="复制所选设备" onClick={duplicate} disabled={!selectedId}><Copy size={16} /></button>
            <button className="tool-button danger-hover" type="button" title={selectedId ? '删除所选设备（Delete）' : '请先选择要删除的设备'} aria-label="删除所选设备" onClick={remove} disabled={!selectedId}><Trash2 size={16} /></button>
          </div>
          <div className="tool-divider" />
          <div className="tool-group">
            <button className="tool-button" type="button" title="阵列工具暂未开放" aria-label="阵列工具暂未开放" disabled><Grid3X3 size={16} /></button>
            <button className="tool-button" type="button" title="框选工具暂未开放" aria-label="框选工具暂未开放" disabled><BoxSelect size={16} /></button>
            <button className="tool-button" type="button" title="适配视图暂未开放" aria-label="适配视图暂未开放" disabled><Maximize2 size={16} /></button>
          </div>
          <div className="toolbar-spacer" />
          <div className="segmented-control compact" role="group" aria-label="机房工作模式">
            {modeLabels.map((mode) => (
              <button key={mode.id} type="button" className={workspaceMode === mode.id ? 'is-selected' : ''} aria-pressed={workspaceMode === mode.id} title={mode.available ? `切换至${mode.label}模式` : `${mode.label}模式将在后续版本开放`} disabled={!mode.available} onClick={() => setWorkspaceMode(mode.id)}>
                {mode.label}
              </button>
            ))}
          </div>
          <div className="segmented-control view-control" role="group" aria-label="机房视图维度">
            <button type="button" className={viewMode === '3d' ? 'is-selected' : ''} aria-pressed={viewMode === '3d'} onClick={() => setViewMode('3d')}>3D</button>
            <button type="button" className={viewMode === '2d' ? 'is-selected' : ''} aria-pressed={viewMode === '2d'} onClick={() => setViewMode('2d')}>2D</button>
          </div>
          <button className={`tool-button wide ${showWalls ? 'is-active' : ''}`} type="button" title={showWalls ? '隐藏墙体' : '显示墙体'} aria-pressed={showWalls} onClick={toggleWalls}><Eye size={16} />墙体</button>
          <button className={`tool-button wide ${showPipes ? 'is-active' : ''}`} type="button" title={showPipes ? '隐藏管线图层' : '显示管线图层'} aria-pressed={showPipes} onClick={togglePipes}><Layers size={16} />图层</button>
          <button className="tool-button" type="button" title="场景扫描暂未开放" aria-label="场景扫描暂未开放" disabled><ScanLine size={16} /></button>
        </>
      ) : sceneScope === 'campus' || sceneScope === 'room' ? (
        <>{sceneScope==='campus'&&<div className="segmented-control" role="group" aria-label="园区呈现方式"><button type="button" className={campusPresentation==='map'?'is-selected':''} aria-pressed={campusPresentation==='map'} onClick={()=>setCampusPresentation('map')}>地理园区</button><button type="button" className={campusPresentation==='model'?'is-selected':''} aria-pressed={campusPresentation==='model'} onClick={()=>setCampusPresentation('model')}>三维仿真</button></div>}<div className="segmented-control" role="group" aria-label="数字孪生工作模式"><button type="button" className={twinMode === 'browse' ? 'is-selected' : ''} aria-pressed={twinMode === 'browse'} onClick={() => setTwinMode('browse')}>浏览</button><button type="button" className={twinMode === 'operate' ? 'is-selected' : ''} aria-pressed={twinMode === 'operate'} onClick={() => setTwinMode('operate')}>运营仿真</button></div><div className="toolbar-spacer" /></>
      ) : (
        <>
          <div className="toolbar-spacer" />
          
        </>
      )}
    </div>
  )
}
