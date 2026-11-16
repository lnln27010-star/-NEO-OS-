import { FileCheck2, FileInput, UploadCloud } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDesignerStore } from '../useDesignerStore'
import { IfcAssetPreview } from './IfcAssetPreview'

const classify = (name: string): 'glb' | 'gltf' | 'ifc' | 'pointcloud' | 'metadata' => {
  const extension = name.toLowerCase().split('.').pop()
  if (extension === 'glb') return 'glb'
  if (extension === 'gltf') return 'gltf'
  if (extension === 'ifc') return 'ifc'
  if (extension === 'e57' || extension === 'las' || extension === 'laz') return 'pointcloud'
  return 'metadata'
}

export function SiteAssetIntake() {
  const setSiteAsset = useDesignerStore((state) => state.setSiteAsset)
  const siteAssetName = useDesignerStore((state) => state.siteAssetName)
  const siteAssetType = useDesignerStore((state) => state.siteAssetType)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const status = useMemo(() => {
    if (!siteAssetName) return '等待业主资产'
    if (siteAssetType === 'glb' || siteAssetType === 'gltf') return '已接入浏览器预览'
    if (siteAssetType === 'ifc' || siteAssetType === 'pointcloud') return '已登记，待转换为 USD/3D Tiles'
    return '已登记元数据'
  }, [siteAssetName, siteAssetType])

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const type = classify(file.name)
    setSourceFile(file)
    const url = URL.createObjectURL(file)
    setSiteAsset({ url, name: file.name, type })
  }

  return (
    <section className="site-asset-intake" aria-label="真实资产导入">
      <div className="site-asset-intake-head"><FileInput size={14} /><strong>真实资产接入</strong><span>DSX pipeline</span></div>
      <label className="site-asset-upload">
        <UploadCloud size={15} />
        <span>{siteAssetName ?? '导入 GLB / IFC / 点云'}</span>
        <input type="file" accept=".glb,.gltf,.ifc,.e57,.las,.laz,.json" onChange={onChange} />
      </label>
      <div className="site-asset-status"><FileCheck2 size={12} /><span>{status}</span></div>
      {sourceFile && siteAssetType === 'ifc' && <IfcAssetPreview file={sourceFile} />}
      <small>GLB/GLTF 可直接预览；IFC、E57、LAS、LAZ 进入转换队列，保留原始文件名和来源。</small>
    </section>
  )
}
