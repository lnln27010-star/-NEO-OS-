import {useState} from 'react'
import {Plus,PlugZap,Box,Trash2,Move3d,ArrowUp,ArrowDown,ArrowLeft,ArrowRight,Check} from 'lucide-react'
import {KIND_LABEL,PODS,type DeviceKind,type Equipment} from '../equipmentModel'
import {connections,ports,candidates,PORT_NAMES} from '../equipmentConnections'
import {useEquipmentStore} from '../useEquipmentStore'
import {useOperationsStore} from '../useOperationsStore'
import './equipment-workbench.css'

export function DeviceLibrary({onProperties}:{onProperties:()=>void}){
  const store=useEquipmentStore(),[kind,setKind]=useState<DeviceKind>('rack'),[mode,setMode]=useState<'air'|'liquid'>('air'),[pod,setPod]=useState(0),[bus,setBus]=useState<'A'|'B'>('A')
  return <div className="device-library">
    <div className="device-kind-grid">{(Object.keys(KIND_LABEL) as DeviceKind[]).map(k=><button key={k} aria-pressed={kind===k} onClick={()=>setKind(k)}><Box size={15}/><span>{KIND_LABEL[k]}</span></button>)}</div>
    <section><h4>新增配置</h4>{kind==='rack'&&<label>散热方式<select aria-label="新增机柜散热方式" value={mode} onChange={e=>setMode(e.target.value as 'air'|'liquid')}><option value="air">风冷机柜 · 42U 满配</option><option value="liquid">液冷背板机柜 · 42U 满配</option></select></label>}
    {['transformer','lv-panel','ups','battery','busbar'].includes(kind)&&<label>供电路别<select aria-label="新增设备供电路别" value={bus} onChange={e=>setBus(e.target.value as 'A'|'B')}><option value="A">A 路</option><option value="B">B 路</option></select></label>}
    <label>所属区域<select aria-label="新增设备所属区域" value={pod} onChange={e=>setPod(Number(e.target.value))}>{PODS.map((p,i)=><option key={p.name} value={i}>{p.name}</option>)}</select></label>
    <button className="equipment-simulate" onClick={()=>{const id=store.addDevice(kind,mode,pod,bus);store.beginInstall(id);onProperties()}}><Plus size={14}/>新增并放置</button></section>
    <section><h4>待安装设备</h4>{Object.values(store.layout).filter(d=>!d.installed&&!d.deleted).map(d=><button className="library-item" key={d.id} onClick={()=>{store.beginInstall(d.id);onProperties()}}><Box size={14}/><span>{d.id}<small>{KIND_LABEL[d.kind]}</small></span><Plus size={14}/></button>)}</section>
  </div>
}
export function DeviceWiring({device:d}:{device:Equipment}){
  const store=useEquipmentStore(),frame=useOperationsStore(s=>s.frame),c=connections(d)
  return <div className="device-wiring"><div className="wiring-device"><PlugZap size={22}/><strong>{d.id}</strong><small>{KIND_LABEL[d.kind]}</small></div>
    {ports(d).length===0?<p className="port-root">{d.kind==='transformer'?'市电接入点':'备用电源接入点'}</p>:ports(d).map(port=>{const source=c[port]??'',s=store.layout[source],live=s?.installed&&s.enabled&&!s.deleted
      return <section key={port} className="wiring-port" data-connected={Boolean(source)}><h4><i data-live={Boolean(live)}/>{d.kind==='generator'?`发电输出 ${port==='powerA'?'A':'B'}`:PORT_NAMES[port]}<span>{source?live?'已连接':'上游停用':'未连接'}</span></h4><select aria-label={`${PORT_NAMES[port]}接线`} value={source} onChange={e=>store.connect(d.id,port,e.target.value)}><option value="">断开 / 未接线</option>{candidates(store.layout,d,port).map(s=><option key={s.id} value={s.id}>{s.id} · {KIND_LABEL[s.kind]}{s.installed?'':' · 待安装'}</option>)}</select>{source&&<div className="port-route"><span>{source}</span><i/><span>{d.id}</span></div>}</section>
    })}
    <section><h4>下游设备</h4><div className="connection-downstream">{Object.values(store.layout).filter(s=>!s.deleted&&Object.values(connections(s)).includes(d.id)).map(s=><button key={s.id} onClick={()=>store.select(s.id)}>{s.id}</button>)}</div></section>
    <div className="wiring-runtime"><span>运行状态</span><strong>{d.installed?frame.runtime[d.id]?.state??'未连接':'待安装'}</strong></div>
  </div>
}
export function MovementControls({device:d}:{device:Equipment}){
  const store=useEquipmentStore(),[step,setStep]=useState(.25),moving=store.movementId===d.id
  return <section className="movement-controls"><h4>位置操作</h4><div className="equipment-actions"><button disabled={!d.installed} aria-pressed={moving} onClick={()=>store.setMovement(moving?null:d.id)}><Move3d size={13}/>{moving?'结束移动':'移动设备'}</button><button onClick={()=>store.removeDevice(d.id)}><Trash2 size={13}/>删除设备</button></div>
    {moving&&<><div className="nudge-controls"><button aria-label="沿 Z 负向移动" onClick={()=>store.move(d.id,d.x,d.z-step)}><ArrowUp size={16}/></button><button aria-label="沿 X 负向移动" onClick={()=>store.move(d.id,d.x-step,d.z)}><ArrowLeft size={16}/></button><button aria-label="完成移动" onClick={()=>store.setMovement(null)}><Check size={16}/></button><button aria-label="沿 X 正向移动" onClick={()=>store.move(d.id,d.x+step,d.z)}><ArrowRight size={16}/></button><button aria-label="沿 Z 正向移动" onClick={()=>store.move(d.id,d.x,d.z+step)}><ArrowDown size={16}/></button></div><label>移动步长<select aria-label="移动步长" value={step} onChange={e=>setStep(Number(e.target.value))}><option value={.05}>5 cm</option><option value={.25}>25 cm</option><option value={1}>1 m</option></select></label><small>拖动轴箭头移动 · Esc 结束</small></>}
  </section>
}
