import {useEffect,useMemo} from 'react'
import * as THREE from 'three'
import {PODS} from '../equipmentModel'
import {Parts,type Part} from './EngineeringSite'

function floorLabel(title:string,subtitle:string){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=192;const c=canvas.getContext('2d')!;c.textAlign='center';c.fillStyle='#b6d1df';c.font='600 43px "Microsoft YaHei",sans-serif';c.fillText(title,512,73);c.fillStyle='#647e91';c.font='24px sans-serif';c.fillText(subtitle,512,124);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture}
export function FacilityLayout({plan}:{plan:boolean}){
  const labels=useMemo(()=>[...PODS.map(p=>floorLabel(p.name,`DATA HALL · ${p.mode==='air'?'COLD / HOT AISLE':'REAR-DOOR LIQUID COOLING'}`)),floorLabel('A 路供配电间','TRANSFORMER · LV · UPS · BATTERY'),floorLabel('水泵机电间','CHILLED WATER / CONDENSER WATER'),floorLabel('B 路供配电间','TRANSFORMER · LV · UPS · BATTERY'),floorLabel('网络核心 / 运维区','SPINE · MANAGEMENT · STAGING')],[])
  useEffect(()=>()=>labels.forEach(t=>t.dispose()),[labels])
  const infrastructure=useMemo(()=>{
    const columns:Part[]=[],rails:Part[]=[],panels:Part[]=[],floor:Part[]=[],markers:Part[]=[],light:Part[]=[]
    for(const p of PODS){
      for(const centre of [p.startZ+1.9,p.startZ+8.3]){
        floor.push({p:[p.x,.16,centre],s:[26.8,.02,2.4],color:p.mode==='air'?'#203e51':'#21454a'})
        for(const x of [p.startX-.56,p.startX+24.15+.56]){columns.push({p:[x,1.42,centre-1.20],s:[.045,2.46,.045]},{p:[x,1.42,centre+1.20],s:[.045,2.46,.045]});panels.push({p:[x,1.5,centre],s:[.015,2.35,2.36],color:'#748d99'})}
        rails.push({p:[p.x,2.67,centre-1.22],s:[26.8,.055,.04]},{p:[p.x,2.67,centre+1.22],s:[26.8,.055,.04]})
        panels.push({p:[p.x,2.69,centre],s:[26.8,.025,2.39],color:'#7babb4'})
        for(let x=p.startX-.3;x<p.startX+24.7;x+=1.3){markers.push({p:[x,.18,centre-1.15],s:[.60,.018,.035],color:'#639fb3'},{p:[x,.18,centre+1.15],s:[.60,.018,.035],color:'#639fb3'})}
      }
      floor.push({p:[p.x,.16,p.startZ+5.1],s:[26.8,.02,1.2],color:'#453730'})
      for(let row=0;row<4;row++)light.push({p:[p.x,5.15,p.startZ+[0,3.8,6.4,10.2][row]],s:[26,.04,.12],color:'#b9c6cd'})
    }
    // Galleries, transport lanes and separate service rooms occupy the remainder.
    for(const z of [-10.8,3.2,24])markers.push({p:[-14,.17,z],s:[61,.025,.045],color:'#8a9480'})
    for(const x of [-46,18.5,21])markers.push({p:[x,.17,0],s:[.045,.025,56],color:'#8a9480'})
    rails.push({p:[20.8,.75,-20],s:[.10,1.1,17],color:'#4a6270'},{p:[20.8,.75,20],s:[.10,1.1,17],color:'#4a6270'})
    for(const z of [-10.5,11])rails.push({p:[33.3,.75,z],s:[25.1,1.1,.10],color:'#4a6270'})
    return {columns,rails,panels,floor,markers,light}
  },[])
  return <group name="Reference facility zones and contained aisles">
    <mesh position={[0,.11,0]}><boxGeometry args={[95,.12,59]}/><meshStandardMaterial color="#283944" roughness={.78} metalness={.12}/></mesh>
    <Parts parts={infrastructure.floor} roughness={.85} castShadow={false}/><Parts parts={infrastructure.markers} castShadow={false}/><Parts parts={infrastructure.columns} color="#8ba0ac" metalness={.5}/><Parts parts={infrastructure.rails} color="#617e8f" metalness={.4}/>
    {!plan&&<Parts parts={infrastructure.panels} opacity={.065} metalness={.25} roughness={.12} castShadow={false}/>}
    {!plan&&<Parts parts={infrastructure.light} emissive="#a0b4c7" emissiveIntensity={.3} castShadow={false}/>}
    {[...PODS.map((p,i)=>({x:p.x,z:p.startZ+11.9,index:i,width:20})),{x:33,z:-22,index:4,width:19},{x:33,z:1,index:5,width:19},{x:33,z:22,index:6,width:19},{x:-37,z:-9.2,index:7,width:16}].map(p=><mesh key={p.index} position={[p.x,.195,p.z]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[p.width,p.width*.1875]}/><meshBasicMaterial map={labels[p.index]} transparent depthWrite={false} opacity={.78} toneMapped={false}/></mesh>)}
  </group>
}
