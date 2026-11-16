import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
const base=process.argv[2]??'http://127.0.0.1:4186'
const identity=await(await fetch(`${base}/__project`)).json()
assert.equal(identity.project,'compute-power-twin-copy')
const built=JSON.parse(fs.readFileSync('dist/build-version.json','utf8'));assert.equal(identity.build,built.build);assert.equal(identity.release,'7.0')
const html=await fetch(`${base}/?scene=room`);assert.equal(html.headers.get('cache-control'),'no-store');assert.ok((await html.text()).includes('type="module"'))
const checksum=data=>createHash('sha256').update(data).digest('hex')
for(const name of ['data/energy-plants.geojson','models/northbridge/building.glb','data/china-provinces.geojson']) {
  const r=await fetch(`${base}/${name}`)
  assert.equal(r.status,200)
  assert.equal(r.headers.get('content-encoding'),'gzip')
  const body=Buffer.from(await r.arrayBuffer()),original=fs.readFileSync(`public/${name}`)
  assert.equal(checksum(body),checksum(original),'Compressed delivery must preserve the complete original asset')
  const etag=r.headers.get('etag')
  const cached=await fetch(`${base}/${name}`,{headers:{'If-None-Match':etag}})
  assert.equal(cached.status,304)
  console.log(`${name}: ${original.length} original bytes, ${r.headers.get('content-length')} delivered bytes; SHA256 preserved, revalidation 304.`)
}
console.log('PASS: project identity, asset compression, lossless data delivery and HTTP cache validation.')
