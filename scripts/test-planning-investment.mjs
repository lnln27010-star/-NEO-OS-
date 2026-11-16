import assert from 'node:assert/strict'
import {allocateNewDemand,calculateInvestment,demandTotals,effectiveTariff,gateStatus,newProject} from '../src/planningInvestment.ts'

const project=newProject()
project.finance_model='legacy'
project.name='测试项目'
project.phases[0].it_mw=5
project.phases[0].capex_wan=30000
const base=calculateInvestment(project)
assert.equal(base.months.length,120)
assert.equal(base.years.length,10)
assert.equal(Math.round(base.months.reduce((n,row)=>n+row.capex,0)),project.phases[0].capex_wan)
assert.equal(base.months[0].active_mw,0)
assert.equal(base.months[12].active_mw,5)
assert.ok(calculateInvestment(project,{electricity_yuan_kwh:.9}).npv<base.npv)
assert.ok(calculateInvestment(project,{mature_occupancy_pct:95}).npv>base.npv)
assert.ok(calculateInvestment(project,{power_billing:'pass-through'}).npv>base.npv)
assert.ok(calculateInvestment(project,{loan_pct:50}).npv===base.npv)
assert.ok(calculateInvestment(project,{loan_pct:50}).equityNpv>base.equityNpv)
const own=calculateInvestment(project,{revenue_model:'own',own_benefit_wan_year:5000})
assert.ok(own.totalRevenue>0)
const mixed=calculateInvestment(project,{revenue_model:'mixed',gpu_capacity_pct:50,gpu_count:200,gpu_yuan_hour:20,gpu_utilization_pct:60})
assert.ok(mixed.totalRevenue>0)
assert.notEqual(mixed.totalRevenue,base.totalRevenue)
assert.ok(Math.abs(effectiveTariff({...project.finance,tariff_mode:'components',peak_share_pct:0,valley_share_pct:0})-.65)<1e-9)
assert.ok(gateStatus(project).issues.includes('建设投资未完成分项核对'))
project.phases[0].capex_lines={civil:{amount_wan:30000,reference:'估算单'}}
assert.ok(!gateStatus(project).issues.includes('建设投资未完成分项核对'))
const east=newProject(),west=newProject()
east.phases[0].it_mw=5;west.phases[0].it_mw=5
east.name='东部';east.site.grid_mw=8;east.site.latency_ms=12;east.finance.electricity_yuan_kwh=.8
west.name='西部';west.site.grid_mw=8;west.site.latency_ms=85;west.finance.electricity_yuan_kwh=.3
let allocation=allocateNewDemand([{id:'E',data:east},{id:'W',data:west}],7,30)
assert.equal(allocation.assigned_mw,5)
assert.equal(allocation.unserved_mw,2)
assert.equal(allocation.candidates.find(c=>c.id==='W').reason,'超出时延边界')
allocation=allocateNewDemand([{id:'E',data:east},{id:'W',data:west}],7,100)
assert.equal(allocation.unserved_mw,0)
assert.equal(allocation.candidates.find(c=>c.id==='W').assigned_mw,5)
const customerCase=newProject()
customerCase.phases[0].it_mw=5
customerCase.customers=[{code:'C1',customer:'甲',workload:'inference',stage:'contract',it_mw:2,min_delivery_date:'',max_latency_ms:20,movable_pct:0,target_yuan_kw_month:null,sla:'',reference:'合同'},{code:'C2',customer:'乙',workload:'training',stage:'rfp',it_mw:4,min_delivery_date:'',max_latency_ms:null,movable_pct:100,target_yuan_kw_month:null,sla:'',reference:'招标'}]
assert.equal(demandTotals(customerCase).contract,2)
assert.equal(demandTotals(customerCase).rfp,4)
assert.ok(!gateStatus(customerCase).issues.includes('缺少已签客户容量'))
console.log('Planning investment model assertions passed')
