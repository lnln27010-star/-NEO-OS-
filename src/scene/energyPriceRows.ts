import type { PriceData, PriceField } from './PriceAnalysisPanel'

export function proxyPriceRows(data: PriceData, province: string, month: string, field: PriceField): [string, string][] | null {
  const provinceData = data[province]
  const current = provinceData?.[month]
  if (!current) return null
  const rows: [string, string][] = [['省份', province], ['月份', month], ['代理购电价', `${current.price.toFixed(4)} 元/kWh`]]
  for (const [id, label] of [['peak', '高峰电价'], ['normal', '平时段电价'], ['valley', '低谷电价']] as const) {
    if (current[id] > 0) rows.push([label, `${current[id].toFixed(4)} 元/kWh`])
  }
  if (current.subRegions > 1) rows.push(['子区域数', `${current.subRegions} 个区域加权均值`])
  const months = Object.keys(provinceData).sort()
  const index = months.indexOf(month)
  const previous = index > 0 ? provinceData[months[index - 1]] : null
  if (previous && previous[field] > 0) {
    const diff = current[field] - previous[field]
    const sign = diff >= 0 ? '+' : ''
    rows.push(['环比变化', `${sign}${diff.toFixed(4)} (${sign}${(diff / previous[field] * 100).toFixed(1)}%)`])
  }
  return rows
}
