import {BriefcaseBusiness,CalendarClock,FileText,Plus,Trash2} from 'lucide-react'
import {demandTotals,MILESTONES,type CustomerDemand,type Milestone,type Project} from '../planningInvestment'
import './planning-opportunity.css'

const PROJECT_TYPES=[['new-build','新建园区'],['retrofit','存量改造'],['lease','租赁机房'],['joint','合作共建'],['edge','边缘节点']] as const
const BUSINESS=[['colocation','机柜托管'],['capacity-lease','IT 容量租赁'],['gpu-service','GPU/算力服务'],['own','自用'],['hybrid','混合经营']] as const
const WORKLOADS=[['inference','推理'],['training','训练'],['general','通算'],['storage','存储'],['disaster-recovery','灾备'],['edge','边缘'],['other','其他']] as const
const STAGES=[['lead','销售线索'],['rfp','招采 / RFP'],['intent','意向/框架'],['contract','已签合同']] as const
const numeric=(value:number|null,onChange:(v:number|null)=>void,placeholder='待录入')=><input type="number" min="0" step="any" value={value??''} placeholder={placeholder} onChange={event=>onChange(event.target.value===''?null:Number(event.target.value))}/>
const date=(value:string,onChange:(v:string)=>void)=><input type="date" value={value} onChange={event=>onChange(event.target.value)}/>

export function PlanningOpportunity({project,onChange}:{project:Project;onChange:(patch:Partial<Project>)=>void}){
  const customers=project.customers??[],milestones=project.milestones??MILESTONES.map(([key])=>({key,owner:'',planned_date:'',actual_date:'',blocker:''})),totals=demandTotals(project)
  const editCustomer=(index:number,patch:Partial<CustomerDemand>)=>onChange({customers:customers.map((item,i)=>i===index?{...item,...patch}:item)})
  const editMilestone=(key:Milestone['key'],patch:Partial<Milestone>)=>onChange({milestones:milestones.map(item=>item.key===key?{...item,...patch}:item)})
  const addCustomer=()=>onChange({customers:[...customers,{code:`REQ-${Date.now().toString(36).toUpperCase()}`,customer:'',customer_province:'',customer_city:'',workload:'general',stage:'lead',it_mw:0,min_delivery_date:'',max_latency_ms:null,bandwidth_gbps:null,movable_pct:0,target_yuan_kw_month:null,sla:'',reference:''}]})
  const duplicateCodes=[...new Set(customers.map(item=>item.code).filter(code=>customers.filter(item=>item.code===code).length>1))]
  return <div className="po-workspace">
    <section className="po-card"><header><span><BriefcaseBusiness size={17}/>项目机会</span><small>项目开发档案</small></header><div className="po-grid">
      <label>项目名称<input value={project.name} placeholder="填写项目名称" onChange={e=>onChange({name:e.target.value})}/></label>
      <label>项目类型<select value={project.opportunity_type} onChange={e=>onChange({opportunity_type:e.target.value})}>{PROJECT_TYPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>商业模式<select value={project.business_model??'colocation'} onChange={e=>{const business_model=e.target.value as NonNullable<Project['business_model']>,revenue_model=business_model==='gpu-service'?'gpu':business_model==='own'?'own':business_model==='hybrid'?'mixed':'colocation';onChange({business_model,finance:{...project.finance,revenue_model}})}}>{BUSINESS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>省份<input value={project.province} placeholder="省/自治区/直辖市" onChange={e=>onChange({province:e.target.value})}/></label>
      <label>城市<input value={project.city} placeholder="目标城市" onChange={e=>onChange({city:e.target.value})}/></label>
      <label>项目负责人<input value={project.owner} placeholder="责任人" onChange={e=>onChange({owner:e.target.value})}/></label>
      <label>目标投产日{date(project.target_date,target_date=>onChange({target_date}))}</label>
      <label>当前开发阶段<select value={project.stage} onChange={e=>onChange({stage:e.target.value})}>{MILESTONES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    </div></section>

    <section className="po-card po-demand"><header><span><FileText size={17}/>客户需求台账</span><button onClick={addCustomer}><Plus size={13}/>新增客户需求</button></header>
      <div className="po-demand-totals"><div><small>已签合同</small><strong>{totals.contract.toFixed(2)} <em>MW</em></strong></div><div><small>招采 / RFP</small><strong>{totals.rfp.toFixed(2)} <em>MW</em></strong></div><div><small>意向框架</small><strong>{totals.intent.toFixed(2)} <em>MW</em></strong></div><div><small>销售线索</small><strong>{totals.lead.toFixed(2)} <em>MW</em></strong></div></div>
      {duplicateCodes.length>0&&<p className="po-warning">需求编号重复：{duplicateCodes.join('、')}。同一需求请更新阶段，避免重复计量。</p>}
      {customers.length===0&&<div className="po-empty">尚无逐客户需求。新增后按合同、招采、意向和线索分别统计。</div>}
      {customers.map((item,index)=><article key={`${item.code}-${index}`} className="po-demand-item"><div className="po-demand-item-head"><b>{String(index+1).padStart(2,'0')}</b><input aria-label="需求编号" value={item.code} placeholder="需求编号" onChange={e=>editCustomer(index,{code:e.target.value})}/><select aria-label="需求阶段" value={item.stage} onChange={e=>editCustomer(index,{stage:e.target.value as CustomerDemand['stage']})}>{STAGES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button aria-label={`删除需求 ${item.code}`} onClick={()=>onChange({customers:customers.filter((_,i)=>i!==index)})}><Trash2 size={13}/></button></div><div className="po-grid">
        <label>客户 / 业务方<input value={item.customer} placeholder="客户名称" onChange={e=>editCustomer(index,{customer:e.target.value})}/></label>
        <label>客户业务所在地（省）<input value={item.customer_province??''} placeholder="客户业务省份" onChange={e=>editCustomer(index,{customer_province:e.target.value})}/></label>
        <label>客户业务所在地（市）<input value={item.customer_city??''} placeholder="客户业务城市" onChange={e=>editCustomer(index,{customer_city:e.target.value})}/></label>
        <label>业务类型<select value={item.workload} onChange={e=>editCustomer(index,{workload:e.target.value as CustomerDemand['workload']})}>{WORKLOADS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>需求 IT 容量 / MW{numeric(item.it_mw,it_mw=>editCustomer(index,{it_mw:it_mw??0}))}</label>
        <label>最早交付日期{date(item.min_delivery_date,min_delivery_date=>editCustomer(index,{min_delivery_date}))}</label>
        <label>最大端到端时延 / ms{numeric(item.max_latency_ms,max_latency_ms=>editCustomer(index,{max_latency_ms}))}</label>
        <label>带宽需求 / Gbps{numeric(item.bandwidth_gbps??null,bandwidth_gbps=>editCustomer(index,{bandwidth_gbps}))}</label>
        <label>可迁移比例 / %{numeric(item.movable_pct,movable_pct=>editCustomer(index,{movable_pct:movable_pct??0}))}</label>
        <label>客户目标价 / 元·kW⁻¹·月⁻¹{numeric(item.target_yuan_kw_month,target_yuan_kw_month=>editCustomer(index,{target_yuan_kw_month}))}</label>
        <label>SLA / 数据驻留约束<input value={item.sla} placeholder="例如可用性、地域、网络约束" onChange={e=>editCustomer(index,{sla:e.target.value})}/></label>
        <label className="po-span">合同、招标或纪要依据<input value={item.reference} placeholder="文件编号与日期；附件在场址尽调的客户需求关口上传" onChange={e=>editCustomer(index,{reference:e.target.value})}/></label>
      </div></article>)}
    </section>

    <section className="po-card"><header><span><CalendarClock size={17}/>开发里程碑</span><small>计划、实际与阻塞</small></header><div className="po-milestones">{MILESTONES.map(([key,label],index)=>{const item=milestones.find(row=>row.key===key)??{key,owner:'',planned_date:'',actual_date:'',blocker:''};return <div className="po-milestone" key={key}><span className="po-milestone-index">{String(index+1).padStart(2,'0')}</span><strong>{label}</strong><label>负责人<input value={item.owner} placeholder="责任人" onChange={e=>editMilestone(key,{owner:e.target.value})}/></label><label>计划{date(item.planned_date,planned_date=>editMilestone(key,{planned_date}))}</label><label>实际{date(item.actual_date,actual_date=>editMilestone(key,{actual_date}))}</label><label>阻塞事项<input value={item.blocker} placeholder="需要解决的问题" onChange={e=>editMilestone(key,{blocker:e.target.value})}/></label><span className={item.actual_date?'po-done':item.blocker?'po-blocked':'po-pending'}>{item.actual_date?'已完成':item.blocker?'受阻':'未完成'}</span></div>})}</div></section>
  </div>
}
