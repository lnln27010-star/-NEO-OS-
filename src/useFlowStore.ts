import {create} from 'zustand'
import type {FlowChannel} from './facilityTopology'
export const FLOW_LABELS:Record<FlowChannel,string>={power:'电力流',water:'水流',heat:'热流 / 风流',information:'信息流'}
export const FLOW_COLORS:Record<FlowChannel,string>={power:'#e8c36b',water:'#6cbfeb',heat:'#e39272',information:'#b69af0'}
export const useFlowStore=create<{channels:Record<FlowChannel,boolean>;animate:boolean;toggle:(key:FlowChannel)=>void;setAnimate:(v:boolean)=>void}>(set=>({channels:{power:true,water:true,heat:true,information:true},animate:true,toggle:key=>set(s=>({channels:{...s.channels,[key]:!s.channels[key]}})),setAnimate:animate=>set({animate})}))
