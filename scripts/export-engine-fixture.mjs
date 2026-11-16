import fs from 'node:fs'
import path from 'node:path'
import {stripTypeScriptTypes} from 'node:module'
import {pathToFileURL} from 'node:url'
import assert from 'node:assert/strict'
const dir='artifacts/engine-fixture';fs.mkdirSync(dir,{recursive:true})
for(const name of ['equipmentModel','equipmentConnections','operationsModel','thermalDynamics','engineeringSimulation'])fs.writeFileSync(`${dir}/${name}.mjs`,stripTypeScriptTypes(fs.readFileSync(`src/${name}.ts`,'utf8')).replace(/from '\.\/([^']+)'/g,"from './$1.mjs'"))
const load=name=>import(pathToFileURL(path.resolve(`${dir}/${name}.mjs`)))
const {defaultEquipment}=await load('equipmentModel'),{DEFAULT_PARAMETERS}=await load('operationsModel'),{advanceOperatingFrame}=await load('thermalDynamics'),{createEngineeringSnapshot}=await load('engineeringSimulation')
const layout=defaultEquipment(),frame=advanceOperatingFrame({scenario:'baseline',seconds:0,load:70,layout,parameters:DEFAULT_PARAMETERS}),snapshot=createEngineeringSnapshot(layout,frame)
fs.writeFileSync(`${dir}/full-model.json`,JSON.stringify(snapshot,null,2))
assert.equal(createEngineeringSnapshot(structuredClone(layout),frame).revision,snapshot.revision)
const moved={...layout,'CHWP-01':{...layout['CHWP-01'],x:layout['CHWP-01'].x+.25}}
assert.notEqual(createEngineeringSnapshot(moved,frame).revision,snapshot.revision)
assert.notEqual(createEngineeringSnapshot(layout,{...frame,load:80}).revision,snapshot.revision)
assert.equal(snapshot.devices.find(d=>d.id==='R-A01').demand_kw,11.2)
assert.ok(snapshot.devices.find(d=>d.id==='CH-01').demand_kw>0)
console.log(`${snapshot.devices.length} devices, revision ${snapshot.revision}, ${snapshot.devices.filter(d=>d.kind==='rack').length} racks`)
