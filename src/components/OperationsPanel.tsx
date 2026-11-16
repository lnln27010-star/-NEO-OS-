import { AlertTriangle, ArrowLeft, LocateFixed, Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { DURATION, FAULT_AT, MODEL_VERSION } from '../operationsModel'
import type { Scenario } from '../operationsModel'
import { useOperationsStore } from '../useOperationsStore'
import { useEquipmentStore } from '../useEquipmentStore'
import {useEngineeringStore} from '../useEngineeringStore'

export function OperationsPanel({ enabled, onBrowse }: { enabled: boolean; onBrowse: () => void }) {
  const ops = useOperationsStore()
  const layout=useEquipmentStore(s=>s.layout)
  const exportReport=()=>{
    const frames=ops.reportFrames()
    const url=URL.createObjectURL(new Blob([JSON.stringify({model:MODEL_VERSION,assumptions:'简化双路供电、水侧热平衡、经验空气温升；非 CFD 或实测遥测',parameters:ops.parameters,layout,events:ops.events,frames},null,2)],{type:'application/json'}))
    const a=document.createElement('a');a.href=url;a.download=`northbridge-${ops.scenario}-simulation.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  const rack = ops.frame.racks.find((item) => item.id === ops.selectedRackId) ?? ops.frame.racks[0]
  const feeder = rack?ops.frame.feeders[rack.row]:undefined
  const deviceRef = useRef<HTMLElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const previousRack = useRef(ops.selectedRackId)
  const previousFocus = useRef(ops.focusSequence)
  useEffect(() => {
    if (previousRack.current !== ops.selectedRackId || previousFocus.current !== ops.focusSequence) {
      deviceRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
    previousRack.current = ops.selectedRackId; previousFocus.current = ops.focusSequence
  }, [ops.selectedRackId, ops.focusSequence])
  const statusLabels = { idle: '待运行', running: '运行中', paused: '已暂停', complete: '已完成' }
  if (!enabled) return <aside className="ops-panel" aria-label="新版机房运营仿真"><header><strong>设备未绑定</strong><button onClick={onBrowse}>返回浏览</button></header><p className="ops-unavailable" role="status">模型未就绪或没有设备绑定。请加载已绑定设备的场景。</p></aside>
  return <>
    <aside ref={panelRef} className="ops-panel" aria-label="新版机房运营仿真" data-frame={ops.seconds}>
      <header><strong>运行推演</strong><button type="button" onClick={()=>useEngineeringStore.getState().setVisible(true)}>工程求解</button><button type="button" onClick={onBrowse}><ArrowLeft size={13} />浏览</button></header>
      
      {!enabled && <p role="alert" className="ops-unavailable">当前模型未绑定设备，请恢复数据中心场景。</p>}
      <fieldset disabled={!enabled}>
        <label>仿真工况<select aria-label="运行仿真工况" value={ops.scenario} onChange={(e) => ops.setScenario(e.target.value as Scenario)}><option value="baseline">正常运行 · 当前装配 / 连接</option><option value="cooling-loss">CDU-02 流量下降 · 液冷 A 厅 K–L 排</option><option value="feeder-trip">PDU-C 末端断开 · C 排失电</option><option value="network-loss">网络 NET-04 中断 · 液冷 B 厅</option><option value="ups-a-loss">UPS A 失电 · 验证 B 路供电</option></select></label>
        <details className="ops-parameters"><summary>模型参数</summary>{([['rackRatedKw','液冷机柜额定功率 / kW',10,200],['airRackRatedKw','风冷机柜额定功率 / kW',2,50],['flowLpm','机柜额定液冷流量 / L/min',10,250],['supplyC','供水温度 / °C',15,40],['feederCapacityKw','列头配电容量 / kW',100,10000],['primaryVolumeM3','冷冻回路容积 / m³',1,200],['secondaryVolumeM3','二次回路容积 / m³',.05,20],['podThermalMassKjK','机房等效热容 / kJ/K',1000,200000],['airSetpointC','送风设定 / °C',16,35]] as const).map(([key,label,min,max])=><label key={key}>{label}<input aria-label={label} type="number" min={min} max={max} value={ops.parameters[key]} onChange={e=>ops.setParameter(key,Number(e.target.value))}/></label>)}</details>
        <label className="ops-load-label">IT 负载<strong>{ops.load}%</strong><input aria-label="运营 IT 负载" type="range" min={30} max={100} value={ops.load} onChange={(e) => ops.setLoad(Number(e.target.value))} /></label>
        <div className="ops-run-actions"><button type="button" className="ops-primary" onClick={ops.status === 'running' ? ops.pause : ops.start}>{ops.status === 'running' ? <><Pause size={14} />暂停运行</> : <><Play size={14} />{ops.status === 'paused' ? '继续运行' : ops.status === 'complete' ? '重新运行' : '开始运行'}</>}</button><button type="button" onClick={ops.reset}><RotateCcw size={13} />重置</button></div>
        <div className="ops-playback"><span role="status">{statusLabels[ops.status]}</span><strong>T+{String(ops.seconds).padStart(3, '0')} s</strong></div>
        <input type="range" className="ops-timeline" aria-label="运行时间轴（秒）" min={0} max={DURATION} step={2} value={ops.seconds} onChange={(e) => ops.seek(Number(e.target.value))} />
        
        <div className="ops-layer-tabs" role="group" aria-label="结果图层"><button type="button" aria-pressed={ops.layer === 'thermal'} onClick={() => ops.setLayer('thermal')}>温度 / 流量</button><button type="button" aria-pressed={ops.layer === 'electrical'} onClick={() => ops.setLayer('electrical')}>供电 / 支路</button><button type="button" aria-pressed={ops.layer === 'network'} onClick={() => ops.setLayer('network')}>网络 / 业务</button></div>
      </fieldset>
      <div className="ops-trend" aria-label="进风温度趋势"><div><span>进风趋势</span><strong>{ops.frame.maxInletC.toFixed(1)} °C</strong></div><svg viewBox="0 0 260 52" role="img" aria-label="最高进风温度曲线"><path d="M0 44H260" stroke="#637f932a"/><polyline points={ops.trail.map(t=>`${t.seconds/DURATION*260},${46-Math.min(40,Math.max(0,t.inletC-20))*1.05}`).join(' ')} stroke="#78b7c9" strokeWidth="1.5" fill="none"/></svg></div>
      <dl className="ops-totals"><div><dt>UPS A 电池</dt><dd>{ops.frame.thermal.batteryKwhA.toFixed(0)} kWh</dd></div><div><dt>UPS B 电池</dt><dd>{ops.frame.thermal.batteryKwhB.toFixed(0)} kWh</dd></div></dl>
      <dl className="ops-totals" aria-label="当前时刻总览"><div><dt>IT 总功率</dt><dd>{(ops.frame.totalPowerKw / 1000).toFixed(2)} MW</dd></div><div><dt>最高进风温度</dt><dd>{ops.frame.maxInletC.toFixed(1)} °C</dd></div><div><dt>停运机柜</dt><dd>{ops.frame.offlineCount} / {ops.frame.installedRackCount}</dd></div><div><dt>告警机柜</dt><dd>{ops.frame.alerts.length}</dd></div></dl>
      <dl className="ops-totals"><div><dt>在线服务器</dt><dd>{ops.frame.onlineServers} / {ops.frame.installedServers}</dd></div><div><dt>估算 PUE</dt><dd>{ops.frame.pue?.toFixed(3)??'—'}</dd></div><div><dt>设施总功率</dt><dd>{(ops.frame.facilityPowerKw/1000).toFixed(2)} MW</dd></div><div><dt>液冷总流量</dt><dd>{ops.frame.totalFlowLpm.toFixed(0)} L/min</dd></div></dl>
      <dl className="ops-totals"><div><dt>可用冷却机组</dt><dd>{ops.frame.activeChillers} / 8</dd></div><div><dt>备用机组名义容量</dt><dd>{(ops.frame.backupReserveKw/1000).toFixed(1)} MW</dd></div></dl>
      {rack&&feeder&&<section ref={deviceRef} className="ops-device" aria-label="运营设备详情" data-rack-id={rack.id} data-frame={ops.seconds}>
        <label>选择机柜<select aria-label="运营机柜" value={rack.id} onChange={(e) => ops.selectRack(e.target.value, true)}>{ops.frame.racks.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.feeder}</option>)}</select></label>
        <label>选择配电回路<select aria-label="运营配电回路" value={rack.feeder} onChange={(e) => { const first = ops.frame.racks.find((item) => item.feeder === e.target.value); if (first) ops.selectRack(first.id, true) }}>{ops.frame.feeders.map((item) => <option key={item.id}>{item.id}</option>)}</select></label>
        <div className="ops-device-title"><strong>{rack.id}</strong><button type="button" onClick={() => ops.selectRack(rack.id, true)}><LocateFixed size={13} />定位</button></div>
        <dl><dt>设备状态</dt><dd>{!rack.installed?'已拆卸':!rack.serverCount?'无已安装服务器':rack.status === 'offline' ? '失电 / 关闭' : rack.status === 'critical' ? '高温告警' : !rack.networkOnline?'网络中断':!rack.redundantPower?'单路供电':rack.status === 'warning' ? '冷却预警' : '供电正常'}</dd><dt>机柜功率</dt><dd>{rack.powerKw.toFixed(1)} kW</dd><dt>进风 / 排风</dt><dd>{rack.inletC.toFixed(1)} / {rack.outletC.toFixed(1)} °C</dd><dt>液冷流量</dt><dd>{rack.flowLpm.toFixed(1)} L/min</dd><dt>回水温度</dt><dd>{rack.waterReturnC===null?'—（无流量）':`${rack.waterReturnC.toFixed(1)} °C`}</dd><dt>{feeder.id} 负载率</dt><dd>{feeder.open ? '支路断开' : `${feeder.loadPercent.toFixed(1)}%`}</dd><dt>冷却回路</dt><dd>{rack.cooling}</dd></dl>
      </section>}
      {ops.frame.deviceAlerts.length>0&&<section className="ops-facility-alerts"><strong>基础设施容量告警 {ops.frame.deviceAlerts.length}</strong>{ops.frame.deviceAlerts.map(a=><button key={a.deviceId} onClick={()=>{useEquipmentStore.getState().select(a.deviceId);useEquipmentStore.getState().setEditMode(true);useEquipmentStore.getState().setPanelOpen(true);useEquipmentStore.getState().focus(a.deviceId)}}>{a.deviceId} · {a.message}</button>)}</section>}
      <div className="ops-run-actions"><button onClick={()=>{useEquipmentStore.getState().setEditMode(true);useEquipmentStore.getState().setPanelOpen(true)}}>编辑设备 / 拆装</button><button onClick={exportReport}>导出完整仿真结果</button></div>
      
    </aside>
    <section className="ops-alerts" aria-label="运营告警列表" data-frame={ops.seconds}><header><strong><AlertTriangle size={14} />当前告警 {ops.frame.alerts.length}</strong><span>T+{ops.seconds}s</span></header>
      {ops.frame.alerts.length ? <><div className="ops-alert-scroll">{ops.frame.alerts.map((alert) => <button type="button" key={alert.id} data-severity={alert.severity} onClick={() => ops.selectRack(alert.rackId, true)}><span>{alert.rackId}<em>{alert.severity === 'critical' ? '严重' : '预警'}</em></span><span>{alert.message}</span><LocateFixed size={13} /></button>)}</div><small>严重告警优先 · 可滚动查看全部 {ops.frame.alerts.length} 条</small></> : <p>{ops.scenario !== 'baseline' && !ops.frame.faultActive ? `故障将在 T+${FAULT_AT}s 生效。开始运行或拖动时间轴查看。` : '当前无告警。'}</p>}
    </section>
    <div className="ops-legend" aria-label="运营结果图例">{ops.layer === 'network' ? <><span><i style={{ background: '#72bb8d' }} />业务在线</span><span><i style={{ background: '#b38fd9' }} />网络中断</span><span><i style={{ background: '#65727c' }} />设备停运</span></> : ops.layer === 'thermal' ? <><span><i style={{ background: '#66b4cf' }} />进风 &lt;30°C</span><span><i style={{ background: '#dfa456' }} />30–35°C</span><span><i style={{ background: '#e16c53' }} />≥35°C</span></> : <><span><i style={{ background: '#72bb8d' }} />供电正常</span><span><i style={{ background: '#c27add' }} />支路超载</span><span><i style={{ background: '#d7ad6d' }} />单路供电</span><span><i style={{ background: '#65727c' }} />失电</span></>}<span>机柜顶部色带 · T+{ops.seconds}s</span></div>
  </>
}
