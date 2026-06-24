'use strict'

const fs = require('fs')
const path = require('path')
const { analyze } = require('../analyzer/index')

const OUT_PATH = path.join('docs', 'api', 'openapi.json')

async function run(args) {
  const projectRoot = process.cwd()

  if (!fs.existsSync('.docutrack')) {
    console.log('\nDocuTrack is not initialized. Run "npx docutrack init" first.\n')
    process.exit(1)
  }

  const quiet = args.includes('--quiet') || args.includes('-q')

  if (!quiet) console.log('\nDocuTrack — analyzing project routes...\n')

  const spec = analyze(projectRoot)
  const endpointCount = Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).length, 0)

  if (!quiet) {
    console.log(`  Project      : ${spec.info.title}`)
    console.log(`  Framework    : ${spec.info.description.match(/Framework: (.+)\./)?.[1] || 'unknown'}`)
    console.log(`  Endpoints    : ${endpointCount}`)
    console.log(`  Output       : ${OUT_PATH}\n`)
  }

  const outDir = path.dirname(OUT_PATH)
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(spec, null, 2))

  if (!quiet) {
    if (endpointCount === 0) {
      console.log('  No routes detected. Make sure your routes are in one of:')
      console.log('  routes/, src/routes/, api/, src/api/, controllers/, src/controllers/\n')
    } else {
      console.log(`  Done. Open "docutrack serve" and click API Explorer to browse.\n`)
    }
  }

  return spec
}

module.exports = { run }
