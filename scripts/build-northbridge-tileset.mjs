import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const input = path.join(root, 'public/models/northbridge/building.glb')
const outDir = path.join(root, 'public/models/northbridge/tileset')
fs.mkdirSync(outDir, { recursive: true })
const b3dm = path.join(outDir, 'northbridge.b3dm')
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['3d-tiles-tools', 'glbToB3dm', input, b3dm, '--force'], { stdio: 'inherit' })
const rad = (degrees) => degrees * Math.PI / 180
const lon = 118.767413, lat = 32.041544
const tileset = {
  asset: { version: '1.0', generator: 'Northbridge research alignment / 3d-tiles-tools' },
  geometricError: 200,
  root: {
    boundingVolume: { region: [rad(lon - 0.0012), rad(lat - 0.0010), rad(lon + 0.0012), rad(lat + 0.0010), 0, 80] },
    geometricError: 0,
    refine: 'ADD',
    content: { uri: 'northbridge.b3dm' },
  },
}
fs.writeFileSync(path.join(outDir, 'tileset.json'), JSON.stringify(tileset, null, 2))
console.log(`Wrote ${path.relative(root, path.join(outDir, 'tileset.json'))}`)
