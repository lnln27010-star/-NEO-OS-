import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Parts, type Part } from './EngineeringSite'
import { useEquipmentStore } from '../useEquipmentStore'
import { EquipmentInteraction } from './EquipmentInteraction'
import type { Equipment } from '../equipmentModel'

function serverTexture(){
  const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d')!
  ctx.fillStyle='#b3bcc1';ctx.fillRect(0,0,1024,128)
  const g=ctx.createLinearGradient(0,0,0,128);g.addColorStop(0,'#c8cfd1');g.addColorStop(.5,'#707f87');g.addColorStop(1,'#afbbc1');ctx.fillStyle=g;ctx.fillRect(0,0,1024,128)
  ctx.fillStyle='#10222c';ctx.fillRect(60,16,680,96)
  ctx.fillStyle='#83929a';for(let y=22;y<108;y+=9)for(let x=68;x<732;x+=12){ctx.beginPath();ctx.arc(x,y,2.3,0,Math.PI*2);ctx.fill()}
  for(let i=0;i<4;i++){ctx.fillStyle='#13212b';ctx.fillRect(764+i*44,30,34,66);ctx.strokeStyle='#9aa8b0';ctx.strokeRect(764+i*44,30,34,66)}
  ctx.fillStyle='#18212a';ctx.fillRect(12,24,24,80);ctx.fillRect(986,24,24,80)
  ctx.fillStyle='#55d6b5';ctx.fillRect(950,32,8,14);ctx.fillStyle='#3b97d1';ctx.fillRect(950,60,8,14)
  ctx.fillStyle='#e9eef0';ctx.font='11px monospace';ctx.fillText('NB / COMPUTE  •  2U',90,100)
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t
}
function buildParts(devices:Equipment[]){
  const frames:Part[]=[],sides:Part[]=[],faces:Part[]=[],servers:Part[]=[],pdus:Part[]=[],lights:Part[]=[],handles:Part[]=[],doors:Part[]=[],units:Part[]=[],vents:Part[]=[],screens:Part[]=[],pipes:Part[]=[]
  const add=(list:Part[],d:Equipment,x:number,y:number,z:number,s:Part['s'],color?:string)=>{const cos=Math.cos(d.yaw),sin=Math.sin(d.yaw);list.push({p:[d.x+x*cos+z*sin,y,d.z-x*sin+z*cos],s,r:[0,d.yaw,0],color})}
  for(const d of devices){if(!d.installed)continue
    if(d.kind!=='rack')continue
    if(d.kind==='rack'){
      for(const x of [-.43,.43])for(const z of [-.55,.55])add(frames,d,x,1.26,z,[.045,2.12,.045])
      for(const y of [.22,2.32])add(frames,d,0,y,0,[.92,.06,1.2])
      for(const x of [-.452,.452])add(sides,d,x,1.26,0,[.017,2.08,1.16])
      if(d.coolingMode==='air')add(sides,d,0,1.26,-.59,[.85,2.08,.015]);else {for(let fin=0;fin<30;fin++)add(frames,d,0,.38+fin*.064,-.65,[.82,.024,.13],'#6e8999');for(const x of [-.36,.36])add(pipes,d,x,1.35,-.73,[.045,2.1,.045],x<0?'#548cbf':'#ca946e')}
      for(let i=0;i<20;i++)if(d.modules[i]){
        const y=.36+(i*2+1)*.04445,depth=d.extracted===i?.52:0
        if(d.extracted!==i)add(servers,d,0,y,.03+depth,[.79,.085,.97],i>=16?'#677783':'#8b9aa4')
        add(faces,d,0,y,.526+depth,[.78,.081,.012])
        for(const x of [-.394,.394])add(handles,d,x,y,.553+depth,[.014,.055,.04])
        add(lights,d,.354,y,.54+depth,[.008,.009,.007],d.enabled&&((d.powerA&&devices.some(a=>a.id==='UPS-A'&&a.installed&&a.enabled))||(d.powerB&&devices.some(a=>a.id==='UPS-B'&&a.installed&&a.enabled)))?'#6cd2ac':'#424a50')
      }
      // 40U servers + 1U switching + 1U patch panel fills the 42U rail.
      for(const y of [.36+40.5*.04445,.36+41.5*.04445]){add(frames,d,0,y,.51,[.8,.04,.07],'#31464f');for(let i=0;i<24;i++)add(vents,d,-.35+i*.0304,y,.553,[.02,.013,.008],'#8aa3ad')}
      for(const x of [-.36,.36]){add(pdus,d,x,1.4,-.54,[.045,2.08,.055],x<0?'#3c86c7':'#c29453');for(let i=0;i<12;i++)add(vents,d,x,.45+i*.16,-.577,[.028,.042,.012],'#101a22')}
      for(let i=0;i<3;i++)add(pipes,d,.30+i*.015,2.34,.40,[.012,.32,.012],['#4eaddb','#c5a44c','#63c4bb'][i])
      if(d.doorOpen)add(doors,d,-.43,1.26,1.01,[.017,2.06,.82],'#394c57')
      else {add(doors,d,0,1.26,.60,[.84,2.06,.006],'#334754');add(handles,d,.34,1.4,.615,[.016,.16,.025])}
    }
  }
  return {frames,sides,faces,servers,pdus,lights,handles,doors,units,vents,screens,pipes}
}
export function DigitalEquipmentHall(){
  const layout=useEquipmentStore(s=>s.layout)
  const devices=useMemo(()=>Object.values(layout),[layout]),parts=useMemo(()=>buildParts(devices),[devices])
  const texture=useMemo(serverTexture,[]);useEffect(()=>()=>texture.dispose(),[texture])
  return <group name="Editable 42U digital twin equipment">
    <Parts parts={parts.frames} color="#253642" metalness={.72} roughness={.38}/>
    <Parts parts={parts.sides} color="#192731" metalness={.48} roughness={.45}/>
    <Parts parts={parts.servers} metalness={.5} roughness={.42} castShadow={false}/>
    <Parts parts={parts.faces} map={texture} metalness={.35} roughness={.5} castShadow={false}/>
    <Parts parts={parts.pdus} metalness={.35} castShadow={false}/>
    <Parts parts={parts.handles} color="#a6b7c1" metalness={.8} roughness={.25} castShadow={false}/>
    <Parts parts={parts.lights} emissive="#56bba2" emissiveIntensity={.7} castShadow={false} receiveShadow={false}/>
    <Parts parts={parts.vents} castShadow={false}/><Parts parts={parts.units} metalness={.45}/>
    <Parts parts={parts.screens} emissive="#28637c" emissiveIntensity={.5} castShadow={false}/><Parts parts={parts.pipes} kind="cylinder" metalness={.55}/>
    {devices.filter(d=>d.installed&&d.kind==='rack'&&d.extracted!==null&&d.modules[d.extracted]).map(d=><ServerInternals key={d.id} device={d}/>)}
    <EquipmentInteraction/>
    <Parts parts={parts.doors.filter(p=>p.s[0]>.8)} opacity={.08} castShadow={false} metalness={.8} roughness={.16}/>
    {parts.doors.length>0&&<Parts parts={parts.doors.filter(p=>p.s[0]<.02&&p.s[2]>.8)} metalness={.4}/>}
  </group>
}

function ServerInternals({device:d}:{device:Equipment}){
  const hardware=useMemo(()=>{
    const trays:Part[]=[{p:[0,-.035,0],s:[.79,.012,.97],color:'#9aa9b4'},{p:[-.39,0,0],s:[.012,.08,.96],color:'#8c9ca7'},{p:[.39,0,0],s:[.012,.08,.96],color:'#8c9ca7'}]
    const board:Part[]=[{p:[0,-.025,-.05],s:[.70,.006,.62],color:'#245850'}],chips:Part[]=[],sinks:Part[]=[],fans:Part[]=[],connectors:Part[]=[]
    for(const x of [-.19,.19]){chips.push({p:[x,-.013,-.08],s:[.13,.02,.13]});for(let i=0;i<10;i++)sinks.push({p:[x-.057+i*.012,.01,-.08],s:[.007,.038,.14]});for(let i=0;i<4;i++)chips.push({p:[x-.055+i*.035,-.005,.13],s:[.009,.045,.11],color:'#456c53'})}
    for(let i=0;i<6;i++)fans.push({p:[-.31+i*.124,.002,-.34],s:[.105,.025,.105],r:[Math.PI/2,0,0]})
    for(let i=0;i<4;i++)connectors.push({p:[-.29+i*.19,-.002,.33],s:[.16,.045,.20],color:'#7f909b'})
    return {trays,board,chips,sinks,fans,connectors}
  },[])
  return <group position={[d.x,.36+(d.extracted!*2+1)*.04445,d.z]} rotation={[0,d.yaw,0]}><group position={[0,0,.55]}>
    <Parts parts={hardware.trays} metalness={.65} roughness={.3} castShadow={false}/><Parts parts={hardware.board} metalness={.2} castShadow={false}/>
    <Parts parts={hardware.chips} color="#17232c" metalness={.3} castShadow={false}/><Parts parts={hardware.sinks} color="#bac8cd" metalness={.8} roughness={.3} castShadow={false}/>
    <Parts parts={hardware.fans} kind="cylinder" color="#233744" castShadow={false}/><Parts parts={hardware.connectors} metalness={.45} castShadow={false}/>
  </group></group>
}