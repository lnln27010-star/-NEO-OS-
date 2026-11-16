import type { Map, ExpressionSpecification, GeoJSONSource, SkySpecification, AllPaintProperties } from 'maplibre-gl'
import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { VisualTheme, BasemapTone } from '../useVisualTheme'
import { EnergySpaceLayer,type EnergySpaceStyle } from './EnergySpaceLayer'

export type EnergyView = '2d' | '3d'
export const ENERGY_SKY: SkySpecification = {
  'sky-color': '#060709', 'horizon-color': '#788790', 'fog-color': '#080a0d',
  'sky-horizon-blend': 0, 'horizon-fog-blend': 0.1,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.14, 3, 0.08, 6, 0],
}
export const PLANT_COLORS: ExpressionSpecification = ['match', ['get', 'source'],
  'solar', '#e3c768', 'wind', '#6fbecb', 'hydro', '#6693d1', 'nuclear', '#c098e3',
  'coal', '#ec9774', 'gas', '#d6b68a', 'oil', '#d6b68a', 'biomass', '#94ba83', '#bac5c9']
export const GLOBE_VOLTAGES = [
  ['#788a96', '< 10'], ['#77a1b4', '10–25'], ['#d69978', '25–52'], ['#d8c16c', '52–132'],
  ['#7ac7d0', '132–220'], ['#729fe0', '220–310'], ['#b5a2de', '310–550'], ['#6dcbb0', '≥ 550'],
] as const
export const GLOBE_LINE_COLOR: ExpressionSpecification = ['case',
  ['==', ['to-number', ['coalesce', ['get', 'frequency'], 50], 50], 0], '#bc8edb',
  ['all', ['!=', ['to-number', ['coalesce', ['get', 'frequency'], 50], 50], 50], ['!=', ['to-number', ['coalesce', ['get', 'frequency'], 50], 50], 60]], '#94a882',
  ['step', ['to-number', ['coalesce', ['get', 'voltage'], 0], 0], GLOBE_VOLTAGES[0][0],
    10, GLOBE_VOLTAGES[1][0], 25, GLOBE_VOLTAGES[2][0], 52, GLOBE_VOLTAGES[3][0], 132, GLOBE_VOLTAGES[4][0],
    220, GLOBE_VOLTAGES[5][0], 310, GLOBE_VOLTAGES[6][0], 550, GLOBE_VOLTAGES[7][0]]]
const appliedThemes = new WeakMap<Map, string>()
let plantInventory:FeatureCollection<Point>|undefined
let inventoryPromise:Promise<FeatureCollection<Point>>|undefined
function loadPlantInventory() {
  return inventoryPromise??=fetch('/data/energy-plants.geojson').then(response=>{
    if(!response.ok)throw new Error(`Plant archive HTTP ${response.status}`)
    return response.json() as Promise<FeatureCollection<Point>>
  }).then(data=>{
    if(!Array.isArray(data.features))throw new Error('Invalid plant archive')
    plantInventory=data
    return data
  }).catch(error=>{inventoryPromise=undefined;throw error})
}

export function addGlobeLayers(map: Map) {
  if(map.getSource('earth-land')) return
  map.addLayer(new EnergySpaceLayer(), 'oim-background')
  map.addSource('earth-land', { type: 'geojson', data: '/data/earth-land.geojson' })
  map.addSource('earth-borders', { type: 'geojson', data: '/data/earth-borders.geojson' })
  const features: Feature<LineString>[] = []
  for (let lat = -60; lat <= 60; lat += 30) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 181 }, (_, i) => [-180 + i * 2, lat]) } })
  for (let lng = -180; lng < 180; lng += 30) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 81 }, (_, i) => [lng, -80 + i * 2]) } })
  map.addSource('earth-graticule', { type: 'geojson', data: { type: 'FeatureCollection', features } })
  const hidden = { visibility: 'none' as const }
  map.addLayer({ id: 'earth-land-fill', type: 'fill', source: 'earth-land', layout: hidden, paint: { 'fill-color': '#191e23', 'fill-opacity': 1 } }, 'oim-power-lines')
  map.addLayer({ id: 'earth-coast', type: 'line', source: 'earth-land', layout: hidden, paint: { 'line-color': '#53616c', 'line-width': 0.65, 'line-opacity': 0.52 } }, 'oim-power-lines')
  map.addLayer({ id: 'earth-borders-line', type: 'line', source: 'earth-borders', layout: hidden, paint: { 'line-color': '#69747e', 'line-width': 0.6, 'line-opacity': 0.35 } }, 'oim-power-lines')
  map.addLayer({ id: 'earth-grid', type: 'line', source: 'earth-graticule', layout: hidden, paint: { 'line-color': '#83919e', 'line-width': 0.5, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.07, 3, 0.04, 5, 0] } }, 'oim-power-lines')
  map.addSource('amap-dark', { type: 'raster', tiles: ['amap-dark://tiles/black/{z}/{x}/{y}'], tileSize: 256, attribution: '© 高德地图', maxzoom: 18 })
  map.addLayer({ id: 'amap-dark-basemap', type: 'raster', source: 'amap-dark', layout: hidden, paint: { 'raster-opacity': 1, 'raster-fade-duration': 250 } }, 'earth-coast')
  map.addSource('amap-blueblack', { type:'raster',tiles:['amap-dark://tiles/blueblack/{z}/{x}/{y}'],tileSize:256,attribution:'© 高德地图',maxzoom:18 })
  map.addLayer({id:'amap-blueblack-basemap',type:'raster',source:'amap-blueblack',layout:hidden,paint:{'raster-opacity':1,'raster-fade-duration':250}},'earth-coast')
  map.moveLayer('amap-basemap','earth-coast')
  const original = map.getStyle().layers.find(l => l.id === 'oim-power-lines')!
  if (original.type === 'line') map.addLayer({ ...original, id: 'energy-line-glow', layout: hidden, paint: { ...original.paint, 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 2, 4, 4, 10, 8], 'line-blur': 2.5, 'line-opacity': 0.24 } }, 'oim-power-lines')
  map.addSource('energy-plant-archive', { type: 'geojson', data: plantInventory??{type:'FeatureCollection',features:[]}, maxzoom: 6, attribution: 'WRI Global Power Plant Database v1.3 (2021), CC BY 4.0', buffer: 0 })
  if(!plantInventory){let attached=true;map.once('remove',()=>{attached=false});void loadPlantInventory().then(data=>{if(attached)(map.getSource('energy-plant-archive') as GeoJSONSource|undefined)?.setData(data)}).catch(error=>{if(attached)console.warn('Plant archive unavailable',error)})}
  map.addLayer({ id: 'energy-generation-glow', type: 'circle', source: 'energy-plant-archive', maxzoom: 6, layout: hidden, paint: { 'circle-color': PLANT_COLORS, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 3, 4, 6, 7], 'circle-blur': 0.85, 'circle-opacity': 0.18 } })
  map.addLayer({ id: 'energy-generation-points', type: 'circle', source: 'energy-plant-archive', maxzoom: 6, layout: hidden, paint: { 'circle-color': PLANT_COLORS, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 0.65, 2, 1, 4, 1.45, 6, 2.4], 'circle-opacity': 0.88 } })
}

/** Keep the same sources and feature handlers while changing only the presentation. */
export function applyEnergyTheme(map: Map, view: EnergyView, basePaint: Record<string, Record<string, unknown>>, theme: VisualTheme = 'dark', basemapVisible = true, spaceVisible = true, tone:BasemapTone='black',spaceStyle:EnergySpaceStyle='galaxy') {
  const globe = view === '3d'
  const dark = theme === 'dark'
  const identity=`${view}/${theme}`
  const changed=appliedThemes.get(map)!==identity
  if(changed) {
    if(map.getProjection()?.type!==(globe?'globe':'mercator')) map.setProjection({ type: globe ? 'globe' : 'mercator' })
    map.setSky(globe && dark ? ENERGY_SKY : { 'atmosphere-blend': 0, 'sky-color': dark ? '#080b0f' : '#eef0ed', 'horizon-color': dark ? '#080b0f' : '#eef0ed' })
    map.setMinZoom(globe ? 0 : 2)
    appliedThemes.set(map,identity)
  }
  map.setLayoutProperty('amap-basemap', 'visibility', !dark && basemapVisible ? 'visible' : 'none')
  if(map.getLayer('amap-dark-basemap')) map.setLayoutProperty('amap-dark-basemap', 'visibility', dark && basemapVisible && tone==='black' ? 'visible' : 'none')
  if(map.getLayer('amap-blueblack-basemap')) map.setLayoutProperty('amap-blueblack-basemap','visibility',dark && basemapVisible && tone==='blueblack'?'visible':'none')
  for (const id of ['earth-land-fill', 'earth-coast', 'earth-borders-line', 'earth-grid']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', globe || dark ? 'visible' : 'none')
  const spaceLayer = map.getLayer('energy-space-backdrop') as unknown as { implementation?: EnergySpaceLayer } | undefined
  const space = spaceLayer?.implementation
  if (space) {space.enabled = globe && dark && spaceVisible;space.setBackgroundStyle?.(spaceStyle)}
  map.triggerRepaint()
  if(!changed) return
  for (const [id, paint] of Object.entries(basePaint)) if (map.getLayer(id)) for (const [property, value] of Object.entries(paint)) map.setPaintProperty(id, property as keyof AllPaintProperties, value as Parameters<Map['setPaintProperty']>[2])
  map.setPaintProperty('oim-background', 'background-color', dark ? '#080b0f' : '#eef0ed')
  if (!dark) return
  map.setPaintProperty('oim-power-lines', 'line-color', GLOBE_LINE_COLOR)
  if (map.getLayer('energy-line-glow')) map.setPaintProperty('energy-line-glow', 'line-color', GLOBE_LINE_COLOR)
  map.setPaintProperty('oim-power-lines', 'line-width', ['interpolate', ['linear'], ['zoom'], 0, 0.55, 3, 0.85, 7, 1.45, 13, 3])
  map.setPaintProperty('oim-power-lines', 'line-blur', 0.2)
  map.setPaintProperty('oim-power-lines', 'line-opacity', 0.85)
  map.setPaintProperty('oim-plants', 'circle-color', PLANT_COLORS)
  map.setPaintProperty('oim-plants', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 0, 1, 3, 1.6, 8, 3, 13, 6])
  map.setPaintProperty('oim-plants', 'circle-stroke-width', 0)
  map.setPaintProperty('oim-substations', 'circle-color', '#d5b96f')
  map.setPaintProperty('oim-substations', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 0, 0.6, 3, 1.1, 8, 2.5, 13, 5])
  map.setPaintProperty('oim-substations', 'circle-stroke-width', 0)
  if (map.getLayer('china-province-line')) {
    map.setPaintProperty('china-province-line', 'line-color', '#a2b4c4')
    map.setPaintProperty('china-province-line', 'line-opacity', 0.24)
  }
  for (const id of ['china-province-labels', 'oim-substation-name', 'oim-plant-name', 'oim-line-voltage']) if (map.getLayer(id)) {
    map.setPaintProperty(id, 'text-color', '#b9c6cf')
    map.setPaintProperty(id, 'text-halo-color', '#0a0d11')
    map.setPaintProperty(id, 'text-halo-width', 1.4)
  }
}

export function priceFill(entries: [string, number][], min: number, max: number): ExpressionSpecification {
  if (!entries.length) return ['literal', 'rgba(0,0,0,0)']
  const span = Math.max(max - min, 0.0001)
  const [first, ...rest] = entries
  const match: ExpressionSpecification = ['match', ['get', 'name'], first[0], first[1], ...rest.flat(), -1]
  return ['case', ['<', match, 0], 'rgba(0,0,0,0)', ['interpolate', ['linear'], match,
    min, 'rgba(78,184,170,0.55)', min+span*.25, 'rgba(168,203,88,0.55)',
    min+span*.5, 'rgba(239,197,91,0.55)', min+span*.75, 'rgba(232,124,88,0.55)', min+span, 'rgba(209,70,80,0.55)']]
}
