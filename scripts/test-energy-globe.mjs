import assert from 'node:assert/strict'
import fs from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { expression } from '@maplibre/maplibre-gl-style-spec'
import path from 'node:path'

function moduleUrl(file) {
  let js = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'))
  for(const match of [...js.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]) {
    const dependency=moduleUrl(path.resolve(path.dirname(file),match[1])+'.ts')
    js=js.replace(match[0],`from '${dependency}'`)
  }
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
}
async function loadTs(file) {
  return import(moduleUrl(file))
}
const { GLOBE_LINE_COLOR, priceFill, applyEnergyTheme } = await loadTs('src/scene/energyGlobe.ts')
const { proxyPriceRows } = await loadTs('src/scene/energyPriceRows.ts')
const evaluator = code => {
  const result = expression.createExpression(code, 'layers[0].paint.line-color', { type: 'color', 'property-type': 'data-driven' })
  assert.equal(result.result, 'success', result.result === 'error' ? result.value.map(v=>v.message).join('; ') : '')
  return properties => String(result.value.evaluate({ zoom: 3 }, { type: 1, properties }))
}
const lineColor = evaluator(GLOBE_LINE_COLOR)
assert.equal(lineColor({ voltage: 220 }), lineColor({ voltage: 220, frequency: 50 }))
assert.equal(lineColor({ voltage: 220, frequency: null }), lineColor({ voltage: 220, frequency: 50 }))
assert.notEqual(lineColor({ voltage: 220 }), lineColor({ voltage: 220, frequency: '0' }))
assert.notEqual(lineColor({ voltage: 110 }), lineColor({ voltage: 500 }))
assert.equal(evaluator(priceFill([], 1, 1))({ name: 'unknown' }), 'rgba(0,0,0,0)')
const single = evaluator(priceFill([['江苏省', 0.3]], 0.3, 0.3))
assert.equal(single({ name: 'unknown' }), 'rgba(0,0,0,0)')
assert.ok(single({ name: '江苏省' }))

const paints = {}, layouts = {}
const space = {enabled:true}
const map = {
  setProjection(v) { this.projection = v.type }, setSky(v) { this.sky = v }, setMinZoom(v) { this.min = v },
  getProjection(){return {type:this.projection??'mercator'}},
  getLayer(id) { return id==='energy-space-backdrop'?{implementation:space}:{} }, setLayoutProperty(id, key, val) { layouts[`${id}.${key}`] = val },
  setPaintProperty(id, key, val) { paints[`${id}.${key}`] = val },
  triggerRepaint() {},
}
const original = { 'oim-background': { 'background-color': '#080b0f' }, 'oim-power-lines': { 'line-width': 2, 'line-color': '#original' } }
applyEnergyTheme(map, '3d', original)
assert.equal(map.projection, 'globe')
assert.equal(layouts['amap-basemap.visibility'], 'none')
assert.equal(layouts['amap-dark-basemap.visibility'], 'visible')
assert.equal(space.enabled,true)
applyEnergyTheme(map, '2d', original,'dark')
assert.equal(space.enabled,false)
assert.equal(layouts['amap-dark-basemap.visibility'],'visible')
assert.equal(paints['oim-background.background-color'],'#080b0f')
applyEnergyTheme(map,'3d',original,'light')
assert.equal(layouts['amap-basemap.visibility'],'visible')
assert.equal(layouts['amap-dark-basemap.visibility'],'none')
applyEnergyTheme(map,'3d',original,'dark',false,false)
assert.equal(layouts['amap-basemap.visibility'],'none')
assert.equal(layouts['amap-dark-basemap.visibility'],'none')
assert.equal(space.enabled,false)
applyEnergyTheme(map, '2d', original, 'light')
assert.equal(map.projection, 'mercator')
assert.equal(layouts['amap-basemap.visibility'], 'visible')
assert.equal(layouts['earth-land-fill.visibility'], 'none')
assert.equal(paints['oim-background.background-color'], '#eef0ed')
assert.equal(paints['oim-power-lines.line-color'], '#original')
applyEnergyTheme(map,'3d',original,'dark',true,true,'blueblack')
assert.equal(layouts['amap-dark-basemap.visibility'],'none')
assert.equal(layouts['amap-blueblack-basemap.visibility'],'visible')
for(let i=0;i<16;i++)applyEnergyTheme(map,i%2?'2d':'3d',original,'dark')
assert.equal(space.enabled,false)

const prices = { 江苏省: { '2026-07': { price: 0.3, peak: 0.6, normal: 0.3, valley: 0.1, subRegions: 2 }, '2026-08': { price: 0.33, peak: 0.66, normal: 0.33, valley: 0.11, subRegions: 2 } } }
const rows = proxyPriceRows(prices, '江苏省', '2026-08', 'price')
assert.ok(rows.some(([k,v]) => k === '环比变化' && v === '+0.0300 (+10.0%)'))
assert.ok(rows.some(([k]) => k === '子区域数'))
assert.equal(proxyPriceRows(prices, '江苏省', '2025-01', 'price'), null)
const inventory = JSON.parse(fs.readFileSync('public/data/energy-plants.geojson'))
assert.equal(inventory.features.length, 34936)
assert.equal(new Set(inventory.features.map(f => f.id)).size, inventory.features.length)
assert.ok(inventory.features.every(f => f.properties.output > 0 && f.properties.archive === 'WRI v1.3 · 2021'))
assert.ok(!fs.readFileSync('src/scene/energyGlobe.ts','utf8').includes('energy-capacity'))
console.log('PASS: voltage, prices, themes, inventory and capacity-column removal.')
