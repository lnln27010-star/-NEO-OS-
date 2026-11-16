import {Box,Map,Move3d,PanelRightOpen,Tags,Magnet,Zap,Droplets,Flame,Network,Pause,Play,Building2,Eye,Blend,Plus,PlugZap,Cpu} from 'lucide-react'
import {useFlowStore,FLOW_LABELS} from '../useFlowStore'
import type {FlowChannel} from '../facilityTopology'
import {useEquipmentStore} from '../useEquipmentStore'
import {useOperationsStore} from '../useOperationsStore'
import {useDesignerStore} from '../useDesignerStore'
import {useEngineeringStore} from '../useEngineeringStore'
import {useActiveEngineeringResult} from '../useActiveEngineeringResult'
import './facility-toolbar.css'
import './facility-premium.css'
const icons={power:Zap,water:Droplets,heat:Flame,information:Network}
export function FacilityToolbar({plan,exterior,onPlan,onPerspective,onExterior,onInterior}:{plan:boolean;exterior:boolean;onPlan:()=>void;onPerspective:()=>void;onExterior:()=>void;onInterior:()=>void}){
  const flow=useFlowStore(),equipment=useEquipmentStore(),frame=useOperationsStore(s=>s.frame),operating=useDesignerStore(s=>s.twinMode==='operate')
  const engineeringResult=useActiveEngineeringResult()
  const sidePanel=engineeringResult?false:equipment.editMode?equipment.panelOpen:operating
  const open=(tab:'library'|'properties'|'wiring')=>{equipment.setEditMode(true);equipment.setPanelOpen(true);document.dispatchEvent(new CustomEvent('equipment-workbench-open',{detail:tab}))}
  return <>
    <div className="facility-editor-actions" role="toolbar" aria-label="设备设计工作台"><button className="editor-action-create" onClick={()=>open('library')}><span className="editor-action-symbol"><Plus size={15}/></span>新增设备</button><button onClick={()=>open('wiring')}><PlugZap size={14}/>设备接线</button><button aria-pressed={Boolean(equipment.movementId)} onClick={()=>{open('properties');equipment.setMovement(equipment.movementId?null:equipment.selectedId)}}><Move3d size={14}/>{equipment.movementId?'结束移动':'移动设备'}</button><i className="editor-action-divider" aria-hidden="true"/><button className="editor-action-sim" aria-pressed={operating} onClick={()=>{equipment.setEditMode(false);useDesignerStore.getState().setTwinMode('operate')}}><Play size={14}/>运行推演</button><button onClick={()=>{equipment.setEditMode(false);useDesignerStore.getState().setTwinMode('operate');useEngineeringStore.getState().setVisible(true)}}><Cpu size={14}/>工程求解</button></div>
    <div className="facility-kpis" data-panel={sidePanel} aria-label="运行指标">
      {engineeringResult?engineeringResult.metrics.slice(0,4).map(m=><div key={m.key}><small>{m.label}</small><strong>{m.value.toLocaleString('zh-CN',{maximumFractionDigits:3})}<em>{m.unit}</em></strong></div>):<><div><small>IT 功率</small><strong>{(frame.totalPowerKw/1000).toFixed(2)}<em>MW</em></strong></div>
      <div><small>设施功率</small><strong>{(frame.facilityPowerKw/1000).toFixed(2)}<em>MW</em></strong></div>
      <div><small>最高进风</small><strong>{frame.maxInletC.toFixed(1)}<em>°C</em></strong></div>
      <div><small>业务吞吐</small><strong>{frame.networkThroughputTbps.toFixed(1)}<em>Tb/s</em></strong></div></>}
    </div>
    <nav className="facility-command-dock" aria-label="场景控制">
      <div className="dock-section"><button aria-label="俯视布局" title="俯视布局" aria-pressed={plan} onClick={onPlan}><Map size={17}/></button><button aria-label="三维总览" title="三维总览" aria-pressed={!plan&&!exterior} onClick={onPerspective}><Box size={17}/></button><button aria-label="建筑外观" title="建筑外观" aria-pressed={exterior} onClick={onExterior}><Building2 size={17}/></button><button aria-label="机房通道" title="机房通道" onClick={onInterior}><Eye size={17}/></button></div>
      <div className="dock-section"><button aria-label="设备拖动" title="设备拖动" aria-pressed={Boolean(equipment.movementId)} onClick={()=>{equipment.setMovement(equipment.movementId?null:equipment.selectedId);equipment.setPanelOpen(true)}}><Move3d size={17}/></button><button aria-label="自动对齐" title="自动对齐 · Shift 临时取消" aria-pressed={equipment.autoAlign} onClick={()=>equipment.setAutoAlign(!equipment.autoAlign)}><Magnet size={17}/></button><button aria-label="设备名称" title="设备名称" aria-pressed={equipment.showNames} onClick={()=>equipment.setShowNames(!equipment.showNames)}><Tags size={17}/></button></div>
      <div className="dock-section" role="group" aria-label="四类流动展示">{(Object.keys(FLOW_LABELS) as FlowChannel[]).map(channel=>{const Icon=icons[channel];return <button key={channel} data-flow={channel} aria-label={FLOW_LABELS[channel]} title={FLOW_LABELS[channel]} aria-pressed={flow.channels[channel]} onClick={()=>flow.toggle(channel)}><Icon size={17}/></button>})}<button aria-label={flow.animate?'暂停流动':'播放流动'} title={flow.animate?'暂停流动':'播放流动'} onClick={()=>flow.setAnimate(!flow.animate)}>{flow.animate?<Pause size={16}/>:<Play size={16}/>}</button></div>
      <div className="dock-section"><button aria-label="外墙透视" title="外墙透视" aria-pressed={equipment.transparentWalls} onClick={()=>equipment.setTransparentWalls(!equipment.transparentWalls)}><Blend size={17}/></button><button aria-label="新增设备" title="新增设备" onClick={()=>{equipment.setEditMode(true);equipment.setPanelOpen(true);document.dispatchEvent(new Event('equipment-library-open'))}}><Plus size={17}/></button><button aria-label="设备工作台" title="设备工作台" aria-pressed={equipment.panelOpen&&equipment.editMode} onClick={()=>{equipment.setEditMode(true);equipment.setPanelOpen(!equipment.panelOpen)}}><PanelRightOpen size={17}/></button></div>
    </nav>
  </>
}
