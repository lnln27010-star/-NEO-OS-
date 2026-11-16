import fs from 'node:fs'
const file = 'public/models/northbridge/tileset/northbridge.b3dm'
const data = fs.readFileSync(file)
const oldValue = Buffer.from('{"BATCH_LENGTH":0}  ')
const newValue = Buffer.from('{"BATCH_LENGTH":1}  ')
const index = data.indexOf(oldValue)
if (index < 0) throw new Error('B3DM feature table JSON not found')
newValue.copy(data, index)
fs.writeFileSync(file, data)
console.log(`patched ${file}`)
