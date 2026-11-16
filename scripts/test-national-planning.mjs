import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {stripTypeScriptTypes} from 'node:module'
import {pathToFileURL} from 'node:url'

const dir='artifacts/national-planning-test'
fs.mkdirSync(dir,{recursive:true})
fs.writeFileSync(`${dir}/nationalPlanning.mjs`,stripTypeScriptTypes(fs.readFileSync('src/nationalPlanning.ts','utf8')))
const model=await import(pathToFileURL(path.resolve(dir,'nationalPlanning.mjs')))
const proxy=JSON.parse(fs.readFileSync('public/data/proxy-price-merged.json','utf8'))
const spot=JSON.parse(fs.readFileSync('public/data/spot-price.json','utf8'))
const climate=JSON.parse(fs.readFileSync('public/data/planning-climate.json','utf8'))
assert.equal(climate.rows.length,31)
assert.equal(new Set(climate.rows.map(row=>row.province)).size,31)
assert.ok(climate.rows.every(row=>Number.isFinite(row.solar_kwh_m2_day)&&Number.isFinite(row.wind_50m_m_s)&&Number.isFinite(row.summer_c)&&row.source_url.startsWith('https://power.larc.nasa.gov/')))
assert.ok(model.proxyValue(proxy,'江苏省','2026-08','price')>0)
assert.equal(model.proxyValue(proxy,'西藏自治区','2026-08','price'),null)
const example=model.spotSummary(spot,'福建省','2026-08','realtime')
assert.ok(example.days>10&&example.hours>example.days&&example.mean>0)
assert.equal(model.spotSummary(spot,'西藏自治区','2026-08','realtime').mean,null)
assert.equal(model.hubFor('宁夏回族自治区')?.name,'宁夏')
assert.equal(model.hubFor('海南省'),null)
assert.ok(model.policiesFor('内蒙古自治区')[0].url.startsWith('https://nyj.nmg.gov.cn/'))
assert.match(model.demandPosition('海南省'),/缺少可比/)
assert.notEqual(model.metricColor('proxy',.2,.1,.5),model.metricColor('proxy',.5,.1,.5))
assert.notEqual(model.metricColor('cooling',20,15,30),model.metricColor('cooling',30,15,30))
console.log('PASS: 31 NASA representative points, explicit missing prices/spot data, hub positioning and non-numeric demand.')
