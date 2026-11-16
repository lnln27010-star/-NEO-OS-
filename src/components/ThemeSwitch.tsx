import { Moon, Sun } from 'lucide-react'
import { useVisualTheme } from '../useVisualTheme'

export function ThemeSwitch() {
  const { theme, setTheme,basemapTone,setBasemapTone } = useVisualTheme()
  return <div className="appearance-switch" role="group" aria-label="地图与园区外观主题">
    <button type="button" aria-pressed={theme==='dark'} onClick={()=>setTheme('dark')}><Moon size={13}/><span>深色</span></button>
    <button type="button" aria-pressed={theme==='light'} onClick={()=>setTheme('light')}><Sun size={13}/><span>浅色</span></button>
    {theme==='dark'&&<select aria-label="深色底图风格" value={basemapTone} onChange={e=>setBasemapTone(e.target.value as 'black'|'blueblack')}><option value="black">黑色底图</option><option value="blueblack">蓝黑底图</option></select>}
  </div>
}
