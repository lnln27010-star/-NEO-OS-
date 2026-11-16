import assert from 'node:assert/strict'
import fs from 'node:fs'
import {calculateIdc,emptyIdcModel} from '../src/idcInvestment.ts'
import {importIdcWorkbook} from '../src/idcWorkbookImport.ts'

assert.equal(calculateIdc(emptyIdcModel()).available,false)
if(process.argv[2]){
  const bytes=fs.readFileSync(process.argv[2])
  const {model}=await importIdcWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'reference.xlsx')
  const result=calculateIdc(model)
  assert.equal(model.phases.length,1)
  assert.equal(result.available,true)
  assert.equal(model.startYear,2027)
  assert.ok(Math.abs(result.steadyRackRevenueYuan-2742452830.1886787)<1)
  assert.ok(Math.abs(result.steadyEbitdaYuan-2311887735.849056)<1)
  assert.ok(Math.abs(result.years.find(row=>row.year===2028).revenueYuan-625471698.1132075)<1)
  assert.ok(Math.abs(result.years.find(row=>row.year===2029).revenueYuan-2014740566.037736)<1)
  assert.equal(result.totalCapexYuan,19505000000)
  assert.equal(result.years.find(row=>row.year===2028).electricityYuan,null)
  assert.equal(result.projectNpvYuan,null)
  assert.equal(result.equityIrrPct,null)
  const financed=calculateIdc({...model,discountPct:7,loanPct:50,loanRatePct:4,loanYears:7})
  assert.ok(Number.isFinite(financed.projectNpvYuan))
  assert.ok(Number.isFinite(financed.equityIrrPct))
  const expensive=calculateIdc({...model,phases:model.phases.map(phase=>({...phase,capexTargetYuanKw:phase.capexTargetYuanKw*1.2}))})
  assert.ok(expensive.projectIrrPct<result.projectIrrPct)
  const higherRent=calculateIdc({...model,phases:model.phases.map(phase=>({...phase,rack1:{...phase.rack1,grossYuanKwMonth:phase.rack1.grossYuanKwMonth*1.1}}))})
  assert.ok(higherRent.projectIrrPct>result.projectIrrPct)
}
console.log('IDC investment model assertions passed')
