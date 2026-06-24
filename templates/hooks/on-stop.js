'use strict'

// Stop hook — fires when the Claude Code session ends
// 1. Catch-all: queues any source files that the PostToolUse hook missed
//    (happens when docutrack init ran mid-session, before hooks were active)
// 2. Reports pending files and asks Claude to run the documentalista

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

queue.pending = queue.pending || []

// ── Catch-all scan ─────────────────────────────────────────────
// Add any source files not yet in the queue (catches files created
// before the PostToolUse hook was active in this session)
const SOURCE_DIRS = ['src', 'lib', 'app', 'pkg', 'internal', 'api', 'routes', 'controllers', 'handlers', 'packages']
const SOURCE_EXTS = new Set(['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx', '.py', '.go', '.rs', '.rb', '.java', '.cs', '.cpp', '.c', '.swift', '.kt'])
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '__pycache__', '.docutrack', 'docs', '.worktrees', 'coverage', '.turbo', '.claude'])
const IGNORE_RE   = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.d\.ts$/, /\.min\.js$/]

const queued = new Set(queue.pending.map(e => e.file))
const lastClear = queue.lastClear ? new Date(queue.lastClear).getTime() : 0
const now = new Date().toISOString()
let caught = 0

const walk = (dir, root) => {
  if (!fs.existsSync(dir)) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), root)
    } else if (e.isFile() && SOURCE_EXTS.has(path.extname(e.name).toLowerCase())) {
      if (IGNORE_RE.some(re => re.test(e.name))) continue
      const rel = path.relative(root, path.join(dir, e.name)).replace(/\\/g, '/')
      if (queued.has(rel)) continue
      // Only catch-all files modified AFTER the last documentation run
      // This prevents re-queuing already-documented files on every session end
      if (lastClear > 0) {
        try {
          const mtime = fs.statSync(path.join(dir, e.name)).mtimeMs
          if (mtime <= lastClear) continue
        } catch { continue }
      }
      queue.pending.push({ file: rel, addedAt: now })
      queued.add(rel)
      caught++
    }
  }
}

const root = process.cwd()
for (const dir of SOURCE_DIRS) walk(path.join(root, dir), root)

if (caught > 0) {
  try { fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2)) } catch { /* ok */ }
}

// ── Report ─────────────────────────────────────────────────────
const count = queue.pending.length
if (count === 0) process.exit(0)

const shown = queue.pending.slice(0, 8)
const files = shown.map(e => `  - ${e.file}`).join('\n')
const overflow = count > 8 ? `\n  … and ${count - 8} more` : ''
const caughtNote = caught > 0 ? `\n  (${caught} file(s) added by catch-all scan)\n` : ''

console.log(`
╔══════════════════════════════════════════════════════════╗
║  DocuTrack — ${String(count).padEnd(3)} file(s) pending documentation       ║
╚══════════════════════════════════════════════════════════╝
${caughtNote}
${files}${overflow}

Please run the documentalista subagent to document these
files before ending the session:

  Task: "Run the documentalista to document all pending files"

The documentalista reads .docutrack/queue.json, writes a doc
for each pending file, and clears the queue automatically.
`)

process.exit(0)
