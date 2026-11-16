import { useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RACKS } from '../operationsModel'
import { defaultEquipment, type EquipmentLayout } from '../equipmentModel'
import { useEquipmentStore } from '../useEquipmentStore'
import { FacilityEquipmentModels } from './FacilityEquipmentModels'
export { RACKS } from '../operationsModel'

export type Part = { p: [number, number, number]; s: [number, number, number]; r?: [number, number, number]; color?: string }

// Instanced engineering detail: authored test geometry, not vendor CAD.
export function Parts({ parts, color = '#7b8182', metalness = 0.25, roughness = 0.65, kind = 'box', castShadow = true, receiveShadow = true, emissive = '#000000', emissiveIntensity = 1, map, opacity=1 }: {
  parts: Part[]; color?: string; metalness?: number; roughness?: number; kind?: 'box' | 'cylinder'; castShadow?: boolean; receiveShadow?: boolean; emissive?: string; emissiveIntensity?: number; map?:THREE.Texture;opacity?:number
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const invalidate=useThree(s=>s.invalidate)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const object = new THREE.Object3D()
    const tint = new THREE.Color()
    parts.forEach((part, index) => {
      object.position.set(...part.p); object.scale.set(...part.s); object.rotation.set(...(part.r ?? [0, 0, 0])); object.updateMatrix()
      mesh.setMatrixAt(index, object.matrix)
      mesh.setColorAt(index, tint.set(part.color ?? color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [parts, color,invalidate])
  return <instancedMesh ref={ref} args={[undefined, undefined, parts.length]} castShadow={castShadow} receiveShadow={receiveShadow}>
    {kind === 'box' ? <boxGeometry args={[1, 1, 1]} /> : <cylinderGeometry args={[0.5, 0.5, 1, 16]} />}
    <meshStandardMaterial color="white" map={map} transparent={opacity<1} opacity={opacity} depthWrite={opacity===1} metalness={metalness} roughness={roughness} emissive={emissive} emissiveIntensity={emissiveIntensity} />
  </instancedMesh>
}

const ceiling:Part[]=[]
for (let x = -46; x < 49; x += 4) ceiling.push({ p: [x, 7.75, 0], s: [.09, .23, 60] })
for (let z = -29; z < 31; z += 4) ceiling.push({ p: [0, 7.76, z], s: [96, .18, .065] })

export function TestDataHall({ ceilingVisible = true }: { ceilingVisible?: boolean }) {
  return <group name="Authored test equipment — not manufacturer assets">

    {ceilingVisible && <Parts parts={ceiling} color="#4c5151" metalness={.65} />}

  </group>
}

const generators: Part[] = [], grilles: Part[] = [], stacks: Part[] = []
for (let n = 0; n < 8; n++) {
  const x = -43 + n * 12.5
  generators.push({ p: [x, 1.8, 61], s: [8.5, 3.2, 3.1] }, { p: [x, .15, 61], s: [9, .3, 3.6], color: '#a4a6a3' })
  for (let f = 0; f < 12; f++) grilles.push({ p: [x - 3.5 + f * .31, 1.85, 62.57], s: [.16, 2.4, .05] })
  stacks.push({ p: [x + 2.6, 4.5, 61], s: [.26, 2.5, .26] })
}
const seams: Part[] = [], markings: Part[] = [], poles: Part[] = [], parking: Part[] = []
for (let x = -46; x < 49; x += 1.2) seams.push({ p: [x, 8.91, 0], s: [.03, .06, 61] })
const roofUnits: Part[] = [], roofVents: Part[] = []
for (const z of [-23, 23]) for (let x = -39; x <= 43; x += 11.7) {
  roofUnits.push({ p:[x,9.42,z],s:[3.6,1.1,2.6],color:'#9a9e99' },{p:[x,9.08,z+2.3],s:[1.5,.45,2.5],color:'#8a9391'})
  for(let i=0;i<10;i++) roofVents.push({p:[x-1.6+i*.35,9.44,z+1.31],s:[.12,.74,.036]})
}
for (let x = -76; x < 80; x += 8) markings.push({ p: [x, -.065, 76], s: [3, .014, .1] }, { p: [x, -.065, -65], s: [3, .014, .1] })
for (let n = 0; n < 18; n++) {
  const z = -42 + n * 5.6
  markings.push({ p: [-83, -.06, z], s: [6, .014, .075] })
  if (n % 3 !== 0) {
    parking.push({ p: [-83, .45, z + 2.3], s: [4.6, 1, 1.9], color: n % 2 ? '#41474b' : '#babfbd' }, { p: [-83.25, 1.02, z + 2.3], s: [2.5, .5, 1.78], color: '#59636a' })
  }
  poles.push({ p: [76, 2.9, z], s: [.07, 6, .07] }, { p: [-76, 2.9, z], s: [.07, 6, .07] })
}
const baseEquipment=defaultEquipment()
function relocateParts(parts:Part[],ids:string[],perDevice:number,layout:EquipmentLayout):Part[]{return parts.flatMap((p,i)=>{const id=ids[Math.floor(i/perDevice)],d=layout[id],base=baseEquipment[id];if(!d?.installed)return [];const x=p.p[0]-base.x,z=p.p[2]-base.z,c=Math.cos(d.yaw),s=Math.sin(d.yaw);return [{...p,p:[d.x+x*c+z*s,p.p[1],d.z-x*s+z*c] as Part['p'],r:[p.r?.[0]??0,(p.r?.[1]??0)+d.yaw,p.r?.[2]??0] as Part['r']}]})}
export function TestCampusServices({ roofVisible, roofDetail }: { roofVisible: boolean; roofDetail: boolean }) {
  const layout=useEquipmentStore(s=>s.layout)
  const generatorIds=Array.from({length:8},(_,i)=>`GEN-${String(i+1).padStart(2,'0')}`)
  const equipmentParts=useMemo(()=>({generators:relocateParts(generators,generatorIds,2,layout),grilles:relocateParts(grilles,generatorIds,12,layout),stacks:relocateParts(stacks,generatorIds,1,layout)}),[layout])
  return <group name="Authored campus services — synthetic layout">
    <FacilityEquipmentModels/>
    <Parts parts={equipmentParts.generators} color="#90998e" />
    <Parts parts={equipmentParts.grilles} color="#22292b" metalness={.6} />
    <Parts parts={equipmentParts.stacks} kind="cylinder" color="#535b5d" metalness={.7} />
    {roofVisible && roofDetail && <Parts parts={seams} color="#848c88" metalness={.5} castShadow={false} receiveShadow={false} />}
    {roofVisible && <><Parts parts={roofUnits} metalness={.32} /><Parts parts={roofVents} color="#394341" /></>}
    <Parts parts={markings} color="#d6d5c7" roughness={1} />
    <Parts parts={parking} metalness={.25} />
    <Parts parts={poles} kind="cylinder" color="#6d7778" metalness={.6} />
  </group>
}
