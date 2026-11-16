import {useMemo} from 'react'
import {useEquipmentStore} from './useEquipmentStore'
import {useOperationsStore} from './useOperationsStore'
import {useEngineeringStore} from './useEngineeringStore'
import {createEngineeringSnapshot} from './engineeringSimulation'
export function useActiveEngineeringResult(){
  const layout=useEquipmentStore(s=>s.layout),frame=useOperationsStore(s=>s.frame),result=useEngineeringStore(s=>s.overlay)
  return useMemo(()=>result&&result.model_revision===createEngineeringSnapshot(layout,frame).revision?result:null,[layout,frame,result])
}
