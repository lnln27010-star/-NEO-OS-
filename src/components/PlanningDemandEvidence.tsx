import {useState,type ChangeEvent} from 'react'
import {Download,Upload} from 'lucide-react'
import {parseCsv} from '../foundationData'
import {platformApi} from '../neoPlatform'
import './planning-demand-evidence.css'

export type DemandRecord={id:string;province:string;workload:string;stage:'contract'|'rfp'|'pipeline';capacity_mw:number;latency_ms:number|null;reference:string;as_of:string;customer_code:string;created_at:string;updated_at:string;revision:number;operator:string}
export type DemandData={records:DemandRecord[];aggregate:Record<string,{contract_mw:number;rfp_mw:number;pipeline_mw:number;count:number}>;source:string;added?:number;updated?:number;skipped?:number}
type ImportRow=Omit<DemandRecord,'id'|'created_at'|'updated_at'|'revision'|'operator'>
const STAGES:Record<DemandRecord['stage'],string>={contract:'已签合同（用户登记）',rfp:'招采 / RFP',pipeline:'意向线索'}
const WORKLOAD:Record<string,string>={inference:'推理',training:'训练',general:'通算',storage:'存储',other:'其他'}

function template(){const content='\uFEFFprovince,workload,stage,capacity_mw,latency_ms,reference,as_of,customer_code\r\n',url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='算力需求证据模板.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function convert(text:string):ImportRow[]{
  const rows=parseCsv(text)
  if(!rows.length||rows.length>500)throw new Error('CSV 应包含 1—500 条需求记录')
  const required=['province','workload','stage','capacity_mw','reference','as_of','customer_code']
  if(required.some(key=>!(key in rows[0])))throw new Error('缺少必需列：'+required.filter(key=>!(key in rows[0])).join('、'))
  return rows.map((row,index)=>{
    const capacity=Number(row.capacity_mw),latency=row.latency_ms?Number(row.latency_ms):null
    if(!Number.isFinite(capacity)||capacity<=0||latency!==null&&(!Number.isFinite(latency)||latency<0))throw new Error(`第 ${index+2} 行容量或时延无效`)
    if(!['contract','rfp','pipeline'].includes(row.stage)||!Object.hasOwn(WORKLOAD,row.workload))throw new Error(`第 ${index+2} 行业务类型或阶段无效`)
    if(!row.province||!row.reference||!row.customer_code||!/^\d{4}-\d{2}-\d{2}$/.test(row.as_of))throw new Error(`第 ${index+2} 行省份、项目编号、来源或日期缺失`)
    return {province:row.province,workload:row.workload,stage:row.stage as DemandRecord['stage'],capacity_mw:capacity,latency_ms:latency,reference:row.reference,as_of:row.as_of,customer_code:row.customer_code}
  })
}

export function PlanningDemandEvidence({province,data,workloadFilter,onImported}:{province:string;data:DemandData|null;workloadFilter:'all'|DemandRecord['workload'];onImported:(result:DemandData)=>void}){
  const [preview,setPreview]=useState<ImportRow[]>([]),[operator,setOperator]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const fileChange=async(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;setError('');setNotice('');try{if(file.size>1_000_000)throw new Error('CSV 文件不能超过 1 MB');setPreview(convert(await file.text()))}catch(e){setPreview([]);setError((e as Error).message)}}
  const submit=async()=>{if(!preview.length||!operator.trim())return;setBusy(true);setError('');try{const result=await platformApi<DemandData>('/planning/demand/import',{operator,records:preview});onImported(result);setPreview([]);setNotice(`新增 ${result.added??0} 条，更新 ${result.updated??0} 条，重复跳过 ${result.skipped??0} 条`)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const records=data?.records.filter(row=>row.province===province&&(workloadFilter==='all'||row.workload===workloadFilter))??[]
  const local=records.reduce((total,row)=>{if(row.stage==='contract')total.contract_mw+=row.capacity_mw;else if(row.stage==='rfp')total.rfp_mw+=row.capacity_mw;else total.pipeline_mw+=row.capacity_mw;return total},{contract_mw:0,rfp_mw:0,pipeline_mw:0})
  return <div className="planning-demand-evidence"><h4>内部客户需求证据</h4>{records.length?<div className="planning-demand-totals"><span>已签 {local.contract_mw.toFixed(2)} MW</span><span>RFP {local.rfp_mw.toFixed(2)} MW</span><span>线索 {local.pipeline_mw.toFixed(2)} MW</span></div>:<p>尚无该省客户合同、招采或线索数据；不能判断省级实际需求量。</p>}{records.slice(0,5).map(record=><div className="planning-demand-record" key={record.id}><strong>{STAGES[record.stage]} · {record.capacity_mw.toFixed(2)} MW</strong><small>{record.customer_code} · {WORKLOAD[record.workload]} · {record.as_of} · {record.reference}</small></div>)}<details><summary>导入客户需求证据 CSV</summary><p>仅存本机服务端。同一省份用 customer_code 作为稳定项目编号，更新阶段需更晚的 as_of 日期；业务类型填 inference/training/general/storage/other，阶段填 contract/rfp/pipeline，容量单位 MW；“已签”是导入者标注，系统不会验证合同真实性。</p><button onClick={template}><Download size={12}/>下载空白模板</button><input aria-label="导入需求证据 CSV" type="file" accept=".csv,text/csv" onChange={fileChange}/>{preview.length>0&&<div className="planning-demand-preview"><strong>{preview.length} 条待导入</strong>{preview.slice(0,3).map((row,index)=><span key={index}>{row.province} · {STAGES[row.stage]} · {row.capacity_mw} MW</span>)}<input aria-label="需求证据导入人" value={operator} onChange={e=>setOperator(e.target.value)} placeholder="导入人"/><button disabled={busy||!operator.trim()} onClick={()=>void submit()}><Upload size={12}/>确认导入</button></div>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</details></div>
}
