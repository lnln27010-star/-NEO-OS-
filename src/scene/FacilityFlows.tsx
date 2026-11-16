import {useEffect,useLayoutEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import * as THREE from 'three'
import {buildFlowGraph} from '../facilityTopology'
import {useEquipmentStore} from '../useEquipmentStore'
import {useOperationsStore} from '../useOperationsStore'
import {useFlowStore} from '../useFlowStore'
import {Parts,type Part} from './EngineeringSite'

export function FacilityFlows({active}:{active:boolean}){
  const layout=useEquipmentStore(s=>s.layout),selected=useEquipmentStore(s=>s.selectedId),frame=useOperationsStore(s=>s.frame),channels=useFlowStore(s=>s.channels),animate=useFlowStore(s=>s.animate)
  const invalidate=useThree(s=>s.invalidate),particles=useRef<THREE.InstancedMesh>(null)
  const edges=useMemo(()=>buildFlowGraph(layout,frame,selected).filter(e=>channels[e.channel]),[layout,frame,selected,channels])
  const paths=useMemo(()=>edges.filter(e=>e.active).map(edge=>{const segments:{a:THREE.Vector3;direction:THREE.Vector3;length:number;start:number}[]=[];let total=0;for(let i=1;i<edge.points.length;i++){const a=new THREE.Vector3(...edge.points[i-1]),b=new THREE.Vector3(...edge.points[i]),delta=b.sub(a),length=delta.length();if(length<.01)continue;segments.push({a,direction:delta.normalize(),length,start:total});total+=length}return {edge,segments,total}}),[edges])
  const guides=useMemo(()=>{
    const tubes:Part[]=[],air:Part[]=[],joints:Part[]=[],y=new THREE.Vector3(0,1,0)
    for(const edge of edges)for(let i=1;i<edge.points.length;i++){
      const a=new THREE.Vector3(...edge.points[i-1]),b=new THREE.Vector3(...edge.points[i]),direction=b.clone().sub(a),length=direction.length();if(length<.01)continue
      const q=new THREE.Quaternion().setFromUnitVectors(y,direction.normalize()),r=new THREE.Euler().setFromQuaternion(q),middle=a.clone().add(b).multiplyScalar(.5),width=edge.channel==='water'?.075:edge.channel==='heat'?.065:.040
      ;(edge.channel==='heat'?air:tubes).push({p:middle.toArray() as Part['p'],s:[width,length,width],r:[r.x,r.y,r.z],color:edge.active?edge.color:'#405563'})
      if(edge.channel==='water')joints.push({p:a.toArray() as Part['p'],s:[width*1.5,width*1.5,width*1.5],color:edge.active?edge.color:'#405563'})
    }
    return {tubes,air,joints}
  },[edges])
  const count=paths.length*4
  useLayoutEffect(()=>{if(!particles.current)return;const c=new THREE.Color();paths.forEach((path,i)=>{for(let j=0;j<4;j++)particles.current!.setColorAt(i*4+j,c.set(path.edge.color))});if(particles.current.instanceColor)particles.current.instanceColor.needsUpdate=true;invalidate()},[paths,invalidate])
  useEffect(()=>{if(!active||!animate||!count)return;const timer=setInterval(()=>invalidate(),50);return ()=>clearInterval(timer)},[active,animate,count,invalidate])
  const time=useRef(0),object=useMemo(()=>new THREE.Object3D(),[]),axis=useMemo(()=>new THREE.Vector3(0,1,0),[])
  useFrame((_,delta)=>{
    if(!particles.current)return;if(active&&animate)time.current+=Math.min(delta,.2)
    paths.forEach((path,i)=>{for(let j=0;j<4;j++){
      const distance=((time.current*(path.edge.channel==='information'?7:3)+path.total*j/4)%Math.max(.001,path.total))
      const segment=path.segments.find((s,index)=>distance<s.start+s.length||index===path.segments.length-1);if(!segment)continue
      object.position.copy(segment.a).addScaledVector(segment.direction,distance-segment.start);object.quaternion.setFromUnitVectors(axis,segment.direction)
      object.scale.setScalar(path.edge.channel==='heat'?1.65:1);object.updateMatrix();particles.current!.setMatrixAt(i*4+j,object.matrix)
    }})
    particles.current.instanceMatrix.needsUpdate=true
  })
  return <group name="Power water heat and information direction flows">
    <Parts parts={guides.tubes} kind="cylinder" opacity={.48} metalness={.2} roughness={.45} castShadow={false} receiveShadow={false}/>
    <Parts parts={guides.air} kind="cylinder" opacity={.17} castShadow={false} receiveShadow={false}/><Parts parts={guides.joints} opacity={.5} castShadow={false}/>
    {count>0&&<instancedMesh ref={particles} args={[undefined,undefined,count]} frustumCulled={false} renderOrder={6}><coneGeometry args={[.085,.30,5]}/><meshBasicMaterial color="white" toneMapped={false}/></instancedMesh>}
  </group>
}
