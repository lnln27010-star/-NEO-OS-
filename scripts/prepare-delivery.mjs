import fs from 'node:fs'
import { gzipSync } from 'node:zlib'
const critical=[
  'data/energy-plants.geojson','data/spot-price.json','data/proxy-price-merged.json',
  'data/china-provinces.geojson','data/earth-land.geojson','data/earth-borders.geojson',
  'models/northbridge/building.glb','models/northbridge/elements.json','textures/industrial-workshop.hdr',
]
for(const name of critical) {
  const file=`public/${name}`,output=`${file}.gz`
  if(!fs.existsSync(file))continue
  if(fs.existsSync(output)&&fs.statSync(output).mtimeMs>=fs.statSync(file).mtimeMs)continue
  const source=fs.readFileSync(file),compressed=gzipSync(source,{level:9})
  fs.writeFileSync(output,compressed)
  console.log(`${name}: ${(source.length/1024).toFixed(0)} KB → ${(compressed.length/1024).toFixed(0)} KB`)
}
