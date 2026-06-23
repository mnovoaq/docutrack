'use strict'

// Stop hook — fires when the Claude Code session ends
// If files are pending documentation, asks Claude to run the documentalista

const fs = require('fs')
const path = require('path')

const QUEUE_PATH = path.join('.docutrack', 'queue.json')

if (!fs.existsSync(QUEUE_PATH)) process.exit(0)

let queue
try {
  queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'))
} catch {
  process.exit(0)
}

if (!queue.pending || queue.pending.length === 0) process.exit(0)

const count = queue.pending.length
const shown = queue.pending.slice(0, 8)
const files = shown.map(e => `  - ${e.file}`).join('\n')
const overflow = count > 8 ? `\n  … and ${count - 8} more` : ''

console.log(`
╔══════════════════════════════════════════════════════════╗
║  DocuTrack — ${String(count).padEnd(3)} file(s) pending documentation       ║
╚══════════════════════════════════════════════════════════╝

${files}${overflow}

Please run the documentalista subagent to document these
files before ending the session:

  Task: "Run the documentalista to document all pending files"

The documentalista reads .docutrack/queue.json, writes a doc
for each pending file, and clears the queue automatically.
`)

process.exit(0)
