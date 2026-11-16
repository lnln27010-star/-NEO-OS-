import { create } from 'zustand'

export type VisualTheme = 'dark' | 'light'
export type BasemapTone = 'black' | 'blueblack'
const readTheme = (): VisualTheme => {
  try { return localStorage.getItem('compute-power-visual-theme') === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}
export const useVisualTheme = create<{ theme: VisualTheme; basemapTone: BasemapTone; setBasemapTone:(tone:BasemapTone)=>void; setTheme: (theme: VisualTheme) => void }>(set => ({
  theme: readTheme(),
  basemapTone:(()=>{try{return localStorage.getItem('compute-power-map-tone')==='blueblack'?'blueblack':'black'}catch{return 'black'}})(),
  setBasemapTone:tone=>{try{localStorage.setItem('compute-power-map-tone',tone)}catch{}set({basemapTone:tone})},
  setTheme: theme => {
    try { localStorage.setItem('compute-power-visual-theme', theme) } catch { /* optional preference */ }
    set({ theme })
  },
}))
