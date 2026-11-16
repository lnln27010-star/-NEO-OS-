import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {stripTypeScriptTypes} from 'node:module'
import {pathToFileURL} from 'node:url'
const dir='artifacts/centers-test';fs.mkdirSync(dir,{recursive:true})
for(const file of ['portalModel','usePortalStore'])fs.writeFileSync(`${dir}/${file}.mjs`,stripTypeScriptTypes(fs.readFileSync(`src/${file}.ts`,'utf8')).replace(/from '\.\/([^']+)'/g,"from './$1.mjs'"))
const model=await import(pathToFileURL(path.resolve(dir,'portalModel.mjs')))
assert.equal(Object.keys(model.CENTERS).length,7)
assert.deepEqual(model.ENABLED_CENTERS,Object.keys(model.CENTERS));for(const id of model.ENABLED_CENTERS)assert.equal(model.isCenterEnabled(id),true)
assert.equal(model.isCenterEnabled('iot'),false)
let ranked=model.rankSites(model.INITIAL_SITES,20,20,12000,[35,25,25,15]);assert.equal(ranked.find(s=>s.id==='S02').eligible,false);assert.ok(ranked[0].eligible)
assert.equal(model.assessSite(model.INITIAL_SITES[0],20,40,12000).status,'资料待补齐')
assert.equal(model.assessSite({...model.INITIAL_SITES[0],waterM3d:0,summerC:34,networkGbps:100,landReady:true,basis:'供电意向函 2026-11'},20,40,12000).ready,true)
assert.equal(model.assessSite({...model.INITIAL_SITES[0],landReady:false},20,40,12000).status,'不满足当前边界')
assert.ok(model.rankSites(model.INITIAL_SITES,500,40,12000,[1,1,1,1]).every(s=>!s.eligible))
assert.ok(model.rankSites(model.INITIAL_SITES,20,40,12000,[0,0,0,0]).every(s=>Number.isFinite(s.score)))
const n=model.designCapacity(384,50,16,60,1.3,'N+1'),nn=model.designCapacity(384,50,16,60,1.3,'2N')
assert.equal(n.airRacks+n.liquidRacks,384);assert.equal(n.itMw,14.592);assert.equal(n.ups,9);assert.equal(nn.ups,16);assert.ok(n.cdu*2.5>=n.waterMw)
const input={loadMw:20,flex:35,gridLimit:26,batteryMwh:20,batteryMw:5,reserve:20},r=model.dispatchDay(model.DISPATCH_SITES,input)
assert.equal(r.rows.length,24);assert.equal(r.unserved,0);assert.equal(r.overHours,0)
let soc=10;for(const row of r.rows){assert.ok(Math.abs(row.allocations.reduce((n,s)=>n+s.mw,0)+row.unserved-input.loadMw)<1e-9);assert.ok(row.allocations.every(s=>s.mw<=s.capacity));soc+=row.charge*.95-row.discharge/.95;assert.ok(Math.abs(row.soc-soc)<1e-9);assert.ok(row.soc>=4-1e-9&&row.soc<=20);assert.ok(Number.isFinite(row.cost)&&row.cost>=0)}
assert.ok(model.dispatchDay(model.DISPATCH_SITES,{...input,loadMw:100}).unserved>0)
assert.ok(model.dispatchDay(model.DISPATCH_SITES,{...input,gridLimit:1,batteryMwh:0}).overHours>0)
globalThis.location={search:''};const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)}
const {usePortalStore:store}=await import(pathToFileURL(path.resolve(dir,'usePortalStore.mjs')))
assert.equal(store.getState().center,'assets');store.getState().setCenter('planning');assert.equal(store.getState().center,'planning')
store.getState().update({activeCenterId:'DC-TEST'});assert.equal(store.getState().activeCenterId,'DC-TEST');assert.equal(JSON.parse(memory.get('aidc-platform-v1')).activeCenterId,'DC-TEST')
store.getState().createOrder('R-A01','供电中断');store.getState().createOrder('R-A01','重复');assert.equal(store.getState().orders.length,1)
const id=store.getState().orders[0].id;store.getState().advanceOrder(id,true);assert.equal(store.getState().orders[0].status,'处理中');store.getState().advanceOrder(id,true);assert.equal(store.getState().orders[0].status,'待验证');store.getState().advanceOrder(id,true);assert.equal(store.getState().orders[0].status,'待验证');store.getState().advanceOrder(id,false);assert.equal(store.getState().orders[0].status,'已闭环');assert.ok(JSON.parse(memory.get('aidc-platform-v1')).orders.length===1)
store.getState().createManualOrder('UPS-A01','巡检发现异常','运维班组','DC-TEST');const manual=store.getState().orders[0].id
store.getState().advanceOrder(manual,false);store.getState().advanceOrder(manual,false);store.getState().advanceOrder(manual,false)
assert.equal(store.getState().orders[0].status,'待验证');store.getState().advanceOrder(manual,false,'复核人：现场复测通过')
assert.equal(store.getState().orders[0].status,'已闭环');assert.match(store.getState().orders[0].verification,/现场复测/)
console.log('PASS: global cockpit and six work centers; site constraints, engineering capacity, dispatch balance and SOC; simulated and manual work order separation; manual verification evidence; persistence.')
