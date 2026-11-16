import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, DragEvent as ReactDragEvent, MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Environment, Grid, Line, OrbitControls, useTexture } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { assetById } from '../assets'
import { ROOM } from '../domain'
import type {
  AssetInstance,
  CameraPreset,
  PlacementPreview,
  Vec3,
} from '../domain'
import { useDesignerStore } from '../useDesignerStore'
import { AssetModel } from './AssetModels'
import { getServiceZones, makeSnappedPosition, validatePlacement } from './sceneMath'

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

type DropProjectorApi = {
  project: (
    clientX: number,
    clientY: number,
    definitionId: string,
    commit: boolean,
  ) => PlacementPreview | null
  clear: () => void
}

type AssetDragState = {
  id: string
  offsetX: number
  offsetZ: number
  hasMoved: boolean
  preview: PlacementPreview
}

export type DataCenterViewportProps = {
  className?: string
  style?: CSSProperties
  showCameraControls?: boolean
  showPlacementFeedback?: boolean
  onPlacementRejected?: (reasons: string[]) => void
}

const CAMERA_VIEWS: Record<CameraPreset, { position: Vec3; target: Vec3 }> = {
  iso: { position: [16.5, 6.8, 17.5], target: [0, 1.25, 0] },
  top: { position: [0, 27, 0.02], target: [0, 0, 0] },
  aisle: { position: [-10.3, 2.85, 4.8], target: [5.8, 1.2, 3.2] },
  front: { position: [0, 6.4, 20.5], target: [0, 1.15, 0] },
}

const SceneLighting = () => (
  <group>
    <hemisphereLight args={['#e8f0f2', '#161b1e', 0.92]} />
    <ambientLight intensity={0.14} />
    <directionalLight
      position={[9, 16, 11]}
      intensity={2.7}
      color="#f5f3e8"
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-left={-15}
      shadow-camera-right={15}
      shadow-camera-top={13}
      shadow-camera-bottom={-13}
      shadow-camera-near={1}
      shadow-camera-far={42}
      shadow-bias={-0.00014}
    />
    <directionalLight position={[-10, 7, 12]} intensity={0.26} color="#a7bbc5" />

    {[-7.5, -2.5, 2.5, 7.5].map((x) => (
      <group key={x} position={[x, ROOM.height - 0.55, 0]}>
        <mesh castShadow>
          <boxGeometry args={[3.15, 0.06, 0.28]} />
          <meshStandardMaterial color="#bfd1dc" metalness={0.56} roughness={0.28} />
        </mesh>
        <mesh position={[0, -0.035, 0]}>
          <boxGeometry args={[2.9, 0.025, 0.18]} />
          <meshStandardMaterial
            color="#f6f2e5"
            emissive="#f6f2e5"
            emissiveIntensity={0.55}
            toneMapped={false}
          />
        </mesh>
        <pointLight position={[0, -0.45, 0]} intensity={2.65} distance={8.5} decay={2} color="#c7e7fa" />
      </group>
    ))}
  </group>
)

const CylinderBetween = ({
  start,
  end,
  radius,
  color,
  emissive = '#000000',
  emissiveIntensity = 0,
}: {
  start: Vec3
  end: Vec3
  radius: number
  color: string
  emissive?: string
  emissiveIntensity?: number
}) => {
  const transform = useMemo(() => {
    const from = new THREE.Vector3(...start)
    const to = new THREE.Vector3(...end)
    const direction = to.clone().sub(from)
    const midpoint = from.clone().add(to).multiplyScalar(0.5)
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    )
    return { midpoint, quaternion, length: direction.length() }
  }, [end, start])

  return (
    <mesh position={transform.midpoint} quaternion={transform.quaternion} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, transform.length, 12]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        metalness={0.42}
        roughness={0.34}
      />
    </mesh>
  )
}

const PipeRoute = ({
  points,
  color,
  active,
}: {
  points: Vec3[]
  color: string
  active: boolean
}) => (
  <group>
    {points.slice(0, -1).map((point, index) => (
      <CylinderBetween
        key={`${point.join('-')}-${index}`}
        start={point}
        end={points[index + 1]}
        radius={active ? 0.072 : 0.058}
        color={color}
        emissive={color}
        emissiveIntensity={active ? 0.32 : 0.04}
      />
    ))}
    {points.slice(1, -1).map((point, index) => (
      <mesh key={`${point.join('-')}-joint-${index}`} position={point} castShadow>
        <sphereGeometry args={[active ? 0.078 : 0.064, 12, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active ? 0.32 : 0.04}
          metalness={0.42}
          roughness={0.34}
        />
      </mesh>
    ))}
  </group>
)

const BuswayRun = ({ z, active }: { z: number; active: boolean }) => (
  <group position={[0, 3.38, z]}>
    <mesh castShadow receiveShadow>
      <boxGeometry args={[19.2, 0.18, 0.24]} />
      <meshStandardMaterial
        color={active ? '#7b654b' : '#59636a'}
        emissive="#ff9f43"
        emissiveIntensity={active ? 0.16 : 0.015}
        metalness={0.7}
        roughness={0.3}
      />
    </mesh>
    <mesh position={[0, -0.055, 0.126]}>
      <boxGeometry args={[19.22, 0.035, 0.012]} />
      <meshStandardMaterial
        color="#ffad4f"
        emissive="#ff9f43"
        emissiveIntensity={active ? 0.8 : 0.18}
        toneMapped={!active}
      />
    </mesh>
    {[-8, -4, 0, 4, 8].map((x) => (
      <group key={x} position={[x, 0.13, 0]}>
        <mesh>
          <boxGeometry args={[0.16, 0.08, 0.29]} />
          <meshStandardMaterial color="#77828a" metalness={0.72} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.25, 0]}>
          <boxGeometry args={[0.035, 0.5, 0.035]} />
          <meshStandardMaterial color="#4b5963" metalness={0.7} roughness={0.34} />
        </mesh>
      </group>
    ))}
  </group>
)

const WallPanel = ({
  position,
  size,
}: {
  position: Vec3
  size: Vec3
}) => (
  <group position={position}>
    <mesh receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color="#7e8788"
        emissive="#163247"
        emissiveIntensity={0.015}
        metalness={0.06}
        roughness={0.84}
        transparent
        opacity={0.76}
        depthWrite={false}
      />
    </mesh>
    <mesh position={[0, -size[1] / 2 + 0.08, 0]}>
      <boxGeometry args={[size[0] + 0.02, 0.16, size[2] + 0.02]} />
      <meshStandardMaterial color="#425766" metalness={0.55} roughness={0.38} />
    </mesh>
    <mesh position={[0, size[1] / 2 - 0.08, 0]}>
      <boxGeometry args={[size[0] + 0.02, 0.16, size[2] + 0.02]} />
      <meshStandardMaterial color="#425766" metalness={0.55} roughness={0.38} />
    </mesh>
  </group>
)

const RoomShell = ({ showWalls, overlayMode }: {
  showWalls: boolean
  overlayMode: ReturnType<typeof useDesignerStore.getState>['overlayMode']
}) => {
  const [floorMap, floorRough, floorNormal] = useTexture([
    '/textures/concrete-floor-diff.jpg',
    '/textures/concrete-floor-rough.jpg',
    '/textures/concrete-floor-norm.jpg',
  ])
  ;[floorMap, floorRough, floorNormal].forEach((texture) => { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(4, 3) })
  const wallHeight = ROOM.height - 0.28
  const wallThickness = 0.1
  const doorWidth = 2.8
  const southSegmentWidth = (ROOM.width - doorWidth) / 2

  return (
    <group>
      <mesh position={[0, -0.11, 0]} receiveShadow>
        <boxGeometry args={[ROOM.width + 0.35, 0.22, ROOM.depth + 0.35]} />
        <meshStandardMaterial map={floorMap} roughnessMap={floorRough} normalMap={floorNormal} color="#e9ece8" metalness={0.02} roughness={0.86} normalScale={new THREE.Vector2(0.12, 0.12)} />
      </mesh>

      <mesh position={[0, -0.008, 0]} receiveShadow>
        <boxGeometry args={[ROOM.width, 0.035, ROOM.depth]} />
        <meshStandardMaterial color="#c6ceca" metalness={0.04} roughness={0.8} />
      </mesh>

      <Grid
        args={[ROOM.width, ROOM.depth]}
        position={[0, 0.008, 0]}
        cellSize={ROOM.tile}
        cellThickness={0.55}
        cellColor="#7a8589"
        sectionSize={ROOM.tile * 5}
        sectionThickness={0.9}
        sectionColor="#5d686c"
        fadeDistance={34}
        fadeStrength={1.1}
        infiniteGrid={false}
        side={THREE.DoubleSide}
      />

      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[11.2, 2.2]} />
        <meshBasicMaterial
          color={overlayMode === 'cooling' ? '#25d7ef' : '#1d84ad'}
          transparent
          opacity={overlayMode === 'cooling' ? 0.18 : 0.055}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {[-3.35, 3.35].map((z) => (
        <mesh key={z} position={[0, 0.011, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[11.2, 0.95]} />
          <meshBasicMaterial
            color={overlayMode === 'heat' ? '#ff674f' : '#7b443a'}
            transparent
            opacity={overlayMode === 'heat' ? 0.145 : 0.035}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {overlayMode === 'power' && (
        <mesh position={[-6.4, 0.013, 5.8]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[6.3, 1.5]} />
          <meshBasicMaterial
            color="#ffad4f"
            transparent
            opacity={0.13}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      <Line
        points={[
          [-ROOM.width / 2, 0.035, -ROOM.depth / 2],
          [ROOM.width / 2, 0.035, -ROOM.depth / 2],
          [ROOM.width / 2, 0.035, ROOM.depth / 2],
          [-ROOM.width / 2, 0.035, ROOM.depth / 2],
          [-ROOM.width / 2, 0.035, -ROOM.depth / 2],
        ]}
        color="#6388a1"
        lineWidth={1.25}
        transparent
        opacity={0.62}
      />

      {[-6.8, 6.8].map((x) => (
        <mesh key={`walkway-${x}`} position={[x, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.08, ROOM.depth - 1.2]} />
          <meshBasicMaterial color="#d6a744" transparent opacity={0.38} depthWrite={false} />
        </mesh>
      ))}

      {ROOM.columns.map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, wallHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.45, wallHeight, 0.45]} />
            <meshStandardMaterial color="#667986" metalness={0.28} roughness={0.62} />
          </mesh>
          <mesh position={[0, 0.46, 0]}>
            <boxGeometry args={[0.47, 0.34, 0.47]} />
            <meshStandardMaterial color="#d4a431" metalness={0.32} roughness={0.46} />
          </mesh>
          <mesh position={[0, 0.46, 0.238]}>
            <boxGeometry args={[0.49, 0.07, 0.012]} />
            <meshStandardMaterial color="#20292f" />
          </mesh>
        </group>
      ))}

      <mesh position={[0, ROOM.height - 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshStandardMaterial
          color="#6d8290"
          metalness={0.35}
          roughness={0.52}
          transparent
          opacity={0.07}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {showWalls && (
        <group>
          <WallPanel position={[0, wallHeight / 2, -ROOM.depth / 2]} size={[ROOM.width, wallHeight, wallThickness]} />
          <WallPanel position={[-ROOM.width / 2, wallHeight / 2, 0]} size={[wallThickness, wallHeight, ROOM.depth]} />
          <WallPanel position={[ROOM.width / 2, wallHeight / 2, 0]} size={[wallThickness, wallHeight, ROOM.depth]} />
          <WallPanel
            position={[-(doorWidth / 2 + southSegmentWidth / 2), wallHeight / 2, ROOM.depth / 2]}
            size={[southSegmentWidth, wallHeight, wallThickness]}
          />
          <WallPanel
            position={[doorWidth / 2 + southSegmentWidth / 2, wallHeight / 2, ROOM.depth / 2]}
            size={[southSegmentWidth, wallHeight, wallThickness]}
          />

          {[-doorWidth / 2, doorWidth / 2].map((x) => (
            <mesh key={x} position={[x, 1.35, ROOM.depth / 2 - 0.015]}>
              <boxGeometry args={[0.12, 2.7, 0.15]} />
              <meshStandardMaterial color="#5b8299" metalness={0.55} roughness={0.35} />
            </mesh>
          ))}
          <mesh position={[0, 2.7, ROOM.depth / 2 - 0.015]}>
            <boxGeometry args={[doorWidth + 0.1, 0.1, 0.14]} />
            <meshStandardMaterial color="#5b8299" metalness={0.55} roughness={0.35} />
          </mesh>
          <group position={[-doorWidth / 2 + 0.05, 1.35, ROOM.depth / 2 + 0.02]} rotation={[0, -0.92, 0]}>
            <mesh position={[0.67, 0, 0]} castShadow>
              <boxGeometry args={[1.34, 2.58, 0.055]} />
              <meshStandardMaterial color="#718897" metalness={0.38} roughness={0.52} transparent opacity={0.72} />
            </mesh>
            <mesh position={[1.18, 0, -0.042]}>
              <boxGeometry args={[0.035, 0.48, 0.06]} />
              <meshStandardMaterial color="#d7e2e8" metalness={0.72} roughness={0.22} />
            </mesh>
          </group>
          <group position={[doorWidth / 2 - 0.05, 1.35, ROOM.depth / 2 + 0.02]} rotation={[0, 0.92, 0]}>
            <mesh position={[-0.67, 0, 0]} castShadow>
              <boxGeometry args={[1.34, 2.58, 0.055]} />
              <meshStandardMaterial color="#718897" metalness={0.38} roughness={0.52} transparent opacity={0.72} />
            </mesh>
            <mesh position={[-1.18, 0, -0.042]}>
              <boxGeometry args={[0.035, 0.48, 0.06]} />
              <meshStandardMaterial color="#d7e2e8" metalness={0.72} roughness={0.22} />
            </mesh>
          </group>
        </group>
      )}
    </group>
  )
}

const InfrastructureRuns = ({ showPipes, overlayMode }: {
  showPipes: boolean
  overlayMode: ReturnType<typeof useDesignerStore.getState>['overlayMode']
}) => {
  if (!showPipes) return null
  const powerActive = overlayMode === 'power'
  const coolingActive = overlayMode === 'cooling'

  return (
    <group>
      {[-2.4, 2.4].map((z) => <BuswayRun key={`bus-${z}`} z={z} active={powerActive} />)}

      <PipeRoute
        points={[
          [9.25, 3.04, -6.15],
          [9.25, 3.04, -0.95],
          [-9.15, 3.04, -0.95],
        ]}
        color="#32bce8"
        active={coolingActive}
      />
      <PipeRoute
        points={[
          [8.88, 2.76, -6.15],
          [8.88, 2.76, 0.95],
          [-9.15, 2.76, 0.95],
        ]}
        color="#d45d57"
        active={coolingActive}
      />

      {[-7.5, -2.5, 2.5, 7.5].map((x) => (
        <group key={`tray-${x}`} position={[x, 3.74, 0]}>
          <mesh>
            <boxGeometry args={[2.2, 0.045, 0.68]} />
            <meshStandardMaterial color="#4c5c66" metalness={0.72} roughness={0.3} wireframe />
          </mesh>
          {[-0.9, -0.45, 0, 0.45, 0.9].map((offset) => (
            <mesh key={offset} position={[offset, 0, 0]}>
              <boxGeometry args={[0.035, 0.055, 0.7]} />
              <meshStandardMaterial color="#657680" metalness={0.75} roughness={0.26} />
            </mesh>
          ))}
        </group>
      ))}

      {[-8, -4, 0, 4, 8].flatMap((x) => [
        <mesh key={`pipe-hanger-a-${x}`} position={[x, 3.34, -0.95]}>
          <boxGeometry args={[0.035, 0.62, 0.035]} />
          <meshStandardMaterial color="#4f6574" metalness={0.66} roughness={0.38} />
        </mesh>,
        <mesh key={`pipe-hanger-b-${x}`} position={[x, 3.2, 0.95]}>
          <boxGeometry args={[0.035, 0.82, 0.035]} />
          <meshStandardMaterial color="#4f6574" metalness={0.66} roughness={0.38} />
        </mesh>,
      ])}
    </group>
  )
}

const CameraRig = () => {
  const cameraPreset = useDesignerStore((state) => state.cameraPreset)
  const viewMode = useDesignerStore((state) => state.viewMode)
  const isManipulating = useDesignerStore((state) => state.isManipulating)
  const focusSequence = useDesignerStore((state) => state.focusSequence)
  const selectedId = useDesignerStore((state) => state.selectedId)
  const instances = useDesignerStore((state) => state.instances)
  const { camera, invalidate } = useThree()
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const goalPosition = useRef(new THREE.Vector3(...CAMERA_VIEWS.iso.position))
  const goalTarget = useRef(new THREE.Vector3(...CAMERA_VIEWS.iso.target))
  const animating = useRef(true)
  const reducedMotion = useRef(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = media.matches }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const view = CAMERA_VIEWS[cameraPreset]
    goalPosition.current.set(...view.position)
    goalTarget.current.set(...view.target)
    animating.current = true
    invalidate()
  }, [cameraPreset, invalidate])

  useEffect(() => {
    if (focusSequence === 0 || !selectedId) return
    const instance = instances.find((item) => item.id === selectedId)
    if (!instance) return
    const definition = assetById[instance.definitionId]
    const y = definition ? definition.dimensions.height * 0.48 : 1
    goalTarget.current.set(instance.position[0], y, instance.position[2])
    goalPosition.current.set(instance.position[0] + 4.6, y + 4.1, instance.position[2] + 5.8)
    animating.current = true
    invalidate()
  }, [focusSequence, instances, invalidate, selectedId])

  useFrame((_, delta) => {
    if (!animating.current) return
    const controls = controlsRef.current
    const factor = reducedMotion.current ? 1 : 1 - Math.exp(-delta * 5.4)
    camera.position.lerp(goalPosition.current, factor)
    if (controls) controls.target.lerp(goalTarget.current, factor)
    controls?.update()

    const positionDone = camera.position.distanceToSquared(goalPosition.current) < 0.0025
    const targetDone = !controls || controls.target.distanceToSquared(goalTarget.current) < 0.0018
    if (positionDone && targetDone) {
      camera.position.copy(goalPosition.current)
      controls?.target.copy(goalTarget.current)
      controls?.update()
      animating.current = false
    } else {
      invalidate()
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={!isManipulating}
      enableDamping
      dampingFactor={0.075}
      minDistance={3.5}
      maxDistance={44}
      maxPolarAngle={Math.PI / 2.03}
      enableRotate={viewMode !== '2d' && cameraPreset !== 'top'}
      screenSpacePanning
      mouseButtons={{
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
      onStart={() => { animating.current = false }}
      onChange={() => invalidate()}
    />
  )
}

const DropProjectorBridge = ({ apiRef }: {
  apiRef: MutableRefObject<DropProjectorApi | null>
}) => {
  const { camera, gl, invalidate } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const hitPoint = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const api: DropProjectorApi = {
      project: (clientX, clientY, definitionId, commit) => {
        const definition = assetById[definitionId]
        if (!definition) return null
        const rect = gl.domElement.getBoundingClientRect()
        if (
          clientX < rect.left
          || clientX > rect.right
          || clientY < rect.top
          || clientY > rect.bottom
          || rect.width === 0
          || rect.height === 0
        ) {
          return null
        }

        ndc.set(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        const intersection = raycaster.ray.intersectPlane(FLOOR_PLANE, hitPoint)
        if (!intersection) return null

        const state = useDesignerStore.getState()
        const priorRotation = state.placementPreview?.definitionId === definitionId
          ? state.placementPreview.rotationY
          : 0
        const position = makeSnappedPosition(intersection.x, intersection.z)
        const preview = validatePlacement(
          definition,
          position,
          priorRotation,
          state.instances,
        )
        state.setPlacementPreview(preview)
        if (commit && preview.valid) {
          state.addAsset(definitionId, preview.position, preview.rotationY)
        }
        invalidate()
        return preview
      },
      clear: () => {
        useDesignerStore.getState().setPlacementPreview(null)
        invalidate()
      },
    }
    apiRef.current = api
    return () => {
      if (apiRef.current === api) apiRef.current = null
    }
  }, [apiRef, camera, gl, hitPoint, invalidate, ndc, raycaster])

  return null
}

const InteractionPlane = ({
  dragging,
  onMove,
  onClearSelection,
}: {
  dragging: boolean
  onMove: (event: ThreeEvent<PointerEvent>) => void
  onClearSelection: () => void
}) => (
  <mesh
    position={[0, 0.028, 0]}
    rotation={[-Math.PI / 2, 0, 0]}
    onPointerMove={dragging ? onMove : undefined}
    onPointerDown={(event) => {
      if (event.nativeEvent.button !== 0 || dragging) return
      onClearSelection()
    }}
  >
    <planeGeometry args={[ROOM.width + 5, ROOM.depth + 5]} />
    <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
  </mesh>
)

const ServiceClearance = ({
  definitionId,
  position,
  rotationY,
  tone,
}: {
  definitionId: string
  position: Vec3
  rotationY: number
  tone: 'selected' | 'valid' | 'invalid' | 'warning'
}) => {
  const definition = assetById[definitionId]
  const zones = useMemo(
    () => definition ? getServiceZones(definition, position, rotationY) : null,
    [definition, position, rotationY],
  )
  if (!zones) return null

  const baseColor = tone === 'invalid'
    ? '#ff536f'
    : tone === 'warning'
      ? '#f7c948'
      : tone === 'valid'
        ? '#43d487'
        : '#4594ff'

  return (
    <group>
      {Object.entries(zones).map(([key, zone]) => {
        const halfWidth = zone.width / 2
        const halfDepth = zone.depth / 2
        const points: Vec3[] = [
          [zone.position[0] - halfWidth, 0.045, zone.position[2] - halfDepth],
          [zone.position[0] + halfWidth, 0.045, zone.position[2] - halfDepth],
          [zone.position[0] + halfWidth, 0.045, zone.position[2] + halfDepth],
          [zone.position[0] - halfWidth, 0.045, zone.position[2] + halfDepth],
          [zone.position[0] - halfWidth, 0.045, zone.position[2] - halfDepth],
        ]
        return (
          <group key={key}>
            <mesh position={[zone.position[0], 0.031, zone.position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[zone.width, zone.depth]} />
              <meshBasicMaterial
                color={baseColor}
                transparent
                opacity={key === 'front' ? 0.085 : 0.055}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <Line
              points={points}
              color={baseColor}
              lineWidth={tone === 'invalid' ? 2 : 1.2}
              transparent
              opacity={tone === 'selected' ? 0.62 : 0.88}
            />
          </group>
        )
      })}
    </group>
  )
}

const SceneContent = ({ projectorRef }: {
  projectorRef: MutableRefObject<DropProjectorApi | null>
}) => {
  const instances = useDesignerStore((state) => state.instances)
  const selectedId = useDesignerStore((state) => state.selectedId)
  const overlayMode = useDesignerStore((state) => state.overlayMode)
  const workspaceMode = useDesignerStore((state) => state.workspaceMode)
  const showWalls = useDesignerStore((state) => state.showWalls)
  const showPipes = useDesignerStore((state) => state.showPipes)
  const placementPreview = useDesignerStore((state) => state.placementPreview)
  const draggingDefinitionId = useDesignerStore((state) => state.draggingDefinitionId)
  const select = useDesignerStore((state) => state.select)
  const moveAsset = useDesignerStore((state) => state.moveAsset)
  const setPlacementPreview = useDesignerStore((state) => state.setPlacementPreview)
  const setManipulating = useDesignerStore((state) => state.setManipulating)
  const [assetDrag, setAssetDrag] = useState<AssetDragState | null>(null)
  const dragRef = useRef<AssetDragState | null>(null)
  dragRef.current = assetDrag

  const finishAssetDrag = useCallback((commit: boolean) => {
    const current = dragRef.current
    if (!current) return
    if (commit && current.hasMoved && current.preview.valid) {
      moveAsset(current.id, current.preview.position)
    }
    setPlacementPreview(null)
    dragRef.current = null
    setAssetDrag(null)
    setManipulating(false)
  }, [moveAsset, setManipulating, setPlacementPreview])

  useEffect(() => {
    const onPointerUp = () => finishAssetDrag(true)
    const onPointerCancel = () => finishAssetDrag(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finishAssetDrag(false)
    }
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [finishAssetDrag])

  const beginAssetDrag = useCallback((instance: AssetInstance, event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    select(instance.id)
    if (
      event.nativeEvent.button !== 0
      || instance.locked
      || workspaceMode !== 'layout'
    ) return

    const definition = assetById[instance.definitionId]
    if (!definition) return
    const point = new THREE.Vector3()
    if (!event.ray.intersectPlane(FLOOR_PLANE, point)) return
    const preview = validatePlacement(
      definition,
      instance.position,
      instance.rotationY,
      instances,
      instance.id,
    )
    const next: AssetDragState = {
      id: instance.id,
      offsetX: instance.position[0] - point.x,
      offsetZ: instance.position[2] - point.z,
      hasMoved: false,
      preview,
    }
    dragRef.current = next
    setAssetDrag(next)
    setPlacementPreview(preview)
    setManipulating(true)
  }, [instances, select, setManipulating, setPlacementPreview, workspaceMode])

  const moveDraggedAsset = useCallback((event: ThreeEvent<PointerEvent>) => {
    const current = dragRef.current
    if (!current) return
    event.stopPropagation()
    const instance = useDesignerStore.getState().instances.find((item) => item.id === current.id)
    if (!instance) return
    const definition = assetById[instance.definitionId]
    if (!definition) return
    const position = makeSnappedPosition(
      event.point.x + current.offsetX,
      event.point.z + current.offsetZ,
    )
    const preview = validatePlacement(
      definition,
      position,
      instance.rotationY,
      useDesignerStore.getState().instances,
      instance.id,
    )
    const hasMoved = current.hasMoved
      || preview.position[0] !== instance.position[0]
      || preview.position[2] !== instance.position[2]
    const next = { ...current, hasMoved, preview }
    dragRef.current = next
    setAssetDrag(next)
    useDesignerStore.getState().setPlacementPreview(preview)
  }, [])

  const ghostDefinition = placementPreview ? assetById[placementPreview.definitionId] : undefined

  return (
    <>
      <color attach="background" args={['#03070a']} />
      <fog attach="fog" args={['#03070a', 52, 118]} />
      <SceneLighting />
      <Environment files="/textures/industrial-workshop.hdr" background={false} environmentIntensity={0.18} />
      <RoomShell showWalls={showWalls} overlayMode={overlayMode} />
      <InfrastructureRuns showPipes={showPipes} overlayMode={overlayMode} />

      {instances.map((instance) => {
        const definition = assetById[instance.definitionId]
        if (!definition) return null
        const activeDrag = assetDrag?.id === instance.id ? assetDrag : null
        const renderPosition = activeDrag ? activeDrag.preview.position : instance.position
        const clearanceTone = activeDrag
          ? activeDrag.preview.valid
            ? activeDrag.preview.warnings.length ? 'warning' : 'valid'
            : 'invalid'
          : 'selected'
        return (
          <group key={instance.id}>
            {(selectedId === instance.id || activeDrag) && (
              <ServiceClearance
                definitionId={instance.definitionId}
                position={renderPosition}
                rotationY={instance.rotationY}
                tone={clearanceTone}
              />
            )}
            <AssetModel
              definition={definition}
              instance={instance}
              position={renderPosition}
              rotationY={instance.rotationY}
              overlayMode={overlayMode}
              selected={selectedId === instance.id}
              previewTone={activeDrag ? (activeDrag.preview.valid ? 'valid' : 'invalid') : null}
              onPointerDown={(event) => beginAssetDrag(instance, event)}
            />
          </group>
        )
      })}

      {placementPreview && ghostDefinition && draggingDefinitionId && (
        <group>
          <ServiceClearance
            definitionId={placementPreview.definitionId}
            position={placementPreview.position}
            rotationY={placementPreview.rotationY}
            tone={placementPreview.valid ? placementPreview.warnings.length ? 'warning' : 'valid' : 'invalid'}
          />
          <AssetModel
            definition={ghostDefinition}
            position={placementPreview.position}
            rotationY={placementPreview.rotationY}
            overlayMode={overlayMode}
            ghost
            previewTone={placementPreview.valid ? 'valid' : 'invalid'}
          />
        </group>
      )}

      <ContactShadows
        position={[0, 0.025, 0]}
        scale={32}
        opacity={0.32}
        blur={2.4}
        far={3.2}
        resolution={1024}
        frames={assetDrag ? Infinity : 1}
        color="#02060a"
      />

      <InteractionPlane
        dragging={Boolean(assetDrag)}
        onMove={moveDraggedAsset}
        onClearSelection={() => select(null)}
      />
      <DropProjectorBridge apiRef={projectorRef} />
      <CameraRig />
    </>
  )
}

const getDefinitionIdFromDrop = (event: ReactDragEvent<HTMLDivElement>) => {
  const stateId = useDesignerStore.getState().draggingDefinitionId
  const candidates = [
    event.dataTransfer.getData('application/x-dc-asset'),
    event.dataTransfer.getData('asset-definition-id'),
    event.dataTransfer.getData('text/plain'),
    stateId ?? '',
  ]
  for (const candidate of candidates) {
    const value = candidate.trim()
    if (value && assetById[value]) return value
    if (value.startsWith('{')) {
      try {
        const parsed = JSON.parse(value) as { definitionId?: string; assetId?: string }
        const parsedId = parsed.definitionId ?? parsed.assetId
        if (parsedId && assetById[parsedId]) return parsedId
      } catch {
        // Ignore unrelated text payloads from native drag and drop.
      }
    }
  }
  return null
}

const CameraPresetControls = () => {
  const cameraPreset = useDesignerStore((state) => state.cameraPreset)
  const setCameraPreset = useDesignerStore((state) => state.setCameraPreset)
  const labels: Array<[CameraPreset, string]> = [
    ['iso', '等轴'],
    ['top', '俯视'],
    ['aisle', '通道'],
    ['front', '全景'],
  ]
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 4,
        display: 'flex',
        gap: 4,
        padding: 4,
        border: '1px solid rgba(139, 185, 215, 0.22)',
        borderRadius: 8,
        background: 'rgba(7, 17, 27, 0.82)',
        backdropFilter: 'blur(10px)',
      }}
      aria-label="相机视角"
    >
      {labels.map(([preset, label]) => (
        <button
          key={preset}
          type="button"
          onClick={() => setCameraPreset(preset)}
          style={{
            border: 0,
            borderRadius: 5,
            padding: '6px 9px',
            color: cameraPreset === preset ? '#061a20' : '#b7cbd8',
            background: cameraPreset === preset ? '#69e0c2' : 'transparent',
            font: 'inherit',
            fontSize: 12,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export const DataCenterViewport = ({
  className,
  style,
  showCameraControls = false,
  showPlacementFeedback = false,
  onPlacementRejected,
}: DataCenterViewportProps) => {
  const projectorRef = useRef<DropProjectorApi | null>(null)
  const preview = useDesignerStore((state) => state.placementPreview)
  const setDraggingDefinition = useDesignerStore((state) => state.setDraggingDefinition)
  const frameRequest = useRef<number | null>(null)
  const pendingPreview = useRef<{ clientX: number; clientY: number; definitionId: string } | null>(null)

  useEffect(() => () => {
    if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current)
  }, [])

  const queuePreview = useCallback((clientX: number, clientY: number, definitionId: string) => {
    pendingPreview.current = { clientX, clientY, definitionId }
    if (frameRequest.current !== null) return
    frameRequest.current = requestAnimationFrame(() => {
      frameRequest.current = null
      const pending = pendingPreview.current
      if (!pending) return
      projectorRef.current?.project(
        pending.clientX,
        pending.clientY,
        pending.definitionId,
        false,
      )
    })
  }, [])

  const onDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    const definitionId = getDefinitionIdFromDrop(event)
      ?? useDesignerStore.getState().draggingDefinitionId
    if (!definitionId || !assetById[definitionId]) return
    queuePreview(event.clientX, event.clientY, definitionId)
  }, [queuePreview])

  const onDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (frameRequest.current !== null) {
      cancelAnimationFrame(frameRequest.current)
      frameRequest.current = null
    }
    pendingPreview.current = null
    const definitionId = getDefinitionIdFromDrop(event)
    if (!definitionId) {
      projectorRef.current?.clear()
      setDraggingDefinition(null)
      return
    }
    const result = projectorRef.current?.project(
      event.clientX,
      event.clientY,
      definitionId,
      true,
    )
    if (result && !result.valid) onPlacementRejected?.(result.reasons)
    if (!result?.valid) projectorRef.current?.clear()
    setDraggingDefinition(null)
  }, [onPlacementRejected, setDraggingDefinition])

  const onDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
    pendingPreview.current = null
    if (frameRequest.current !== null) {
      cancelAnimationFrame(frameRequest.current)
      frameRequest.current = null
    }
    projectorRef.current?.clear()
  }, [])

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 360,
        overflow: 'hidden',
        background: '#07111b',
        ...style,
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      aria-label="数据中心三维设计视口"
    >
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        frameloop="demand"
        camera={{ position: CAMERA_VIEWS.iso.position, fov: 42, near: 0.1, far: 120 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.1
          gl.domElement.setAttribute('role', 'img')
          gl.domElement.setAttribute(
            'aria-label',
            '交互式数据中心三维机房。可选择并拖动设备，右键旋转视图，滚轮缩放；方向键以 100 毫米微调所选设备，Shift 加方向键以 600 毫米移动，也可使用界面按钮完成添加、移动、旋转、复制和删除。',
          )
        }}
      >
        <SceneContent projectorRef={projectorRef} />
      </Canvas>

      {showCameraControls && <CameraPresetControls />}

      {showPlacementFeedback && preview && (
        <div
          style={{
            position: 'absolute',
            left: 14,
            bottom: 14,
            zIndex: 4,
            maxWidth: 360,
            padding: '8px 11px',
            borderRadius: 7,
            border: `1px solid ${preview.valid ? 'rgba(82, 232, 190, .45)' : 'rgba(255, 92, 111, .5)'}`,
            background: 'rgba(7, 17, 27, .88)',
            color: preview.valid ? '#86f1d3' : '#ff8795',
            fontSize: 12,
            lineHeight: 1.45,
            pointerEvents: 'none',
            backdropFilter: 'blur(10px)',
          }}
          aria-live="polite"
        >
          {preview.valid
            ? preview.warnings.length
              ? `可以放置，${preview.warnings.join('；')}`
              : `已吸附至 ${ROOM.grid.toFixed(1)}m 网格`
            : preview.reasons.join('；')}
        </div>
      )}
    </div>
  )
}

export default DataCenterViewport
