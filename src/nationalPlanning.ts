export type ProxyRow={price:number;peak:number;normal:number;valley:number;subRegions:number}
export type ProxyPrices=Record<string,Record<string,ProxyRow>>
export type SpotPrices={realtime:Record<string,Record<string,(number|null)[]>>;dayahead:Record<string,Record<string,(number|null)[]>>}
export type ClimatePoint={province:string;longitude:number;latitude:number;solar_kwh_m2_day:number;wind_50m_m_s:number;temperature_c:number;summer_c:number;solar_months:Record<string,number>;wind_months:Record<string,number>;source_url:string;source_range:string}
export type ClimateSnapshot={source:string;period:string;scope:string;rows:ClimatePoint[]}
export type PlanningMetric='proxy'|'spot'|'solar'|'wind'|'cooling'|'policy'|'demand'
export type ProxyField='price'|'peak'|'normal'|'valley'
export type SpotType='realtime'|'dayahead'

export const PLANNING_SOURCES={
  hub:'https://www.ndrc.gov.cn/xxgk/zcfb/tz/202312/t20231229_1363000.html',
  green:'https://www.ndrc.gov.cn/xxgk/zcfb/tz/202407/P020240723625582947550.pdf',
  demand:'https://www.caict.ac.cn/kxyj/qwfb/ztbg/202507/P020250724397149741659.pdf',
  climate:'https://power.larc.nasa.gov/docs/services/api/temporal/',
}

const hubGroups:[string,string[],string][]=[
  ['京津冀',['北京市','天津市','河北省'],'近用户应用与低时延业务'],
  ['长三角',['上海市','江苏省','浙江省','安徽省'],'近用户应用与低时延业务'],
  ['粤港澳大湾区',['广东省'],'近用户应用与低时延业务'],
  ['成渝',['重庆市','四川省'],'区域应用与算力供给协同'],
  ['内蒙古',['内蒙古自治区'],'非实时业务与绿色能源承接'],
  ['贵州',['贵州省'],'非实时业务与绿色能源承接'],
  ['甘肃',['甘肃省'],'非实时业务与绿色能源承接'],
  ['宁夏',['宁夏回族自治区'],'非实时业务与绿色能源承接'],
]
export function hubFor(province:string){const group=hubGroups.find(([,provinces])=>provinces.includes(province));return group?{name:group[0],positioning:group[2],scope:'省份包含国家枢纽区域；不代表全省场址均在获批集群内'}:null}
export function demandPosition(province:string){const hub=hubFor(province);if(!hub)return '缺少可比的省级客户需求证据';return hub.positioning}
export const LOCAL_POLICY=[
  {province:'内蒙古自治区',title:'绿电直连工作指引',date:'2026-01',scope:'和林格尔数据中心集群可按条件研究绿电直连；需核实电网影响评估等要求。',url:'https://nyj.nmg.gov.cn/gzcy/zcwdk/202601/t20260115_2848834.html'},
  {province:'贵州省',title:'鼓励数据产业发展的若干政策（试行）',date:'2025-09',scope:'支持算力集群规模化并对投运、扩建数据中心开展算力评估；有效期见原文。',url:'https://new.tzxm.gov.cn/zckd/cyzc/202509/t20250901_1400205.shtml'},
  {province:'甘肃省',title:'数据市场培育行动方案（2025—2027年）',date:'2025',scope:'推动大型及以上算力中心向庆阳数据中心集群集聚并完善跨区域直连。',url:'https://zwfw.gansu.gov.cn/huating/zczx/zcwj/art/2025/art_b8ce7b0645a248fc9a5b0c6138dd4435.html'},
  {province:'宁夏回族自治区',title:'数字产业集群行动方案（2025—2027年）',date:'2025-01',scope:'支持中卫集群建设算力保障与灾备基地；项目条件需以现行申报文件核实。',url:'https://gxt.nx.gov.cn/zwgk/fdzdgknr/ghjh/202501/t20250115_4790535.html'},
]
export function policiesFor(province:string){return LOCAL_POLICY.filter(policy=>policy.province===province)}
export function proxyValue(data:ProxyPrices|null,province:string,month:string,field:ProxyField){const value=data?.[province]?.[month]?.[field];return typeof value==='number'&&Number.isFinite(value)&&value>0?value:null}
export function spotSummary(data:SpotPrices|null,province:string,month:string,type:SpotType){
  const records=data?.[type]?.[province]??{}
  const days=Object.entries(records).filter(([date,hours])=>date.startsWith(month)&&hours.some(value=>typeof value==='number'&&value>0))
  const values=days.flatMap(([,hours])=>hours.filter((value):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0))
  return {mean:values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null,days:days.length,hours:values.length}
}
export function metricColor(metric:PlanningMetric,value:number|null,min:number,max:number){
  if(value===null||!Number.isFinite(value))return '#1a2b38'
  const span=Math.max(.00001,max-min),raw=Math.max(0,Math.min(1,(value-min)/span)),t=metric==='proxy'||metric==='spot'||metric==='cooling'?1-raw:raw
  const low=[36,57,73],high=[60,188,163]
  const mix=(a:number,b:number)=>Math.round(a+(b-a)*t)
  return `rgb(${mix(low[0],high[0])},${mix(low[1],high[1])},${mix(low[2],high[2])})`
}
