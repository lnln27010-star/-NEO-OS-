import {useEffect,useMemo} from 'react'
import {useFrame} from '@react-three/fiber'
import * as THREE from 'three'
import {dimensions,KIND_LABEL,PODS,isExterior} from '../equipmentModel'
import {useEquipmentStore} from '../useEquipmentStore'

/** Physical faceplates near equipment; only zone wayfinding floats above the room. */
export function EquipmentNames({exterior=false}:{exterior?:boolean}){
  const layout=useEquipmentStore(s=>s.layout),selected=useEquipmentStore(s=>s.selectedId),visible=useEquipmentStore(s=>s.showNames)
  const devices=useMemo(()=>Object.values(layout).filter(d=>d.installed&&!d.deleted&&!['pipe','busbar'].includes(d.kind)&&(!exterior||isExterior(d))),[layout,exterior])
  const zones=useMemo(()=>exterior?[{x:-5,z:-47,name:'冷却塔区',sub:'HEAT REJECTION'},{x:0,z:61,name:'备用发电区',sub:'STANDBY POWER'},{x:-64,z:0,name:'冷水机组区',sub:'CHILLER PLANT'}]:[...PODS.map((p,i)=>({x:p.x,z:p.z,name:p.name,sub:`${Object.values(layout).filter(d=>d.installed&&!d.deleted&&d.kind==='rack'&&d.pod===i).length} RACKS`})),{x:33,z:-22,name:'A 路供配电区',sub:'POWER · UPS · BATTERY'},{x:33,z:22,name:'B 路供配电区',sub:'POWER · UPS · BATTERY'},{x:33,z:1,name:'水泵机电区',sub:'CHW / CW'},{x:-37,z:-3,name:'网络核心区',sub:'CORE NETWORK'}],[exterior,layout])
  const atlas=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=4096;const c=canvas.getContext('2d')!
    const labels=[...devices.map(d=>({name:d.id,sub:d.kind==='rack'?(d.coolingMode==='air'?'风冷服务器机柜':'液冷背板机柜'):KIND_LABEL[d.kind]})),...zones]
    labels.forEach((d,i)=>{const x=i%8*256,y=Math.floor(i/8)*56;c.fillStyle='#101f29';c.fillRect(x+1,y+1,254,54);c.strokeStyle='#607f8c';c.strokeRect(x+1.5,y+1.5,253,53);c.textAlign='center';c.fillStyle='#d0e4e9';c.font='18px "Microsoft YaHei",sans-serif';c.fillText(d.name,x+128,y+24,244);c.fillStyle='#84a7b5';c.font='12px "Microsoft YaHei",sans-serif';c.fillText(d.sub,x+128,y+44,244)})
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t
  },[devices,zones])
  const geometry=useMemo(()=>{
    const n=devices.length+zones.length,g=new THREE.BufferGeometry(),uv=new Float32Array(n*12)
    for(let i=0;i<n;i++){const x=i%8*256/2048,y=1-(Math.floor(i/8)*56+56)/4096,w=256/2048,h=56/4096;uv.set([x,y,x+w,y,x+w,y+h,x,y,x+w,y+h,x,y+h],i*12)}
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*18),3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));return g
  },[devices,zones])
  useEffect(()=>()=>{atlas.dispose();geometry.dispose()},[atlas,geometry])
  useFrame(({camera,size,viewport})=>{
    const a=geometry.getAttribute('position') as THREE.BufferAttribute,values=a.array as Float32Array;values.fill(-100000)
    const quad=(i:number,centre:THREE.Vector3,right:THREE.Vector3,up:THREE.Vector3,w:number,h:number)=>{[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,-.5],[.5,.5],[-.5,.5]].forEach(([x,y],j)=>{const p=centre.clone().addScaledVector(right,x*w).addScaledVector(up,y*h);values.set([p.x,p.y,p.z],i*18+j*3)})}
    if(visible){
      devices.forEach((d,i)=>{const [w,h,depth]=dimensions(d),front=new THREE.Vector3(Math.sin(d.yaw),0,Math.cos(d.yaw)),centre=new THREE.Vector3(d.x,Math.min(2.15,h*.78),d.z).addScaledVector(front,depth/2+.055)
        if(centre.distanceTo(camera.position)>38&&d.id!==selected)return
        quad(i,centre,new THREE.Vector3(Math.cos(d.yaw),0,-Math.sin(d.yaw)),new THREE.Vector3(0,1,0),Math.min(.76,w*.78),.19)
      })
      const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion),occupied:{x:number;y:number}[]=[]
      zones.forEach((z,i)=>{const p=new THREE.Vector3(z.x,10.5,z.z),screen=p.clone().project(camera),x=(screen.x+1)*size.width/2,y=(1-screen.y)*size.height/2
        if(screen.z>1||screen.z< -1||x<100||x>size.width-100||y<100||y>size.height-110||occupied.some(r=>Math.abs(r.x-x)<138&&Math.abs(r.y-y)<42))return
        occupied.push({x,y});const v=viewport.getCurrentViewport(camera,p),w=Math.min(16,v.width/size.width*116);quad(devices.length+i,p,right,up,w,w*56/256)
      })
    }
    a.needsUpdate=true
  })
  return <mesh geometry={geometry} frustumCulled={false} renderOrder={15}><meshBasicMaterial map={atlas} transparent alphaTest={.1} depthWrite={false} side={THREE.DoubleSide} toneMapped={false}/></mesh>
}
