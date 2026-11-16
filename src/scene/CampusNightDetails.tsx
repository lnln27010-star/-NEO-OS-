import { Parts, type Part } from './EngineeringSite'

const roofEdges: Part[] = [
  {p:[0,8.72,30.55],s:[96,.06,.08]}, {p:[0,8.72,-30.55],s:[96,.06,.08]},
  {p:[-48,8.72,0],s:[.08,.06,61]}, {p:[48,8.72,0],s:[.08,.06,61]},
  {p:[0,6.7,30.78],s:[92,.045,.07]},
]
const streetLights: Part[] = [], pathLights: Part[] = [], curb: Part[] = []
for(let z=-42;z<54;z+=16) for(const x of [-76,76]) {
  streetLights.push({p:[x,5.95,z],s:[1.15,.08,.45]})
  pathLights.push({p:[x,.17,z],s:[.12,.12,1.5]})
}
for(let x=-84;x<=84;x+=12) for(const z of [-75,83]) pathLights.push({p:[x,.17,z],s:[1.5,.12,.12]})
curb.push({p:[0,.07,-78],s:[190,.12,.25]},{p:[0,.07,86],s:[190,.12,.25]},{p:[-94,.07,4],s:[.25,.12,164]},{p:[94,.07,4],s:[.25,.12,164]})

export function CampusNightDetails({dark,roof=true}:{dark:boolean;roof?:boolean}) {
  if(!dark) return null
  return <group name="Architectural evening lighting — presentation only">
    {roof && <Parts parts={roofEdges} color="#b6d6df" emissive="#6d9fb4" emissiveIntensity={1.8} castShadow={false}/>}
    <Parts parts={streetLights} color="#f3dfb6" emissive="#ebca91" emissiveIntensity={2.2} castShadow={false}/>
    <Parts parts={pathLights} color="#a4caca" emissive="#659f9d" emissiveIntensity={1.7} castShadow={false}/>
    <Parts parts={curb} color="#566670" metalness={.2} roughness={.7}/>
    <mesh position={[0,5.44,37.8]}><boxGeometry args={[13,.075,.14]}/><meshStandardMaterial color="#dce7d7" emissive="#a6cbb5" emissiveIntensity={2}/></mesh>
    <mesh position={[0,.045,43]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[13,5]}/><meshStandardMaterial color="#b29e73" transparent opacity={.16} emissive="#977345" emissiveIntensity={.3} depthWrite={false}/></mesh>
  </group>
}
