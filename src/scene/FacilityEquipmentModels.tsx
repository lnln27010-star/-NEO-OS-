import { useMemo } from 'react'
import { Parts,type Part } from './EngineeringSite'
import { useEquipmentStore } from '../useEquipmentStore'
import { dimensions,type Equipment } from '../equipmentModel'
import {useOperationsStore} from '../useOperationsStore'

/** Instanced engineering assemblies: coils, impellers, breakers, modules and exchangers. */
export function FacilityEquipmentModels(){
  const layout=useEquipmentStore(s=>s.layout)
  const runtime=useOperationsStore(s=>s.frame.runtime)
  const statusLights=useMemo(()=>Object.values(layout).filter(d=>d.installed&&!['rack','pipe','busbar','generator'].includes(d.kind)).map(d=>{const [w,h,z]=dimensions(d),cos=Math.cos(d.yaw),sin=Math.sin(d.yaw);return {p:[d.x+w*.22*cos+(z/2+.08)*sin,h*.76+.35,d.z-w*.22*sin+(z/2+.08)*cos] as Part['p'],s:[.055,.055,.025] as Part['s'],r:[0,d.yaw,0] as Part['r'],color:runtime[d.id]?.utilization>1?'#e18b61':runtime[d.id]?.active?'#8fd5b4':'#516576'}}),[layout,runtime])
  const parts=useMemo(()=>{
    const casing:Part[]=[],metal:Part[]=[],dark:Part[]=[],copper:Part[]=[],cylinders:Part[]=[],screens:Part[]=[],glass:Part[]=[],pipes:Part[]=[],blades:Part[]=[]
    const add=(list:Part[],d:Equipment,x:number,y:number,z:number,size:Part['s'],color?:string,r:Part['r']=[0,0,0])=>{const c=Math.cos(d.yaw),s=Math.sin(d.yaw);list.push({p:[d.x+x*c+z*s,y,d.z-x*s+z*c],s:size,r:[r[0],r[1]+d.yaw,r[2]],color})}
    for(const d of Object.values(layout)){
      if(!d.installed||d.kind==='rack'||d.kind==='generator'&&/^GEN-\d+$/.test(d.id))continue
      const [w,h,depth]=dimensions(d)
      if(d.kind==='generator'){add(casing,d,0,2.1,0,[w,h-.3,depth],'#8c968c');for(let i=0;i<18;i++)add(dark,d,-w/2-.015,.5+i*.16,0,[.02,.05,depth*.78],'#394b4c');add(cylinders,d,w*.32,h+.45,0,[.22,1.1,.22],'#7b8b92');continue}
      if(d.kind==='busbar'){add(casing,d,0,3.6,0,[20,.18,.38],'#8d856b');for(let x=-9;x<=9;x+=2)add(metal,d,x,3.6,0,[.10,.25,.46],'#b2b3a2');continue}
      if(d.kind==='pipe'){
        const color=d.id.includes('SUP')?'#559ebc':'#bd8164'
        add(pipes,d,0,4.3,0,[.16,26,.16],color,[0,0,Math.PI/2]);for(const x of [-12.8,-6.5,0,6.5,12.8])add(cylinders,d,x,4.3,0,[.27,.045,.27],'#8fa3af',[0,0,Math.PI/2]);add(casing,d,0,4.6,0,[.34,.22,.26],'#2e6574');continue
      }
      add(metal,d,0,.13,0,[w+.12,.22,depth+.10],'#3b4a52')
      if(d.kind==='transformer'){
        for(const x of [-1,0,1]){add(cylinders,d,x,1.55,0,[.82,1.9,.82],'#986d47');for(let i=0;i<25;i++)add(cylinders,d,x,.65+i*.072,0,[.88,.022,.88],'#c19a64')}
        for(const y of [.45,2.65])add(metal,d,0,y,0,[3.1,.25,1.1],'#64737c')
        for(const x of [-1.25,1.25])add(metal,d,x,1.5,-.62,[.16,2.15,.17],'#617581')
        for(const x of [-1,0,1]){add(cylinders,d,x,2.9,0,[.15,.38,.15],'#ccd8d7');add(copper,d,x,3.1,.35,[.12,.06,.65])}continue
      }
      if(d.kind==='chiller'){
        for(const z of [-.75,.75]){add(cylinders,d,0,1.05,z,[1.1,5.8,1.1],z<0?'#82999c':'#4d7786',[0,0,Math.PI/2]);for(const x of [-2.9,-2.3,2.3,2.9])add(cylinders,d,x,1.05,z,[1.22,.09,1.22],'#8ea5af',[0,0,Math.PI/2])}
        for(const x of [-1.8,1.8])add(casing,d,x,1.98,0,[1.12,.76,.88],'#5d8694')
        add(casing,d,0,1.75,1.24,[1.4,.75,.28],'#bac3c7');add(screens,d,0,1.83,1.39,[.75,.32,.015],'#397e9c')
        for(const x of [-2.75,2.75])add(pipes,d,x,1.4,1.45,[.24,.95,.24],'#609fb4')
        continue
      }
      if(d.kind==='chw-pump'||d.kind==='cw-pump'){
        add(cylinders,d,-.48,.70,0,[.64,.92,.64],d.kind==='chw-pump'?'#477fa1':'#687f91',[0,0,Math.PI/2]);add(cylinders,d,.58,.70,0,[.93,.46,.93],'#527687',[0,0,Math.PI/2])
        for(let i=0;i<13;i++)add(cylinders,d,-.90+i*.065,.70,0,[.68,.021,.68],'#88a6b7',[0,0,Math.PI/2])
        for(const x of [-1,.95]){add(pipes,d,x,1.1,0,[.18,.82,.18],'#719bab');add(cylinders,d,x,1.48,0,[.32,.065,.32],'#9cacb4')}
        add(screens,d,0,.4,.72,[.37,.19,.04],'#438397');continue
      }
      if(d.kind==='cooling-tower'){
        add(casing,d,0,2.45,0,[6.8,4.1,4.8],'#829aa5');add(glass,d,0,.36,0,[6.5,.16,4.55],'#376c82')
        for(let i=0;i<30;i++)for(const z of [-2.42,2.42])add(dark,d,0,.8+i*.10,z,[6.3,.035,.04],'#344e5c')
        add(cylinders,d,0,4.65,0,[4.2,.35,4.2],'#4a6876');for(let i=0;i<8;i++)add(blades,d,0,4.85,0,[3.6,.055,.22],'#a8bcc4',[0,i*Math.PI/8,0]);continue
      }
      const colour=d.kind==='cdu'?'#597f8c':d.kind==='ups'?'#7c8e9a':d.kind==='crac'?'#607e8d':d.kind==='battery'?'#6c747f':d.kind==='pdu'?'#41576a':'#728591'
      for(const x of [-w/2,w/2])add(casing,d,x,h/2+.2,0,[.025,h,depth],colour)
      add(casing,d,0,h+.20,0,[w,.035,depth],colour);add(casing,d,0,h/2+.20,-depth/2,[w,h,.025],colour)
      if(d.doorOpen)add(casing,d,-w*.85,h/2+.2,depth*.85,[.024,h,w],colour)
      else add(glass,d,0,h/2+.20,depth/2+.025,[w*.90,h*.93,.012],colour)
      add(screens,d,w*.22,h*.76+.2,depth/2+.055,[w*.30,.21,.025],d.enabled?'#4898b7':'#293944')
      add(metal,d,w*.42,h*.50,depth/2+.09,[.025,.25,.06],'#a4b8c0')
      if(d.kind==='cdu'){
        for(let i=0;i<22;i++)add(metal,d,.39,1.35,0,[.014,1.25,.72],'#9cacaf')
        for(const x of [-.55,-.15]){add(cylinders,d,x,.65,.15,[.37,.64,.37],'#678c9c',[0,0,Math.PI/2]);add(pipes,d,x,1.9,-.27,[.095,1.7,.095],x<-.3?'#5ba5c5':'#c48a68')}
        for(const x of [-.65,.65]){add(pipes,d,x,2.78,0,[.12,.75,.12],x<0?'#5ba5c5':'#c48a68');add(cylinders,d,x,2.98,0,[.22,.045,.22],'#a8bdc8')}
      }else if(d.kind==='battery'){
        for(let row=0;row<5;row++)for(const x of [-.3,.3]){add(dark,d,x,.4+row*.34,0,[.50,.28,.65],'#354653');add(copper,d,x,.54+row*.34,.16,[.13,.025,.22],'#d7ab60')}
      }else if(d.kind==='ups'){
        for(let i=0;i<5;i++){add(dark,d,0,.48+i*.33,0,[w*.82,.26,depth*.85],'#3e5464');for(let n=0;n<12;n++)add(metal,d,-w*.35+n*w*.064,.48+i*.33,depth*.445,[.016,.18,.015],'#77939f')}
      }else if(d.kind==='crac'){
        for(let i=0;i<29;i++)add(metal,d,0,.5+i*.062,depth*.43,[w*.85,.018,.08],'#869faa')
        for(const x of [-w*.27,w*.27]){add(cylinders,d,x,2.68,0,[.69,.12,.69],'#2d4858');for(let i=0;i<5;i++)add(blades,d,x,2.76,0,[.62,.015,.055],'#8096a4',[0,i*Math.PI/5,0])}
      }else if(d.kind==='pdu'||d.kind==='lv-panel'||d.kind==='rpp'){
        for(let row=0;row<8;row++)for(const x of [-w*.23,w*.23]){add(dark,d,x,.45+row*.20,.2,[w*.30,.14,.28],'#283944');add(copper,d,x,.45+row*.20,.36,[.045,.085,.025],row%3?'#78b298':'#c99563')}
        for(const x of [-.23,0,.23])add(copper,d,x,1.3,-.2,[.06,1.8,.045],'#cda978')
      }else if(d.kind==='network'){
        for(let row=0;row<8;row++){add(dark,d,0,.4+row*.22,0,[w*.85,.16,.78]);for(let p=0;p<12;p++)add(metal,d,-w*.36+p*w*.064,.4+row*.22,.43,[.045,.05,.02],'#8caca9')}
      }
    }
    return {casing,metal,dark,copper,cylinders,screens,glass,pipes,blades}
  },[layout])
  return <group name="Facility engineering equipment assemblies">
    <Parts parts={parts.casing} metalness={.45} roughness={.46}/><Parts parts={parts.metal} metalness={.78} roughness={.32} castShadow={false}/>
    <Parts parts={parts.dark} color="#283a45" metalness={.25}/><Parts parts={parts.copper} color="#ba9964" metalness={.7} castShadow={false}/>
    <Parts parts={parts.cylinders} kind="cylinder" metalness={.5}/><Parts parts={parts.pipes} kind="cylinder" metalness={.42}/>
    <Parts parts={parts.screens} emissive="#245b71" emissiveIntensity={.5} castShadow={false}/><Parts parts={parts.glass} opacity={.22} metalness={.25} roughness={.1} castShadow={false}/>
    <Parts parts={parts.blades} metalness={.7} castShadow={false}/>
    <Parts parts={statusLights} metalness={0} roughness={.3} castShadow={false} receiveShadow={false}/>
  </group>
}
