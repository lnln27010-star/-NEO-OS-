import assert from 'node:assert/strict'
import {rankRegions} from '../src/nationalOpportunityRanking.ts'
const rows=[
  {key:'A',province:'甲省',city:'',price:.3,solar:4,wind:4,summer:25,contractMw:null,verifiedGates:null,blocked:false},
  {key:'B',province:'乙省',city:'',price:.5,solar:5,wind:5,summer:20,contractMw:null,verifiedGates:null,blocked:false},
]
const preliminary=rankRegions(rows)
assert.equal(preliminary[0].scores.overall,null)
assert.equal(preliminary[1].scores.overall,null)
assert.ok(preliminary.every(row=>row.coverage===2))
assert.equal(rankRegions(rows,undefined,'economics')[0].key,'A')
assert.equal(rankRegions(rows,undefined,'resource')[0].key,'B')
const thin=[...rows,{key:'C',province:'丙省',city:'',price:null,solar:7,wind:8,summer:8,contractMw:null,verifiedGates:null,blocked:false}]
assert.notEqual(rankRegions(thin)[0].key,'C')
const complete=rankRegions(rows.map((row,i)=>({...row,contractMw:i?10:1,verifiedGates:i?6:3})))
assert.equal(complete[0].key,'B')
assert.ok(complete[0].scores.overall!==null)
const blocked=rankRegions(rows.map((row,i)=>({...row,contractMw:i?10:1,verifiedGates:6,blocked:i===1})))
assert.equal(blocked[0].key,'A')
assert.equal(blocked[1].scores.overall,null)
console.log('National ranking assertions passed')
