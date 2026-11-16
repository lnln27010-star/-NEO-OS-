import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ChevronDown, Compass, Expand, Globe2, Layers, Map, Minus, Pause, Play, Plus, RotateCcw, Search, X } from 'lucide-react'
import { addGlobeLayers, applyEnergyTheme, GLOBE_VOLTAGES, priceFill, type EnergyView } from './energyGlobe'
import './energy-map.css'
import { proxyPriceRows } from './energyPriceRows'
import { registerAmapDarkProtocol } from './amapDarkTiles'
import { useVisualTheme } from '../useVisualTheme'
import type {EnergySpaceStyle} from './EnergySpaceLayer'
import { useDesignerStore } from '../useDesignerStore'
import {usePortalStore} from '../usePortalStore'
import {platformApi,type PlatformOverview,type RegisteredCenter} from '../neoPlatform'
import {GlobalCockpitPanel} from './GlobalCockpitPanel'
import { usePriceData, getAllMonths, getPriceRange, PRICE_FIELDS, type PriceField, type PriceData } from './PriceAnalysisPanel'
import { useSpotPriceData, getSpotMean, getSpot24hProfile, getSpotDateKeys, getSpotPriceRange, getBestDateKey, SPOT_TYPES, SPOT_AGGREGATIONS, type SpotPriceData, type SpotAggregation, type SpotType } from './SpotPricePanel'

const OIM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  // NOTE: 高德栅格瓦片使用 GCJ-02 坐标系，OpenInfraMap 电力数据来自 OSM（WGS-84），
  // 两者在中国境内存在几十至数百米偏移，原型阶段可接受，正式发布需统一坐标系。
  // 2026-10-11: 迁移到 OpenInfraMap 新版分类瓦片源（旧 map.json 已标记 DEPRECATED）
  sources: {
    oim_power: { type: 'vector', tiles: ['https://openinframap.org/map/power/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 17, attribution: '© OpenStreetMap contributors, OpenInfraMap' },
    solar_heatmap: { type:'vector', tiles:['https://openinframap.org/heatmap/{z}/{x}/{y}.pbf'], minzoom:2, maxzoom:17, attribution:'© OpenStreetMap contributors, OpenInfraMap' },
    amap: { type: 'raster', tiles: ['https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', 'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', 'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', 'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'], tileSize: 256, attribution: '© 高德地图' },
  },
  layers: [
    { id: 'oim-background', type: 'background', paint: { 'background-color': '#eef0ed' } },
    { id: 'amap-basemap', type: 'raster', source: 'amap', paint: { 'raster-opacity': 1 } },
    // 输电线路 — 使用电气化色系，与高德道路线条明显区分：
    // 道路多为黄/橙/灰白色，故电线路采用蓝、紫、青、粉等"电流"色调
    // 加 line-blur 微光晕 + 提高线宽，使网架结构在底图上更醒目
    { id: 'oim-power-lines', type: 'line', source: 'oim_power', 'source-layer': 'power_line',
      paint: {
        'line-color': [
          'case',
          // HVDC 直流
          ['==', ['to-number', ['coalesce', ['get', 'frequency'], 50], 50], 0], '#7C00D6',
          // Traction current 牵引
          ['all', ['!=', ['to-number', ['coalesce', ['get', 'frequency'], 50], 50], 50], ['!=', ['to-number', ['coalesce', ['get', 'frequency'], 50], 50], 60]], '#94A882',
          // Normal AC by voltage
          ['step', ['coalesce', ['to-number', ['get', 'voltage']], 0],
            '#90A4AE',     // default / < 10kV — steel blue-gray
            10, '#D500F9',  // ≥ 10kV — electric magenta
            25, '#FF3D00',  // ≥ 25kV — high-voltage red-orange
            52, '#FFC400',  // ≥ 52kV — amber gold
            132, '#00E5FF', // ≥ 132kV — bright cyan
            220, '#2979FF', // ≥ 220kV — electric blue
            310, '#AA00FF', // ≥ 310kV — deep purple
            550, '#00BFA5', // ≥ 550kV — teal green
          ],
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.1, 8, 2.6, 13, 5.2],
        'line-opacity': 0.97,
        'line-blur': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 8, 1.2, 13, 2],
      },
    },
    { id: 'oim-substations', type: 'circle', source: 'oim_power', 'source-layer': 'power_substation_point', paint: { 'circle-color': '#efc55b', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2, 10, 5, 15, 8], 'circle-stroke-color': '#fff1aa', 'circle-stroke-width': 1 } },
    { id: 'oim-plants', type: 'circle', source: 'oim_power', 'source-layer': 'power_plant_point', paint: { 'circle-color': '#e47d68', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.5, 10, 6], 'circle-stroke-color': '#ffd0b9', 'circle-stroke-width': 1 } },
    { id: 'oim-towers', type: 'circle', source: 'oim_power', 'source-layer': 'power_tower', filter: ['==',['get','type'],'tower'], minzoom: 7, paint: { 'circle-radius':['interpolate',['linear'],['zoom'],7,2,11,4], 'circle-color':'#f9fbf6','circle-stroke-color':'#1f2d33','circle-stroke-width':1.4 } },
  ],
}
maplibregl.setWorkerUrl(maplibreWorkerUrl)
registerAmapDarkProtocol()

function createAssetIcon(kind: 'substation' | 'plant' | 'solar') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 48
  const ctx = canvas.getContext('2d')!; ctx.clearRect(0, 0, 48, 48)
  ctx.fillStyle = '#f8fbf5'; ctx.strokeStyle = kind === 'solar' ? '#e5b945' : kind === 'plant' ? '#d26d55' : '#5e91a7'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.roundRect(4, 4, 40, 40, 5); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = '#1e2c32'; ctx.lineWidth = 2
  if (kind === 'substation') { for (let x = 12; x <= 36; x += 8) { ctx.beginPath(); ctx.moveTo(x, 13); ctx.lineTo(x, 35); ctx.stroke() } ctx.beginPath(); ctx.moveTo(10, 20); ctx.lineTo(38, 20); ctx.moveTo(10, 29); ctx.lineTo(38, 29); ctx.stroke() }
  if (kind === 'plant') { ctx.fillStyle = '#344148'; ctx.fillRect(12, 24, 24, 11); ctx.fillRect(17, 14, 5, 10); ctx.fillRect(28, 10, 5, 14) }
  if (kind === 'solar') { ctx.fillStyle = '#e5b945'; ctx.fillRect(12, 23, 24, 11); ctx.strokeStyle = '#9f7a1e'; for (let x=16;x<36;x+=7) { ctx.beginPath();ctx.moveTo(x,23);ctx.lineTo(x,34);ctx.stroke() } ctx.beginPath();ctx.moveTo(12,28);ctx.lineTo(36,28);ctx.stroke() }
  return ctx.getImageData(0, 0, 48, 48)
}

type PriceTab = 'solar' | 'proxy' | 'spot'

export function ChinaMapViewport() {
  const theme = useVisualTheme(s => s.theme)
  const basemapTone=useVisualTheme(s=>s.basemapTone)
  const themeRef = useRef(theme)
  themeRef.current = theme
  const [basemapVisible, setBasemapVisible] = useState(true)
  const [spaceVisible, setSpaceVisible] = useState(true)
  const [spaceStyle,setSpaceStyle]=useState<EnergySpaceStyle>(()=>{try{return localStorage.getItem('energy-space-style')==='stars'?'stars':'galaxy'}catch{return 'galaxy'}})
  const mapNode = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const initializedMapRef=useRef<maplibregl.Map|null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const basePaint = useRef<Record<string, Record<string, unknown>>>({})
  const [view, setView] = useState<EnergyView>(() => {
    try { return localStorage.getItem('energy-map-view') === '2d' ? '2d' : '3d' } catch { return '3d' }
  })
  const viewRef = useRef(view)
  const provinceCenters = useRef<Record<string, [number, number]>>({})
  viewRef.current = view
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [rotating, setRotating] = useState(false)
  const [focused, setFocused] = useState(false)
  const [camera, setCamera] = useState({ lng: 104, lat: 32, zoom: 1.9 })
  const [region, setRegion] = useState('china')
  const sceneScope = useDesignerStore(s => s.sceneScope)
  const [powerVisible, setPowerVisible] = useState(true)
  const [substationsVisible, setSubstationsVisible] = useState(true)
  const [plantsVisible, setPlantsVisible] = useState(true)
  const [boundaryVisible, setBoundaryVisible] = useState(true)
  const [sitesVisible, setSitesVisible] = useState(true)
  const [lineLabelsVisible, setLineLabelsVisible] = useState(true)
  const [heatVisible, setHeatVisible] = useState(true)
  const [layersOpen, setLayersOpen] = useState(false)
  const [detail, setDetail] = useState<{ title: string; rows: [string, string][] } | null>(null)
  const setScope = useDesignerStore((s) => s.setSceneScope)
  const [overview,setOverview]=useState<PlatformOverview|null>(null)
  const [overviewError,setOverviewError]=useState('')
  const [overviewBusy,setOverviewBusy]=useState(false)
  const selectedCenterId=usePortalStore(s=>s.activeCenterId)
  const selectCenter=(id:string)=>usePortalStore.getState().update({activeCenterId:id})
  const [cockpitOpen,setCockpitOpen]=useState(true)
  const selectedCenter=overview?.centers.find(center=>center.id===selectedCenterId)??null
  const locateCenter=(center:RegisteredCenter)=>{if(center.longitude===null||center.latitude===null||!Number.isFinite(center.longitude)||!Number.isFinite(center.latitude))return;setRotating(false);mapRef.current?.flyTo({center:[center.longitude,center.latitude],zoom:view==='3d'?4.5:7,pitch:0,duration:1100})}
  const refreshOverview=async()=>{
    setOverviewBusy(true);setOverviewError('')
    try{const value=await platformApi<PlatformOverview>('/overview');setOverview(value);const previous=usePortalStore.getState().activeCenterId;if(!value.centers.some(center=>center.id===previous&&!center.archived))selectCenter(value.centers.find(center=>!center.archived)?.id??'')}
    catch(error){setOverviewError((error as Error).message)}finally{setOverviewBusy(false)}
  }
  useEffect(()=>{void refreshOverview()},[])

  // ── 合并电价面板状态 ──
  const [activeTab, setActiveTab] = useState<PriceTab>('solar')
  const [panelExpanded, setPanelExpanded] = useState(false)

  // 代理购电
  const priceData = usePriceData()
  const [priceAnalysisOn, setPriceAnalysisOn] = useState(false)
  const [priceMonth, setPriceMonth] = useState('2026-08')
  const [priceField, setPriceField] = useState<PriceField>('price')
  const [priceDetail, setPriceDetail] = useState<{ province: string; rows: [string, string][] } | null>(null)
  const priceDataRef = useRef<PriceData | null>(null)
  priceDataRef.current = priceData
  const priceAnalysisOnRef = useRef(false)
  priceAnalysisOnRef.current = priceAnalysisOn
  const priceMonthRef = useRef('2026-08')
  priceMonthRef.current = priceMonth
  const priceFieldRef = useRef<PriceField>('price')
  priceFieldRef.current = priceField

  // 现货电价
  const spotData = useSpotPriceData()
  const [spotAnalysisOn, setSpotAnalysisOn] = useState(false)
  const [spotType, setSpotType] = useState<SpotType>('realtime')
  const [spotAggregation, setSpotAggregation] = useState<SpotAggregation>('month')
  const [spotDateKey, setSpotDateKey] = useState('2026-08')
  const [spotDetail, setSpotDetail] = useState<{ province: string; hours: (number | null)[]; mean: number | null } | null>(null)
  const spotDataRef = useRef<SpotPriceData | null>(null)
  spotDataRef.current = spotData
  const spotAnalysisOnRef = useRef(false)
  spotAnalysisOnRef.current = spotAnalysisOn
  const spotTypeRef = useRef<SpotType>('realtime')
  spotTypeRef.current = spotType
  const spotAggRef = useRef<SpotAggregation>('month')
  spotAggRef.current = spotAggregation
  const spotDateKeyRef = useRef('2026-08')
  spotDateKeyRef.current = spotDateKey

  // When spot data loads, auto-select the date key with best province coverage
  useEffect(() => {
    if (!spotData) return
    const best = getBestDateKey(spotData, spotType, spotAggregation)
    if (best && best !== spotDateKey) setSpotDateKey(best)
  }, [spotData])

  // When price analysis is on (not solar), dim other layers for contrast
  const anyPriceAnalysis = priceAnalysisOn || spotAnalysisOn

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!ready||initializedMapRef.current!==map||!overview)return
    const features=overview.centers.filter(center=>!center.archived&&center.latitude!==null&&center.longitude!==null&&Number.isFinite(center.latitude)&&Number.isFinite(center.longitude)).map(center=>({type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[center.longitude!,center.latitude!] as [number,number]},properties:{id:center.id,name:center.name}}))
    const data={type:'FeatureCollection' as const,features}
    const source=map.getSource('registered-centers') as maplibregl.GeoJSONSource|undefined
    if(source)source.setData(data)
    else{
      map.addSource('registered-centers',{type:'geojson',data})
      map.addLayer({id:'registered-center-points',type:'circle',source:'registered-centers',paint:{'circle-radius':7,'circle-color':'#76dbc7','circle-stroke-color':'#07131a','circle-stroke-width':2,'circle-opacity':.96}})
      map.addLayer({id:'registered-center-labels',type:'symbol',source:'registered-centers',minzoom:3,layout:{'text-field':['get','name'],'text-offset':[0,1.35],'text-size':11,'text-allow-overlap':false},paint:{'text-color':'#c9eee7','text-halo-color':'#0d1720','text-halo-width':2}})
    }
    const onSiteClick=(event:maplibregl.MapLayerMouseEvent)=>{const id=String(event.features?.[0]?.properties?.id??'');if(id){selectCenter(id);setCockpitOpen(true)}}
    const onEnter=()=>{map.getCanvas().style.cursor='pointer'}
    const onLeave=()=>{map.getCanvas().style.cursor=''}
    map.on('click','registered-center-points',onSiteClick)
    map.on('mouseenter','registered-center-points',onEnter)
    map.on('mouseleave','registered-center-points',onLeave)
    return()=>{map.off('click','registered-center-points',onSiteClick);map.off('mouseenter','registered-center-points',onEnter);map.off('mouseleave','registered-center-points',onLeave)}
  },[ready,overview])

  useEffect(()=>{
    const map=mapRef.current
    if(!map?.getLayer('registered-center-points'))return
    map.setPaintProperty('registered-center-points','circle-radius',['case',['==',['get','id'],selectedCenterId],9,6])
  },[ready,selectedCenterId,overview])

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return
    const controller = new AbortController()
    let disposed = false
    initializedMapRef.current=null
    const globe = viewRef.current === '3d'
    const initialStyle: maplibregl.StyleSpecification = {
      ...OIM_STYLE,
      layers: OIM_STYLE.layers.map(layer => {
        if (themeRef.current === 'dark' && layer.type === 'raster' && layer.id === 'amap-basemap') return { ...layer, layout: { visibility: 'none' } }
        if (themeRef.current === 'dark' && layer.type === 'background') return { ...layer, paint: { 'background-color': '#080b0f' } }
        return layer
      }),
      glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      projection: { type: globe ? 'globe' : 'mercator' },
    }
    const map = new maplibregl.Map({ container: mapNode.current, style: initialStyle, center: [104, 32], zoom: globe ? 1.9 : 3.5, minZoom: globe ? 0 : 2, maxZoom: 16, attributionControl: false, canvasContextAttributes: { antialias: true }, maxPitch: 70 })
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.on('moveend', () => { const c = map.getCenter(); setCamera({ lng: c.lng, lat: c.lat, zoom: map.getZoom() }) })
    map.on('dragstart', () => setRotating(false))
    map.on('zoomstart', e => { if (e.originalEvent) setRotating(false) })
    map.on('error', event => {
      if (event.error?.message?.includes('openinframap')) setMapError('电网服务暂不可用，正在等待重连')
    })
    // Projection/style changes may emit style.load again. Overlay IDs are installed once.
    map.once('style.load', async () => {
      if(disposed) return
      try {
        addGlobeLayers(map)
        map.addImage('oim-substation-icon', createAssetIcon('substation'))
        map.addImage('oim-plant-icon', createAssetIcon('plant'))
        map.addLayer({ id: 'oim-solar-heat', type: 'heatmap', source: 'solar_heatmap', 'source-layer': 'power_heatmap_solar', minzoom: 2, maxzoom: 9, paint: { 'heatmap-weight': ['interpolate',['linear'],['coalesce',['to-number',['get','output']],1],1,.02,70,.08,250,.18,1000,.32,7000,.5], 'heatmap-intensity': .35, 'heatmap-radius':['interpolate',['linear'],['zoom'],2,12,6,22,9,30], 'heatmap-opacity':.58, 'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(255,255,204,0)',.20,'rgba(255,239,157,0)',.38,'rgba(255,220,93,.22)',.56,'rgba(250,170,61,.38)',.74,'rgba(238,119,46,.50)',1,'rgba(213,78,54,.62)'] } }, 'oim-power-lines')
        map.addLayer({ id: 'oim-line-voltage', type: 'symbol', source: 'oim_power', 'source-layer': 'power_line', filter: ['all',['has','voltage'],['>=',['to-number',['get','voltage']],100]], minzoom: 6, layout: { 'symbol-placement':'line', 'symbol-spacing': 360, 'text-field':['concat',['to-string',['round',['to-number',['get','voltage']]]],' kV'], 'text-size':11, 'text-keep-upright':true }, paint: { 'text-color':'#233038','text-halo-color':'#ffffff','text-halo-width':1.5 } })
        map.addLayer({ id: 'oim-substation-icon-layer', type:'symbol', source:'oim_power', 'source-layer':'power_substation_point', minzoom:5, layout:{'icon-image':'oim-substation-icon','icon-size':['interpolate',['linear'],['zoom'],5,.42,10,.72],'icon-allow-overlap':false} })
        map.addLayer({ id: 'oim-plant-icon-layer', type:'symbol', source:'oim_power', 'source-layer':'power_plant_point', minzoom:5, layout:{'icon-image':'oim-plant-icon','icon-size':['interpolate',['linear'],['zoom'],5,.42,10,.72],'icon-allow-overlap':false} })
        const substationName = ['case', ['has', 'name'], ['get', 'name'], ['case', ['has', 'ref'], ['get', 'ref'], ['case', ['has', 'voltage'], ['concat', ['to-string', ['round', ['to-number', ['get', 'voltage']]]], ' kV 变电站'], '变电站']]] as maplibregl.ExpressionSpecification
        const plantName = ['case', ['has', 'name'], ['get', 'name'], ['match', ['get', 'source'], 'coal', '火电站', 'gas', '燃气电站', 'oil', '燃油电站', 'diesel', '柴油电站', 'nuclear', '核电站', 'hydro', '水电站', 'solar', '太阳能电站', 'wind', '风电场', 'biomass', '生物质电站', 'waste', '垃圾发电站', 'battery', '储能电站', 'geothermal', '地热电站', '发电厂']] as maplibregl.ExpressionSpecification
        const assetLabelPaint = { 'text-color':'#283944', 'text-halo-color':'rgba(255,255,255,.96)', 'text-halo-width':1.6 } as const
        map.addLayer({ id:'oim-substation-name', type:'symbol', source:'oim_power', 'source-layer':'power_substation_point', minzoom:9, layout:{ 'text-field':substationName, 'text-size':['interpolate',['linear'],['zoom'],9,10,12,12], 'text-offset':[0,1.45], 'text-max-width':12, 'text-optional':true, 'text-allow-overlap':true, 'text-ignore-placement':true }, paint:assetLabelPaint })
        map.addLayer({ id:'oim-plant-name', type:'symbol', source:'oim_power', 'source-layer':'power_plant_point', minzoom:9, layout:{ 'text-field':plantName, 'text-size':['interpolate',['linear'],['zoom'],9,10,12,12], 'text-offset':[0,1.45], 'text-max-width':12, 'text-optional':true, 'text-allow-overlap':true, 'text-ignore-placement':true }, paint:assetLabelPaint })
        map.addSource('selected-line', { type:'geojson', data:{ type:'FeatureCollection',features:[] } })
        map.addLayer({ id:'selected-line-highlight', type:'line', source:'selected-line', paint:{'line-color':'#ffffff','line-width':8,'line-opacity':.9,'line-blur':1.2} })
        const response = await fetch('/data/china-provinces.geojson', {signal:controller.signal})
        if(!response.ok) throw new Error(`Province boundaries: HTTP ${response.status}`)
        const data = await response.json()
        if (disposed || mapRef.current !== map) return
        if(!Array.isArray(data.features)) throw new Error('Invalid province boundary data')
        for (const f of data.features) provinceCenters.current[f.properties?.name] = f.properties?.centroid ?? f.properties?.center
        map.addSource('china-provinces', { type: 'geojson', data })
        map.addLayer({ id: 'china-province-line', type: 'line', source: 'china-provinces', paint: { 'line-color': '#d57fc1', 'line-width': 1, 'line-opacity': 0.72 } })
        const centroidFeatures = data.features.map((f: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: f.properties?.centroid ?? f.properties?.center ?? [0, 0] }, properties: { name: f.properties?.name ?? '' } }))
        map.addSource('china-province-centroids', { type: 'geojson', data: { type: 'FeatureCollection', features: centroidFeatures } })
        map.addLayer({ id: 'china-province-labels', type: 'symbol', source: 'china-province-centroids', minzoom: 2, layout: { 'text-field': ['get', 'name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 8, 3.5, 9, 5, 10, 6, 11], 'text-allow-overlap': false, 'text-ignore-placement': false, 'text-padding': 3, 'text-variable-anchor': ['center', 'top', 'bottom'], 'text-radial-offset': 0.5 }, paint: { 'text-color': '#40515e', 'text-halo-color': '#f7fcf8', 'text-halo-width': 1.6 } })
        // Price fill layers (hidden initially)
        map.addLayer({ id: 'china-province-price-fill', type: 'fill', source: 'china-provinces', layout: { visibility: 'none' }, paint: { 'fill-color': '#c0c0c0', 'fill-opacity': 0.55 } }, 'china-province-line')
        map.addLayer({ id: 'china-province-spot-fill', type: 'fill', source: 'china-provinces', layout: { visibility: 'none' }, paint: { 'fill-color': '#c0c0c0', 'fill-opacity': 0.55 } }, 'china-province-line')
        map.addSource('northbridge-sites', { type: 'geojson', data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [119.8123, 31.892168] }, properties: { name: '常州新南村 · 数据中心效果设计', facilityId: 'hall-a2' } }] } })
        map.addLayer({ id: 'northbridge-site-point', type: 'circle', source: 'northbridge-sites', minzoom:5, paint: { 'circle-radius': ['interpolate',['linear'],['zoom'],5,5,8,9], 'circle-color': '#b2c982', 'circle-stroke-color': '#fff3b2', 'circle-stroke-width': 1.5 } })
        map.addLayer({ id: 'northbridge-site-label', type: 'symbol', source: 'northbridge-sites', minzoom:5, layout: { 'text-field': ['get', 'name'], 'text-offset': [0, 1.3], 'text-size': 12 }, paint: { 'text-color': '#f3edc2', 'text-halo-color': '#102331', 'text-halo-width': 2 } })
        map.on('click', 'northbridge-site-point', () => setScope('campus'))
        map.on('click', (event) => {
          const hitArea: [maplibregl.PointLike, maplibregl.PointLike] = [[event.point.x-5, event.point.y-5], [event.point.x+5, event.point.y+5]]
          const features = map.queryRenderedFeatures(hitArea, { layers: ['registered-center-points', 'oim-power-lines', 'oim-substations', 'oim-plants', 'oim-towers', 'oim-substation-icon-layer', 'oim-plant-icon-layer', 'energy-generation-points', 'northbridge-site-point', 'china-province-line', 'china-province-price-fill', 'china-province-spot-fill'].filter(id => Boolean(map.getLayer(id))) })
          if(features.some(feature=>feature.layer.id==='registered-center-points'))return
          const provinceFeature = features.find((feature) => feature.layer.id === 'china-province-line' || feature.layer.id === 'china-province-price-fill' || feature.layer.id === 'china-province-spot-fill')
          const infrastructure = (!((priceAnalysisOnRef.current || spotAnalysisOnRef.current) && provinceFeature)) && features.find((feature) => feature.layer.id.startsWith('oim-') || feature.layer.id === 'energy-generation-points')
          if (infrastructure) {
            const properties = infrastructure.properties ?? {}
            const voltage = Number(properties.voltage)
            const name = properties.name || properties.ref || '未标注名称'
            const kind = infrastructure.layer.id.includes('tower') ? '输电铁塔' : infrastructure.layer.id.includes('plant') || infrastructure.layer.id === 'energy-generation-points' ? '发电厂' : infrastructure.layer.id.includes('substation') ? '变电站' : '输电线路'
            const sourceLabels: Record<string,string> = { coal:'煤电', gas:'燃气', oil:'燃油', diesel:'柴油', nuclear:'核电', hydro:'水电', solar:'太阳能', wind:'风电', biomass:'生物质', waste:'垃圾发电', battery:'储能', geothermal:'地热' }
            const rows: [string,string][] = [['类型',kind]]
            if (kind === '发电厂' && properties.source) {
              rows.push(['发电类型', sourceLabels[properties.source] || properties.source])
            }
            rows.push(['名称', String(name)])
            if (kind !== '输电线路' && Number.isFinite(voltage)) rows.push(['电压', `${Math.round(voltage)} kV`])
            if (kind === '输电线路' && Number.isFinite(voltage)) rows.push(['电压', `${Math.round(voltage)} kV`])
            if (properties.output) rows.push(['装机容量', `${Math.round(Number(properties.output))} MW`])
            if (properties.frequency !== undefined && Number(properties.frequency) === 0) rows.push(['制式', 'HVDC 直流输电'])
            if (properties.archive) { rows.push(['档案版本', String(properties.archive)], ['状态', '历史设施档案，非实时运行状态']); if (properties.country) rows.push(['国家', String(properties.country)]) }
            else if (properties.construction) rows.push(['状态', '建设中'])
            else rows.push(['状态', '运行（数据来源 OSM）'])
            setDetail({title:String(name),rows})
            if (infrastructure.layer.id === 'oim-power-lines') (map.getSource('selected-line') as maplibregl.GeoJSONSource).setData({type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:infrastructure.geometry}]})
            return
          }
          // Spot price click handler (priority)
          if (spotAnalysisOnRef.current && spotDataRef.current && provinceFeature) {
            const provName = String(provinceFeature.properties?.name ?? '')
            const sData = spotDataRef.current
            const typeData = sData[spotTypeRef.current] ?? {}
            if (typeData[provName]) {
              const agg = spotAggRef.current
              const dk = spotDateKeyRef.current
              const tp = spotTypeRef.current
              const mean = getSpotMean(sData, provName, tp, agg, dk)
              const hours = getSpot24hProfile(sData, provName, tp, agg, dk)
              setSpotDetail({ province: provName, hours, mean })
              return
            }
          }
          // Proxy price click handler
          if (priceAnalysisOnRef.current && priceDataRef.current && provinceFeature) {
            const provName = String(provinceFeature.properties?.name ?? '')
            const data = priceDataRef.current
            const provData = data[provName]
            if (provData) {
              const month = priceMonthRef.current
              const field = priceFieldRef.current
              const m = provData[month]
              if (m) {
                const rows: [string, string][] = [
                  ['省份', provName],
                  ['月份', month],
                  ['代理购电价', `${m.price.toFixed(4)} 元/kWh`],
                ]
                if (m.peak > 0) rows.push(['高峰电价', `${m.peak.toFixed(4)} 元/kWh`])
                if (m.normal > 0) rows.push(['平时段电价', `${m.normal.toFixed(4)} 元/kWh`])
                if (m.valley > 0) rows.push(['低谷电价', `${m.valley.toFixed(4)} 元/kWh`])
                if (m.subRegions > 1) rows.push(['子区域数', `${m.subRegions} 个区域加权均值`])
                const allMonths = Object.keys(provData).sort()
                const idx = allMonths.indexOf(month)
                if (idx > 0) {
                  const prev = provData[allMonths[idx - 1]]
                  if (prev && prev[field] > 0) {
                    const diff = m[field] - prev[field]
                    const pct = (diff / prev[field] * 100).toFixed(1)
                    const sign = diff >= 0 ? '+' : ''
                    rows.push(['环比变化', `${sign}${diff.toFixed(4)} (${sign}${pct}%)`])
                  }
                }
                setPriceDetail({ province: provName, rows })
                return
              }
            }
          }
          const adcode = Number(provinceFeature?.properties?.adcode)
          if (adcode) new maplibregl.Popup({ closeButton: true, closeOnClick: true }).setLngLat(event.lngLat).setText(String(provinceFeature?.properties?.name ?? '省级边界')).addTo(map)
        })
        map.on('mouseenter', 'china-province-line', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'china-province-line', () => { map.getCanvas().style.cursor = '' })
        map.on('mouseenter', 'china-province-price-fill', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'china-province-price-fill', () => { map.getCanvas().style.cursor = '' })
        map.on('mouseenter', 'china-province-spot-fill', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'china-province-spot-fill', () => { map.getCanvas().style.cursor = '' })
      } catch(error) {
        if(disposed || controller.signal.aborted || mapRef.current!==map) return
        console.error('Energy overlay initialization failed',error)
        setMapError('区域叠加图层加载失败，请刷新后重试')
      }
      if (disposed || mapRef.current !== map) return
      for (const layer of map.getStyle().layers) if ('paint' in layer && layer.paint) basePaint.current[layer.id] = { ...layer.paint }
      initializedMapRef.current=map
      setReady(true)
    })
    mapRef.current = map
    return () => { disposed=true;controller.abort();map.remove(); if(mapRef.current===map)mapRef.current=null;if(initializedMapRef.current===map)initializedMapRef.current=null;setReady(false) }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || initializedMapRef.current!==map) return
    applyEnergyTheme(map, view, basePaint.current, theme, basemapVisible, spaceVisible,basemapTone,spaceStyle)
    try { localStorage.setItem('energy-map-view', view) } catch { /* optional preference */ }
  }, [ready, view, theme, basemapVisible, spaceVisible,basemapTone,spaceStyle])
  useEffect(()=>{try{localStorage.setItem('energy-space-style',spaceStyle)}catch{}},[spaceStyle])

  useEffect(() => {
    const node = mapNode.current
    if (!node) return
    const observer = new ResizeObserver(() => mapRef.current?.resize())
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || initializedMapRef.current!==map) return
    map.resize()
    const visibility = (ids: string[], visible: boolean) => ids.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none') })
    visibility(['oim-power-lines', 'oim-towers', 'selected-line-highlight'], powerVisible)
    visibility(['oim-substations', 'oim-substation-icon-layer', 'oim-substation-name'], substationsVisible)
    visibility(['oim-plants', 'oim-plant-icon-layer', 'oim-plant-name'], plantsVisible)
    visibility(['china-province-line', 'china-province-labels'], boundaryVisible)
    visibility(['northbridge-site-point', 'northbridge-site-label','registered-center-points','registered-center-labels'], sitesVisible)
    visibility(['oim-line-voltage'], lineLabelsVisible)
    visibility(['oim-solar-heat'], heatVisible && activeTab === 'solar')
    const infraOpacity = anyPriceAnalysis ? 0.3 : view === '3d' ? 0.85 : 0.97
    map.setPaintProperty('amap-basemap', 'raster-opacity', anyPriceAnalysis ? 0.55 : 1)
    if(map.getLayer('amap-dark-basemap')) map.setPaintProperty('amap-dark-basemap', 'raster-opacity', anyPriceAnalysis ? 0.5 : view === '3d' ? 0.8 : 1)
    if(map.getLayer('amap-blueblack-basemap')) map.setPaintProperty('amap-blueblack-basemap','raster-opacity',anyPriceAnalysis?.5:view==='3d'?.8:1)
    map.setPaintProperty('oim-power-lines', 'line-opacity', infraOpacity)
    for (const id of ['oim-substations', 'oim-plants', 'oim-towers']) if (map.getLayer(id)) map.setPaintProperty(id, 'circle-opacity', anyPriceAnalysis ? 0.3 : 1)
    for (const id of ['oim-substation-icon-layer', 'oim-plant-icon-layer', 'oim-line-voltage', 'oim-substation-name', 'oim-plant-name']) if (map.getLayer(id)) {
      map.setPaintProperty(id, 'icon-opacity', anyPriceAnalysis ? 0.3 : 1)
      map.setPaintProperty(id, 'text-opacity', anyPriceAnalysis ? 0.3 : 1)
    }
    if (map.getLayer('oim-solar-heat')) map.setPaintProperty('oim-solar-heat', 'heatmap-opacity', anyPriceAnalysis ? 0.15 : theme==='dark' ? view === '3d' ? 0.18 : 0.28 : 0.58)
    if (map.getLayer('energy-line-glow')) map.setPaintProperty('energy-line-glow', 'line-opacity', anyPriceAnalysis ? 0.05 : 0.24)
    if (map.getLayer('energy-line-glow')) map.setLayoutProperty('energy-line-glow', 'visibility', view === '3d' && powerVisible ? 'visible' : 'none')
    visibility(['energy-generation-points', 'energy-generation-glow'], view === '3d' && plantsVisible)
    if (map.getLayer('energy-generation-points')) map.setPaintProperty('energy-generation-points', 'circle-opacity', anyPriceAnalysis ? 0.25 : 0.88)

  }, [ready, view, theme, basemapVisible, spaceVisible,basemapTone, powerVisible, plantsVisible, sceneScope, substationsVisible, boundaryVisible, sitesVisible, lineLabelsVisible, heatVisible, activeTab, anyPriceAnalysis])

  useEffect(() => {
    if (!rotating || view !== '3d' || !ready || sceneScope !== 'china') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    let previous = 0
    const spin = (now: number) => {
      const map = mapRef.current
      if (map && !document.hidden && now - previous >= 50) {
        const delta = previous ? Math.min(now - previous, 100) : 50
        const center = map.getCenter()
        map.jumpTo({ center: [center.lng + delta * 0.0018, center.lat] })
        previous = now
      }
      frame = requestAnimationFrame(spin)
    }
    frame = requestAnimationFrame(spin)
    return () => cancelAnimationFrame(frame)
  }, [rotating, view, ready, sceneScope])

  // ── Update proxy price fill colors ──
  useEffect(() => {
    const map = mapRef.current; if (!map || !priceData) return
    if (!map.getLayer('china-province-price-fill')) return
    if (!priceAnalysisOn) { map.setLayoutProperty('china-province-price-fill', 'visibility', 'none'); return }
    map.setLayoutProperty('china-province-price-fill', 'visibility', 'visible')
    const { min, max } = getPriceRange(priceData, priceMonth, priceField)
    const matchEntries: [string, number][] = []
    for (const [prov, months] of Object.entries(priceData)) {
      const m = months[priceMonth]
      if (m && m[priceField] > 0) matchEntries.push([prov, m[priceField]])
    }
    map.setPaintProperty('china-province-price-fill', 'fill-color', priceFill(matchEntries, min, max))
  }, [priceAnalysisOn, priceData, priceMonth, priceField, ready, view, theme, basemapVisible, spaceVisible])

  // ── Update spot price fill colors ──
  useEffect(() => {
    const map = mapRef.current; if (!map || !spotData) return
    if (!map.getLayer('china-province-spot-fill')) return
    if (!spotAnalysisOn) { map.setLayoutProperty('china-province-spot-fill', 'visibility', 'none'); return }
    map.setLayoutProperty('china-province-spot-fill', 'visibility', 'visible')
    const { min, max } = getSpotPriceRange(spotData, spotType, spotAggregation, spotDateKey)
    const matchEntries: [string, number][] = []
    const typeData = spotData[spotType] ?? {}
    for (const prov of Object.keys(typeData)) {
      const m = getSpotMean(spotData, prov, spotType, spotAggregation, spotDateKey)
      if (m && m > 0) matchEntries.push([prov, m])
    }
    map.setPaintProperty('china-province-spot-fill', 'fill-color', priceFill(matchEntries, min, max))
  }, [spotAnalysisOn, spotData, spotType, spotAggregation, spotDateKey, ready, view, theme, basemapVisible, spaceVisible])

  // Dock tab click: if clicking the active tab, toggle expand/collapse; otherwise switch tab and expand
  const handleDockTab = (tab: PriceTab) => {
    if (tab === activeTab) { setPanelExpanded(!panelExpanded); return }
    setActiveTab(tab)
    setPanelExpanded(true)
    // 切换到代理购电/现货电价时自动开启热区
    if (tab === 'proxy' && !priceAnalysisOn) { setPriceAnalysisOn(true) }
    if (tab === 'spot' && !spotAnalysisOn) { setSpotAnalysisOn(true) }
    // 关闭另一个分析
    if (tab !== 'proxy' && priceAnalysisOn) { setPriceAnalysisOn(false); setPriceDetail(null) }
    if (tab !== 'spot' && spotAnalysisOn) { setSpotAnalysisOn(false); setSpotDetail(null) }
  }

  const flyToRegion = (id: string) => {
    setRegion(id)
    setRotating(false)
    const regions: Record<string, { center: [number, number]; zoom: number }> = {
      world: { center: [80, 24], zoom: 0.7 }, china: { center: [104, 32], zoom: 3.5 },
      europe: { center: [12, 49], zoom: 3.9 }, america: { center: [-98, 38], zoom: 3.2 },
      asia: { center: [115, 22], zoom: 2.8 },
    }
    const target = regions[id] ?? regions.china
    mapRef.current?.flyTo({ ...target, pitch: view === '3d' && id === 'europe' ? 32 : 0, bearing: 0, duration: 1500 })
  }

  const switchView = (next: EnergyView) => {
    if (next === viewRef.current) return
    viewRef.current=next
    setRotating(false)
    setView(next)
    const map = mapRef.current
    if (map && ready && initializedMapRef.current===map) {
      map.stop()
      map.setProjection({ type: next === '3d' ? 'globe' : 'mercator' })
      map.setMinZoom(next === '3d' ? 0 : 2)
      map.easeTo({ zoom: next === '3d' ? Math.min(map.getZoom(), 1.9) : Math.max(map.getZoom(), 3.5), pitch: 0, bearing: 0, duration: 280 })
    }
  }

  const inspectProvince = (province: string) => {
    setRotating(false)
    const center = provinceCenters.current[province]
    if (center) mapRef.current?.flyTo({ center, zoom: 5.1, pitch: 0, duration: 1300 })
    if (activeTab === 'spot' && spotData) {
      setSpotDetail({ province, hours: getSpot24hProfile(spotData, province, spotType, spotAggregation, spotDateKey), mean: getSpotMean(spotData, province, spotType, spotAggregation, spotDateKey) })
    } else if (priceData) {
      const rows = proxyPriceRows(priceData, province, priceMonth, priceField)
      if (rows) setPriceDetail({ province, rows })
    }
  }

  useEffect(() => {
    if (!spotDetail || !spotData) return
    const province = spotDetail.province
    setSpotDetail({ province, hours: getSpot24hProfile(spotData, province, spotType, spotAggregation, spotDateKey), mean: getSpotMean(spotData, province, spotType, spotAggregation, spotDateKey) })
  }, [spotType, spotAggregation, spotDateKey])

  useEffect(() => {
    if (!priceDetail || !priceData) return
    const rows = proxyPriceRows(priceData, priceDetail.province, priceMonth, priceField)
    setPriceDetail(rows ? { province: priceDetail.province, rows } : null)
  }, [priceMonth, priceField])

  const rankedPrices = activeTab === 'proxy' && priceData ? Object.entries(priceData).map(([name, months]) => ({ name, value: months[priceMonth]?.[priceField] })).filter(p => p.value > 0).sort((a, b) => a.value - b.value)
    : activeTab === 'spot' && spotData ? Object.keys(spotData[spotType] ?? {}).map(name => ({ name, value: getSpotMean(spotData, name, spotType, spotAggregation, spotDateKey) ?? 0 })).filter(p => p.value > 0).sort((a, b) => a.value - b.value) : []

  // Compute Y-axis ticks for 24h chart
  function yAxisTicks(min: number, max: number): number[] {
    if (max <= min) return [min]
    const range = max - min
    const step = range <= 50 ? 10 : range <= 100 ? 20 : range <= 300 ? 50 : range <= 600 ? 100 : 200
    const ticks: number[] = []
    const start = Math.floor(min / step) * step
    for (let v = start; v <= max + step; v += step) ticks.push(Math.round(v))
    return ticks
  }

  return <div ref={rootRef} className={`world-viewport china-viewport map-api-surface energy-world is-${view} is-${theme} ${focused ? 'is-focused' : ''}`} aria-label="全球能源网与区域电力资源地图">
    <div ref={mapNode} className="openinfra-map" />
    <div className="energy-vignette" />
    <div className="energy-heading"><div className="energy-eyebrow"><span /> GLOBAL ENERGY / COMPUTE</div><h1>全域算电驾驶舱<span>全球能源网 · 园区 · 机房</span></h1><p>电网与电价 · 基地资产 · 工程计算</p></div>
    <GlobalCockpitPanel overview={overview} selected={selectedCenter} selectedId={selectedCenterId} open={cockpitOpen} compact={Boolean(detail||priceDetail||spotDetail||rankedPrices.length)} busy={overviewBusy} error={overviewError} onToggle={()=>{if(detail||priceDetail||spotDetail||rankedPrices.length){setDetail(null);setPriceDetail(null);setSpotDetail(null);setPriceAnalysisOn(false);setSpotAnalysisOn(false);setActiveTab('solar');setCockpitOpen(true)}else setCockpitOpen(!cockpitOpen)}} onSelect={id=>{selectCenter(id);const center=overview?.centers.find(item=>item.id===id);if(center)locateCenter(center)}} onRefresh={()=>void refreshOverview()} onLocate={locateCenter}/>
    <div className="energy-top-controls">
      <label className="energy-region"><Search size={14} /><select aria-label="快捷定位区域" value={region} onChange={e => flyToRegion(e.target.value)}><option value="world">全球视野</option><option value="china">中国</option><option value="europe">欧洲</option><option value="america">北美</option><option value="asia">亚太</option></select><ChevronDown size={13} /></label>
      <div className="energy-view-switch" role="group" aria-label="能源地图维度"><button type="button" aria-pressed={view === '2d'} className={view === '2d' ? 'is-active' : ''} onClick={() => switchView('2d')}><Map size={14} />2D</button><button type="button" aria-pressed={view === '3d'} className={view === '3d' ? 'is-active' : ''} onClick={() => switchView('3d')}><Globe2 size={14} />3D</button></div>
      <button className={`energy-square ${focused ? 'is-active' : ''}`} title="专注模式" aria-label="专注模式" aria-pressed={focused} onClick={() => setFocused(!focused)}><Expand size={16} /></button>
    </div>
    <aside className={`oim-layer-switcher energy-layers ${layersOpen?'':'is-collapsed'}`} aria-label="全球能源网图层选择">
      <header><div><Layers size={14} /><strong>图层与图例</strong><span>LAYERS</span></div><button aria-label={layersOpen ? '折叠图层面板' : '展开图层面板'} onClick={()=>setLayersOpen(!layersOpen)}>{layersOpen?<Minus size={14}/>:<Plus size={14}/>}</button></header>
      {layersOpen && <>{view==='3d'&&theme==='dark'&&spaceVisible&&<label className="energy-space-style"><span>背景样式</span><select aria-label="宇宙背景样式" value={spaceStyle} onChange={e=>setSpaceStyle(e.target.value as EnergySpaceStyle)}><option value="galaxy">银河 · 蓝银星云</option><option value="stars">淡星空 · 深空</option></select></label>}<div className="energy-layer-list">{[
        { label: '高德底图', sub: 'Roads & geographic context', value: basemapVisible, set: setBasemapVisible },
        { label: '输电线路与铁塔', sub: 'Transmission network', value: powerVisible, set: setPowerVisible },
        { label: '线路电压标签', sub: 'Voltage labels', value: lineLabelsVisible, set: setLineLabelsVisible },
        { label: '变电站', sub: 'Substations', value: substationsVisible, set: setSubstationsVisible },
        { label: '发电厂', sub: 'Power generation', value: plantsVisible, set: setPlantsVisible },
        { label: '省级边界 / 地名', sub: 'Boundaries & labels', value: boundaryVisible, set: setBoundaryVisible },
        { label: '数据中心', sub: 'Compute infrastructure', value: sitesVisible, set: setSitesVisible },
      ].map(l => <label key={l.label}><span>{l.label}<small>{l.sub}</small></span><input type="checkbox" checked={l.value} onChange={e => l.set(e.target.checked)}/></label>)}</div>
      {view === '3d' && theme === 'dark' && <label className="energy-column-toggle"><span>宇宙背景<small>{spaceStyle==='galaxy'?'银河星云':'淡星空'} · 可关闭</small></span><input type="checkbox" checked={spaceVisible} onChange={e => setSpaceVisible(e.target.checked)}/></label>}
      <div className="energy-voltage-legend"><b>输电电压 <span>kV</span></b>{(theme==='dark'?GLOBE_VOLTAGES:[['#90A4AE','< 10'],['#D500F9','10–25'],['#FF3D00','25–52'],['#FFC400','52–132'],['#00E5FF','132–220'],['#2979FF','220–310'],['#AA00FF','310–550'],['#00BFA5','≥ 550']]).map(([color,label]) => <span key={label}><i style={{background:color}}/>{label}</span>)}</div>
      {view === '3d' && <div className="energy-generation-legend"><b>发电类型</b>{[['#e3c768','光伏'],['#6fbecb','风电'],['#6693d1','水电'],['#c098e3','核电'],['#ec9774','煤电'],['#d6b68a','燃气 / 油']].map(([color,label]) => <span key={label}><i style={{background:color}}/>{label}</span>)}</div>}
      <footer><span /> {view==='3d'?'OSM 电网 · WRI 电厂档案（2021）':'OSM 公开电力设施数据'}</footer></>}
    </aside>
    <div className="energy-camera-controls"><button className="energy-square" aria-label="放大地图" onClick={() => {setRotating(false);mapRef.current?.zoomIn()}}><Plus size={16}/></button><button className="energy-square" aria-label="缩小地图" onClick={() => {setRotating(false);mapRef.current?.zoomOut()}}><Minus size={16}/></button><button className="energy-square" aria-label="恢复地球视角" onClick={() => {setRotating(false);setRegion('china');mapRef.current?.flyTo({center:[104,32],zoom:view==='3d'?1.9:3.5,pitch:0,bearing:0,duration:1200})}}><RotateCcw size={15}/></button>{view==='3d'&&<button className={`energy-square ${rotating?'is-active':''}`} aria-label={rotating?'暂停地球旋转':'自动旋转地球'} aria-pressed={rotating} onClick={()=>setRotating(!rotating)}>{rotating?<Pause size={14}/>:<Play size={14}/>}</button>}<button className="energy-square energy-compass" aria-label="朝向正北" onClick={()=>mapRef.current?.easeTo({bearing:0,pitch:0,duration:600})}><Compass size={20}/><small>N</small></button></div>
    <div className="energy-coordinate"><span>{view==='3d'?'GLOBE':'MERCATOR'}</span><b>{Math.abs(camera.lat).toFixed(2)}° {camera.lat<0?'S':'N'} <i>/</i> {Math.abs(camera.lng).toFixed(2)}° {camera.lng<0?'W':'E'}</b><em>ZOOM {camera.zoom.toFixed(1)}</em></div>
    <div className="energy-interaction-note">{view==='3d'?'拖动旋转地球':'拖动平移地图'}<i/>滚轮缩放<i/>点击查询设施</div>
    {!ready && <div className="energy-loading" role="status"><Globe2 size={26}/><span>正在连接能源网络</span><small>LOADING ENERGY ATLAS</small></div>}
    {mapError && <div className="energy-error" role="status">{mapError}<button onClick={()=>setMapError('')} aria-label="关闭地图提示"><X size={12}/></button></div>}
    {rankedPrices.length > 0 && !priceDetail && !spotDetail && !detail && <aside className="energy-price-ranking"><header><span>{activeTab==='proxy'?'代理购电':'现货电价'} · 区域比较</span><small>{activeTab==='proxy'?priceMonth:spotDateKey}</small></header><div className="energy-ranking-title"><strong>{rankedPrices.length}</strong><span>个有数据省份<small>由低到高 · {activeTab==='proxy'?'元/kWh':'元/MWh'}</small></span></div>{rankedPrices.slice(0,5).map((p,i)=><button key={p.name} onClick={()=>inspectProvince(p.name)}><em>0{i+1}</em><span>{p.name}</span><b>{activeTab==='proxy'?p.value.toFixed(4):p.value.toFixed(2)}</b><ArrowUpRight size={12}/></button>)}<label>查看省份<select aria-label="查看省份电价" defaultValue="" onChange={e=>{if(e.target.value)inspectProvince(e.target.value)}}><option value="" disabled>选择省份</option>{rankedPrices.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select></label></aside>}

    {/* ── 底部 dock 统一分析面板 ── */}
    <div className="analysis-dock-wrapper">
      {/* 展开的内容区 */}
      {panelExpanded && (
        <div className="analysis-dock-content">
          {/* 太阳能资源 tab */}
          {activeTab === 'solar' && <>
            <div className="dock-intro">
              <span className="dock-intro-title">太阳能资源密度</span>
              <span className="dock-intro-desc">OSM 装机加权分布 · 光伏与聚光类设施</span>
            </div>
            <div className="dock-solar-legend">
              <div className="solar-gradient-bar" />
              <div className="solar-legend-labels"><span>低</span><span>中</span><span>高</span></div>
            </div>
            <div className="dock-toggle-row">
              <span className="dock-toggle-label">热区显示</span>
              <button type="button" role="switch" aria-label="太阳能热区显示" aria-checked={heatVisible} className={`dock-switch ${heatVisible?'is-on':''}`} onClick={()=>setHeatVisible(!heatVisible)} />
            </div>
          </>}
          {/* 代理购电 tab */}
          {activeTab === 'proxy' && priceData && <>
            <div className="dock-toggle-row">
              <span className="dock-toggle-label">电价热区</span>
              <button type="button" role="switch" aria-label="代理购电热区显示" aria-checked={priceAnalysisOn} className={`dock-switch ${priceAnalysisOn?'is-on':''}`} onClick={()=>{ setPriceAnalysisOn(!priceAnalysisOn); if(!priceAnalysisOn) setPriceDetail(null) }} />
            </div>
            {priceAnalysisOn && <>
              <div className="dock-selectors">
                <label><span className="dock-field-label">月份</span><select value={priceMonth} onChange={(event) => setPriceMonth(event.target.value)}>{getAllMonths(priceData).map(m => <option key={m} value={m}>{m}</option>)}</select></label>
                <label><span className="dock-field-label">指标</span><select value={priceField} onChange={(event) => setPriceField(event.target.value as PriceField)}>{PRICE_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
              </div>
              <div className="dock-legend"><span>低</span><div className="dock-gradient-bar" /><span>高</span></div>
              <small className="dock-hint">点击省份查看详细电价</small>
            </>}
          </>}
          {/* 现货电价 tab */}
          {activeTab === 'spot' && spotData && <>
            <div className="dock-toggle-row">
              <span className="dock-toggle-label">现货热区</span>
              <button type="button" role="switch" aria-label="现货电价热区显示" aria-checked={spotAnalysisOn} className={`dock-switch dock-switch-spot ${spotAnalysisOn?'is-on':''}`} onClick={()=>{ setSpotAnalysisOn(!spotAnalysisOn); if(!spotAnalysisOn) setSpotDetail(null) }} />
            </div>
            {spotAnalysisOn && <>
              <div className="dock-selectors">
                <label><span className="dock-field-label">类型</span><select value={spotType} onChange={(event) => { const v = event.target.value as SpotType; setSpotType(v); const best = getBestDateKey(spotData, v, spotAggregation); if (best) setSpotDateKey(best) }}>{SPOT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
                <label><span className="dock-field-label">聚合</span><select value={spotAggregation} onChange={(event) => { const v = event.target.value as SpotAggregation; setSpotAggregation(v); const best = getBestDateKey(spotData, spotType, v); if (best) setSpotDateKey(best) }}>{SPOT_AGGREGATIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
                <label><span className="dock-field-label">{spotAggregation === 'day' ? '日期' : spotAggregation === 'month' ? '月份' : '年份'}</span><select value={spotDateKey} onChange={(event) => setSpotDateKey(event.target.value)}>{getSpotDateKeys(spotData, spotType, spotAggregation).map(k => <option key={k} value={k}>{k}</option>)}</select></label>
              </div>
              <div className="dock-legend"><span>低</span><div className="dock-gradient-bar dock-gradient-spot" /><span>高</span></div>
              <small className="dock-hint">点击省份查看24时分时电价</small>
            </>}
          </>}
        </div>
      )}
      {/* 底部 dock tab 栏（始终可见） */}
      <div className="analysis-dock-bar">
        <button className={`dock-tab ${activeTab==='solar'?'is-active':''}`} onClick={()=>handleDockTab('solar')}>
          <span className="dock-tab-icon" data-type="solar" />
          太阳能资源
        </button>
        <button className={`dock-tab ${activeTab==='proxy'?'is-active':''}`} onClick={()=>handleDockTab('proxy')}>
          <span className="dock-tab-icon" data-type="proxy" />
          代理购电
        </button>
        <button className={`dock-tab ${activeTab==='spot'?'is-active':''}`} onClick={()=>handleDockTab('spot')}>
          <span className="dock-tab-icon" data-type="spot" />
          现货电价
        </button>
      </div>
    </div>

    {/* 代理购电详情 */}
    {priceAnalysisOn && priceDetail && <aside className="price-detail-panel" aria-label="电价详情"><header><strong>{priceDetail.province}</strong><button onClick={()=>setPriceDetail(null)} aria-label="关闭详情">×</button></header><div className="price-detail-body">{priceDetail.rows.map(([key,value])=><div key={key}><span>{key}</span><b>{value}</b></div>)}<small>数据来源：各省电网公司代理购电公告</small></div></aside>}

    {/* 现货电价详情：24点分时图（带 Y 轴） */}
    {spotAnalysisOn && spotDetail && <aside className="spot-detail-panel" aria-label="现货电价详情">
      <header>
        <strong>{spotDetail.province} · 24时分时电价</strong>
        <span className="spot-detail-type">{SPOT_TYPES.find(t=>t.id===spotType)?.label} · {spotAggregation==='day'?'按日':spotAggregation==='month'?'按月':'按年'} · {spotDateKey}</span>
        <button onClick={()=>setSpotDetail(null)} aria-label="关闭详情">×</button>
      </header>
      <div className="spot-detail-body">
        <div className="spot-chart-container">
          {(() => {
            const hours = spotDetail.hours
            const validPrices = hours.filter((p): p is number => p !== null && p > 0)
            const maxP = validPrices.length ? Math.max(...validPrices) : 1
            const minP = validPrices.length ? Math.min(...validPrices) : 0
            // Y-axis range: use 0 to maxP with some padding
            const yMax = Math.ceil(maxP / 50) * 50 + 50
            const yMin = 0
            const yTicks = yAxisTicks(yMin, yMax)
            return <>
              <div className="spot-chart-with-axis">
                {/* Y-axis */}
                <div className="spot-chart-yaxis">
                  {yTicks.map((t, i) => {
                    const ratio = (t - yMin) / (yMax - yMin)
                    return <div key={i} className="spot-yaxis-tick" style={{ bottom: `${ratio * 100}%` }}>
                      <span className="spot-yaxis-label">{t}</span>
                      <span className="spot-yaxis-gridline" />
                    </div>
                  })}
                </div>
                {/* Bars */}
                <div className="spot-chart-bars">
                  {hours.map((p, h) => {
                    const valid = p !== null && p > 0
                    const ratio = valid ? Math.max(0.02, (p! - yMin) / (yMax - yMin)) : 0
                    const tipText = valid ? `${String(h).padStart(2,'0')}:00 — ${p} 元/MWh` : '无数据'
                    return <div key={h} className="spot-bar-col" title={tipText} data-tip={tipText}>
                      <div className="spot-bar" style={{ height: `${ratio * 100}%`, opacity: valid ? 1 : 0 }} />
                    </div>
                  })}
                </div>
              </div>
              <div className="spot-chart-axis">
                {[0, 6, 12, 18, 23].map(h => <span key={h}>{String(h).padStart(2,'0')}</span>)}
              </div>
              <div className="spot-chart-summary">
                {spotDetail.mean !== null && <span>均值 <b>{spotDetail.mean}</b> 元/MWh</span>}
                {validPrices.length > 0 && <span>峰 <b>{maxP}</b> · 谷 <b>{minP}</b></span>}
                <span>有效 <b>{validPrices.length}/24</b> 点</span>
              </div>
            </>
          })()}
        </div>
        <small>数据来源：各省电力交易中心现货市场 · {SPOT_TYPES.find(t=>t.id===spotType)?.label}价格聚合</small>
      </div>
    </aside>}

    {detail && <aside className="oim-detail" aria-label="能源资产详情"><header><strong>{detail.title}</strong><button onClick={()=>setDetail(null)} aria-label="关闭详情">×</button></header>{detail.rows.map(([key,value])=><div key={key}><span>{key}</span><b>{value}</b></div>)}<small>{detail.rows.some(([key])=>key==='档案版本')?'WRI Global Power Plant Database v1.3 · CC BY 4.0':'电力数据 OpenInfraMap / OSM · ODbL'}{view==='2d'?' · 底图 © 高德地图':''}</small></aside>}
  </div>
}

export default ChinaMapViewport
