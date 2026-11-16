import { useLayoutEffect, useMemo, useRef } from 'react'
import { RoundedBox, useGLTF } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type {
  AssetDefinition,
  AssetInstance,
  OverlayMode,
  Vec3,
} from '../domain'

type PreviewTone = 'valid' | 'invalid' | null

type Palette = {
  body: string
  accent: string
  emissive: string
  opacity: number
  emissiveIntensity: number
}

const RACK_REFERENCE_GLB = '/data/rack-room/Rack_Room_Free_Server_Rack/models/server_rack.glb'

const RealRackReference = ({ definition }: { definition: AssetDefinition }) => {
  const { scene } = useGLTF(RACK_REFERENCE_GLB)
  const model = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    return clone
  }, [scene])
  const { width, height, depth } = definition.dimensions
  return <primitive object={model} scale={[width / 0.76, height / 1.665, depth / 1.19]} />
}

useGLTF.preload(RACK_REFERENCE_GLB)

export type AssetModelProps = {
  definition: AssetDefinition
  instance?: AssetInstance
  position: Vec3
  rotationY: number
  overlayMode: OverlayMode
  selected?: boolean
  ghost?: boolean
  previewTone?: PreviewTone
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
}

const heatColor = (loadPercent: number) => {
  const t = THREE.MathUtils.clamp((loadPercent - 45) / 55, 0, 1)
  const color = new THREE.Color('#33bfe9')
  if (t < 0.52) return `#${color.lerp(new THREE.Color('#f7cf54'), t / 0.52).getHexString()}`
  return `#${color
    .set('#f7cf54')
    .lerp(new THREE.Color('#ff5e5e'), (t - 0.52) / 0.48)
    .getHexString()}`
}

const makePalette = (
  definition: AssetDefinition,
  loadPercent: number,
  overlayMode: OverlayMode,
  ghost: boolean,
  previewTone: PreviewTone,
): Palette => {
  if (ghost || previewTone) {
    const valid = previewTone !== 'invalid'
    return {
      body: valid ? '#25d8a2' : '#ff5668',
      accent: valid ? '#91ffe0' : '#ff9aa5',
      emissive: valid ? '#35f4b8' : '#ff4057',
      opacity: ghost ? 0.4 : 0.72,
      emissiveIntensity: ghost ? 0.55 : 0.34,
    }
  }

  const body = new THREE.Color(definition.visual.body).lerp(new THREE.Color('#252c30'), 0.56)
  const accent = new THREE.Color(definition.visual.accent)
  const emissive = new THREE.Color(definition.visual.emissive)

  if (overlayMode === 'heat') {
    const overlay = new THREE.Color(heatColor(loadPercent))
    body.lerp(overlay, definition.category === 'compute' || definition.category === 'network' ? 0.16 : 0.08)
    accent.lerp(overlay, 0.62)
    emissive.copy(overlay)
  } else if (overlayMode === 'power') {
    const overlay = new THREE.Color(loadPercent > 88 ? '#ff5e58' : loadPercent > 75 ? '#ffb14c' : '#47d8a0')
    body.lerp(overlay, definition.ratedPowerKw ? 0.12 : 0.06)
    accent.lerp(overlay, 0.62)
    emissive.copy(overlay)
  } else if (overlayMode === 'cooling') {
    const overlay = new THREE.Color(definition.coolingKw ? '#2cd6e8' : '#3d6c7b')
    body.lerp(overlay, definition.coolingKw ? 0.14 : 0.07)
    accent.lerp(overlay, 0.62)
    emissive.copy(overlay)
  }

  return {
    body: `#${body.getHexString()}`,
    accent: `#${accent.getHexString()}`,
    emissive: `#${emissive.getHexString()}`,
    opacity: 1,
    emissiveIntensity: overlayMode === 'none' ? 0.04 : 0.16,
  }
}

type InstancePart = {
  position: Vec3
  scale: Vec3
  rotation?: Vec3
  color?: string
}

const PartMaterial = ({
  palette,
  color,
  emissive = '#000000',
  emissiveIntensity = 0,
  metalness = 0.28,
  roughness = 0.56,
  vertexColors = false,
  toneMapped = true,
}: {
  palette: Palette
  color: string
  emissive?: string
  emissiveIntensity?: number
  metalness?: number
  roughness?: number
  vertexColors?: boolean
  toneMapped?: boolean
}) => {
  const preview = palette.opacity < 1
  return (
    <meshStandardMaterial
      color={preview ? palette.body : color}
      emissive={preview ? palette.emissive : emissive}
      emissiveIntensity={preview ? Math.max(emissiveIntensity, palette.emissiveIntensity * 0.45) : emissiveIntensity}
      metalness={metalness}
      roughness={roughness}
      vertexColors={!preview && vertexColors}
      transparent={preview}
      opacity={palette.opacity}
      depthWrite={palette.opacity > 0.85}
      toneMapped={toneMapped}
    />
  )
}

const BoxInstances = ({
  items,
  palette,
  color,
  emissive,
  emissiveIntensity,
  metalness,
  roughness,
  castShadow = false,
  receiveShadow = false,
}: {
  items: InstancePart[]
  palette: Palette
  color: string
  emissive?: string
  emissiveIntensity?: number
  metalness?: number
  roughness?: number
  castShadow?: boolean
  receiveShadow?: boolean
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const usesInstanceColors = palette.opacity >= 1 && items.some((item) => Boolean(item.color))

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    items.forEach((item, index) => {
      const rotation = item.rotation ?? [0, 0, 0]
      dummy.position.set(...item.position)
      dummy.rotation.set(...rotation)
      dummy.scale.set(...item.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      if (usesInstanceColors) mesh.setColorAt(index, new THREE.Color(item.color ?? color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [color, dummy, items, usesInstanceColors])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, items.length]}
      castShadow={castShadow && palette.opacity >= 1}
      receiveShadow={receiveShadow}
    >
      <boxGeometry args={[1, 1, 1]} />
      <PartMaterial
        palette={palette}
        color={usesInstanceColors ? '#ffffff' : color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        metalness={metalness}
        roughness={roughness}
        vertexColors={usesInstanceColors}
      />
    </instancedMesh>
  )
}

const CylinderInstances = ({
  items,
  palette,
  color,
  emissive,
  emissiveIntensity,
  metalness,
  roughness,
  radialSegments = 16,
}: {
  items: InstancePart[]
  palette: Palette
  color: string
  emissive?: string
  emissiveIntensity?: number
  metalness?: number
  roughness?: number
  radialSegments?: number
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const usesInstanceColors = palette.opacity >= 1 && items.some((item) => Boolean(item.color))

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    items.forEach((item, index) => {
      const rotation = item.rotation ?? [0, 0, 0]
      dummy.position.set(...item.position)
      dummy.rotation.set(...rotation)
      dummy.scale.set(...item.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      if (usesInstanceColors) mesh.setColorAt(index, new THREE.Color(item.color ?? color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [color, dummy, items, usesInstanceColors])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, items.length]}>
      <cylinderGeometry args={[1, 1, 1, radialSegments]} />
      <PartMaterial
        palette={palette}
        color={usesInstanceColors ? '#ffffff' : color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        metalness={metalness}
        roughness={roughness}
        vertexColors={usesInstanceColors}
      />
    </instancedMesh>
  )
}

const EquipmentShell = ({
  width,
  height,
  depth,
  radius,
  palette,
  ghost,
  metalness,
  roughness,
}: {
  width: number
  height: number
  depth: number
  radius: number
  palette: Palette
  ghost: boolean
  metalness: number
  roughness: number
}) => (
  <RoundedBox
    args={[width, height, depth]}
    radius={radius}
    smoothness={2}
    position={[0, height / 2, 0]}
    castShadow={!ghost}
    receiveShadow
  >
    <PartMaterial
      palette={palette}
      color={palette.body}
      emissive={palette.emissive}
      emissiveIntensity={palette.emissiveIntensity * 0.42}
      metalness={metalness}
      roughness={roughness}
    />
  </RoundedBox>
)

const statusColor = (status: AssetInstance['status'], palette: Palette) => (
  status === 'offline' ? '#7e8792' : status === 'warning' ? '#ffc44d' : palette.emissive
)

const StatusLamp = ({
  position,
  size,
  status,
  palette,
}: {
  position: Vec3
  size: number
  status: AssetInstance['status']
  palette: Palette
}) => {
  const color = statusColor(status, palette)
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[size, size, 0.018, 18]} />
      <PartMaterial
        palette={palette}
        color={color}
        emissive={color}
        emissiveIntensity={status === 'offline' ? 0.18 : 1.9}
        metalness={0.22}
        roughness={0.24}
        toneMapped={false}
      />
    </mesh>
  )
}

const ControlScreen = ({
  position,
  width,
  height,
  status,
  palette,
}: {
  position: Vec3
  width: number
  height: number
  status: AssetInstance['status']
  palette: Palette
}) => {
  const color = statusColor(status, palette)
  const marks = useMemo<InstancePart[]>(() => [
    { position: [-width * 0.2, height * 0.16, 0.016], scale: [width * 0.42, height * 0.12, 0.008] },
    { position: [-width * 0.08, -height * 0.08, 0.016], scale: [width * 0.66, height * 0.1, 0.008] },
    { position: [width * 0.35, height * 0.16, 0.016], scale: [height * 0.12, height * 0.12, 0.008] },
  ], [height, width])

  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[width, height, 0.018]} />
        <PartMaterial
          palette={palette}
          color="#07171b"
          emissive={color}
          emissiveIntensity={status === 'offline' ? 0.08 : 0.48}
          metalness={0.24}
          roughness={0.26}
        />
      </mesh>
      <BoxInstances
        items={marks}
        palette={palette}
        color={color}
        emissive={color}
        emissiveIntensity={status === 'offline' ? 0.06 : 0.85}
        metalness={0.16}
        roughness={0.3}
      />
    </group>
  )
}

const FanArray = ({
  centers,
  radius,
  z,
  palette,
}: {
  centers: Array<[number, number]>
  radius: number
  z: number
  palette: Palette
}) => {
  const rims = useMemo<InstancePart[]>(() => centers.map(([x, y]) => ({
    position: [x, y, z],
    scale: [radius, 0.018, radius],
    rotation: [Math.PI / 2, 0, 0],
  })), [centers, radius, z])
  const discs = useMemo<InstancePart[]>(() => centers.map(([x, y]) => ({
    position: [x, y, z + 0.012],
    scale: [radius * 0.82, 0.016, radius * 0.82],
    rotation: [Math.PI / 2, 0, 0],
  })), [centers, radius, z])
  const hubs = useMemo<InstancePart[]>(() => centers.map(([x, y]) => ({
    position: [x, y, z + 0.03],
    scale: [radius * 0.18, 0.018, radius * 0.18],
    rotation: [Math.PI / 2, 0, 0],
  })), [centers, radius, z])
  const spokes = useMemo<InstancePart[]>(() => centers.flatMap(([x, y]) => (
    [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4].map((angle) => ({
      position: [x, y, z + 0.025] as Vec3,
      scale: [radius * 1.48, radius * 0.055, 0.012] as Vec3,
      rotation: [0, 0, angle] as Vec3,
    }))
  )), [centers, radius, z])

  return (
    <group>
      <CylinderInstances items={rims} palette={palette} color="#68757e" metalness={0.72} roughness={0.32} />
      <CylinderInstances items={discs} palette={palette} color="#0a1015" metalness={0.35} roughness={0.62} />
      <BoxInstances items={spokes} palette={palette} color="#4d5962" metalness={0.64} roughness={0.38} />
      <CylinderInstances items={hubs} palette={palette} color="#89949c" metalness={0.7} roughness={0.3} />
    </group>
  )
}

const RackModules = ({
  definition,
  palette,
  status,
}: {
  definition: AssetDefinition
  palette: Palette
  status: AssetInstance['status']
}) => {
  const { width, height, depth } = definition.dimensions
  const count = definition.kind === 'gpu-rack' ? 14 : definition.kind === 'network-rack' ? 17 : 20
  const usableHeight = height * 0.7
  const start = height * 0.14
  const pitch = usableHeight / count
  const led = statusColor(status, palette)
  const moduleColor = definition.kind === 'network-rack' ? '#252a3d' : definition.kind === 'gpu-rack' ? '#23312f' : '#27323c'
  const modules = useMemo<InstancePart[]>(() => Array.from({ length: count }, (_, index) => ({
    position: [0, start + pitch * index + pitch / 2, depth / 2 + 0.047],
    scale: [width * 0.7, Math.max(0.026, pitch * 0.72), 0.038],
    color: index % 6 === 0 ? palette.accent : moduleColor,
  })), [count, depth, moduleColor, palette.accent, pitch, start, width])
  const slots = useMemo<InstancePart[]>(() => Array.from({ length: count }, (_, index) => ({
    position: [-width * 0.035, start + pitch * index + pitch / 2, depth / 2 + 0.071],
    scale: [width * 0.5, Math.max(0.006, pitch * 0.11), 0.012],
  })), [count, depth, pitch, start, width])
  const leds = useMemo<InstancePart[]>(() => Array.from({ length: Math.ceil(count / 2) }, (_, index) => ({
    position: [width * 0.29, start + pitch * (index * 2) + pitch / 2, depth / 2 + 0.081],
    scale: [0.012, 0.012, 0.01],
  })), [count, depth, pitch, start, width])
  const patchPorts = useMemo<InstancePart[]>(() => Array.from({ length: 24 }, (_, index) => {
    const column = index % 6
    const row = Math.floor(index / 6)
    return {
      position: [(-2.5 + column) * width * 0.072, height * (0.67 + row * 0.026), depth / 2 + 0.09],
      scale: [width * 0.045, height * 0.012, 0.012],
      color: index % 3 === 0 ? palette.accent : '#131b25',
    }
  }), [depth, height, palette.accent, width])
  const liquidHardware = useMemo<InstancePart[]>(() => [
    { position: [-width * 0.325, height * 0.48, depth / 2 + 0.081], scale: [0.012, height * 0.55, 0.012], color: '#3dbfe6' },
    { position: [width * 0.325, height * 0.48, depth / 2 + 0.081], scale: [0.012, height * 0.55, 0.012], color: '#e46762' },
    ...[-0.325, 0.325].flatMap((x, sideIndex) => [0.25, 0.47, 0.69].map((y) => ({
      position: [width * x, height * y, depth / 2 + 0.097] as Vec3,
      scale: [0.026, 0.018, 0.026] as Vec3,
      rotation: [Math.PI / 2, 0, 0] as Vec3,
      color: sideIndex === 0 ? '#3dbfe6' : '#e46762',
    }))),
  ], [depth, height, width])

  return (
    <group>
      <BoxInstances items={modules} palette={palette} color={moduleColor} metalness={0.68} roughness={0.38} />
      <BoxInstances items={slots} palette={palette} color="#090d12" metalness={0.18} roughness={0.72} />
      <BoxInstances
        items={leds}
        palette={palette}
        color={led}
        emissive={led}
        emissiveIntensity={status === 'offline' ? 0.08 : 1.25}
        metalness={0.1}
        roughness={0.24}
      />
      {definition.kind === 'network-rack' && (
        <BoxInstances items={patchPorts} palette={palette} color="#131b25" metalness={0.32} roughness={0.5} />
      )}
      {definition.kind === 'gpu-rack' && (
        <CylinderInstances items={liquidHardware} palette={palette} color={palette.accent} metalness={0.62} roughness={0.28} />
      )}
    </group>
  )
}

const RackModel = ({
  definition,
  palette,
  status,
  ghost,
}: {
  definition: AssetDefinition
  palette: Palette
  status: AssetInstance['status']
  ghost: boolean
}) => {
  const { width, height, depth } = definition.dimensions
  const detailBoxes = useMemo<InstancePart[]>(() => {
    const items: InstancePart[] = [
      { position: [0, height * 0.51, depth / 2 + 0.018], scale: [width * 0.84, height * 0.84, 0.03], color: '#0a1016' },
      { position: [0, height * 0.49, -depth / 2 - 0.018], scale: [width * 0.82, height * 0.78, 0.03], color: '#0b1117' },
      { position: [0, height * 0.04, 0], scale: [width * 0.96, height * 0.08, depth * 0.94], color: '#151c22' },
      { position: [-width * 0.38, 0.014, -depth * 0.38], scale: [width * 0.12, 0.028, depth * 0.12], color: '#0d1216' },
      { position: [width * 0.38, 0.014, -depth * 0.38], scale: [width * 0.12, 0.028, depth * 0.12], color: '#0d1216' },
      { position: [-width * 0.38, 0.014, depth * 0.38], scale: [width * 0.12, 0.028, depth * 0.12], color: '#0d1216' },
      { position: [width * 0.38, 0.014, depth * 0.38], scale: [width * 0.12, 0.028, depth * 0.12], color: '#0d1216' },
      { position: [0, height * 0.94, depth / 2 + 0.051], scale: [width * 0.8, 0.025, 0.024], color: palette.accent },
      { position: [-width * 0.18, height * 0.955, depth / 2 + 0.066], scale: [width * 0.31, 0.058, 0.018], color: '#cad2d8' },
      { position: [-width * 0.21, height * 0.96, depth / 2 + 0.077], scale: [width * 0.15, 0.009, 0.008], color: '#34414b' },
      { position: [-width * 0.16, height * 0.946, depth / 2 + 0.077], scale: [width * 0.23, 0.007, 0.008], color: '#56636d' },
      { position: [width * 0.35, height * 0.9, depth / 2 + 0.061], scale: [width * 0.12, 0.055, 0.02], color: '#111820' },
      { position: [width * 0.38, height * 0.52, depth / 2 + 0.077], scale: [0.018, height * 0.18, 0.024], color: '#a3adb5' },
      { position: [width * 0.38, height * 0.61, depth / 2 + 0.063], scale: [0.045, 0.02, 0.02], color: '#737f88' },
      { position: [width * 0.38, height * 0.43, depth / 2 + 0.063], scale: [0.045, 0.02, 0.02], color: '#737f88' },
    ]
    ;[1, -1].forEach((face) => {
      const z = face * (depth / 2 + 0.043)
      items.push(
        { position: [0, height * 0.93, z], scale: [width * 0.86, 0.025, 0.022], color: '#5f6c76' },
        { position: [0, height * 0.09, z], scale: [width * 0.86, 0.025, 0.022], color: '#5f6c76' },
        { position: [-width * 0.43, height * 0.51, z], scale: [0.024, height * 0.86, 0.022], color: '#66737d' },
        { position: [width * 0.43, height * 0.51, z], scale: [0.024, height * 0.86, 0.022], color: '#66737d' },
      )
    })
    ;[-1, 1].forEach((side) => items.push({
      position: [side * width * 0.345, height * 0.5, depth / 2 + 0.058],
      scale: [0.018, height * 0.76, 0.018],
      color: '#79858e',
    }))
    Array.from({ length: 9 }, (_, index) => height * (0.19 + index * 0.063)).forEach((y) => items.push({
      position: [0, y, -depth / 2 - 0.045],
      scale: [width * 0.64, 0.016, 0.014],
      color: '#303a42',
    }))
    return items
  }, [depth, height, palette.accent, width])
  const cableEntries = useMemo<InstancePart[]>(() => [
    { position: [-width * 0.18, height + 0.008, -depth * 0.18], scale: [width * 0.055, 0.018, width * 0.055], color: '#161c21' },
    { position: [width * 0.18, height + 0.008, -depth * 0.18], scale: [width * 0.055, 0.018, width * 0.055], color: '#161c21' },
    { position: [-width * 0.17, height * 0.14, -depth / 2 - 0.044], scale: [width * 0.04, 0.02, width * 0.04], rotation: [Math.PI / 2, 0, 0], color: '#202930' },
    { position: [width * 0.17, height * 0.14, -depth / 2 - 0.044], scale: [width * 0.04, 0.02, width * 0.04], rotation: [Math.PI / 2, 0, 0], color: '#202930' },
  ], [depth, height, width])

  return (
    <group>
<EquipmentShell width={width} height={height} depth={depth} radius={0.02} palette={palette} ghost={ghost} metalness={0.28} roughness={0.56} />
      <BoxInstances items={detailBoxes} palette={palette} color="#5f6c76" metalness={0.68} roughness={0.38} />
      <RackModules definition={definition} palette={palette} status={status} />
      <CylinderInstances items={cableEntries} palette={palette} color="#171e24" metalness={0.56} roughness={0.4} />
      <StatusLamp
        position={[width * 0.35, height * 0.9, depth / 2 + 0.075]}
        size={Math.max(0.016, width * 0.023)}
        status={status}
        palette={palette}
      />
    </group>
  )
}

const UpsModel = ({
  definition,
  palette,
  status,
  ghost,
}: {
  definition: AssetDefinition
  palette: Palette
  status: AssetInstance['status']
  ghost: boolean
}) => {
  const { width, height, depth } = definition.dimensions
  const details = useMemo<InstancePart[]>(() => {
    const items: InstancePart[] = [
      { position: [0, height * 0.51, depth / 2 + 0.021], scale: [width * 0.91, height * 0.83, 0.034], color: '#171b1f' },
      { position: [0, height * 0.5, -depth / 2 - 0.019], scale: [width * 0.86, height * 0.76, 0.03], color: '#20252a' },
      { position: [0, height * 0.045, 0], scale: [width * 0.96, height * 0.09, depth * 0.94], color: '#262b2f' },
      { position: [0, height * 0.94, depth / 2 + 0.055], scale: [width * 0.86, 0.028, 0.025], color: palette.accent },
      { position: [0, height * 0.8, depth / 2 + 0.07], scale: [width * 0.25, height * 0.145, 0.03], color: '#0c1115' },
      { position: [width * 0.39, height * 0.9, depth / 2 + 0.063], scale: [width * 0.09, 0.055, 0.022], color: '#10161b' },
      { position: [-width * 0.31, height * 0.91, depth / 2 + 0.064], scale: [width * 0.24, 0.055, 0.02], color: '#d2d5d6' },
      { position: [-width * 0.32, height * 0.91, depth / 2 + 0.077], scale: [width * 0.13, 0.008, 0.008], color: '#3d454b' },
    ]
    ;[-1, 0, 1].forEach((column) => {
      const x = column * width * 0.295
      items.push(
        { position: [x, height * 0.5, depth / 2 + 0.046], scale: [width * 0.27, height * 0.71, 0.024], color: column === 0 ? '#1a2025' : '#1d2227' },
        { position: [x + width * 0.09, height * 0.53, depth / 2 + 0.071], scale: [0.018, height * 0.15, 0.022], color: '#9ca3a8' },
      )
      Array.from({ length: 6 }, (_, row) => row).forEach((row) => items.push({
        position: [x, height * (0.23 + row * 0.065), depth / 2 + 0.064],
        scale: [width * 0.19, 0.014, 0.012],
        color: row % 2 === 0 ? '#4a5054' : '#353b40',
      }))
    })
    ;[-1, 1].forEach((side) => items.push(
      { position: [side * width * 0.455, height * 0.51, depth / 2 + 0.05], scale: [0.024, height * 0.83, 0.022], color: '#626a70' },
      { position: [side * width * 0.4, 0.018, depth * 0.36], scale: [width * 0.1, 0.036, depth * 0.12], color: '#171b1f' },
      { position: [side * width * 0.4, 0.018, -depth * 0.36], scale: [width * 0.1, 0.036, depth * 0.12], color: '#171b1f' },
    ))
    Array.from({ length: 8 }, (_, index) => height * (0.23 + index * 0.065)).forEach((y) => items.push({
      position: [0, y, -depth / 2 - 0.043],
      scale: [width * 0.66, 0.016, 0.014],
      color: '#424a50',
    }))
    return items
  }, [depth, height, palette.accent, width])
  const terminals = useMemo<InstancePart[]>(() => [
    ...[-0.3, -0.1, 0.1, 0.3].map((x) => ({
      position: [x * width, height + 0.01, -depth * 0.16] as Vec3,
      scale: [width * 0.037, 0.022, width * 0.037] as Vec3,
      color: '#232a2f',
    })),
    ...[-0.24, -0.08, 0.08, 0.24].map((x, index) => ({
      position: [x * width, height * 0.16, -depth / 2 - 0.046] as Vec3,
      scale: [width * 0.026, 0.022, width * 0.026] as Vec3,
      rotation: [Math.PI / 2, 0, 0] as Vec3,
      color: index < 2 ? '#bd7a36' : '#737f87',
    })),
  ], [depth, height, width])

  return (
    <group>
<EquipmentShell width={width} height={height} depth={depth} radius={0.025} palette={palette} ghost={ghost} metalness={0.24} roughness={0.58} />
      <BoxInstances items={details} palette={palette} color="#343a3f" metalness={0.58} roughness={0.42} />
      <ControlScreen position={[0, height * 0.8, depth / 2 + 0.09]} width={width * 0.19} height={height * 0.085} status={status} palette={palette} />
      <CylinderInstances items={terminals} palette={palette} color="#343b40" metalness={0.7} roughness={0.28} />
      <StatusLamp position={[width * 0.39, height * 0.9, depth / 2 + 0.078]} size={width * 0.018} status={status} palette={palette} />
    </group>
  )
}

const BreakerGrid = ({
  width,
  height,
  depth,
  palette,
  isRpp,
}: {
  width: number
  height: number
  depth: number
  palette: Palette
  isRpp: boolean
}) => {
  const columns = isRpp ? 3 : 4
  const rows = isRpp ? 6 : 5
  const bodies = useMemo<InstancePart[]>(() => Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    return {
      position: [
        (column - (columns - 1) / 2) * width * (isRpp ? 0.2 : 0.17),
        height * (0.25 + row * (isRpp ? 0.082 : 0.09)),
        depth / 2 + 0.064,
      ],
      scale: [width * (isRpp ? 0.14 : 0.115), height * 0.052, 0.035],
      color: index % 7 === 0 ? palette.accent : ['#9da2a5', '#928d80', '#858f96'][column % 3],
    }
  }), [columns, depth, height, isRpp, palette.accent, rows, width])
  const toggles = useMemo<InstancePart[]>(() => bodies.map((body, index) => ({
    position: [body.position[0], body.position[1], depth / 2 + 0.088],
    scale: [width * 0.025, height * 0.025, 0.014],
    color: index % 7 === 0 ? '#f3b45b' : '#252c31',
  })), [bodies, depth, height, width])

  return (
    <group>
      <BoxInstances items={bodies} palette={palette} color="#969b9e" metalness={0.48} roughness={0.48} />
      <BoxInstances items={toggles} palette={palette} color="#252c31" metalness={0.42} roughness={0.4} />
    </group>
  )
}

const DistributionModel = ({
  definition,
  palette,
  status,
  ghost,
}: {
  definition: AssetDefinition
  palette: Palette
  status: AssetInstance['status']
  ghost: boolean
}) => {
  const { width, height, depth } = definition.dimensions
  const isRpp = definition.kind === 'rpp'
  const details = useMemo<InstancePart[]>(() => {
    const items: InstancePart[] = [
      { position: [0, height * 0.52, depth / 2 + 0.022], scale: [width * 0.84, height * 0.8, 0.036], color: '#181c20' },
      { position: [0, height * 0.045, 0], scale: [width * 0.96, height * 0.09, depth * 0.94], color: '#2b3034' },
      { position: [0, height * 0.955, depth / 2 + 0.057], scale: [width * 0.83, 0.027, 0.025], color: palette.accent },
      { position: [0, height * 0.81, depth / 2 + 0.068], scale: [width * (isRpp ? 0.34 : 0.4), height * 0.13, 0.029], color: '#0d1317' },
      { position: [width * 0.36, height * 0.91, depth / 2 + 0.063], scale: [width * 0.1, 0.055, 0.022], color: '#11171b' },
      { position: [-width * 0.27, height * 0.91, depth / 2 + 0.064], scale: [width * 0.25, 0.056, 0.02], color: '#d5d7d7' },
      { position: [-width * 0.28, height * 0.91, depth / 2 + 0.076], scale: [width * 0.14, 0.008, 0.008], color: '#454b4f' },
      { position: [width * 0.355, height * 0.5, depth / 2 + 0.074], scale: [0.018, height * 0.16, 0.022], color: '#9aa1a5' },
      { position: [-width * 0.31, height * 0.72, depth / 2 + 0.078], scale: [width * 0.075, height * 0.09, 0.026], color: '#d3893c' },
      { position: [-width * 0.31, height * 0.72, depth / 2 + 0.097], scale: [width * 0.02, height * 0.065, 0.012], color: '#2e3438' },
    ]
    ;[-1, 1].forEach((side) => items.push(
      { position: [side * width * 0.43, height * 0.52, depth / 2 + 0.049], scale: [0.023, height * 0.8, 0.022], color: '#646c71' },
      { position: [side * width * 0.38, 0.017, depth * 0.34], scale: [width * 0.1, 0.034, depth * 0.13], color: '#1c2023' },
      { position: [side * width * 0.38, 0.017, -depth * 0.34], scale: [width * 0.1, 0.034, depth * 0.13], color: '#1c2023' },
    ))
    ;[0.16, 0.2, 0.24, 0.28].forEach((fraction) => items.push({
      position: [0, height * fraction, -depth / 2 - 0.038],
      scale: [width * 0.62, 0.014, 0.012],
      color: '#41494e',
    }))
    if (!isRpp) items.push({ position: [0, height * 0.49, depth / 2 + 0.046], scale: [0.018, height * 0.63, 0.018], color: '#555e64' })
    return items
  }, [depth, height, isRpp, palette.accent, width])
  const glands = useMemo<InstancePart[]>(() => {
    const count = isRpp ? 4 : 6
    return [
      ...Array.from({ length: count }, (_, index) => ({
        position: [((index / (count - 1)) - 0.5) * width * 0.64, height + 0.01, 0] as Vec3,
        scale: [width * 0.035, 0.02, width * 0.035] as Vec3,
        color: '#272e33',
      })),
      ...['#d95a52', '#d9ba4e', '#5894c2'].map((color, index) => ({
        position: [width * (-0.1 + index * 0.1), height * 0.72, depth / 2 + 0.096] as Vec3,
        scale: [width * 0.013, 0.012, width * 0.013] as Vec3,
        rotation: [Math.PI / 2, 0, 0] as Vec3,
        color,
      })),
    ]
  }, [depth, height, isRpp, width])

  return (
    <group>
<EquipmentShell width={width} height={height} depth={depth} radius={0.02} palette={palette} ghost={ghost} metalness={0.24} roughness={0.58} />
      <BoxInstances items={details} palette={palette} color="#555d62" metalness={0.58} roughness={0.43} />
      <BreakerGrid width={width} height={height} depth={depth} palette={palette} isRpp={isRpp} />
      <ControlScreen position={[0, height * 0.81, depth / 2 + 0.088]} width={width * (isRpp ? 0.28 : 0.34)} height={height * 0.08} status={status} palette={palette} />
      <CylinderInstances items={glands} palette={palette} color="#31383d" metalness={0.66} roughness={0.3} />
      <StatusLamp position={[width * 0.36, height * 0.91, depth / 2 + 0.078]} size={width * 0.019} status={status} palette={palette} />
    </group>
  )
}

const CduModel = ({
  definition,
  palette,
  status,
  ghost,
}: {
  definition: AssetDefinition
  palette: Palette
  status: AssetInstance['status']
  ghost: boolean
}) => {
  const { width, height, depth } = definition.dimensions
  const details = useMemo<InstancePart[]>(() => {
    const items: InstancePart[] = [
      { position: [-width * 0.235, height * 0.52, depth / 2 + 0.024], scale: [width * 0.44, height * 0.8, 0.038], color: '#112027' },
      { position: [width * 0.235, height * 0.52, depth / 2 + 0.024], scale: [width * 0.44, height * 0.8, 0.038], color: '#102129' },
      { position: [0, height * 0.045, 0], scale: [width * 0.96, height * 0.09, depth * 0.94], color: '#263238' },
      { position: [0, height * 0.94, depth / 2 + 0.057], scale: [width * 0.83, 0.028, 0.025], color: palette.accent },
      { position: [0, height * 0.82, depth / 2 + 0.071], scale: [width * 0.31, height * 0.13, 0.029], color: '#07161a' },
      { position: [width * 0.39, height * 0.9, depth / 2 + 0.063], scale: [width * 0.1, 0.055, 0.022], color: '#0e171c' },
      { position: [-width * 0.3, height * 0.9, depth / 2 + 0.064], scale: [width * 0.22, 0.055, 0.02], color: '#cbd4d7' },
      { position: [-width * 0.31, height * 0.9, depth / 2 + 0.076], scale: [width * 0.12, 0.008, 0.008], color: '#38505a' },
      { position: [-width * 0.07, height * 0.51, depth / 2 + 0.069], scale: [0.018, height * 0.18, 0.022], color: '#9aa6ac' },
      { position: [width * 0.07, height * 0.51, depth / 2 + 0.069], scale: [0.018, height * 0.18, 0.022], color: '#9aa6ac' },
      { position: [0, height * 0.52, depth / 2 + 0.049], scale: [0.02, height * 0.8, 0.022], color: '#5f6d73' },
    ]
    ;[-1, 1].forEach((side) => items.push(
      { position: [side * width * 0.455, height * 0.52, depth / 2 + 0.049], scale: [0.024, height * 0.8, 0.022], color: '#607077' },
      { position: [side * width * 0.39, 0.017, depth * 0.37], scale: [width * 0.1, 0.034, depth * 0.12], color: '#192227' },
      { position: [side * width * 0.39, 0.017, -depth * 0.37], scale: [width * 0.1, 0.034, depth * 0.12], color: '#192227' },
    ))
    ;[-0.235, 0.235].forEach((x) => Array.from({ length: 5 }, (_, index) => items.push({
      position: [width * x, height * (0.14 + index * 0.045), depth / 2 + 0.069],
      scale: [width * 0.27, 0.014, 0.012],
      color: '#34505a',
    })))
    return items
  }, [depth, height, palette.accent, width])
  const pipework = useMemo<InstancePart[]>(() => {
    const topXs = [-0.3, -0.1, 0.1, 0.3]
    return [
      ...topXs.map((x, index) => ({
        position: [x * width, height + 0.075, index % 2 === 0 ? -depth * 0.18 : depth * 0.18] as Vec3,
        scale: [width * 0.052, 0.15, width * 0.052] as Vec3,
        color: index < 2 ? '#34b9e6' : '#e36b63',
      })),
      ...topXs.map((x, index) => ({
        position: [x * width, height + 0.012, index % 2 === 0 ? -depth * 0.18 : depth * 0.18] as Vec3,
        scale: [width * 0.075, 0.028, width * 0.075] as Vec3,
        color: index < 2 ? '#5acdf0' : '#ef827a',
      })),
      ...[-0.3, -0.1, 0.1, 0.3].map((x, index) => ({
        position: [x * width, height * 0.62, depth / 2 + 0.076] as Vec3,
        scale: [width * 0.047, 0.022, width * 0.047] as Vec3,
        rotation: [Math.PI / 2, 0, 0] as Vec3,
        color: index < 2 ? '#34b9e6' : '#e36b63',
      })),
      { position: [-width * 0.39, height * 0.43, depth / 2 + 0.067], scale: [0.014, height * 0.5, 0.014], color: '#34b9e6' },
      { position: [width * 0.39, height * 0.43, depth / 2 + 0.067], scale: [0.014, height * 0.5, 0.014], color: '#e36b63' },
    ]
  }, [depth, height, width])
  const gaugeRims = useMemo<InstancePart[]>(() => [-0.17, 0.17].map((x) => ({
    position: [x * width, height * 0.72, depth / 2 + 0.077],
    scale: [width * 0.065, 0.022, width * 0.065],
    rotation: [Math.PI / 2, 0, 0],
  })), [depth, height, width])
  const gaugeFaces = useMemo<InstancePart[]>(() => [-0.17, 0.17].map((x, index) => ({
    position: [x * width, height * 0.72, depth / 2 + 0.093],
    scale: [width * 0.048, 0.016, width * 0.048],
    rotation: [Math.PI / 2, 0, 0],
    color: index === 0 ? '#184a5d' : '#5d2928',
  })), [depth, height, width])
  const needles = useMemo<InstancePart[]>(() => [-0.17, 0.17].map((x, index) => ({
    position: [x * width, height * 0.72, depth / 2 + 0.106],
    scale: [width * 0.045, 0.007, 0.008],
    rotation: [0, 0, index === 0 ? 0.45 : -0.35],
  })), [depth, height, width])
  const fanCenters = useMemo<Array<[number, number]>>(() => [
    [-width * 0.22, height * 0.29],
    [width * 0.22, height * 0.29],
  ], [height, width])

  return (
    <group>
<EquipmentShell width={width} height={height} depth={depth} radius={0.024} palette={palette} ghost={ghost} metalness={0.22} roughness={0.6} />
      <BoxInstances items={details} palette={palette} color="#53656d" metalness={0.56} roughness={0.4} />
      <CylinderInstances items={pipework} palette={palette} color={palette.accent} metalness={0.68} roughness={0.28} />
      <CylinderInstances items={gaugeRims} palette={palette} color="#a4afb3" metalness={0.76} roughness={0.24} />
      <CylinderInstances items={gaugeFaces} palette={palette} color="#173b46" metalness={0.22} roughness={0.34} />
      <BoxInstances items={needles} palette={palette} color="#eef4f5" metalness={0.24} roughness={0.28} />
      <FanArray centers={fanCenters} radius={width * 0.115} z={depth / 2 + 0.072} palette={palette} />
      <ControlScreen position={[0, height * 0.82, depth / 2 + 0.09]} width={width * 0.24} height={height * 0.078} status={status} palette={palette} />
      <StatusLamp position={[width * 0.39, height * 0.9, depth / 2 + 0.078]} size={width * 0.018} status={status} palette={palette} />
    </group>
  )
}

const CrahModel = ({
  definition,
  palette,
  status,
  ghost,
}: {
  definition: AssetDefinition
  palette: Palette
  status: AssetInstance['status']
  ghost: boolean
}) => {
  const { width, height, depth } = definition.dimensions
  const details = useMemo<InstancePart[]>(() => {
    const items: InstancePart[] = [
      { position: [0, height * 0.51, depth / 2 + 0.022], scale: [width * 0.89, height * 0.83, 0.038], color: '#112028' },
      { position: [0, height * 0.5, -depth / 2 - 0.021], scale: [width * 0.87, height * 0.76, 0.034], color: '#17252b' },
      { position: [0, height * 0.045, 0], scale: [width * 0.97, height * 0.09, depth * 0.95], color: '#2a3439' },
      { position: [0, height * 0.945, depth / 2 + 0.057], scale: [width * 0.86, 0.028, 0.025], color: palette.accent },
      { position: [width * 0.31, height * 0.84, depth / 2 + 0.071], scale: [width * 0.25, height * 0.12, 0.03], color: '#08161b' },
      { position: [width * 0.44, height * 0.92, depth / 2 + 0.063], scale: [width * 0.07, 0.052, 0.022], color: '#0e171c' },
      { position: [-width * 0.31, height * 0.91, depth / 2 + 0.064], scale: [width * 0.25, 0.056, 0.02], color: '#d0d7da' },
      { position: [-width * 0.32, height * 0.91, depth / 2 + 0.076], scale: [width * 0.14, 0.008, 0.008], color: '#39525d' },
      { position: [-width * 0.14, height * 0.55, depth / 2 + 0.069], scale: [0.018, height * 0.17, 0.022], color: '#9ba7ad' },
      { position: [width * 0.14, height * 0.55, depth / 2 + 0.069], scale: [0.018, height * 0.17, 0.022], color: '#9ba7ad' },
    ]
    ;[-1, 1].forEach((side) => items.push(
      { position: [side * width * 0.455, height * 0.51, depth / 2 + 0.049], scale: [0.025, height * 0.83, 0.022], color: '#64737a' },
      { position: [side * width * 0.41, 0.018, depth * 0.37], scale: [width * 0.1, 0.036, depth * 0.12], color: '#1c2529' },
      { position: [side * width * 0.41, 0.018, -depth * 0.37], scale: [width * 0.1, 0.036, depth * 0.12], color: '#1c2529' },
    ))
    Array.from({ length: 8 }, (_, index) => items.push({
      position: [0, height * (0.64 + index * 0.032), depth / 2 + 0.067],
      scale: [width * 0.72, 0.014, 0.012],
      color: index % 2 === 0 ? '#45616b' : '#354d57',
    }))
    Array.from({ length: 10 }, (_, index) => items.push({
      position: [width * (-0.36 + index * 0.08), height * 0.5, -depth / 2 - 0.045],
      scale: [0.016, height * 0.62, 0.014],
      color: '#3a515a',
    }))
    ;[-0.28, 0, 0.28].forEach((x) => {
      items.push({ position: [x * width, height + 0.012, 0], scale: [width * 0.21, 0.024, depth * 0.54], color: '#15242a' })
      ;[-0.08, -0.027, 0.027, 0.08].forEach((offset) => items.push({
        position: [(x + offset) * width, height + 0.028, 0],
        scale: [0.014, 0.012, depth * 0.4],
        color: '#60747c',
      }))
    })
    return items
  }, [depth, height, palette.accent, width])
  const fanCenters = useMemo<Array<[number, number]>>(() => [
    [-width * 0.27, height * 0.36],
    [0, height * 0.36],
    [width * 0.27, height * 0.36],
  ], [height, width])
  const pipePorts = useMemo<InstancePart[]>(() => [
    { position: [-width * 0.2, height * 0.14, -depth / 2 - 0.048], scale: [width * 0.045, 0.024, width * 0.045], rotation: [Math.PI / 2, 0, 0], color: '#35b9e4' },
    { position: [width * 0.2, height * 0.14, -depth / 2 - 0.048], scale: [width * 0.045, 0.024, width * 0.045], rotation: [Math.PI / 2, 0, 0], color: '#e36d64' },
    { position: [-width * 0.31, height * 0.13, depth / 2 + 0.065], scale: [width * 0.025, 0.018, width * 0.025], rotation: [Math.PI / 2, 0, 0], color: '#63747c' },
    { position: [width * 0.31, height * 0.13, depth / 2 + 0.065], scale: [width * 0.025, 0.018, width * 0.025], rotation: [Math.PI / 2, 0, 0], color: '#63747c' },
  ], [depth, height, width])

  return (
    <group>
<EquipmentShell width={width} height={height} depth={depth} radius={0.026} palette={palette} ghost={ghost} metalness={0.2} roughness={0.62} />
      <BoxInstances items={details} palette={palette} color="#53676f" metalness={0.54} roughness={0.4} />
      <FanArray centers={fanCenters} radius={width * 0.1} z={depth / 2 + 0.075} palette={palette} />
      <CylinderInstances items={pipePorts} palette={palette} color="#64757d" metalness={0.67} roughness={0.29} />
      <ControlScreen position={[width * 0.31, height * 0.84, depth / 2 + 0.09]} width={width * 0.19} height={height * 0.072} status={status} palette={palette} />
      <StatusLamp position={[width * 0.44, height * 0.92, depth / 2 + 0.078]} size={width * 0.014} status={status} palette={palette} />
    </group>
  )
}

const SelectionEnvelope = ({ definition, tone = 'selected' }: { definition: AssetDefinition; tone?: 'selected' | 'valid' | 'invalid' }) => {
  const { width, height, depth } = definition.dimensions
  const color = tone === 'invalid' ? '#ff5d70' : tone === 'valid' ? '#54e9c0' : '#4594ff'
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(width + 0.09, height + 0.09, depth + 0.09)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    return edges
  }, [depth, height, width])

  return (
    <group>
      <lineSegments geometry={geometry} position={[0, height / 2, 0]} renderOrder={30}>
        <lineBasicMaterial color={color} transparent opacity={0.92} depthTest={false} />
      </lineSegments>
      <mesh position={[0, 0.024, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={12}>
        <planeGeometry args={[width + 0.18, depth + 0.18]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[0, 0.035, depth / 2 + 0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.07, 0.18, 3]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}

const AnalysisOverlay = ({
  definition,
  loadPercent,
  overlayMode,
}: {
  definition: AssetDefinition
  loadPercent: number
  overlayMode: OverlayMode
}) => {
  if (overlayMode === 'none') return null
  const { width, height, depth } = definition.dimensions
  const color = overlayMode === 'heat'
    ? heatColor(loadPercent)
    : overlayMode === 'power'
      ? (loadPercent > 88 ? '#ff625f' : loadPercent > 75 ? '#ffb24f' : '#42df9a')
      : '#2fd5ed'

  return (
    <group>
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={8}>
        <planeGeometry args={[width + 0.14, depth + 0.14]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1 + Math.min(loadPercent, 100) * 0.0011}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {overlayMode === 'heat' && (definition.category === 'compute' || definition.category === 'network') && (
        <mesh position={[0, height + height * 0.42, -depth * 0.2]} renderOrder={5}>
          <cylinderGeometry args={[width * 0.22, width * 0.55, height * 0.8, 18, 1, true]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.055 + Math.min(loadPercent, 100) * 0.00065}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </group>
  )
}

const ModelByKind = ({
  definition,
  palette,
  status,
  ghost,
}: {
  definition: AssetDefinition
  palette: Palette
  status: AssetInstance['status']
  ghost: boolean
}) => {
  switch (definition.kind) {
    case 'gpu-rack':
    case 'server-rack':
    case 'network-rack':
      return ghost ? <RackModel definition={definition} palette={palette} status={status} ghost={ghost} /> : <RealRackReference definition={definition} />
    case 'ups':
      return <UpsModel definition={definition} palette={palette} status={status} ghost={ghost} />
    case 'pdu':
    case 'rpp':
      return <DistributionModel definition={definition} palette={palette} status={status} ghost={ghost} />
    case 'cdu':
      return <CduModel definition={definition} palette={palette} status={status} ghost={ghost} />
    case 'crah':
      return <CrahModel definition={definition} palette={palette} status={status} ghost={ghost} />
    default:
      return null
  }
}

export const AssetModel = ({
  definition,
  instance,
  position,
  rotationY,
  overlayMode,
  selected = false,
  ghost = false,
  previewTone = null,
  onPointerDown,
}: AssetModelProps) => {
  const loadPercent = instance?.loadPercent ?? 70
  const status = instance?.status ?? 'normal'
  const palette = useMemo(
    () => makePalette(definition, loadPercent, overlayMode, ghost, previewTone),
    [definition, ghost, loadPercent, overlayMode, previewTone],
  )
  const { width, height, depth } = definition.dimensions

  return (
    <group
      position={position}
      rotation={[0, rotationY, 0]}
      onPointerDown={onPointerDown}
      userData={{ assetId: instance?.id, definitionId: definition.id }}
    >
      <ModelByKind definition={definition} palette={palette} status={status} ghost={ghost || Boolean(previewTone)} />

      {!ghost && (
        <AnalysisOverlay definition={definition} loadPercent={loadPercent} overlayMode={overlayMode} />
      )}

      {(selected || ghost || previewTone) && (
        <SelectionEnvelope definition={definition} tone={previewTone ?? (ghost ? 'valid' : 'selected')} />
      )}

      {!ghost && (
        <mesh position={[0, height / 2, 0]}>
          <boxGeometry args={[width, height, depth]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      )}
    </group>
  )
}
