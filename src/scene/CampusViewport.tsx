import { ContactShadows, Environment, Line, OrbitControls, Sky, useGLTF, useTexture } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { campusFacilities, getCityByAdcode, getFacilityById } from '../siteData'
import type { CampusFacility } from '../siteData'
import { useDesignerStore } from '../useDesignerStore'

const facadePalette = {
  panel: '#73808a',
  panelDark: '#42505b',
  frame: '#283740',
  glass: '#153e55',
  roof: '#39464f',
  concrete: '#7b858b',
}

const DataHallBuilding = ({ facility }: { facility: CampusFacility }) => {
  const [width, height, depth] = facility.size
  const panelCount = Math.max(6, Math.floor(width / 3.2))
  const roofUnits = Math.max(4, Math.floor(width / 7))
  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={facadePalette.panel} metalness={0.08} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.34, depth / 2 + 0.06]}>
        <boxGeometry args={[width * 0.96, 0.68, 0.1]} />
        <meshStandardMaterial color={facadePalette.panelDark} metalness={0.12} roughness={0.72} />
      </mesh>
      {Array.from({ length: panelCount }, (_, index) => {
        const x = -width / 2 + (index + 0.5) * width / panelCount
        return (
          <group key={index} position={[x, height * 0.53, depth / 2 + 0.065]}>
            <mesh>
              <boxGeometry args={[0.055, height * 0.8, 0.08]} />
              <meshStandardMaterial color={facadePalette.frame} metalness={0.55} roughness={0.4} />
            </mesh>
            {index % 2 === 0 && (
              <mesh position={[width / panelCount * 0.23, height * 0.12, 0.035]}>
                <boxGeometry args={[width / panelCount * 0.36, height * 0.22, 0.035]} />
                <meshPhysicalMaterial color={facadePalette.glass} transmission={0.26} thickness={0.12} roughness={0.22} metalness={0.08} transparent opacity={0.9} />
              </mesh>
            )}
          </group>
        )
      })}
      {[0.28, 0.64].map((ratio) => (
        <group key={ratio} position={[-width / 2 - 0.07, height * ratio, 0]}>
          {Array.from({ length: Math.max(5, Math.floor(depth / 3)) }, (_, index) => (
            <mesh key={index} position={[0, 0, -depth / 2 + 1.5 + index * 2.8]}>
              <boxGeometry args={[0.08, 0.78, 1.4]} />
              <meshStandardMaterial color="#22343f" metalness={0.35} roughness={0.58} />
            </mesh>
          ))}
        </group>
      ))}
      {Array.from({ length: roofUnits }, (_, index) => {
        const x = -width * 0.38 + index * (width * 0.76 / Math.max(1, roofUnits - 1))
        return (
          <group key={index} position={[x, height + 0.55, index % 2 ? -depth * 0.22 : depth * 0.2]}>
            <mesh castShadow>
              <boxGeometry args={[2.6, 1.0, 2.1]} />
            <meshStandardMaterial color="#59666d" metalness={0.28} roughness={0.58} />
            </mesh>
            <mesh position={[0, 0.54, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.64, 0.64, 0.05, 20]} />
              <meshStandardMaterial color="#202a30" metalness={0.48} roughness={0.42} />
            </mesh>
          </group>
        )
      })}
      <mesh position={[-width * 0.31, 1.65, depth / 2 + 0.14]}>
        <boxGeometry args={[width * 0.22, 2.8, 0.18]} />
        <meshStandardMaterial color="#28343d" metalness={0.6} roughness={0.34} />
      </mesh>
      <mesh position={[-width * 0.31, 1.65, depth / 2 + 0.25]}>
        <boxGeometry args={[width * 0.17, 2.2, 0.08]} />
        <meshStandardMaterial color="#476477" metalness={0.5} roughness={0.28} />
      </mesh>
      <mesh position={[width * 0.28, height * 0.82, depth / 2 + 0.12]}>
        <boxGeometry args={[width * 0.28, 0.6, 0.08]} />
        <meshStandardMaterial color="#1b2b35" emissive="#184b62" emissiveIntensity={0.2} />
      </mesh>
    </group>
  )
}

const CoolingPlant = ({ facility }: { facility: CampusFacility }) => {
  const [width, height, depth] = facility.size
  return (
    <group>
      <mesh position={[0, height * 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height * 0.76, depth]} />
        <meshStandardMaterial color="#5e727a" metalness={0.18} roughness={0.72} />
      </mesh>
      {[-0.31, -0.1, 0.11, 0.32].map((ratio) => (
        <group key={ratio} position={[ratio * width, height * 0.94, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[1.45, 1.25, height * 0.74, 24]} />
            <meshStandardMaterial color="#7d8d91" metalness={0.28} roughness={0.62} />
          </mesh>
          <mesh position={[0, height * 0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.48, 1.02, 20]} />
            <meshStandardMaterial color="#29373e" metalness={0.52} roughness={0.4} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      {[-0.35, 0.35].map((zRatio) => (
        <mesh key={zRatio} position={[0, 0.48, zRatio * depth]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.22, 0.22, width * 0.86, 14]} />
          <meshStandardMaterial color={zRatio > 0 ? '#35b6de' : '#c55c58'} metalness={0.55} roughness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

const Substation = ({ facility }: { facility: CampusFacility }) => {
  const [width, height, depth] = facility.size
  const transformerXs = [-0.3, 0.3]
  return (
    <group>
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[width, 0.16, depth]} />
        <meshStandardMaterial color="#6d7374" roughness={0.92} metalness={0.02} />
      </mesh>
      {transformerXs.map((ratio) => (
        <group key={ratio} position={[ratio * width, height * 0.33, 0]}>
          <mesh castShadow>
            <boxGeometry args={[3.8, height * 0.58, 3.2]} />
          <meshStandardMaterial color="#6c7777" metalness={0.22} roughness={0.66} />
          </mesh>
          {[-1.15, 0, 1.15].map((x) => (
            <mesh key={x} position={[x, height * 0.42, 0]} castShadow>
              <cylinderGeometry args={[0.16, 0.22, height * 0.54, 10]} />
              <meshStandardMaterial color="#343f43" metalness={0.48} roughness={0.48} />
            </mesh>
          ))}
          {[-1.65, 1.65].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <boxGeometry args={[0.12, height * 0.45, 3.5]} />
              <meshStandardMaterial color="#2d393d" metalness={0.5} roughness={0.46} />
            </mesh>
          ))}
        </group>
      ))}
      {Array.from({ length: 7 }, (_, index) => (
        <mesh key={index} position={[-width / 2 + 1.2 + index * (width - 2.4) / 6, height * 0.46, -depth * 0.32]} castShadow>
          <boxGeometry args={[0.46, height * 0.92, 0.46]} />
          <meshStandardMaterial color="#59666a" metalness={0.68} roughness={0.28} />
        </mesh>
      ))}
    </group>
  )
}

const UtilityBuilding = ({ facility }: { facility: CampusFacility }) => {
  const [width, height, depth] = facility.size
  const containers = Math.max(2, Math.floor(width / 4))
  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={facility.type.includes('admin') ? '#6e7e89' : '#4f6068'} metalness={0.1} roughness={0.76} />
      </mesh>
      {Array.from({ length: containers }, (_, index) => (
        <mesh key={index} position={[-width / 2 + (index + 0.5) * width / containers, height * 0.55, depth / 2 + 0.065]}>
          <boxGeometry args={[width / containers * 0.68, height * 0.45, 0.08]} />
        <meshPhysicalMaterial color="#17394b" transmission={0.2} thickness={0.08} roughness={0.22} metalness={0.05} transparent opacity={0.88} />
        </mesh>
      ))}
      {!facility.type.includes('admin') && Array.from({ length: Math.max(2, Math.floor(width / 3.4)) }, (_, index) => (
        <mesh key={`vent-${index}`} position={[-width * 0.38 + index * 3.2, height * 0.42, depth / 2 + 0.12]}>
          <boxGeometry args={[1.4, height * 0.36, 0.12]} />
          <meshStandardMaterial color="#26343a" metalness={0.7} roughness={0.26} />
        </mesh>
      ))}
    </group>
  )
}

const FacilityModel = ({ facility }: { facility: CampusFacility }) => {
  const selectedFacilityId = useDesignerStore((state) => state.selectedFacilityId)
  const setSelectedFacilityId = useDesignerStore((state) => state.setSelectedFacilityId)
  const setSceneScope = useDesignerStore((state) => state.setSceneScope)
  const selected = selectedFacilityId === facility.id
  const model = facility.type.includes('data')
    ? <DataHallBuilding facility={facility} />
    : facility.type.includes('cool')
      ? <CoolingPlant facility={facility} />
      : facility.type.includes('substation') || facility.type.includes('power')
        ? <Substation facility={facility} />
        : <UtilityBuilding facility={facility} />

  return (
    <group
      position={facility.position}
      onPointerDown={(event) => {
        event.stopPropagation()
        setSelectedFacilityId(facility.id)
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        setSelectedFacilityId(facility.id)
        if (facility.enterable) setSceneScope('room')
      }}
    >
      {model}
      {selected && (
        <>
          <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[facility.size[0] + 1.4, facility.size[2] + 1.4]} />
            <meshBasicMaterial color="#4594ff" transparent opacity={0.12} depthWrite={false} />
          </mesh>
          <Line
            points={[
              [-facility.size[0] / 2 - 0.7, 0.05, -facility.size[2] / 2 - 0.7],
              [facility.size[0] / 2 + 0.7, 0.05, -facility.size[2] / 2 - 0.7],
              [facility.size[0] / 2 + 0.7, 0.05, facility.size[2] / 2 + 0.7],
              [-facility.size[0] / 2 - 0.7, 0.05, facility.size[2] / 2 + 0.7],
              [-facility.size[0] / 2 - 0.7, 0.05, -facility.size[2] / 2 - 0.7],
            ]}
            color="#61b4ff"
            lineWidth={1.4}
          />
        </>
      )}
    </group>
  )
}

const Tree = ({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) => (
  <group position={position} scale={scale}>
    <mesh position={[0, 0.8, 0]} castShadow>
      <cylinderGeometry args={[0.12, 0.16, 1.6, 8]} />
      <meshStandardMaterial color="#4c3b2d" roughness={0.9} />
    </mesh>
    <mesh position={[0, 2.05, 0]} castShadow>
      <coneGeometry args={[0.9, 2.3, 10]} />
      <meshStandardMaterial color="#244f3a" roughness={0.88} />
    </mesh>
  </group>
)

const StreetLight = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    <mesh position={[0, 2.8, 0]} castShadow>
      <cylinderGeometry args={[0.055, 0.08, 5.6, 10]} />
      <meshStandardMaterial color="#414e54" metalness={0.78} roughness={0.25} />
    </mesh>
    <mesh position={[0.42, 5.52, 0]}>
      <boxGeometry args={[0.86, 0.08, 0.08]} />
      <meshStandardMaterial color="#414e54" metalness={0.78} roughness={0.25} />
    </mesh>
    <mesh position={[0.82, 5.42, 0]}>
      <boxGeometry args={[0.36, 0.08, 0.22]} />
      <meshStandardMaterial color="#dcebf3" emissive="#d7efff" emissiveIntensity={0.42} toneMapped={false} />
    </mesh>
  </group>
)

const ImportedSiteAsset = ({ url, name }: { url: string; name: string | null }) => {
  const { scene } = useGLTF(url)
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
  return <primitive object={model} position={[0, 0.08, 0]} scale={1} userData={{ sourceFile: name ?? 'uploaded-site-asset' }} />
}

const CampusScene = () => {
  const siteAssetUrl = useDesignerStore((state) => state.siteAssetUrl)
  const siteAssetName = useDesignerStore((state) => state.siteAssetName)
  const siteAssetReady = Boolean(siteAssetUrl && /\.(glb|gltf)$/i.test(siteAssetName ?? ''))
  const [groundMap, groundRough, groundNormal, asphaltMap, asphaltRough, asphaltNormal, satelliteMap] = useTexture([
    '/textures/concrete-floor-diff.jpg',
    '/textures/concrete-floor-rough.jpg',
    '/textures/concrete-floor-norm.jpg',
    '/textures/asphalt-diff.jpg',
    '/textures/asphalt-rough.jpg',
    '/textures/asphalt-norm.jpg',
    '/data/nanjing-industrial-tile.jpg',
  ])
  satelliteMap.colorSpace = THREE.SRGBColorSpace
  satelliteMap.anisotropy = 8
  ;[groundMap, groundRough, groundNormal].forEach((texture) => { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(5, 5) })
  ;[asphaltMap, asphaltRough, asphaltNormal].forEach((texture) => { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(3, 12) })
  const treePositions = useMemo<[number, number, number][]>(() => [
    [-45, 0, -29], [-38, 0, -29], [-31, 0, -29], [-24, 0, -29], [-17, 0, -29], [-10, 0, -29],
    [18, 0, -29], [26, 0, -29], [34, 0, -29], [42, 0, -29],
    [-46, 0, 29], [-38, 0, 29], [-30, 0, 29], [26, 0, 29], [34, 0, 29], [42, 0, 29],
    [-49, 0, -18], [-49, 0, -7], [-49, 0, 5], [-49, 0, 17], [49, 0, -18], [49, 0, -6], [49, 0, 8], [49, 0, 20],
  ], [])
  return (
    <>
      <color attach="background" args={['#9eb6c1']} />
      <fog attach="fog" args={['#9eb6c1', 145, 260]} />
      <Sky distance={450000} sunPosition={[70, 42, 28]} inclination={0.54} azimuth={0.21} turbidity={7.5} rayleigh={0.32} mieCoefficient={0.004} mieDirectionalG={0.72} />
      <Environment files="/textures/industrial-workshop.hdr" environmentIntensity={0.22} background={false} />
      <hemisphereLight args={['#dcefff', '#42534b', 0.78]} />
      <ambientLight intensity={0.16} />
      <directionalLight
        position={[42, 68, 38]}
        intensity={2.25}
        color="#fff6e8"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-72}
        shadow-camera-right={72}
        shadow-camera-top={62}
        shadow-camera-bottom={-62}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.00012}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
        <planeGeometry args={[112, 80, 1, 1]} />
        <meshStandardMaterial map={satelliteMap} color="#ffffff" roughness={0.98} metalness={0} />
      </mesh>
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <boxGeometry args={[95, 0.03, 66]} />
        <meshStandardMaterial map={groundMap} roughnessMap={groundRough} normalMap={groundNormal} color="#9ca7a0" transparent opacity={0.12} roughness={0.92} metalness={0} normalScale={new THREE.Vector2(0.18, 0.18)} />
      </mesh>

      <group visible={siteAssetReady}>
      <mesh position={[0, 0.04, 15]} receiveShadow>
        <boxGeometry args={[98, 0.08, 7.5]} />
        <meshStandardMaterial map={asphaltMap} roughnessMap={asphaltRough} normalMap={asphaltNormal} color="#454a4b" roughness={0.88} metalness={0.02} normalScale={new THREE.Vector2(0.3, 0.3)} />
      </mesh>
      <mesh position={[-32, 0.045, -4]} receiveShadow>
        <boxGeometry args={[7.5, 0.09, 45]} />
        <meshStandardMaterial map={asphaltMap} roughnessMap={asphaltRough} normalMap={asphaltNormal} color="#454a4b" roughness={0.88} metalness={0.02} normalScale={new THREE.Vector2(0.3, 0.3)} />
      </mesh>
      {[-2.25, 2.25].map((z) => (
        <mesh key={z} position={[0, 0.092, 15 + z]}>
          <boxGeometry args={[94, 0.012, 0.12]} />
          <meshBasicMaterial color="#c9d1d0" />
        </mesh>
      ))}

      <mesh position={[30, 0.03, -23]} receiveShadow>
        <boxGeometry args={[28, 0.07, 13]} />
        <meshStandardMaterial color="#343b3e" roughness={0.88} metalness={0.03} />
      </mesh>
      {Array.from({ length: 9 }, (_, index) => (
        <mesh key={index} position={[19 + index * 2.8, 0.08, -23]}>
          <boxGeometry args={[0.08, 0.012, 11.5]} />
          <meshBasicMaterial color="#d7dedb" />
        </mesh>
      ))}
      {[-27.2, -18.8].map((z) => Array.from({ length: 5 }, (_, index) => (
        <group key={`${z}-${index}`} position={[20.2 + index * 5.2, 0.48, z]}>
          <mesh castShadow>
            <boxGeometry args={[3.2, 0.72, 1.55]} />
          <meshStandardMaterial color={index % 2 ? '#607988' : '#bec8c9'} metalness={0.18} roughness={0.58} />
          </mesh>
          <mesh position={[1.48, -0.34, 0.54]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.28, 0.28, 0.18, 16]} /><meshStandardMaterial color="#171c1e" /></mesh>
          <mesh position={[-1.48, -0.34, 0.54]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.28, 0.28, 0.18, 16]} /><meshStandardMaterial color="#171c1e" /></mesh>
        </group>
      ))) }

      {[-22, -7, 8, 23, 38].flatMap((x) => [
        <StreetLight key={`light-n-${x}`} position={[x, 0, 10.7]} />,
        <StreetLight key={`light-s-${x}`} position={[x, 0, 19.3]} />,
      ])}

      <group position={[-32, 0, 30.5]}>
        <mesh position={[0, 1.35, 0]} castShadow>
          <boxGeometry args={[5.2, 2.7, 3.4]} />
          <meshStandardMaterial color="#667780" metalness={0.42} roughness={0.48} />
        </mesh>
        <mesh position={[0, 1.48, -1.74]}>
          <boxGeometry args={[3.1, 1.15, 0.08]} />
          <meshStandardMaterial color="#173b4e" emissive="#123349" emissiveIntensity={0.1} metalness={0.58} roughness={0.24} />
        </mesh>
        <mesh position={[4.1, 1.2, 0]} rotation={[0, 0, -0.12]}>
          <boxGeometry args={[5.8, 0.1, 0.16]} />
          <meshStandardMaterial color="#e7e9e7" metalness={0.54} roughness={0.34} />
        </mesh>
        <mesh position={[5.2, 1.21, 0]} rotation={[0, 0, -0.12]}>
          <boxGeometry args={[0.6, 0.13, 0.18]} />
          <meshStandardMaterial color="#d75a51" />
        </mesh>
      </group>

      {[-25.3, -20.7].map((z, row) => (
        <group key={z} position={[30, 3.0, z]}>
          <mesh rotation={[-0.18, 0, 0]} castShadow>
            <boxGeometry args={[25, 0.12, 3.2]} />
            <meshStandardMaterial color="#1d3952" metalness={0.74} roughness={0.24} />
          </mesh>
          {[-10, -5, 0, 5, 10].map((x) => (
            <mesh key={x} position={[x, -1.48, 0]}>
              <boxGeometry args={[0.12, 3.0, 0.12]} />
              <meshStandardMaterial color="#59656a" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
          <mesh position={[0, 0.075, 0]} rotation={[-0.18, 0, 0]}>
            <boxGeometry args={[24.6, 0.018, 0.055]} />
            <meshBasicMaterial color={row ? '#4d7fa4' : '#5d93b7'} />
          </mesh>
        </group>
      ))}

      {siteAssetReady
        ? <ImportedSiteAsset url={siteAssetUrl as string} name={siteAssetName} />
        : null}

      {siteAssetReady && <>
        <Line points={[[-38, 0.22, 10], [-18, 0.22, 10], [-18, 0.22, -9], [2, 0.22, -9], [2, 0.22, -23]]} color="#e58e37" lineWidth={3} transparent opacity={0.86} />
        <Line points={[[35, 0.24, 6], [19, 0.24, 6], [19, 0.24, -10], [2, 0.24, -10]]} color="#32bce8" lineWidth={3} transparent opacity={0.82} />
        <Line points={[[35, 0.22, 8], [21, 0.22, 8], [21, 0.22, -8], [2, 0.22, -8]]} color="#cb5b58" lineWidth={3} transparent opacity={0.76} />
      </>}

      {treePositions.map((position, index) => <Tree key={index} position={position} scale={0.82 + (index % 3) * 0.08} />)}

      {Array.from({ length: 25 }, (_, index) => {
        const alongX = index < 13
        const t = alongX ? -48 + index * 8 : -31 + (index - 13) * 5.6
        const position: [number, number, number] = alongX ? [t, 1.35, -34] : [-53, 1.35, t]
        return (
          <mesh key={index} position={position} castShadow>
            <boxGeometry args={alongX ? [0.09, 2.7, 0.09] : [0.09, 2.7, 0.09]} />
            <meshStandardMaterial color="#48565b" metalness={0.7} roughness={0.3} />
          </mesh>
        )
      })}

      {[0.82, 1.62].map((height) => (
        <Line
          key={height}
          points={[
            [-52, height, -34], [52, height, -34], [52, height, 34],
            [-35, height, 34], [-35, height, 31], [-29, height, 31], [-29, height, 34],
            [-52, height, 34], [-52, height, -34],
          ]}
          color="#54656b"
          lineWidth={1.35}
          transparent
          opacity={0.88}
        />
      ))}
      </group>

      <ContactShadows position={[0, 0.02, 0]} scale={112} opacity={0.28} blur={2.4} far={18} resolution={1024} frames={1} color="#1f2b27" />
      <OrbitControls makeDefault enableDamping dampingFactor={0.075} target={[0, 0, 0]} minDistance={34} maxDistance={150} maxPolarAngle={Math.PI / 2.08} />
    </>
  )
}

export const CampusViewport = () => {
  const selectedCityAdcode = useDesignerStore((state) => state.selectedCityAdcode)
  const selectedFacilityId = useDesignerStore((state) => state.selectedFacilityId)
  const setSceneScope = useDesignerStore((state) => state.setSceneScope)
  const city = getCityByAdcode(selectedCityAdcode)
  const facility = getFacilityById(selectedFacilityId) ?? campusFacilities[0]
  const siteAssetUrl = useDesignerStore((state) => state.siteAssetUrl)
  const siteAssetName = useDesignerStore((state) => state.siteAssetName)
  const siteAssetReady = Boolean(siteAssetUrl && /\.(glb|gltf)$/i.test(siteAssetName ?? ''))
  return (
    <div className="world-viewport campus-viewport" aria-label="数据中心园区和建筑外观三维场景">
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        camera={{ position: [58, 62, 70], fov: 42, near: 0.1, far: 300 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.03
          gl.domElement.setAttribute('role', 'img')
          gl.domElement.setAttribute('aria-label', '示例数据中心园区三维场景，包含数据楼、变电站、冷却能源中心、后备能源、道路和场地设施。')
        }}
      >
        <CampusScene />
      </Canvas>
      <div className="world-stage-card">
        <span>园区场地</span>
        <strong>{city?.name ?? '南京市'} · 华东智算中心示例场址</strong>
        <em>{facility.name} · {facility.status}</em>
      </div>
      <div className="campus-legend" aria-label="园区图层图例">
        <span><i className="legend-campus-power" />供配电</span>
        <span><i className="legend-campus-supply" />冷却供液</span>
        <span><i className="legend-campus-return" />冷却回液</span>
      </div>
      {!siteAssetReady && <div className="campus-asset-gate" role="status"><strong>等待真实园区资产</strong><span>当前仅显示卫星场地参考。导入业主 GLB/GLTF 后才加载建筑实体。</span></div>}
      {facility.enterable && <button className="world-enter-button" type="button" onClick={() => setSceneScope('room')}>进入 {facility.name} 机房内部</button>}
      <div className="campus-source-note">底图为南京公开卫星影像参考；建筑、设备与管线仍需替换为业主 BIM/点云/厂商资产，当前模型不代表具体已建项目。</div>
    </div>
  )
}

export default CampusViewport
