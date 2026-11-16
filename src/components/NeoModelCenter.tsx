import {useEffect,useState} from 'react'
import {ArrowUpRight,Blocks,Code2,Cpu,Database,RefreshCw,ShieldCheck,Workflow} from 'lucide-react'
import {platformApi,type CapabilityDirectory} from '../neoPlatform'
import {usePortalStore} from '../usePortalStore'
import {useDesignerStore} from '../useDesignerStore'
import {useEngineeringStore} from '../useEngineeringStore'
import {useFoundationStore} from '../foundationData'
import './neo-centers.css'

const domains:Record<string,string>={pandapower:'ELECTRICAL',pypsa:'COMPUTE × POWER',openfoam:'THERMAL & FLOW',fenicsx:'LOCAL FEM'}

export function NeoModelCenter(){
  const [catalog,setCatalog]=useState<CapabilityDirectory|null>(null),[error,setError]=useState('')
  const refresh=async()=>{setError('');try{setCatalog(await platformApi<CapabilityDirectory>('/capabilities'))}catch(e){setError((e as Error).message)}}
  useEffect(()=>{void refresh()},[])
  const ready=catalog?.capabilities.filter(c=>c.available).length??0
  const toSimulation=()=>{usePortalStore.getState().setCenter('simulation');useDesignerStore.getState().setTwinMode('operate');useEngineeringStore.getState().setVisible(true)}
  const toData=()=>{usePortalStore.getState().setCenter('assets');useDesignerStore.getState().setTwinMode('browse');useFoundationStore.getState().open()}
  return <div className="neo-model-center"><div className="neo-model-top"><div><small>REGISTERED CAPABILITIES</small><strong>{ready}<em> / {catalog?.capabilities.length??4}</em></strong><span>本机可执行的工程求解器</span></div><div><small>数据来源</small><strong>已发布<em>基线</em></strong><span>每次计算冻结输入与模型版本</span></div><div><small>智能操作</small><strong>受控<em>任务</em></strong><span>按明确动作编排，外部大模型尚未接入</span></div></div>
    {error&&<p className="neo-error" role="alert">{error}<button onClick={()=>void refresh()}><RefreshCw size={13}/>重试</button></p>}
    <section className="neo-capability-section"><header><h2>专业能力目录</h2><button onClick={()=>void refresh()}><RefreshCw size={13}/>刷新环境</button></header><div className="neo-capability-grid">{catalog?.capabilities.map(c=><article key={c.id} className="neo-capability"><div className="neo-capability-head"><span>{domains[c.id]??'ENGINE'}</span><i data-ready={c.available}/></div><div className="neo-capability-icon"><Blocks size={21}/></div><h3>{c.name}</h3><p>{c.inputs}</p><div className="neo-capability-row"><span>输出</span><strong>{c.outputs}</strong></div><div className="neo-capability-row"><span>运行环境</span><strong>{c.available?`${c.runtime} · ${c.version??'本机'}`:c.reason}</strong></div><div className="neo-capability-row"><span>校准</span><strong>{c.calibration}</strong></div><button disabled={!c.available} onClick={toSimulation}>{c.available?'进入仿真工作台':'待配置运行环境'}<ArrowUpRight size={13}/></button></article>)??<div className="neo-model-empty">正在读取能力目录…</div>}</div></section>
    <div className="neo-model-bottom"><section><header><Database size={17}/><h3>算电数字底座</h3></header><p>已登记的中心、设备、电缆、服务器、测点和资料以统一编号关联。正式计算读取发布后的资料版本。</p><div>{catalog?.data_interfaces.map(s=><div key={s.name}><span>{s.name}</span><b>{s.status}</b></div>)}</div><button onClick={toData}>查看资产与资料<ArrowUpRight size={13}/></button></section><section><header><Workflow size={17}/><h3>任务与接口</h3></header><p>{catalog?.agent_runtime??'正在读取任务接口…'}</p><div><div><span>工程任务服务</span><b>异步队列 · 日志 · 结果文件</b></div><div><span>智能体调用</span><b>MCP 工具接口</b></div><div><span>场景执行</span><b>人工审核后再接入现场系统</b></div></div><a href="/api/simulation/docs" target="_blank" rel="noreferrer"><Code2 size={13}/>查看服务接口<ArrowUpRight size={13}/></a></section></div>
  </div>
}
