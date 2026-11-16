import { CheckCircle2, ChevronRight, Filter, GripVertical, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { assetDefinitions } from '../assets'
import type { AssetCategory, AssetDefinition } from '../domain'
import { useDesignerStore } from '../useDesignerStore'

const categories: Array<{ id: 'all' | AssetCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'compute', label: 'IT 与算力' },
  { id: 'power', label: '供配电' },
  { id: 'cooling', label: '冷却' },
  { id: 'network', label: '网络' },
]

function AssetThumbnail({ definition }: { definition: AssetDefinition }) {
  return (
    <div className={`asset-thumb asset-thumb-${definition.kind}`} style={{ '--asset-accent': definition.visual.accent } as React.CSSProperties}>
      <div className="asset-thumb-body">
        <span />
        <span />
        <span />
        <i />
      </div>
    </div>
  )
}

export function AssetLibrary() {
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | AssetCategory>('all')
  const [tab, setTab] = useState<'equipment' | 'space' | 'connector'>('equipment')
  const setDraggingDefinition = useDesignerStore((state) => state.setDraggingDefinition)
  const setPlacementPreview = useDesignerStore((state) => state.setPlacementPreview)
  const addAssetAutomatically = useDesignerStore((state) => state.addAssetAutomatically)

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  const filteredAssets = useMemo(() => assetDefinitions.filter((item) => {
    const categoryMatch = category === 'all' || item.category === category
    const search = `${item.name} ${item.model} ${item.summary}`.toLowerCase()
    return categoryMatch && search.includes(query.trim().toLowerCase())
  }), [category, query])

  const onDragStart = (event: React.DragEvent, definitionId: string) => {
    if ((event.target as HTMLElement).closest('button')) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-dc-asset', definitionId)
    setDraggingDefinition(definitionId)
  }

  const onDragEnd = () => {
    setDraggingDefinition(null)
    setPlacementPreview(null)
  }

  return (
    <aside className="asset-library panel-surface">
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">资产库</div>
          <div className="panel-subtitle">已发布资产 {assetDefinitions.filter((item) => item.published).length}</div>
        </div>
        <button className="icon-button" type="button" title="资产筛选暂未开放" aria-label="资产筛选暂未开放" disabled><SlidersHorizontal size={16} /></button>
      </div>
      <label className="search-box">
        <Search size={15} />
        <input ref={searchRef} id="asset-search" name="asset-search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索资产" placeholder="搜索机柜、CDU、RPP…" />
        <kbd>Ctrl K</kbd>
      </label>
      <div className="asset-tabs">
        <button type="button" className={tab === 'equipment' ? 'is-active' : ''} aria-pressed={tab === 'equipment'} onClick={() => setTab('equipment')}>设备</button>
        <button type="button" className={tab === 'space' ? 'is-active' : ''} aria-pressed={tab === 'space'} onClick={() => setTab('space')}>空间</button>
        <button type="button" className={tab === 'connector' ? 'is-active' : ''} aria-pressed={tab === 'connector'} onClick={() => setTab('connector')}>连接件</button>
      </div>
      {tab === 'equipment' ? (
        <>
          <div className="category-strip">
            {categories.map((item) => (
              <button key={item.id} type="button" className={category === item.id ? 'is-active' : ''} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>
            ))}
          </div>
          <div className="asset-list-meta">
            <span>{filteredAssets.length} 个资产</span>
            <button type="button" title="项目资产筛选暂未开放" aria-label="项目资产筛选暂未开放" disabled><Filter size={13} />项目资产</button>
          </div>
          <div className="asset-card-grid">
            {filteredAssets.map((definition) => (
              <article
                key={definition.id}
                className="asset-card"
                draggable
                onDragStart={(event) => onDragStart(event, definition.id)}
                onDragEnd={onDragEnd}
                title="拖入三维场景，或使用添加按钮自动落位"
              >
                <GripVertical className="drag-handle" size={13} />
                <CheckCircle2 className="published-mark" size={14} />
                <AssetThumbnail definition={definition} />
                <div className="asset-card-name">{definition.name}</div>
                <div className="asset-card-model">{definition.model}</div>
                <div className="asset-card-summary" style={{ paddingRight: 48 }}>{definition.summary}</div>
                <button
                  className="tool-button"
                  type="button"
                  draggable={false}
                  aria-label={`添加 ${definition.name} 到最近可用网格`}
                  title={`添加 ${definition.name} 到最近可用网格`}
                  onDragStart={(event) => event.preventDefault()}
                  onClick={() => addAssetAutomatically(definition.id)}
                  style={{ position: 'absolute', right: 4, bottom: 4, minWidth: 44, height: 24, padding: '0 6px', fontSize: 10 }}
                >
                  <Plus size={12} />添加
                </button>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="library-placeholder">
          <div className="placeholder-graphic"><ChevronRight size={24} /></div>
          <strong>{tab === 'space' ? '空间构件' : '管线与连接件'}</strong>
          <span>将在下一轮原型中开放参数化墙体、门、通道与管线路由。</span>
        </div>
      )}
    </aside>
  )
}
