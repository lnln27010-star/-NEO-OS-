import {PlatformLogo} from './PlatformLogo'
import {ThemeSwitch} from './ThemeSwitch'
import {Sparkles} from 'lucide-react'
import {NeoAssistant,useNeoAssistantStore} from './NeoAssistant'

export function HeaderBar(){const open=useNeoAssistantStore(s=>s.open);return <><header className="header-bar"><div className="brand-block"><div className="brand-mark"><PlatformLogo/></div><div className="brand-name">分布式算电协同平台</div></div><div className="header-spacer"/><button className="header-ai-trigger" aria-pressed={open} onClick={()=>useNeoAssistantStore.getState().setOpen(!open)}><Sparkles size={14}/>智能操作</button><ThemeSwitch/></header><NeoAssistant/></>}
