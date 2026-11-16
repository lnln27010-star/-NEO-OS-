export type AssistantIntent='coverage'|'power_check'|'dispatch'|'recent_jobs'
export const ASSISTANT_ACTIONS:{id:AssistantIntent;label:string;prompt:string}[]=[
  {id:'coverage',label:'检查资料覆盖',prompt:'检查已登记中心的资料和缺项'},
  {id:'power_check',label:'运行供电校核',prompt:'校核所选中心的供电与短路'},
  {id:'dispatch',label:'优化多站算电',prompt:'用已发布中心优化电价和算力分配'},
  {id:'recent_jobs',label:'查看计算记录',prompt:'查询最近的专业求解任务'},
]
export function classifyAssistantRequest(input:string):AssistantIntent|null{
  const text=input.trim()
  if(!text)return null
  if(/供电|短路|变压器|UPS|配电/.test(text))return 'power_check'
  if(/优化|调度|储能|电价|迁移|绿电/.test(text))return 'dispatch'
  if(/记录|结果|任务|日志/.test(text))return 'recent_jobs'
  if(/资料|缺项|基地|中心|资源|概况|覆盖/.test(text))return 'coverage'
  return null
}
