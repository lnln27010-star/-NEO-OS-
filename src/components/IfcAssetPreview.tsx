import { useEffect, useState } from 'react'

type IfcAssetPreviewProps = { file: File }

export function IfcAssetPreview({ file }: IfcAssetPreviewProps) {
  const [status, setStatus] = useState('正在读取 IFC 几何…')
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const { IfcAPI } = await import('web-ifc')
        const api = new IfcAPI()
        api.SetWasmPath('/data/', false)
        await api.Init()
        const bytes = new Uint8Array(await file.arrayBuffer())
        const modelID = api.OpenModel(bytes)
        let meshCount = 0
        api.StreamAllMeshes(modelID, () => { meshCount += 1 })
        api.CloseModel(modelID)
        api.Dispose()
        if (!cancelled) setStatus(`IFC 已解析 · ${meshCount.toLocaleString()} 个几何构件 · 待转换 USD/GLB`)
      } catch (error) {
        if (!cancelled) setStatus(`IFC 读取失败 · ${error instanceof Error ? error.message : '未知错误'}`)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [file])
  return <span className="ifc-asset-status">{status}</span>
}
