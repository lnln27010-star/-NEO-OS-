import {useEffect} from 'react'
import {useEquipmentStore} from './useEquipmentStore'
import {useOperationsStore} from './useOperationsStore'
import {createEngineeringSnapshot,simulationApi} from './engineeringSimulation'

/** Keep the agent's snapshot current without tying solver execution to render frames. */
export function useSyncEngineeringModel(active:boolean){
  useEffect(()=>{
    if(!active)return
    let timer:ReturnType<typeof setTimeout>|undefined,disposed=false,lastSent=0,retryAfter=0,revision='',busy=false
    const sync=async()=>{
      if(disposed||document.hidden||busy)return
      const snapshot=createEngineeringSnapshot(useEquipmentStore.getState().layout,useOperationsStore.getState().frame)
      if(snapshot.revision===revision)return
      busy=true
      try{await simulationApi('/model',snapshot);revision=snapshot.revision;lastSent=Date.now();retryAfter=0}catch{retryAfter=Date.now()+30000}finally{busy=false}
    }
    const schedule=()=>{if(disposed)return;clearTimeout(timer);timer=setTimeout(()=>void sync(),Math.max(350,lastSent+4000-Date.now(),retryAfter-Date.now()))}
    const unEquipment=useEquipmentStore.subscribe((n,p)=>{if(n.layout!==p.layout)schedule()})
    const unOperations=useOperationsStore.subscribe((n,p)=>{if(n.frame!==p.frame)schedule()})
    window.addEventListener('focus',schedule);document.addEventListener('visibilitychange',schedule);schedule()
    return()=>{disposed=true;clearTimeout(timer);unEquipment();unOperations();window.removeEventListener('focus',schedule);document.removeEventListener('visibilitychange',schedule)}
  },[active])
}
