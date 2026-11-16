import fs from 'node:fs'
import path from 'node:path'
import {stripTypeScriptTypes} from 'node:module'
import {pathToFileURL} from 'node:url'
import assert from 'node:assert/strict'
const dir='artifacts/foundation-tests';fs.mkdirSync(dir,{recursive:true})
globalThis.location={search:''}
for(const name of ['foundationData','equipmentModel','equipmentConnections','operationsModel'])fs.writeFileSync(`${dir}/${name}.mjs`,stripTypeScriptTypes(fs.readFileSync(`src/${name}.ts`,'utf8')).replace(/from '\.\.\/([^']+)'/g,"from './$1.mjs'").replace(/from '\.\/([^']+)'/g,"from './$1.mjs'"))
const f=await import(pathToFileURL(path.resolve(`${dir}/foundationData.mjs`)))
const {defaultEquipment}=await import(pathToFileURL(path.resolve(`${dir}/equipmentModel.mjs`)))
const rows=f.parseCsv('\uFEFFid,name,kind,capacity\r\nR-1,"一号,机柜",rack,20\r\n')
const assets=f.importAssets(rows,[]);assert.equal(assets[0].name,'一号,机柜');assert.equal(assets[0].capacity,20)
assert.throws(()=>f.parseCsv('id,id\n1,2'),/重复/)
assert.throws(()=>f.importAssets([...rows,...rows],[]),/重复/)
assert.throws(()=>f.importAssets([{id:'A',kind:'rack',capacity:'NaN'}],[]),/数值/)
const exported=f.encodeCsv([f.assetCsv(assets[0])]);assert.equal(f.parseCsv(exported)[0].name,'一号,机柜')
const negative=f.parseCsv(f.encodeCsv([{x:-42,name:'=unsafe'}]))[0];assert.equal(Number(negative.x),-42);assert.equal(negative.name,"'=unsafe")
const center=f.syncLayout(f.emptyCenter(),defaultEquipment());assert.equal(center.assets.length,540);assert.equal(center.assets.filter(a=>a.kind==='rack').length,384)
assert.ok(center.cables.length>500);assert.ok(center.assets.every(a=>a.source==='model'));assert.ok(center.cables.every(c=>c.length_m===null))
center.assets[0].manufacturer='现场资料';center.assets[0].source='manual';center.assets[0].capacity=77
const next=f.syncLayout(center,defaultEquipment());assert.equal(next.assets[0].manufacturer,'现场资料');assert.equal(next.assets[0].capacity,77);assert.equal(next.cables.length,center.cables.length)
console.log('PASS: CSV quoting, bounds, duplicate IDs, current 540-asset synchronization, preservation of maintained records.')
