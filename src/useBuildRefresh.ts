import {useEffect} from 'react'
import {useEquipmentStore} from './useEquipmentStore'
declare const __APP_BUILD__:string

/** Refresh idle sessions after a production rebuild; layout edits are already persisted. */
export function useBuildRefresh(){
  useEffect(()=>{
    let disposed=false,busy=false
    const check=async()=>{
      if(busy)return
      busy=true
      try{
        const response=await fetch('/__project',{cache:'no-store',signal:AbortSignal.timeout(4000)})
        if(!response.ok)return
        const current=await response.json(),state=useEquipmentStore.getState(),tag=document.activeElement?.tagName
        if(!disposed&&current.build&&current.build!==__APP_BUILD__&&!state.dragging&&!state.placementId&&!['INPUT','SELECT','TEXTAREA'].includes(tag??''))window.location.reload()
      }catch{/* Offline previews remain usable. */}finally{busy=false}
    }
    const timer=window.setInterval(check,15000)
    window.addEventListener('focus',check)
    void check()
    return ()=>{disposed=true;window.clearInterval(timer);window.removeEventListener('focus',check)}
  },[])
}
