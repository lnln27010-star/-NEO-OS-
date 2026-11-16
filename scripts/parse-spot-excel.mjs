import XLSX from 'xlsx'
import { writeFileSync } from 'fs'

const filePath = 'C:/Users/EDY/WorkBuddy/2026-10-10-22-32-52/现货市场数据.xlsx'
const wb = XLSX.readFile(filePath, { cellDates: false })
const ws = wb.Sheets['透视表']
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })

// Province name mapping: Excel short name → GeoJSON full name
const PROVINCE_MAP = {
  '福建': '福建省', '四川': '四川省', '上海': '上海市', '浙江': '浙江省',
  '广东': '广东省', '湖南': '湖南省', '湖北': '湖北省', '陕西': '陕西省',
  '重庆': '重庆市', '山西': '山西省', '辽宁': '辽宁省', '甘肃': '甘肃省',
  '安徽': '安徽省', '山东': '山东省', '青海': '青海省', '新疆': '新疆维吾尔自治区',
  '宁夏': '宁夏回族自治区', '江苏': '江苏省', '吉林': '吉林省',
  '河北南网': '河北省', '河北': '河北省',
  '蒙东': '内蒙古自治区', '蒙西': '内蒙古自治区',
}

// 96 time columns: col 5 = 00:15, col 6 = 00:30, ..., col 100 = 24:00
// Group 4 consecutive quarters into 1 hour
// Hour 0: cols 5,6,7,8 (00:15, 00:30, 00:45, 01:00) → but actually these represent 00:00-01:00
// Actually looking at the headers: 00:15, 00:30, 00:45, 01:00, 01:15, 01:30, 01:45, 02:00...
// So hour 0 = cols 5-8 (00:15,00:30,00:45,01:00)
// Hour 1 = cols 9-12 (01:15,01:30,01:45,02:00)
// Hour h = cols 5+4*h to 5+4*h+3
// Hour 23 = cols 97-100 (23:15,23:30,23:45,24:00)

function aggregate96to24(prices96) {
  const hours = []
  for (let h = 0; h < 24; h++) {
    const start = 4 * h
    const vals = prices96.slice(start, start + 4).filter(v => v !== null && v !== undefined && v > 0)
    if (vals.length === 0) {
      hours.push(null)
    } else {
      hours.push(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100)
    }
  }
  return hours
}

// Parse the Excel pivot table
// Structure: each province has paired rows (实时 row with date, then 日前 row with null date)
// Some provinces have multiple sources (来源一/二/四), some have 分类 = "最终结果" without dates
// We only want rows that have actual dates and source data

const result = { realtime: {}, dayahead: {} }
let currentProvince = null
let currentDate = null
let currentSource = null

// Track which (province, date, type, source) combinations we've seen
// to handle duplicates (take the last/most complete one)
const seen = {}

for (let i = 2; i < rows.length; i++) {
  const row = rows[i]
  
  // Update current province if this row has one
  if (row[0]) {
    currentProvince = String(row[0]).trim()
  }
  
  // Update current date if this row has one
  if (row[1] !== null && row[1] !== undefined) {
    // Date might be Excel serial number or string
    let dateStr
    if (typeof row[1] === 'number') {
      // Excel serial date: 45658 = 2025-01-01
      const epoch = new Date(Date.UTC(1899, 11, 30)) // Excel epoch
      const d = new Date(epoch.getTime() + row[1] * 24 * 60 * 60 * 1000)
      const yyyy = d.getUTCFullYear()
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(d.getUTCDate()).padStart(2, '0')
      dateStr = `${yyyy}-${mm}-${dd}`
    } else if (typeof row[1] === 'string') {
      dateStr = row[1].trim()
      // Handle various date formats
      const m = dateStr.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)
      if (m) {
        dateStr = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
      } else {
        continue // skip unparseable dates
      }
    } else {
      continue
    }
    currentDate = dateStr
  }
  
  // Update current source
  if (row[2]) {
    currentSource = String(row[2]).trim()
  }
  
  const category = row[3] // 分类
  const type = row[4] // 类型: 实时, 日前, 中长期
  
  // Skip rows without a type or with "最终结果"/"临时结果" category (no date)
  if (!type || type === '中长期') continue
  if (category === '最终结果' || category === '临时结果') continue
  if (!currentProvince) continue
  if (!currentDate) continue
  
  // Map province name
  const provName = PROVINCE_MAP[currentProvince] || currentProvince
  if (!provName) continue
  
  // Extract 96 quarter-hour prices (cols 5-100)
  const prices96 = []
  for (let c = 5; c <= 100; c++) {
    const v = row[c]
    if (v === null || v === undefined || v === '' || v === 0) {
      prices96.push(null)
    } else if (typeof v === 'number') {
      prices96.push(v)
    } else if (typeof v === 'string') {
      const n = parseFloat(v)
      prices96.push(isNaN(n) ? null : n)
    } else {
      prices96.push(null)
    }
  }
  
  // Check if this row has enough valid prices (at least 24 valid quarters)
  const validCount = prices96.filter(p => p !== null && p > 0).length
  if (validCount < 24) continue
  
  // Aggregate to 24 hours
  const hours24 = aggregate96to24(prices96)
  
  // Check if at least 12 hours have data
  const validHours = hours24.filter(h => h !== null && h > 0).length
  if (validHours < 12) continue
  
  // Determine target bucket
  const typeKey = type === '实时' ? 'realtime' : type === '日前' ? 'dayahead' : null
  if (!typeKey) continue
  
  // Initialize province entry
  if (!result[typeKey][provName]) {
    result[typeKey][provName] = {}
  }
  
  // Handle special cases:
  // For 江苏, there might be 江南/江北 categories - take the first non-null one per date
  // For provinces with multiple sources, prefer 来源二 over 来源一
  
  const dedupKey = `${typeKey}:${provName}:${currentDate}`
  // If we already have this date, prefer the new entry if:
  // - current source is 来源二 (likely more complete) 
  // - or the new entry has more valid hours
  if (result[typeKey][provName][currentDate]) {
    // For 江南/江北 of 江苏, merge them
    if (provName === '江苏省' && (category === '江南' || category === '江北')) {
      // Merge: take non-null values from both
      const existing = result[typeKey][provName][currentDate]
      for (let h = 0; h < 24; h++) {
        if (existing[h] === null && hours24[h] !== null) {
          existing[h] = hours24[h]
        }
      }
      continue
    }
    // For multiple sources, prefer the one with more valid hours
    const existingValid = result[typeKey][provName][currentDate].filter(h => h !== null && h > 0).length
    if (validHours <= existingValid && currentSource !== '来源二') {
      continue // keep existing
    }
  }
  
  result[typeKey][provName][currentDate] = hours24
}

// Print summary
console.log('\n=== Generated JSON Summary ===')
for (const [typeKey, provData] of Object.entries(result)) {
  console.log(`\n${typeKey}: ${Object.keys(provData).length} provinces`)
  for (const [prov, dates] of Object.entries(provData)) {
    const sortedDates = Object.keys(dates).sort()
    console.log(`  ${prov}: ${sortedDates.length} dates (${sortedDates[0]} ~ ${sortedDates[sortedDates.length-1]})`)
  }
}

// Write the JSON
const outputPath = 'D:/算电协同平台/算电协同 2/public/data/spot-price.json'
writeFileSync(outputPath, JSON.stringify(result, null, 0))
console.log('\nWritten to:', outputPath)
console.log('File size:', (Buffer.byteLength(JSON.stringify(result)) / 1024).toFixed(0), 'KB')
