import { useEffect, useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

export function CampusPaving({dark,elevation=-.14}:{dark:boolean;elevation?:number}) {
  const source=useTexture('/textures/asphalt-diff.jpg')
  const texture=useMemo(()=>{
    const copy=source.clone();copy.colorSpace=THREE.SRGBColorSpace
    copy.wrapS=copy.wrapT=THREE.RepeatWrapping;copy.repeat.set(32,28);copy.anisotropy=4;copy.needsUpdate=true
    return copy
  },[source])
  useEffect(()=>()=>texture.dispose(),[texture])
  return <mesh position={[0,elevation,4]} rotation={[-Math.PI/2,0,0]} receiveShadow>
    <planeGeometry args={[196,170]}/>
    <meshStandardMaterial map={texture} color={dark?'#8e9daa':'#b6b9b5'} roughness={.86} metalness={dark?.08:0}/>
  </mesh>
}
