import { OrbitControls, useTexture } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { geoMercator } from 'd3-geo'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { chinaProvinces, getCityByAdcode, getProvinceByAdcode, jiangsuCities } from '../siteData'
import { useDesignerStore } from '../useDesignerStore'

type CityProperties = {
  adcode: number
  name: string
  center: [number, number]
  centroid?: [number, number]
}

type CityFeature = Feature<Polygon | MultiPolygon, CityProperties>
type JiangsuGeoData = FeatureCollection<Polygon | MultiPolygon, CityProperties>

type ProjectedCity = {
  adcode: number
  name: string
  center: [number, number]
  shapes: THREE.Shape[]
}

const MAP_WIDTH = 21
const MAP_HEIGHT = 25

const collectCoordinates = (data: JiangsuGeoData) => {
  const points: [number, number][] = []
  data.features.forEach((feature) => {
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates
    polygons.forEach((rings) => rings.forEach((ring) => ring.forEach((point) => points.push(point as [number, number]))))
  })
  return points
}

const makeShape = (
  rings: number[][][],
  project: (point: [number, number]) => [number, number] | null,
) => {
  const [outer, ...holes] = rings
  if (!outer?.length) return null
  const shape = new THREE.Shape()
  outer.forEach((coordinate, index) => {
    const projected = project(coordinate as [number, number])
    if (!projected) return
    const [x, y] = projected
    const z = MAP_HEIGHT / 2 - y
    index === 0 ? shape.moveTo(x - MAP_WIDTH / 2, z) : shape.lineTo(x - MAP_WIDTH / 2, z)
  })
  holes.forEach((ring) => {
    const path = new THREE.Path()
    ring.forEach((coordinate, index) => {
      const projected = project(coordinate as [number, number])
      if (!projected) return
      const [x, y] = projected
      const z = MAP_HEIGHT / 2 - y
      index === 0 ? path.moveTo(x - MAP_WIDTH / 2, z) : path.lineTo(x - MAP_WIDTH / 2, z)
    })
    shape.holes.push(path)
  })
  return shape
}

const buildProjectedCities = (data: JiangsuGeoData): ProjectedCity[] => {
  const coordinates = collectCoordinates(data)
  const longitude = coordinates.map((point) => point[0])
  const latitude = coordinates.map((point) => point[1])
  const center: [number, number] = [
    (Math.min(...longitude) + Math.max(...longitude)) / 2,
    (Math.min(...latitude) + Math.max(...latitude)) / 2,
  ]
  const unitProjection = geoMercator().center(center).scale(1).translate([0, 0])
  const unitPoints = coordinates.map((point) => unitProjection(point) ?? [0, 0])
  const xs = unitPoints.map((point) => point[0])
  const ys = unitPoints.map((point) => point[1])
  const scale = Math.min(
    (MAP_WIDTH - 1.2) / Math.max(0.0001, Math.max(...xs) - Math.min(...xs)),
    (MAP_HEIGHT - 1.2) / Math.max(0.0001, Math.max(...ys) - Math.min(...ys)),
  )
  const projection = geoMercator().center(center).scale(scale).translate([MAP_WIDTH / 2, MAP_HEIGHT / 2])
  return (data.features as CityFeature[]).map((feature) => {
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates
    const shapes = polygons
      .map((rings) => makeShape(rings, projection))
      .filter((shape): shape is THREE.Shape => Boolean(shape))
    const centerPoint = feature.properties.centroid ?? feature.properties.center
    const projectedCenter = projection(centerPoint) ?? [MAP_WIDTH / 2, MAP_HEIGHT / 2]
    return {
      adcode: feature.properties.adcode,
      name: feature.properties.name,
      center: [projectedCenter[0] - MAP_WIDTH / 2, MAP_HEIGHT / 2 - projectedCenter[1]],
      shapes,
    }
  })
}

const CityShape = ({
  shape,
  depth,
  color,
  selected,
  onSelect,
  onEnter,
}: {
  shape: THREE.Shape
  depth: number
  color: string
  selected: boolean
  onSelect: () => void
  onEnter: () => void
}) => {
  const geometry = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.035, bevelThickness: 0.035 }),
    [depth, shape],
  )
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 24), [geometry])
  return (
    <group
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.03, 0]}
      onPointerDown={(event) => { event.stopPropagation(); onSelect() }}
      onDoubleClick={(event) => { event.stopPropagation(); onEnter() }}
    >
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={color}
          emissive={selected ? '#1d62ad' : '#101e29'}
          emissiveIntensity={selected ? 0.3 : 0.07}
          metalness={0.08}
          roughness={0.84}
          transparent
          opacity={selected ? 0.12 : 0.035}
        />
      </mesh>
      <lineSegments geometry={edges} position={[0, 0, 0.003]} renderOrder={8}>
        <lineBasicMaterial color={selected ? '#8bc8ff' : '#3f6178'} transparent opacity={selected ? 0.92 : 0.56} />
      </lineSegments>
    </group>
  )
}

const CityGeometry = ({ city }: { city: ProjectedCity }) => {
  const selectedCityAdcode = useDesignerStore((state) => state.selectedCityAdcode)
  const setSelectedCityAdcode = useDesignerStore((state) => state.setSelectedCityAdcode)
  const setSceneScope = useDesignerStore((state) => state.setSceneScope)
  const metadata = getCityByAdcode(city.adcode)
  const selected = selectedCityAdcode === city.adcode
  const candidate = Boolean(metadata?.candidate)
  const depth = selected ? 0.08 : candidate ? 0.045 : 0.018
  const regionColors = ['#1e3548', '#233c50', '#274357', '#20394d']
  const color = selected ? '#397fd6' : candidate ? '#365d7a' : regionColors[Math.floor(city.adcode / 100) % regionColors.length]

  return (
    <group>
      {city.shapes.map((shape, index) => (
        <CityShape
          key={`${city.adcode}-${index}`}
          shape={shape}
          depth={depth}
          color={color}
          selected={selected}
          onSelect={() => setSelectedCityAdcode(city.adcode)}
          onEnter={() => {
            setSelectedCityAdcode(city.adcode)
            if (candidate) setSceneScope('campus')
          }}
        />
      ))}
      {(selected || candidate) && (
        <group position={[city.center[0], depth + 0.18, city.center[1]]}>
          <mesh castShadow>
            <cylinderGeometry args={[selected ? 0.16 : 0.11, selected ? 0.16 : 0.11, selected ? 0.42 : 0.27, 18]} />
            <meshStandardMaterial
              color={selected ? '#70b8ff' : '#f1b750'}
              emissive={selected ? '#4594ff' : '#ff9f43'}
              emissiveIntensity={0.48}
              metalness={0.35}
              roughness={0.28}
              toneMapped={false}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
            <ringGeometry args={[0.2, 0.3, 24]} />
            <meshBasicMaterial color={selected ? '#65b5ff' : '#f0b14d'} transparent opacity={0.72} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  )
}

const ProvinceMapScene = ({ data }: { data: JiangsuGeoData }) => {
  const cities = useMemo(() => buildProjectedCities(data), [data])
  const satellite = useTexture('/data/jiangsu-satellite.jpg')
  satellite.colorSpace = THREE.SRGBColorSpace
  satellite.anisotropy = 8
  return (
    <>
      <color attach="background" args={['#061018']} />
      <fog attach="fog" args={['#061018', 34, 76]} />
      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#c9e7f5', '#071017', 0.9]} />
      <directionalLight position={[10, 22, 13]} intensity={1.4} color="#e6f2ff" castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
        <planeGeometry args={[MAP_WIDTH + 8, MAP_HEIGHT + 3, 1, 1]} />
        <meshBasicMaterial map={satellite} toneMapped={false} transparent opacity={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]}>
        <planeGeometry args={[MAP_WIDTH + 8, MAP_HEIGHT + 3, 1, 1]} />
        <meshBasicMaterial color="#04131c" transparent opacity={0.12} />
      </mesh>
      {cities.map((city) => <CityGeometry key={city.adcode} city={city} />)}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minZoom={12}
        maxZoom={42}
        minPolarAngle={0.18}
        maxPolarAngle={1.15}
        target={[0, 0, 0]}
      />
    </>
  )
}

export const ProvinceMapViewport = () => {
  const [data, setData] = useState<JiangsuGeoData | null>(null)
  const [error, setError] = useState('')
  const selectedCityAdcode = useDesignerStore((state) => state.selectedCityAdcode)
  const setSceneScope = useDesignerStore((state) => state.setSceneScope)
  const selectedCity = getCityByAdcode(selectedCityAdcode) ?? jiangsuCities[0]
  const selectedProvinceAdcode = useDesignerStore((state) => state.selectedProvinceAdcode)
  const selectedProvince = getProvinceByAdcode(selectedProvinceAdcode) ?? chinaProvinces[0]

  if (selectedProvinceAdcode !== 320000) {
    return <div className="world-viewport province-viewport generic-province-viewport" aria-label={`${selectedProvince.name}真实省级边界地图`}>
      <div className="generic-province-map"><div className="generic-province-outline" /><span className="generic-province-pin">●</span><strong>{selectedProvince.name}</strong><small>{selectedProvince.center[0].toFixed(6)}°E · {selectedProvince.center[1].toFixed(6)}°N</small></div>
      <div className="world-stage-card"><span>省域真实边界</span><strong>{selectedProvince.name} · 省级地图</strong><em>当前省界、中心点和行政区代码来自全国 GeoJSON；可返回全国继续选择其他省份。</em></div>
      <div className="map-legend"><span><i className="legend-selected" />当前省份</span><span><i className="legend-region" />真实省界</span></div>
      <div className="map-source-note">该省已支持全国地图直接选中与省域进入；城市级和园区级模型按后续真实数据接入。</div>
    </div>
  }

  useEffect(() => {
    let cancelled = false
    fetch('/data/jiangsu-cities.geojson')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<JiangsuGeoData>
      })
      .then((next) => { if (!cancelled) setData(next) })
      .catch(() => { if (!cancelled) setError('省份边界数据加载失败，请刷新后重试。') })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="world-viewport province-viewport" aria-label="江苏省真实行政边界选址地图">
      {data ? (
        <Canvas
          orthographic
          shadows={{ type: THREE.PCFShadowMap }}
          dpr={[1, 1.5]}
          camera={{ position: [0, 28, 26], zoom: 27, near: 0.1, far: 120 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.08
            gl.domElement.setAttribute('role', 'img')
            gl.domElement.setAttribute('aria-label', '江苏省十三个设区市行政边界地图。可在左侧列表选择城市，并进入示例园区。')
          }}
        >
          <ProvinceMapScene data={data} />
        </Canvas>
      ) : (
        <div className={`world-loading ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>
          {error || '正在加载江苏省行政边界…'}
        </div>
      )}
      <div className="world-stage-card">
        <span>省域选址</span>
        <strong>江苏省 · 13 个设区市</strong>
        <em>{selectedCity.name} · {selectedCity.center[0].toFixed(3)}°E / {selectedCity.center[1].toFixed(3)}°N</em>
      </div>
      <div className="map-legend" aria-label="地图图例">
        <span><i className="legend-selected" />当前选择</span>
        <span><i className="legend-candidate" />候选城市</span>
        <span><i className="legend-region" />行政边界</span>
      </div>
      <button
        className="world-enter-button"
        type="button"
        disabled={!selectedCity.candidate}
        title={selectedCity.candidate ? '进入南京建模示例园区' : '当前仅南京市提供园区级建模示例'}
        onClick={() => setSceneScope('campus')}
      >
        {selectedCity.candidate ? `进入 ${selectedCity.name} 示例场地` : `${selectedCity.name} 暂无园区模型`}
      </button>
      <div className="map-source-note">边界数据：阿里云 DataV 离线 GeoJSON，仅供内部原型；正式发布需采用审图合规底图。</div>
    </div>
  )
}

export default ProvinceMapViewport
