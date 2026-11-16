import fs from 'node:fs'
import XLSX from 'xlsx'

// Reproducible conversion of WRI's public v1.3 historical facility inventory.
const input = process.argv[2] ?? 'artifacts/energy-globe-reference/global-power-plants.csv'
const workbook = XLSX.read(fs.readFileSync(input), { type: 'buffer', raw: true })
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
const fuel = { Solar: 'solar', Wind: 'wind', Hydro: 'hydro', Nuclear: 'nuclear', Coal: 'coal', Gas: 'gas', Oil: 'oil', Biomass: 'biomass', Waste: 'waste', Geothermal: 'geothermal', Storage: 'battery', Other: 'other' }
const features = rows.flatMap(row => {
  const lng = Number(row.longitude), lat = Number(row.latitude), output = Number(row.capacity_mw)
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90 || output <= 0) return []
  return [{ type: 'Feature', id: row.gppd_idnr, properties: { name: row.name, source: fuel[row.primary_fuel] ?? 'other', output, country: row.country_long, archive: 'WRI v1.3 · 2021', origin: row.source }, geometry: { type: 'Point', coordinates: [lng, lat] } }]
})
if (features.length < 30000) throw new Error('Incomplete WRI inventory; refusing to replace the snapshot.')
fs.writeFileSync('public/data/energy-plants.geojson', JSON.stringify({ type: 'FeatureCollection', features }))
console.log(`Converted ${features.length} historical power facilities; no synthetic records.`)
