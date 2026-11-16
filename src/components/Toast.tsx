import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useEffect } from 'react'
import { useDesignerStore } from '../useDesignerStore'

export function Toast() {
  const toast = useDesignerStore((state) => state.toast)
  const clear = useDesignerStore((state) => state.clearToast)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(clear, 3200)
    return () => window.clearTimeout(timer)
  }, [toast, clear])

  if (!toast) return null
  const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'warning' ? AlertTriangle : Info
  return (
    <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
      <Icon size={17} />
      <span>{toast.message}</span>
      <button type="button" aria-label="关闭提示" title="关闭提示" onClick={clear}><X size={14} /></button>
    </div>
  )
}
