const fs = require('fs')
const path = require('path')

if (process.argv.length < 3) {
  console.error('Usage: node parseRomLd.cjs <esp32c3.rom.ld>')
  process.exit(1)
}

const filePath = process.argv[2]
const content = fs.readFileSync(filePath, 'utf8')

const symbolMap = {}
const regex = /(?:PROVIDE\()?\s*([\w\d_]+)\s*=\s*(0x[0-9a-fA-F]+)\s*\)?\s*;/g

let match
while ((match = regex.exec(content)) !== null) {
  const [_, symbol, address] = match
  symbolMap[address.toLowerCase()] = symbol
}

console.log(JSON.stringify(symbolMap, null, 2))
