import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { rackColor } from '../operationsModel'
import { useOperationsStore } from '../useOperationsStore'
import { Parts } from './EngineeringSite'
import { useEquipmentStore } from '../useEquipmentStore'

export function RackOperationsOverlay() {
  const frame = useOperationsStore((state) => state.frame)
  const layer = useOperationsStore((state) => state.layer)
  const racks=frame.racks
  const selectedId = useOperationsStore((state) => state.selectedRackId)
  const select = useOperationsStore((state) => state.selectRack)
  const hitBoxes = useRef<THREE.InstancedMesh>(null)
  const editing=useEquipmentStore(s=>s.editMode)
  const layout=useEquipmentStore(s=>s.layout)
  const colors = useMemo(() => frame.racks.filter(r=>r.installed).map((rack) => ({ p: [rack.x, 2.37, rack.z] as [number, number, number], s: [.96, .06, 1.28] as [number, number, number], r:[0,layout[rack.id].yaw,0] as [number,number,number],color: rackColor(rack, frame, layer) })), [frame, layer,layout])
  useLayoutEffect(() => {
    if (!hitBoxes.current) return
    const object = new THREE.Object3D()
    racks.forEach((rack, index) => {const d=layout[rack.id];object.position.set(d.x,1.4,d.z);object.rotation.set(0,d.yaw,0);object.scale.setScalar(d.installed?1:0);object.updateMatrix();hitBoxes.current!.setMatrixAt(index,object.matrix) })
    hitBoxes.current.instanceMatrix.needsUpdate = true; hitBoxes.current.computeBoundingSphere()
  }, [layout,editing,racks])
  const selected = layout[selectedId] ?? (racks[0]?layout[racks[0].id]:undefined)
  const outline = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 2.3, 1.4)), [])
  useEffect(() => () => outline.dispose(), [outline])
  return <group name={`Operations frame ${frame.seconds}s`}>
    <Parts parts={colors} metalness={0} roughness={.6} castShadow={false} />
    {!editing&&<instancedMesh ref={hitBoxes} args={[undefined, undefined, racks.length]} onClick={(event) => { if (event.instanceId !== undefined) { event.stopPropagation(); select(racks[event.instanceId].id) } }}>
      <boxGeometry args={[1, 2.6, 1.38]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </instancedMesh>}
    {selected?.installed&&!selected.deleted&&!editing&&<lineSegments geometry={outline} position={[selected.x, 1.26, selected.z]} rotation={[0,selected.yaw,0]}><lineBasicMaterial color="#f0d980" toneMapped={false} /></lineSegments>}
  </group>
}
