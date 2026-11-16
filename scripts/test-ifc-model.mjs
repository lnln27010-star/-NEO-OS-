import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
const report = JSON.parse(fs.readFileSync('public/models/northbridge/elements.json'))
const glb = fs.readFileSync('public/models/northbridge/building.glb')
assert.equal(glb.readUInt32LE(0), 0x46546c67)
assert.equal(glb.readUInt32LE(4), 2)
assert.equal(glb.readUInt32LE(8), glb.length)
const jsonLength = glb.readUInt32LE(12)
const model = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength))
assert.equal(model.nodes.length, report.elementCount)
assert.equal(new Set(report.elements.map((e) => e.globalId)).size, report.elementCount)
assert.equal(report.sourceSha256, crypto.createHash('sha256').update(fs.readFileSync(report.source)).digest('hex'))
const binStart = 20 + jsonLength + 8
for (const node of model.nodes) {
  assert.ok(node.extras.globalId && node.extras.type)
  for (const primitive of model.meshes[node.mesh].primitives) {
    const position = model.accessors[primitive.attributes.POSITION]
    assert.ok(position.count > 0)
    assert.ok([...position.min, ...position.max].every(Number.isFinite))
    const indices = model.accessors[primitive.indices]
    const view = model.bufferViews[indices.bufferView]
    for (let i = 0; i < indices.count; i++) assert.ok(glb.readUInt32LE(binStart + view.byteOffset + i * 4) < position.count)
  }
}
assert.equal(report.synthetic, true)
assert.equal(report.units, 'metres')
assert.ok(report.typeSummary.IfcRoof && report.typeSummary.IfcColumn && report.typeSummary.IfcDuctSegment)
console.log(`PASS: ${report.elementCount} distinct IFC GlobalIds, finite geometry, valid indices, source SHA-256, ${glb.length} byte GLB.`)
console.log(`Reported conversion limitation: ${report.unsupportedGeometryParts} empty/unsupported geometry parts.`)
