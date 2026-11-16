import { useEffect, useRef, useState } from 'react'
import { useEquipmentStore } from '../useEquipmentStore'
import { useOperationsStore } from '../useOperationsStore'
import { useDesignerStore } from '../useDesignerStore'
import './equipment-panel.css'
import {DeviceLibrary,DeviceWiring,MovementControls} from './EquipmentWorkbench'

import { KIND_LABEL as kindLabel } from '../equipmentModel'

export function EquipmentPanel(){
  const equipment=useEquipmentStore(),ops=useOperationsStore(),d=equipment.layout[equipment.selectedId]
  const panelRef=useRef<HTMLElement>(null)
  const [tab,setTab]=useState<'properties'|'library'|'wiring'>('properties')
  useEffect(()=>{const open=()=>setTab('library');document.addEventListener('equipment-library-open',open);return ()=>document.removeEventListener('equipment-library-open',open)},[])
  useEffect(()=>{const open=(e:Event)=>setTab((e as CustomEvent).detail);document.addEventListener('equipment-workbench-open',open);return ()=>document.removeEventListener('equipment-workbench-open',open)},[])
  useEffect(()=>{panelRef.current?.scrollTo({top:0})},[tab,d.id])
  const [search,setSearch]=useState(''),[capacity,setCapacity]=useState(d.capacity)
  const [bay,setBay]=useState(0),[target,setTarget]=useState('R-A02'),[targetBay,setTargetBay]=useState(0)
  const [position,setPosition]=useState({x:d.x,z:d.z}),file=useRef<HTMLInputElement>(null)
  useEffect(()=>{setCapacity(d.capacity)},[d.id,d.capacity])
  useEffect(()=>{setPosition({x:d.x,z:d.z})},[d.id,d.x,d.z])
  useEffect(()=>{if(target===d.id)setTarget(Object.values(equipment.layout).find(r=>r.kind==='rack'&&r.id!==d.id)!.id)},[d.id,target,equipment.layout])
  const frameRack=ops.frame.racks.find(r=>r.id===d.id)
  const simulate=()=>{if(d.kind==='rack')ops.selectRack(d.id);equipment.setEditMode(false);useDesignerStore.getState().setTwinMode('operate')}
  const download=()=>{const url=URL.createObjectURL(new Blob([equipment.exportLayout()],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='northbridge-equipment-layout.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  if(!equipment.editMode||!equipment.panelOpen)return null
  return <aside ref={panelRef} className="equipment-panel" aria-label="机房设备编辑">
    <header><div><strong>设备属性</strong></div><button aria-label="关闭设备工作台" onClick={()=>{equipment.setPanelOpen(false);equipment.setMovement(null);if(useDesignerStore.getState().twinMode==='operate')equipment.setEditMode(false)}}>×</button></header>
    <div className="workbench-tabs"><button aria-pressed={tab==='properties'} onClick={()=>setTab('properties')}>属性 / 移动</button><button aria-pressed={tab==='library'} onClick={()=>setTab('library')}>设备库</button><button aria-pressed={tab==='wiring'} onClick={()=>setTab('wiring')}>接线</button></div>
    {tab==='library'?<DeviceLibrary onProperties={()=>setTab('properties')}/>:tab==='wiring'?<DeviceWiring device={d}/>:<>
    <input className="equipment-search" aria-label="搜索设备" placeholder="搜索编号或设备类型…" value={search} onChange={e=>setSearch(e.target.value)}/>
    <label>选择设备<select aria-label="编辑设备" value={d.id} onChange={e=>equipment.select(e.target.value)}>{Object.values(equipment.layout).filter(item=>!item.deleted&&(item.id===d.id||`${item.id} ${kindLabel[item.kind]}`.toLowerCase().includes(search.toLowerCase()))).map(item=><option key={item.id} value={item.id}>{item.id} · {kindLabel[item.kind]}{item.installed?'':' · 设备库'}</option>)}</select></label>
    <div className="equipment-title"><strong>{d.id}</strong><span>{d.kind==='rack'?(d.coolingMode==='air'?'风冷机柜':'液冷背板机柜'):kindLabel[d.kind]} · {d.installed?'已安装':'已拆卸'}</span></div>
    <div className="equipment-actions"><button onClick={()=>equipment.focus(d.id)} disabled={!d.installed}>定位设备</button><button onClick={()=>d.installed?equipment.install(d.id,false):equipment.beginInstall(d.id)}>{d.installed?'拆卸设备':'点击空地安装'}</button><button onClick={()=>equipment.patch(d.id,{enabled:!d.enabled})}>{d.enabled?'关闭设备':'启动设备'}</button></div>
    <MovementControls device={d}/>
    <section><h4>位置与朝向</h4><div className="equipment-coordinates"><label>X / m<input aria-label="设备 X 坐标" type="number" step=".05" value={position.x} onChange={e=>setPosition({...position,x:Number(e.target.value)})}/></label><label>Z / m<input aria-label="设备 Z 坐标" type="number" step=".05" value={position.z} onChange={e=>setPosition({...position,z:Number(e.target.value)})}/></label></div><div className="equipment-actions"><button onClick={()=>equipment.move(d.id,position.x,position.z)}>应用位置</button><button onClick={()=>equipment.move(d.id,d.x,d.z,d.yaw+Math.PI/2)}>旋转 90°</button></div></section>
    {d.kind!=='rack'&&d.kind!=='pipe'&&<section><h4>额定参数</h4><label>{d.kind==='battery'?'电池容量 / kWh':['chw-pump','cw-pump'].includes(d.kind)?'泵额定流量 / m³/h':d.kind==='network'?'网络容量 / Gb/s':'额定容量 / kW'}<input type="number" aria-label="设备额定容量" min={1} max={100000} value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label><button onClick={()=>equipment.setCapacity(d.id,capacity)}>应用设备参数</button></section>}
    {d.kind==='rack'&&<>
      <section><h4>机柜装配 <span>{d.modules.filter(Boolean).length*2+2} / 42 U</span></h4><p>20 × 2U 服务器 + 1U 交换机 + 1U 配线架</p><div className="equipment-bays" role="group" aria-label="服务器槽位">{d.modules.map((present,i)=><button key={i} aria-label={`服务器槽 ${i+1}${present?' 已安装':' 空槽'}`} aria-pressed={bay===i} data-present={present} onClick={()=>setBay(i)}><span>{String(i+1).padStart(2,'0')}</span>{present?'2U':'空'}</button>)}</div><div className="equipment-actions"><button disabled={!d.installed} onClick={()=>equipment.patch(d.id,{doorOpen:!d.doorOpen})}>{d.doorOpen?'关闭机柜门':'打开机柜门'}</button><button disabled={!d.installed||!d.modules[bay]} onClick={()=>{equipment.patch(d.id,{extracted:d.extracted===bay?null:bay});equipment.focus(d.id,bay)}}>{d.extracted===bay?'推入服务器':'抽出服务器'}</button><button disabled={!d.installed} onClick={()=>equipment.module(d.id,bay,!d.modules[bay])}>{d.modules[bay]?'拆卸服务器':'安装服务器'}</button></div>
      <label>移装到机柜<select aria-label="服务器移装目标" value={target} onChange={e=>setTarget(e.target.value)}>{Object.values(equipment.layout).filter(r=>!r.deleted&&r.kind==='rack'&&r.id!==d.id).map(r=><option key={r.id} value={r.id}>{r.id} · {r.modules.filter(v=>!v).length} 空槽</option>)}</select></label><label>目标槽位<select aria-label="移装目标槽位" value={targetBay} onChange={e=>setTargetBay(Number(e.target.value))}>{Array.from({length:20},(_,i)=><option key={i} value={i}>{i+1} · {equipment.layout[target]?.modules[i]?'已占用':'空槽'}</option>)}</select></label><button className="equipment-wide" onClick={()=>equipment.transfer(d.id,bay,target,targetBay)}>移装当前服务器</button></section>
      <section><h4>供电 / 网络 / 冷却连接</h4>{([['powerA','PDU A 路'],['powerB','PDU B 路'],['cooling',d.coolingMode==='air'?'风冷送风通道':'液冷供回水'],['network','ToR 网络上联']] as const).map(([key,label])=><label className="equipment-connection" key={key}><span>{label}</span><input type="checkbox" checked={d[key]} onChange={e=>equipment.patch(d.id,{[key]:e.target.checked})}/></label>)}</section>
    </>}
    {!frameRack&&ops.frame.runtime[d.id]&&<div className="equipment-runtime"><span>运行状态<strong>{ops.frame.runtime[d.id].state}</strong></span><span>功率 / 输送功率<strong>{ops.frame.runtime[d.id].powerKw.toFixed(1)} kW</strong></span><span>流量<strong>{ops.frame.runtime[d.id].flowM3h.toFixed(1)} m³/h</strong></span><span>温度<strong>{ops.frame.runtime[d.id].temperatureC?.toFixed(1)??'—'} °C</strong></span></div>}
    {frameRack&&<div className="equipment-live"><span>机柜功率<strong>{frameRack.powerKw.toFixed(1)} kW</strong></span><span>在线服务器<strong>{frameRack.onlineServers} / 20</strong></span><span>进风温度<strong>{frameRack.inletC.toFixed(1)} °C</strong></span><span>冷却流量<strong>{frameRack.flowLpm.toFixed(0)} L/min</strong></span></div>}
    <section><h4>设备库 · 拖入场景安装</h4><div className="equipment-library">{Object.values(equipment.layout).filter(item=>!item.installed).map(item=><button key={item.id} draggable onDragStart={e=>{e.dataTransfer.setData('application/x-equipment-id',item.id);equipment.beginInstall(item.id)}} onDragEnd={()=>{if(useEquipmentStore.getState().placementId)equipment.cancelPlacement()}} onClick={()=>equipment.beginInstall(item.id)}>{item.id}<span>{kindLabel[item.kind]}</span></button>)}</div>{Object.values(equipment.layout).every(item=>item.installed)&&<small>设备均已安装。选中设备拆卸后，可拖入空地重新布置。</small>}</section>
    </>}
    {equipment.message&&<p className="equipment-message" role="status">{equipment.message}</p>}
    <div className="equipment-actions"><button onClick={equipment.undo} disabled={!equipment.history.length}>撤销操作</button><button onClick={equipment.reset}>恢复满配布局</button></div>
    <div className="equipment-actions"><button onClick={download}>导出布局</button><button onClick={()=>file.current?.click()}>导入布局</button></div><input hidden type="file" ref={file} accept=".json" onChange={async e=>{const f=e.target.files?.[0];if(f)equipment.importLayout(await f.text());e.target.value=''}}/>
    <button className="equipment-simulate" onClick={simulate}>进入运行仿真 →</button>
    
  </aside>
}
