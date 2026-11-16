import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as Modern from 'three'
import type { VisualTheme } from '../useVisualTheme'
import { useEquipmentStore } from '../useEquipmentStore'
// AMap supplies WebGL1; this isolated renderer does not change the main BIM renderer.
// @ts-ignore package alias intentionally isolates the WebGL1 renderer.
import * as Legacy from 'three-legacy'

function copyObject(source: Modern.Object3D): any {
  let target: any
  if (source instanceof Modern.Mesh) {
    const geometry = new Legacy.BufferGeometry()
    for (const [key, attribute] of Object.entries(source.geometry.attributes)) {
      if (attribute instanceof Modern.BufferAttribute) geometry.setAttribute(key, new Legacy.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized))
    }
    if (source.geometry.index) geometry.setIndex(new Legacy.BufferAttribute(source.geometry.index.array, 1))
    const makeMaterial = (m: any) => {
      let map
      if (m.map?.image) { map = new Legacy.Texture(m.map.image); map.encoding = Legacy.sRGBEncoding; map.flipY = m.map.flipY;map.wrapS=m.map.wrapS;map.wrapT=m.map.wrapT;map.repeat.copy(m.map.repeat);map.offset.copy(m.map.offset);map.minFilter=Legacy.LinearFilter;map.generateMipmaps=false;map.needsUpdate = true }
      const material=new Legacy.MeshStandardMaterial({ ...(map?{map}:{}), color:0xffffff, emissiveIntensity:m.emissiveIntensity??1, roughness: m.roughness ?? .7, metalness: m.metalness ?? .1, side: Legacy.DoubleSide, transparent:!!m.transparent, opacity:m.opacity??1, alphaTest: m.alphaTest ?? 0 })
      // Modern Three colors are already linear; converting through hex brightens them twice.
      if(m.color)material.color.setRGB(m.color.r,m.color.g,m.color.b)
      if(m.emissive)material.emissive.setRGB(m.emissive.r,m.emissive.g,m.emissive.b)
      return material
    }
    const material = Array.isArray(source.material) ? source.material.map(makeMaterial) : makeMaterial(source.material)
    if (source instanceof Modern.InstancedMesh) {
      target = new Legacy.InstancedMesh(geometry, material, source.count)
      target.instanceMatrix.array.set(source.instanceMatrix.array); target.instanceMatrix.needsUpdate = true
      if (source.instanceColor) { target.instanceColor = new Legacy.InstancedBufferAttribute(source.instanceColor.array.slice(), 3); target.instanceColor.needsUpdate = true }
    } else target = new Legacy.Mesh(geometry, material)
  } else target = new Legacy.Group()
  target.position.copy(source.position); target.quaternion.copy(source.quaternion); target.scale.copy(source.scale); target.visible = source.visible
  for (const child of source.children) target.add(copyObject(child))
  return target
}

export function AmapSharedRenderer({ map, longitude, latitude, onReady, theme }: { map: any; longitude: number; latitude: number; onReady: () => void; theme: VisualTheme }) {
  const scene = useThree((s) => s.scene)
  const equipmentVersion=useEquipmentStore(s=>Object.values(s.layout).filter(d=>d.kind==='chiller'||d.kind==='generator').map(d=>`${d.id}/${d.x}/${d.z}/${d.yaw}/${d.installed}`).join('|'))
  useEffect(() => {
    const AMap = window.AMap
    if (!AMap?.GLCustomLayer) return
    let renderer: any, camera: any, ready = false
    const sharedScene = new Legacy.Scene()
    // Only the campus group is copied; camera/light/environment objects are independent.
    const campus = scene.getObjectByName('georeferenced-campus')
    if (!campus) return
    sharedScene.add(copyObject(campus))
    const dark = theme==='dark'
    sharedScene.add(new Legacy.HemisphereLight(dark?0xb7d4e9:0xffffff, dark?0x17202a:0x787b70, dark?.5:1.2))
    const light = new Legacy.DirectionalLight(dark?0xb5d3f0:0xfff5e8, dark?1.6:1.5); light.position.set(100, -180, 220); sharedScene.add(light)
    if(dark) { const fill=new Legacy.DirectionalLight(0xffd3a1,.4);fill.position.set(-140,100,100);sharedScene.add(fill) }
    const coords = map.customCoords
    coords.setCenter([longitude, latitude])
    const layer = new AMap.GLCustomLayer({ zIndex: 140, init: (gl: any) => {
      renderer = new Legacy.WebGLRenderer({ context: gl, canvas: gl.canvas }); renderer.autoClear = false
      renderer.toneMapping = Legacy.ACESFilmicToneMapping; renderer.toneMappingExposure = dark?1:.8
      renderer.outputEncoding = Legacy.sRGBEncoding
      camera = new Legacy.PerspectiveCamera()
    }, render: () => {
      if (!renderer) return
      renderer.resetState(); coords.setCenter([longitude, latitude])
      const p = coords.getCameraParams(); const size = map.getSize()
      camera.near = p.near; camera.far = p.far; camera.fov = p.fov; camera.aspect = size.width / size.height
      camera.position.fromArray(p.position); camera.up.fromArray(p.up); camera.lookAt(new Legacy.Vector3().fromArray(p.lookAt)); camera.updateProjectionMatrix()
      renderer.render(sharedScene, camera); renderer.resetState()
      if (!ready) { ready = true; onReady() }
    } })
    map.add(layer); map.render()
    return () => {
      map.remove(layer); renderer?.dispose()
      sharedScene.traverse((object: any) => { object.geometry?.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material: any) => { material?.map?.dispose(); material?.dispose() }) })
    }
  }, [map, scene, longitude, latitude, onReady, theme,equipmentVersion])
  return null
}
