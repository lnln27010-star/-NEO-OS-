import { useEffect, useRef, useState } from 'react'

// Spot price data: { realtime: { province -> { date -> [24 prices] } }, dayahead: { ... } }
export type SpotPriceData = {
  realtime: Record<string, Record<string, (number | null)[]>>
  dayahead: Record<string, Record<string, (number | null)[]>>
}

export type SpotType = 'realtime' | 'dayahead'
export type SpotAggregation = 'day' | 'month' | 'year'

export const SPOT_TYPES: { id: SpotType; label: string }[] = [
  { id: 'realtime', label: '实时' },
  { id: 'dayahead', label: '日前' },
]

export const SPOT_AGGREGATIONS: { id: SpotAggregation; label: string }[] = [
  { id: 'day', label: '按日' },
  { id: 'month', label: '按月' },
  { id: 'year', label: '按年' },
]

// Color scale for spot prices (元/MWh), using P10-P90 range
const SPOT_COLOR_STOPS = [
  { t: 0,    c: [78, 184, 170] },   // teal
  { t: 0.25, c: [168, 203, 88] },  // green
  { t: 0.5,  c: [239, 197, 91] },   // gold
  { t: 0.75, c: [232, 124, 88] },  // orange
  { t: 1,    c: [209, 70, 80] },   // red
]

export function spotPriceColor(price: number, min: number, max: number): string {
  if (!price || price <= 0) return 'rgba(180,190,195,0.15)'
  const t = Math.max(0, Math.min(1, (price - min) / (max - min)))
  for (let i = 0; i < SPOT_COLOR_STOPS.length - 1; i++) {
    if (t <= SPOT_COLOR_STOPS[i + 1].t) {
      const lt = (t - SPOT_COLOR_STOPS[i].t) / (SPOT_COLOR_STOPS[i + 1].t - SPOT_COLOR_STOPS[i].t)
      const r = Math.round(SPOT_COLOR_STOPS[i].c[0] + (SPOT_COLOR_STOPS[i + 1].c[0] - SPOT_COLOR_STOPS[i].c[0]) * lt)
      const g = Math.round(SPOT_COLOR_STOPS[i].c[1] + (SPOT_COLOR_STOPS[i + 1].c[1] - SPOT_COLOR_STOPS[i].c[1]) * lt)
      const b = Math.round(SPOT_COLOR_STOPS[i].c[2] + (SPOT_COLOR_STOPS[i + 1].c[2] - SPOT_COLOR_STOPS[i].c[2]) * lt)
      return `rgba(${r},${g},${b},0.55)`
    }
  }
  return 'rgba(209,70,80,0.55)'
}

function getTypeData(data: SpotPriceData, type: SpotType): Record<string, Record<string, (number | null)[]>> {
  return data[type] ?? {}
}

// Compute mean price for a province at a given aggregation level
export function getSpotMean(
  data: SpotPriceData,
  province: string,
  type: SpotType,
  aggregation: SpotAggregation,
  dateKey: string
): number | null {
  const prov = getTypeData(data, type)[province]
  if (!prov) return null
  const prices: number[] = []
  for (const [date, hours] of Object.entries(prov)) {
    let match = false
    if (aggregation === 'day' && date === dateKey) match = true
    else if (aggregation === 'month' && date.substring(0, 7) === dateKey) match = true
    else if (aggregation === 'year' && date.substring(0, 4) === dateKey) match = true
    if (match) {
      for (const p of hours) { if (p !== null && p > 0) prices.push(p) }
    }
  }
  if (!prices.length) return null
  return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100
}

// Get 24-hour mean profile for a province at a given aggregation
export function getSpot24hProfile(
  data: SpotPriceData,
  province: string,
  type: SpotType,
  aggregation: SpotAggregation,
  dateKey: string
): (number | null)[] {
  const prov = getTypeData(data, type)[province]
  if (!prov) return new Array(24).fill(null)
  const hourSums = new Array(24).fill(0)
  const hourCounts = new Array(24).fill(0)
  for (const [date, hours] of Object.entries(prov)) {
    let match = false
    if (aggregation === 'day' && date === dateKey) match = true
    else if (aggregation === 'month' && date.substring(0, 7) === dateKey) match = true
    else if (aggregation === 'year' && date.substring(0, 4) === dateKey) match = true
    if (!match) continue
    for (let h = 0; h < 24; h++) {
      const p = hours[h]
      if (p !== null && p > 0) { hourSums[h] += p; hourCounts[h]++ }
    }
  }
  return hourSums.map((s, i) => hourCounts[i] > 0 ? Math.round(s / hourCounts[i] * 100) / 100 : null)
}

// Get all available date keys for a given aggregation and type
export function getSpotDateKeys(data: SpotPriceData, type: SpotType, aggregation: SpotAggregation): string[] {
  const typeData = getTypeData(data, type)
  const keys = new Set<string>()
  for (const prov of Object.values(typeData)) {
    for (const date of Object.keys(prov)) {
      if (aggregation === 'day') keys.add(date)
      else if (aggregation === 'month') keys.add(date.substring(0, 7))
      else keys.add(date.substring(0, 4))
    }
  }
  return [...keys].sort()
}

// Pick the date key with the most province coverage (best for heatmap display)
export function getBestDateKey(data: SpotPriceData, type: SpotType, aggregation: SpotAggregation): string | null {
  const keys = getSpotDateKeys(data, type, aggregation)
  if (!keys.length) return null
  let best = keys[0], bestCount = 0
  for (const k of keys) {
    let count = 0
    for (const prov of Object.keys(getTypeData(data, type))) {
      if (getSpotMean(data, prov, type, aggregation, k) !== null) count++
    }
    if (count > bestCount) { bestCount = count; best = k }
  }
  return best
}

// Get price range (P10-P90) for color calibration
export function getSpotPriceRange(data: SpotPriceData, type: SpotType, aggregation: SpotAggregation, dateKey: string): { min: number; max: number } {
  const means: number[] = []
  const typeData = getTypeData(data, type)
  for (const prov of Object.keys(typeData)) {
    const m = getSpotMean(data, prov, type, aggregation, dateKey)
    if (m && m > 0) means.push(m)
  }
  if (!means.length) return { min: 200, max: 500 }
  means.sort((a, b) => a - b)
  return {
    min: means[Math.floor(means.length * 0.1)],
    max: means[Math.floor(means.length * 0.9)],
  }
}

// Hook to load spot price data
export function useSpotPriceData() {
  const [data, setData] = useState<SpotPriceData | null>(null)
  useEffect(() => {
    fetch('/data/spot-price.json')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])
  return data
}
