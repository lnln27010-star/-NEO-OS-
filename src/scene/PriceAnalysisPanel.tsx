import { useEffect, useMemo, useRef, useState } from 'react'

// Province name mapping from Excel to GeoJSON
const NAME_MAP: Record<string, string> = {
  '北京市': '北京市', '天津市': '天津市', '上海市': '上海市', '重庆市': '重庆市',
  '江苏省': '江苏省', '浙江省': '浙江省', '安徽省': '安徽省', '福建省': '福建省',
  '江西省': '江西省', '山东省': '山东省', '河南省': '河南省', '湖北省': '湖北省',
  '湖南省': '湖南省', '四川省': '四川省', '贵州省': '贵州省', '云南省': '云南省',
  '陕西省': '陕西省', '陕西省榆林地区': '陕西省',
  '甘肃省': '甘肃省', '青海省': '青海省', '辽宁省': '辽宁省', '吉林省': '吉林省',
  '黑龙江省': '黑龙江省', '山西省': '山西省', '海南省': '海南省',
  '宁夏回族自治区': '宁夏回族自治区', '新疆维吾尔自治区': '新疆维吾尔自治区',
  '广西壮族自治区': '广西壮族自治区',
  '内蒙古东部地区': '内蒙古自治区',
  '河北省南部': '河北省', '河北省北部': '河北省',
  '广东省珠三角五市': '广东省', '广东省东西两翼地区': '广东省',
  '广东省粤北山区': '广东省', '广东省惠州市': '广东省', '广东省江门市': '广东省',
}

export type PriceField = 'price' | 'peak' | 'normal' | 'valley'
export const PRICE_FIELDS: { id: PriceField; label: string; unit: string }[] = [
  { id: 'price', label: '代理购电价', unit: '元/kWh' },
  { id: 'peak', label: '高峰电价', unit: '元/kWh' },
  { id: 'normal', label: '平时段电价', unit: '元/kWh' },
  { id: 'valley', label: '低谷电价', unit: '元/kWh' },
]

export type PriceData = Record<string, Record<string, {
  price: number; peak: number; normal: number; valley: number; subRegions: number
}>>

export type PriceDetail = {
  province: string
  month: string
  rows: [string, string][]
}

// Color scale: 5 buckets from low (green) to high (red)
// Price range typically 0.15–0.49, we use 0.20–0.45 as the scale bounds
function priceColor(price: number, min: number, max: number): string {
  if (!price || price <= 0) return 'rgba(180,190,195,0.15)'
  const t = Math.max(0, Math.min(1, (price - min) / (max - min)))
  // 5-stop gradient: teal -> yellow-green -> gold -> orange -> red
  const stops = [
    { t: 0,    c: [78, 184, 170] },   // #4eb8aa - low, teal
    { t: 0.25, c: [168, 203, 88] },  // #a8cb58 - low-mid, green
    { t: 0.5,  c: [239, 197, 91] },   // #efc55b - mid, gold
    { t: 0.75, c: [232, 124, 88] },  // #e87c58 - high, orange
    { t: 1,    c: [209, 70, 80] },   // #d14650 - high, red
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1].t) {
      const localT = (t - stops[i].t) / (stops[i + 1].t - stops[i].t)
      const r = Math.round(stops[i].c[0] + (stops[i + 1].c[0] - stops[i].c[0]) * localT)
      const g = Math.round(stops[i].c[1] + (stops[i + 1].c[1] - stops[i].c[1]) * localT)
      const b = Math.round(stops[i].c[2] + (stops[i + 1].c[2] - stops[i].c[2]) * localT)
      return `rgba(${r},${g},${b},0.55)`
    }
  }
  return 'rgba(209,70,80,0.55)'
}

export function usePriceData() {
  const [priceData, setPriceData] = useState<PriceData | null>(null)
  useEffect(() => {
    fetch('/data/proxy-price-merged.json')
      .then(r => r.json())
      .then(setPriceData)
      .catch(() => {})
  }, [])
  return priceData
}

export function getPriceForProvince(
  data: PriceData,
  province: string,
  month: string,
  field: PriceField
): number | null {
  const prov = data[province]
  if (!prov) return null
  const m = prov[month]
  if (!m) return null
  const val = m[field]
  return val > 0 ? val : null
}

export function getAllMonths(data: PriceData): string[] {
  const months = new Set<string>()
  for (const prov of Object.values(data)) {
    for (const m of Object.keys(prov)) months.add(m)
  }
  return [...months].sort()
}

export function getPriceRange(data: PriceData, month: string, field: PriceField): { min: number; max: number } {
  const prices: number[] = []
  for (const prov of Object.values(data)) {
    const m = prov[month]
    if (m && m[field] > 0) prices.push(m[field])
  }
  if (!prices.length) return { min: 0.2, max: 0.45 }
  prices.sort((a, b) => a - b)
  // Use 10th and 90th percentile to avoid outliers skewing the scale
  const min = prices[Math.floor(prices.length * 0.1)]
  const max = prices[Math.floor(prices.length * 0.9)]
  return { min, max }
}

export { priceColor, NAME_MAP }
