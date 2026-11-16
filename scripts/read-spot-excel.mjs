import XLSX from 'xlsx'

const filePath = 'C:/Users/EDY/WorkBuddy/2026-10-10-22-32-52/现货市场数据.xlsx'
const wb = XLSX.readFile(filePath)
const ws = wb.Sheets['透视表']
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })

// Check unique values for 来源 (col 2), 分类 (col 3), 类型 (col 4)
const sources = new Set()
const categories = new Set()
const types = new Set()
const provinces = new Set()

let currentProvince = null
for (let i = 2; i < rows.length; i++) {
  if (rows[i][0]) currentProvince = rows[i][0]
  if (currentProvince) provinces.add(currentProvince)
  if (rows[i][2]) sources.add(rows[i][2])
  if (rows[i][3]) categories.add(rows[i][3])
  if (rows[i][4]) types.add(rows[i][4])
}

console.log('Provinces:', [...provinces].sort())
console.log('Sources:', [...sources])
console.log('Categories:', [...categories])
console.log('Types:', [...types])

// Check: for each province, how many 实时 vs 日前 rows?
const counts = {}
currentProvince = null
for (let i = 2; i < rows.length; i++) {
  if (rows[i][0]) currentProvince = rows[i][0]
  if (!currentProvince) continue
  const type = rows[i][4]
  if (!type) continue
  if (!counts[currentProvince]) counts[currentProvince] = { 实时: 0, 日前: 0 }
  if (type === '实时') counts[currentProvince].实时++
  if (type === '日前') counts[currentProvince].日前++
}

console.log('\nProvince row counts:')
for (const [prov, c] of Object.entries(counts).sort()) {
  console.log(`  ${prov}: 实时=${c.实时} 日前=${c.日前}`)
}

// Check what 分类 = "最终结果" means
console.log('\n\nSample rows with 分类 = "最终结果":')
let count = 0
currentProvince = null
for (let i = 2; i < rows.length && count < 10; i++) {
  if (rows[i][0]) currentProvince = rows[i][0]
  if (rows[i][3] === '最终结果') {
    console.log(`  Row ${i}: prov=${currentProvince}, date=${rows[i][1]}, source=${rows[i][2]}, cat=${rows[i][3]}, type=${rows[i][4]}, first_price=${rows[i][5]}`)
    count++
  }
}

// Also check rows with 分类 = null
console.log('\nSample rows with 分类 = null:')
count = 0
currentProvince = null
for (let i = 2; i < rows.length && count < 10; i++) {
  if (rows[i][0]) currentProvince = rows[i][0]
  if (rows[i][3] === null || rows[i][3] === undefined) {
    console.log(`  Row ${i}: prov=${currentProvince}, date=${rows[i][1]}, source=${rows[i][2]}, cat=${rows[i][3]}, type=${rows[i][4]}, first_price=${rows[i][5]}`)
    count++
  }
}
