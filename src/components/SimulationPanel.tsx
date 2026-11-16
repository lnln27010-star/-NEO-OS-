import { Activity, CircleStop, Cpu, Droplets, Flame, Play, ShieldAlert, Thermometer, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useDesignerStore } from '../useDesignerStore'

type SimulationKind = 'thermal' | 'electrical'

type SimulationFrame = {
  timestamp: string
  thermal: { inletTemp: number; peakTemp: number; flowRate: number; pressure: number; coolingCapacity: number }
  electrical: { activePower: number; reactivePower: number; voltage: number; current: number; powerFactor: number; frequency: number; rppLoad: number; upsLoad: number }
}

type SimulationFixture = {
  schemaVersion: string
  modelVersion: string
  dataStatus: string
  source: string
  generatedAt: string
  frames: SimulationFrame[]
}

export function SimulationPanel() {
  const [kind, setKind] = useState<SimulationKind>('thermal')
  const [running, setRunning] = useState(false)
  const [load, setLoad] = useState(68)
  const [fault, setFault] = useState('none')
  const [fixture, setFixture] = useState<SimulationFixture | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const setOverlayMode = useDesignerStore((state) => state.setOverlayMode)
  const setWorkspaceMode = useDesignerStore((state) => state.setWorkspaceMode)

  useEffect(() => {
    let cancelled = false
    fetch('/data/simulation/thermal-electrical-timeseries.json')
      .then((response) => response.json() as Promise<SimulationFixture>)
      .then((next) => { if (!cancelled) setFixture(next) })
      .catch(() => { if (!cancelled) setFixture(null) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!running || !fixture?.frames.length) return
    const timer = window.setInterval(() => setFrameIndex((current) => (current + 1) % fixture.frames.length), 900)
    return () => window.clearInterval(timer)
  }, [fixture, running])

  const metrics = useMemo(() => {
    const frame = fixture?.frames[Math.min(frameIndex, Math.max(0, (fixture?.frames.length ?? 1) - 1))]
    const scale = load / 68
    const thermal = frame?.thermal ?? { inletTemp: 24, peakTemp: 42.3, flowRate: 91, pressure: 160, coolingCapacity: 2860 }
    const electrical = frame?.electrical ?? { activePower: 2530, reactivePower: 490, voltage: 398, current: 3600, powerFactor: 0.98, frequency: 50, rppLoad: 79, upsLoad: 88 }
    const faultFactor = fault === 'cdu-03' ? 1.08 : fault === 'rpp-a' ? 1.02 : 1
    return {
      peakC: thermal.peakTemp * (0.84 + 0.16 * scale) * faultFactor,
      inletC: thermal.inletTemp * (0.92 + 0.08 * scale),
      flow: Math.round(thermal.flowRate * (fault === 'cdu-03' ? 0.78 : 0.98 + scale * 0.02)),
      powerKw: Math.round(electrical.activePower * scale),
      electricalLoad: Math.min(100, Math.round(electrical.rppLoad * scale)),
      rppLoad: Math.min(100, Math.round(electrical.rppLoad * scale)),
      upsLoad: Math.min(100, Math.round(electrical.upsLoad * scale)),
      voltage: electrical.voltage,
      frequency: electrical.frequency,
      timestamp: frame?.timestamp ?? '等待测试数据',
    }
  }, [fixture, frameIndex, fault, load])

  const run = () => {
    const next = !running
    setRunning(next)
    setWorkspaceMode('analyse')
    setOverlayMode(next ? (kind === 'thermal' ? 'heat' : 'power') : 'none')
  }

  return (
    <aside className="simulation-dock" aria-label="场景仿真控制台">
      <div className="simulation-dock-head">
        <div className="simulation-title"><Activity size={15} /><strong>仿真实验室</strong></div>
        <span className="simulation-badge">L0/L1 示例</span>
      </div>
      <div className="simulation-tabs" role="tablist" aria-label="仿真类型">
        <button type="button" role="tab" aria-selected={kind === 'thermal'} className={kind === 'thermal' ? 'is-active' : ''} onClick={() => { setKind('thermal'); if (running) setOverlayMode('heat') }}><Flame size={13} />热仿真</button>
        <button type="button" role="tab" aria-selected={kind === 'electrical'} className={kind === 'electrical' ? 'is-active' : ''} onClick={() => { setKind('electrical'); if (running) setOverlayMode('power') }}><Zap size={13} />电气仿真</button>
      </div>
      <div className="simulation-field-row">
        <label htmlFor="simulation-scenario">场景</label>
        <select id="simulation-scenario" value={fault} onChange={(event) => setFault(event.target.value)}>
          <option value="none">基线工况</option>
          <option value="rpp-a">RPP-A07 支路异常</option>
          <option value="cdu-03">CDU-03 流量下降</option>
          <option value="ups-a">UPS-A01 容量故障</option>
        </select>
      </div>
      <div className="simulation-slider-row">
        <label htmlFor="simulation-load">负载覆盖</label>
        <strong>{load}%</strong>
      </div>
      <input id="simulation-load" className="simulation-range" type="range" min="30" max="100" value={load} onChange={(event) => setLoad(Number(event.target.value))} />
      <button className={`simulation-run-button ${running ? 'is-running' : ''}`} type="button" aria-pressed={running} onClick={run}>
        {running ? <><CircleStop size={14} />停止测试</> : <><Play size={14} fill="currentColor" />运行仿真</>}
      </button>
      <div className={`simulation-status ${running ? 'is-running' : ''}`} role="status" aria-live="polite">
        <span><i />{running ? (kind === 'thermal' ? '热流场计算中' : '支路状态计算中') : '准备运行'}</span>
        <em>{fault === 'none' ? '无故障注入' : fault === 'rpp-a' ? 'RPP 支路故障' : fault === 'cdu-03' ? 'CDU 流量异常' : 'UPS 容量故障'}</em>
      </div>
      {kind === 'thermal' ? (
        <div className="simulation-metric-grid">
          <div><Thermometer size={13} /><span>入口温度</span><strong>{metrics.inletC.toFixed(1)} °C</strong></div>
          <div><Flame size={13} /><span>峰值温度</span><strong>{metrics.peakC.toFixed(1)} °C</strong></div>
          <div><Droplets size={13} /><span>液冷流量</span><strong>{metrics.flow} L/min</strong></div>
          <div><Cpu size={13} /><span>数据时刻</span><strong>{metrics.timestamp.slice(11, 16)}</strong></div>
        </div>
      ) : (
        <div className="simulation-electrical-block">
          <div className="simulation-phase-head"><span>电源支路</span><span>A</span><span>B</span><span>C</span></div>
          <div className="simulation-phase-row"><span>RPP-A07</span><strong>{metrics.rppLoad}%</strong><strong>{Math.round(metrics.powerKw / 3)} kW</strong><strong>{fault === 'rpp-a' ? '故障' : '正常'}</strong></div>
          <div className="simulation-phase-row"><span>UPS-A01</span><strong>{metrics.upsLoad}%</strong><strong>{metrics.voltage.toFixed(1)} V</strong><strong>{fault === 'ups-a' ? '容量不足' : '正常'}</strong></div>
        </div>
      )}
      <div className="simulation-footer"><ShieldAlert size={12} />{fixture ? `${fixture.source} · ${fixture.modelVersion}` : '测试数据加载中'} · 非现场遥测</div>
    </aside>
  )
}
