import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { IfcAPI, LogLevel } from 'web-ifc'
import { Matrix4, Matrix3, Vector3 } from 'three'

// Offline derivative: original coordinates and GlobalIds survive tessellation.
const source = process.argv[2] ?? 'public/data/northbridge_data_hall/geometry/northbridge_data_hall.ifc'
const destination = process.argv[3] ?? 'public/models/northbridge'
const bytes = fs.readFileSync(source)
const api = new IfcAPI()
await api.Init()
api.SetLogLevel(LogLevel.LOG_LEVEL_OFF)
const modelID = api.OpenModel(new Uint8Array(bytes), { COORDINATE_TO_ORIGIN: false })
const model = { asset: { version: '2.0', generator: 'web-ifc 0.0.78 / local IFC derivative' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] }
const binary = []
let offset = 0
const elements = []
const typeSummary = {}
const extent = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
const materialIds = new Map()
const palettes = {
  IfcWall: [0.56, 0.59, 0.58], IfcRoof: [0.68, 0.7, 0.68], IfcSlab: [0.52, 0.53, 0.5],
  IfcColumn: [0.3, 0.32, 0.32], IfcBeam: [0.34, 0.36, 0.36], IfcPlate: [0.6, 0.63, 0.62],
  IfcWindow: [0.07, 0.13, 0.16], IfcDoor: [0.19, 0.22, 0.23], IfcDuctSegment: [0.43, 0.47, 0.48],
  IfcPipeSegment: [0.12, 0.27, 0.31], IfcCovering: [0.77, 0.77, 0.73], IfcMechanicalFastener: [0.28, 0.3, 0.31],
}
function material(type) {
  if (materialIds.has(type)) return materialIds.get(type)
  const id = model.materials.length
  model.materials.push({ name: type, pbrMetallicRoughness: { baseColorFactor: [...(palettes[type] ?? [0.36, 0.38, 0.38]), 1], metallicFactor: /Beam|Column|Duct|Pipe|Fastener/.test(type) ? 0.48 : 0.05, roughnessFactor: type === 'IfcWindow' ? 0.18 : 0.7 }, doubleSided: true })
  materialIds.set(type, id)
  return id
}
function accessor(array, componentType, type, target, min, max) {
  const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength)
  const padding = (4 - buffer.length % 4) % 4
  const bufferView = model.bufferViews.length
  model.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length, target })
  binary.push(buffer, Buffer.alloc(padding)); offset += buffer.length + padding
  const index = model.accessors.length
  model.accessors.push({ bufferView, byteOffset: 0, componentType, count: array.length / (type === 'VEC3' ? 3 : 1), type, ...(min ? { min, max } : {}) })
  return index
}
let failedGeometry = 0
api.StreamAllMeshes(modelID, (flatMesh) => {
  const line = api.GetLine(modelID, flatMesh.expressID)
  const type = api.GetNameFromTypeCode(line.type)
  const primitives = []
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  for (let i = 0; i < flatMesh.geometries.size(); i++) {
    const placed = flatMesh.geometries.get(i)
    const geo = api.GetGeometry(modelID, placed.geometryExpressID)
    const vertices = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize())
    const indices = new Uint32Array(api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize()))
    if (!indices.length || !vertices.length) { failedGeometry++; geo.delete(); continue }
    const positions = new Float32Array(vertices.length / 2)
    const normals = new Float32Array(vertices.length / 2)
    const matrix = new Matrix4().fromArray(placed.flatTransformation)
    const normalMatrix = new Matrix3().getNormalMatrix(matrix)
    const v = new Vector3()
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let n = 0; n < vertices.length / 6; n++) {
      v.set(vertices[n * 6], vertices[n * 6 + 1], vertices[n * 6 + 2]).applyMatrix4(matrix)
      positions.set(v.toArray(), n * 3)
      for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], positions[n * 3 + axis]); max[axis] = Math.max(max[axis], positions[n * 3 + axis]) }
      v.set(vertices[n * 6 + 3], vertices[n * 6 + 4], vertices[n * 6 + 5]).applyMatrix3(normalMatrix).normalize()
      normals.set(v.toArray(), n * 3)
    }
    if (![...min, ...max].every(Number.isFinite)) throw new Error(`Non-finite IFC geometry #${flatMesh.expressID}`)
    for (let axis = 0; axis < 3; axis++) { bounds.min[axis] = Math.min(bounds.min[axis], min[axis]); bounds.max[axis] = Math.max(bounds.max[axis], max[axis]); extent.min[axis] = Math.min(extent.min[axis], min[axis]); extent.max[axis] = Math.max(extent.max[axis], max[axis]) }
    primitives.push({ attributes: { POSITION: accessor(positions, 5126, 'VEC3', 34962, min, max), NORMAL: accessor(normals, 5126, 'VEC3', 34962) }, indices: accessor(indices, 5125, 'SCALAR', 34963), material: material(type) })
    geo.delete()
  }
  if (!primitives.length) return
  const element = { expressId: flatMesh.expressID, globalId: line.GlobalId?.value, name: line.Name?.value ?? type, type, bounds }
  elements.push(element)
  typeSummary[type] = (typeSummary[type] ?? 0) + 1
  const mesh = model.meshes.length
  model.meshes.push({ name: `${type}_${flatMesh.expressID}`, primitives })
  model.scenes[0].nodes.push(model.nodes.length)
  model.nodes.push({ name: `${type}_${flatMesh.expressID}`, mesh, extras: element })
})
api.CloseModel(modelID); api.Dispose()
model.buffers.push({ byteLength: offset })
const json = Buffer.from(JSON.stringify(model))
const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)])
const bin = Buffer.concat(binary)
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + paddedJson.length + 8 + bin.length, 8)
const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(paddedJson.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4)
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4)
fs.mkdirSync(destination, { recursive: true })
fs.writeFileSync(path.join(destination, 'building.glb'), Buffer.concat([header, jsonHeader, paddedJson, binHeader, bin]))
const report = { name: 'Northbridge Data Hall', synthetic: true, source, sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'), units: 'metres', upAxis: 'Y', elementCount: elements.length, unsupportedGeometryParts: failedGeometry, extent, typeSummary, elements }
fs.writeFileSync(path.join(destination, 'elements.json'), JSON.stringify(report))
console.log(JSON.stringify({ ...report, elements: undefined, glbBytes: fs.statSync(path.join(destination, 'building.glb')).size }, null, 2))
