import { useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react'
import { useThree,type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { dimensions,elevation as deviceElevation,placementError,alignPosition,type Equipment } from '../equipmentModel'
import { useEquipmentStore } from '../useEquipmentStore'
import { useOperationsStore } from '../useOperationsStore'

type Capture={setPointerCapture:(id:number)=>void;releasePointerCapture:(id:number)=>void}
export function EquipmentInteraction(){
  const layout=useEquipmentStore(s=>s.layout),editing=useEquipmentStore(s=>s.editMode),selectedId=useEquipmentStore(s=>s.selectedId),placementId=useEquipmentStore(s=>s.placementId),autoAlign=useEquipmentStore(s=>s.autoAlign),movementId=useEquipmentStore(s=>s.movementId)
  const {gl,camera,invalidate,controls:rawControls}=useThree(),controls=rawControls as unknown as {enabled:boolean}|undefined
  const installed=useMemo(()=>Object.values(layout).filter(d=>d.installed&&!d.deleted),[layout])
  const hit=useRef<THREE.InstancedMesh>(null),ghost=useRef<THREE.Group>(null),line=useRef<THREE.LineBasicMaterial>(null)
  const drag=useRef<{d:Equipment;start:THREE.Vector3;plane:THREE.Plane;target:Capture;pointerId:number;x:number;z:number;moved:boolean;enabled:boolean;axis?:'x'|'z'}|null>(null)
  const guides=useRef<THREE.Group>(null),grid=useRef<THREE.GridHelper>(null),targetPad=useRef<THREE.MeshBasicMaterial>(null)
  const [dragId,setDragId]=useState<string|null>(null)
  const selected=layout[dragId??placementId??selectedId]
  const [w,h,depth]=dimensions(selected),elevation=deviceElevation(selected)
  const outline=useMemo(()=>new THREE.EdgesGeometry(new THREE.BoxGeometry(w+.04,h+.04,depth+.04)),[w,h,depth])
  useEffect(()=>()=>outline.dispose(),[outline])
  useLayoutEffect(()=>{if(!hit.current)return;const o=new THREE.Object3D();installed.forEach((d,i)=>{const [width,height,length]=dimensions(d);o.position.set(d.x,deviceElevation(d),d.z);o.rotation.set(0,d.yaw,0);o.scale.set(width,height,length);o.updateMatrix();hit.current!.setMatrixAt(i,o.matrix)});hit.current.instanceMatrix.needsUpdate=true;hit.current.computeBoundingSphere();invalidate()},[installed,editing,invalidate])
  const finish=useCallback((cancel=false)=>{
    const session=drag.current;if(!session)return
    drag.current=null
    if(controls)controls.enabled=session.enabled
    try{session.target.releasePointerCapture(session.pointerId)}catch{/* Pointer may already have left the window. */}
    gl.domElement.style.cursor=editing?'grab':'auto'
    if(!cancel&&session.moved)useEquipmentStore.getState().move(session.d.id,session.x,session.z,undefined,true)
    else if(!cancel)useEquipmentStore.getState().setPanelOpen(true)
    const restored=useEquipmentStore.getState().layout[session.d.id];ghost.current?.position.set(restored.x,deviceElevation(restored),restored.z);ghost.current?.rotation.set(0,restored.yaw,0)
    setDragId(null);useEquipmentStore.getState().setDragging(false);invalidate()
  },[controls,editing,gl,invalidate])
  useEffect(()=>{const cancel=()=>finish(true),key=(e:KeyboardEvent)=>{if(e.key==='Escape'){finish(true);useEquipmentStore.getState().cancelPlacement();useEquipmentStore.getState().setMovement(null)}};window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',key);return ()=>{window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key);finish(true)}},[finish])
  const down=(e:ThreeEvent<PointerEvent>,axis?:'x'|'z')=>{
    if(!editing||placementId||e.button!==0||e.instanceId===undefined&&!axis)return
    e.stopPropagation();const d=axis?layout[selectedId]:installed[e.instanceId!];if(movementId!==d.id){useEquipmentStore.getState().select(d.id);useEquipmentStore.getState().setPanelOpen(true);return}const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-(deviceElevation(d))),start=new THREE.Vector3()
    if(!e.ray.intersectPlane(plane,start))return
    if(d.kind==='rack')useOperationsStore.getState().selectRack(d.id)
    const target=e.target as unknown as Capture;target.setPointerCapture(e.pointerId)
    drag.current={d,start,plane,target,pointerId:e.pointerId,x:d.x,z:d.z,moved:false,enabled:controls?.enabled??true,axis}
    if(controls)controls.enabled=false
    setDragId(d.id);useEquipmentStore.getState().setDragging(true);gl.domElement.style.cursor='grabbing'
  }
  const move=(e:ThreeEvent<PointerEvent>)=>{
    const session=drag.current;if(!session)return;e.stopPropagation();const p=new THREE.Vector3();if(!e.ray.intersectPlane(session.plane,p))return
    const aligned=alignPosition(layout,session.d.id,session.axis==='z'?session.d.x:session.d.x+p.x-session.start.x,session.axis==='x'?session.d.z:session.d.z+p.z-session.start.z,autoAlign&&!e.shiftKey)
    session.x=session.axis==='z'?session.d.x:aligned.x;session.z=session.axis==='x'?session.d.z:aligned.z
    if(guides.current){guides.current.position.set(session.x,.24,session.z);guides.current.visible=aligned.snapX!==undefined||aligned.snapZ!==undefined}
    grid.current?.position.set(session.x,.23,session.z)
    session.moved ||= Math.hypot(session.x-session.d.x,session.z-session.d.z)>.04
    if(ghost.current)ghost.current.position.set(session.x,deviceElevation(session.d),session.z)
    const error=placementError(layout,session.d.id,session.x,session.z,session.d.yaw)
    const canSwap=error.collider&&layout[error.collider].kind==='rack'&&session.d.kind==='rack'&&Math.hypot(layout[error.collider].x-session.x,layout[error.collider].z-session.z)<.7
    const color=error.message&&!canSwap?'#ef8274':canSwap?'#e3c374':'#73dbd7';line.current?.color.set(color);targetPad.current?.color.set(color);invalidate()
  }
  useEffect(()=>{
    if(!placementId)return
    const old=controls?.enabled??true;if(controls)controls.enabled=false
    const raycaster=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.25)
    const locate=(event:PointerEvent|DragEvent)=>{const rect=gl.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);return raycaster.ray.intersectPlane(plane,new THREE.Vector3())}
    const preview=(event:PointerEvent|DragEvent)=>{const p=locate(event);if(!p)return;const a=alignPosition(layout,placementId,p.x,p.z,autoAlign&&!event.shiftKey);ghost.current?.position.set(a.x,elevation,a.z);grid.current?.position.set(a.x,.23,a.z);if(guides.current){guides.current.position.set(a.x,.24,a.z);guides.current.visible=a.snapX!==undefined||a.snapZ!==undefined}const color=placementError(layout,placementId,a.x,a.z,layout[placementId].yaw).message?'#e5866b':'#6ee0d6';line.current?.color.set(color);targetPad.current?.color.set(color);invalidate()}
    const commit=(event:PointerEvent|DragEvent)=>{const p=locate(event);if(p){const a=alignPosition(layout,placementId,p.x,p.z,autoAlign&&!event.shiftKey);useEquipmentStore.getState().place(a.x,a.z)}}
    const place=(event:PointerEvent)=>{if(event.button!==0)return;event.stopPropagation();commit(event)}
    const over=(e:DragEvent)=>{e.preventDefault();preview(e)}
    const drop=(e:DragEvent)=>{e.preventDefault();e.stopPropagation();commit(e)}
    gl.domElement.addEventListener('dragover',over);gl.domElement.addEventListener('drop',drop);
    gl.domElement.addEventListener('pointermove',preview);gl.domElement.addEventListener('pointerup',place,true);gl.domElement.style.cursor='crosshair'
    return ()=>{gl.domElement.removeEventListener('dragover',over);gl.domElement.removeEventListener('drop',drop);gl.domElement.removeEventListener('pointermove',preview);gl.domElement.removeEventListener('pointerup',place,true);if(controls)controls.enabled=old;gl.domElement.style.cursor='auto'}
  },[placementId,controls,gl,camera,layout,elevation,invalidate,autoAlign])
  return <group name="Direct drag and placement interaction">
    {editing&&<instancedMesh ref={hit} args={[undefined,undefined,installed.length]} onPointerDown={down} onPointerMove={move} onPointerUp={e=>{if(drag.current){e.stopPropagation();finish()}}} onPointerOver={()=>{if(!drag.current&&!placementId)gl.domElement.style.cursor=movementId?'grab':'pointer'}} onPointerOut={()=>{if(!drag.current&&!placementId)gl.domElement.style.cursor='auto'}}><boxGeometry/><meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false}/></instancedMesh>}
    {editing&&selected.installed&&<group position={[selected.x,elevation,selected.z]} rotation={[0,selected.yaw,0]}>
      <mesh renderOrder={990}><boxGeometry args={[w+.04,h+.04,depth+.04]}/><meshBasicMaterial color="#61dad8" transparent opacity={.13} depthWrite={false}/></mesh>
      <lineSegments geometry={outline} renderOrder={1000}><lineBasicMaterial color="#8cedeb" depthTest={false}/></lineSegments>
      <mesh position={[0,-elevation+.22,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[w+.16,depth+.16]}/><meshBasicMaterial color="#64d5d4" transparent opacity={.18} depthWrite={false}/></mesh>
    </group>}
    {editing&&movementId===selectedId&&selected.installed&&<group position={[selected.x,h+.65,selected.z]}>
      {(['x','z'] as const).map(axis=><group key={axis} rotation={[0,axis==='x'?Math.PI/2:0,0]} onPointerDown={e=>down(e,axis)} onPointerMove={move} onPointerUp={e=>{e.stopPropagation();finish()}}>
        <mesh position={[0,0,2.15]}><boxGeometry args={[.8,.8,3.5]}/><meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false}/></mesh>
        <mesh position={[0,.13,2.15]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.08,.08,2.7,12]}/><meshBasicMaterial color={axis==='x'?'#e9a28d':'#85c5e8'} depthTest={false}/></mesh>
        <mesh position={[0,.13,3.6]} rotation={[Math.PI/2,0,0]}><coneGeometry args={[.27,.6,16]}/><meshBasicMaterial color={axis==='x'?'#e9a28d':'#85c5e8'} depthTest={false}/></mesh>
      </group>)}
    </group>}
    {editing&&(dragId||placementId||movementId)&&<>
      <group visible={Boolean(dragId||placementId)} ref={ghost} position={[selected.x,elevation,selected.z]} rotation={[0,selected.yaw,0]}>
        <lineSegments geometry={outline} renderOrder={1000}><lineBasicMaterial ref={line} color="#73dbd7" depthTest={false}/></lineSegments>
        <mesh><boxGeometry args={[w,h,depth]}/><meshBasicMaterial color="#72cfd0" transparent opacity={.11} depthWrite={false}/></mesh>
        <mesh position={[0,-elevation+.24,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[w+.22,depth+.22]}/><meshBasicMaterial ref={targetPad} color="#73dbd7" transparent opacity={.38} depthWrite={false}/></mesh>
      </group>
      <gridHelper ref={grid} args={[12,24,'#597f8d','#2e4c5b']} position={[selected.x,.23,selected.z]}/>
      <group ref={guides} position={[selected.x,.24,selected.z]}>
        <mesh rotation={[-Math.PI/2,0,0]}><planeGeometry args={[36,.035]}/><meshBasicMaterial color="#c6b285" transparent opacity={.75} depthTest={false}/></mesh>
        <mesh rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.035,36]}/><meshBasicMaterial color="#78b8d2" transparent opacity={.75} depthTest={false}/></mesh>
      </group>
    </>}

  </group>
}
