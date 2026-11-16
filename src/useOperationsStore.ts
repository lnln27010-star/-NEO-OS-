import {create} from 'zustand'
import {DEFAULT_PARAMETERS,DURATION,RACKS,type OperationFrame,type OperationLayer,type Scenario,type SimulationParameters} from './operationsModel'
import {advanceOperatingFrame,replayOperatingFrames,type OperatingEvent} from './thermalDynamics'
import {useEquipmentStore} from './useEquipmentStore'
type Sample={seconds:number;powerKw:number;inletC:number}
const sample=(frame:OperationFrame):Sample=>({seconds:frame.seconds,powerKw:frame.totalPowerKw,inletC:frame.maxInletC})
type State={trail:Sample[];status:'idle'|'running'|'paused'|'complete';scenario:Scenario;load:number;parameters:SimulationParameters;seconds:number;frame:OperationFrame;events:OperatingEvent[];layer:OperationLayer;selectedRackId:string;focusSequence:number
 setParameter:(key:keyof SimulationParameters,value:number)=>void;setScenario:(s:Scenario)=>void;setLoad:(n:number)=>void;setLayer:(s:OperationLayer)=>void;selectRack:(id:string,focus?:boolean)=>void;start:()=>void;pause:()=>void;tick:()=>void;seek:(seconds:number)=>void;reset:()=>void;reportFrames:()=>OperationFrame[]}
const initialEvent=():OperatingEvent=>({seconds:0,layout:useEquipmentStore.getState().layout,load:70,parameters:{...DEFAULT_PARAMETERS}})
const limits:Record<keyof SimulationParameters,[number,number]>={rackRatedKw:[10,200],airRackRatedKw:[2,50],flowLpm:[10,250],supplyC:[15,40],feederCapacityKw:[100,10000],primaryVolumeM3:[1,200],secondaryVolumeM3:[.05,20],podThermalMassKjK:[1000,200000],airSetpointC:[16,35]}
const first=initialEvent()
let replaying=false
export const useOperationsStore=create<State>((set,get)=>{
  const record=(change:Partial<OperatingEvent>)=>{
    const state=get(),event:OperatingEvent={seconds:state.seconds,layout:useEquipmentStore.getState().layout,load:state.load,parameters:state.parameters,...change}
    const events=[...state.events.filter(e=>e.seconds<state.seconds),event],frame=advanceOperatingFrame({...event,scenario:state.scenario},state.seconds?state.frame:undefined,0)
    set({events,load:event.load,parameters:event.parameters,frame,trail:[...state.trail.filter(t=>t.seconds<state.seconds),sample(frame)]})
  }
  const seek=(input:number)=>{
    const state=get(),seconds=Math.round(Math.max(0,Math.min(DURATION,Number.isFinite(input)?input:0))),frames=replayOperatingFrames(state.events,state.scenario,seconds),event=[...state.events].reverse().find(e=>e.seconds<=seconds)??state.events[0]
    replaying=true;useEquipmentStore.setState({layout:event.layout});replaying=false
    set({seconds,load:event.load,parameters:event.parameters,status:seconds===DURATION?'complete':'paused',frame:frames[seconds],trail:frames.filter((_,i)=>i%2===0).map(sample)})
  }
  return {trail:[],status:'idle',scenario:'baseline',load:70,parameters:first.parameters,seconds:0,frame:advanceOperatingFrame({...first,scenario:'baseline'}),events:[first],layer:'thermal',selectedRackId:RACKS[0].id,focusSequence:0,
    setParameter:(key,value)=>{if(!Number.isFinite(value))return;const [min,max]=limits[key];record({parameters:{...get().parameters,[key]:Math.max(min,Math.min(max,value))}})},
    setLoad:value=>record({load:Math.max(30,Math.min(100,Number.isFinite(value)?value:70))}),
    setScenario:scenario=>{const state=get(),event:OperatingEvent={seconds:0,layout:useEquipmentStore.getState().layout,load:state.load,parameters:state.parameters};set({trail:[],scenario,seconds:0,status:'idle',events:[event],frame:advanceOperatingFrame({...event,scenario}),layer:scenario==='network-loss'?'network':scenario==='feeder-trip'||scenario==='ups-a-loss'?'electrical':'thermal'})},
    setLayer:layer=>set({layer}),selectRack:(id,focus=false)=>{if(get().frame.racks.some(r=>r.id===id)){if(useEquipmentStore.getState().selectedId!==id)useEquipmentStore.getState().select(id);set(s=>({selectedRackId:id,focusSequence:s.focusSequence+(focus?1:0)}))}},
    start:()=>{if(get().status==='complete'){const state=get(),event:OperatingEvent={seconds:0,layout:useEquipmentStore.getState().layout,load:state.load,parameters:state.parameters};set({trail:[],seconds:0,events:[event],frame:advanceOperatingFrame({...event,scenario:state.scenario})})}set({status:'running'})},
    pause:()=>{if(get().status==='running')set({status:'paused'})},
    tick:()=>{const s=get();if(s.status!=='running')return;const seconds=Math.min(DURATION,s.seconds+2);let frame=s.frame;for(let time=s.seconds+1;time<=seconds;time++)frame=advanceOperatingFrame({seconds:time,layout:useEquipmentStore.getState().layout,load:s.load,parameters:s.parameters,scenario:s.scenario},frame,1);set({seconds,frame,trail:[...s.trail.filter(t=>t.seconds<s.seconds),sample(s.frame),sample(frame)],status:seconds===DURATION?'complete':'running'})},
    seek,reset:()=>{const event=initialEvent();set({trail:[],status:'idle',scenario:'baseline',load:70,parameters:event.parameters,seconds:0,events:[event],frame:advanceOperatingFrame({...event,scenario:'baseline'}),layer:'thermal'})},
    reportFrames:()=>{const s=get();return replayOperatingFrames(s.events,s.scenario,DURATION).filter((_,i)=>i%2===0)},
  }
})
useEquipmentStore.subscribe((next,previous)=>{
  if(replaying||next.layout===previous.layout)return
  const s=useOperationsStore.getState(),event:OperatingEvent={seconds:s.seconds,layout:next.layout,load:s.load,parameters:s.parameters}
  useOperationsStore.setState({events:[...s.events.filter(e=>e.seconds<s.seconds),event],frame:advanceOperatingFrame({...event,scenario:s.scenario},s.seconds?s.frame:undefined,0)})
})
