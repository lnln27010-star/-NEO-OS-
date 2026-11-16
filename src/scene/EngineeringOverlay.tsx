import {useEffect,useLayoutEffect,useMemo,useRef} from 'react'
import {useThree} from '@react-three/fiber'
import * as THREE from 'three'
import {X,RefreshCw} from 'lucide-react'
import {Parts} from './EngineeringSite'
import {useEngineeringStore} from '../useEngineeringStore'
import {useEquipmentStore} from '../useEquipmentStore'
import {useActiveEngineeringResult} from '../useActiveEngineeringResult'
import {ENGINE_LABELS} from '../engineeringSimulation'
import '../components/engineering-workbench.css'

function color(value:number,min:number,max:number){const t=Math.max(0,Math.min(1,(value-min)/Math.max(1e-8,max-min))),colors=['#4d89bd','#70c7ca','#d6bf78','#d7775e'],i=Math.min(2,Math.floor(t*3));return new THREE.Color(colors[i]).lerp(new THREE.Color(colors[i+1]),t*3-i)}
export function EngineeringOverlay(){
  const result=useActiveEngineeringResult(),field=useEngineeringStore(s=>s.field),slice=useEngineeringStore(s=>s.slice),vectors=useEngineeringStore(s=>s.vectors),layout=useEquipmentStore(s=>s.layout),{invalidate}=useThree(),arrows=useRef<THREE.InstancedMesh>(null)
  const glyphs=useMemo(()=>{
    if(!result||!field)return []
    const local=field.kind==='local_temperature',d=field.target_device?layout[field.target_device]:null,min=Math.min(...field.values),max=Math.max(...field.values)
    return field.points.map((p,i)=>{
      let position:[number,number,number]=[p[0],p[1],p[2]]
      if(local){const x=p[0]-(field.bounds?.[1]??.6)/2,z=p[1]-(field.bounds?.[3]??.2)/2,angle=d?.yaw??0;position=[(d?.x??0)+x*Math.cos(angle)+z*Math.sin(angle),2.9+p[2],(d?.z??0)-x*Math.sin(angle)+z*Math.cos(angle)]}
      return {position,value:field.values[i],color:color(field.values[i],min,max),velocity:field.velocity?.[i]}
    }).filter(g=>local||Math.abs(g.position[1]-slice)<.6)
  },[result,field,slice,layout])
  const geometry=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(glyphs.flatMap(g=>g.position),3));g.setAttribute('color',new THREE.Float32BufferAttribute(glyphs.flatMap(g=>[g.color.r,g.color.g,g.color.b]),3));return g},[glyphs])
  useEffect(()=>()=>geometry.dispose(),[geometry]);useEffect(()=>invalidate(),[result,glyphs,vectors,invalidate])
  useLayoutEffect(()=>{if(!arrows.current)return;const obj=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);glyphs.forEach((g,i)=>{const v=new THREE.Vector3(...(g.velocity??[0,0,0])),speed=v.length();obj.position.set(...g.position);obj.quaternion.setFromUnitVectors(up,speed>1e-8?v.normalize():up);obj.scale.set(.16,Math.min(2.2,speed),.16);obj.updateMatrix();arrows.current!.setMatrixAt(i,obj.matrix);arrows.current!.setColorAt(i,g.color)});arrows.current.instanceMatrix.needsUpdate=true;if(arrows.current.instanceColor)arrows.current.instanceColor.needsUpdate=true;arrows.current.computeBoundingSphere()},[glyphs,vectors])
  if(!result)return null
  const parts=result.assets.filter(a=>a.kind==='rack'&&layout[a.id]?.installed).map(a=>({p:[a.x,2.44,a.z] as [number,number,number],s:[.96,.08,1.35] as [number,number,number],r:[0,layout[a.id]?.yaw??0,0] as [number,number,number],color:a.status==='offline'?'#7f8993':a.voltage_pu===null?'#858e98':a.status==='warning'?'#dba377':'#7bcdbe'}))
  return <group name="Engineering solver results"><Parts parts={parts} metalness={0} castShadow={false}/>{field&&<points geometry={geometry}><pointsMaterial vertexColors transparent opacity={.72} size={field.kind==='local_temperature'?.025:.65} depthWrite={false}/></points>}{vectors&&field?.velocity&&<instancedMesh ref={arrows} args={[undefined,undefined,glyphs.length]}><coneGeometry args={[1,1,8]}/><meshBasicMaterial vertexColors transparent opacity={.85}/></instancedMesh>}</group>
}
export function EngineeringOverlayControls(){
  const store=useEngineeringStore(),active=useActiveEngineeringResult()
  if(!store.overlay||store.visible)return null
  const field=store.field
  return <div className="engineering-overlay-controls"><strong>{ENGINE_LABELS[store.overlay.engine].name} · {active?field?'温度场':'供电校核':'模型已变更，结果已隐藏'}</strong>{active&&field&&<><span>{Math.min(...field.values).toFixed(1)} °C</span><i className="engineering-overlay-scale"/><span>{Math.max(...field.values).toFixed(1)} °C</span>{field.kind==='room_temperature'&&<label>层高 {store.slice.toFixed(1)}m<input aria-label="工程温度场层高" type="range" min={.5} max={8} step={.5} value={store.slice} onChange={e=>store.setSlice(Number(e.target.value))}/></label>}{field.velocity&&<label><input type="checkbox" checked={store.vectors} onChange={e=>store.setVectors(e.target.checked)}/>风速方向</label>}</>}{!active&&<button onClick={()=>store.setVisible(true)}><RefreshCw size={12}/>重新计算</button>}<button aria-label="关闭工程结果图层" onClick={()=>store.setOverlay(null)}><X size={13}/></button></div>
}
