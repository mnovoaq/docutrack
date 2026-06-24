'use strict'

// Global DocuTrack Stop hook — installed once in ~/.claude/settings.json.
// Fires in every Claude Code session. Handles catch-all queuing and pending-file
// reporting for any DocuTrack project. Contains the authoritative logic so that
// a global update fixes all projects without requiring re-init.

const fs = require('fs')
const path = require('path')

const QUEUE_PATH = path.join(process.cwd(), '.docutrack', 'queue.json')
if (!fs.existsSync(QUEUE_PATH)) process.exit(0)

let queue
try {
  queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'))
} catch { process.exit(0) }

queue.pending = queue.pending || []

const SOURCE_DIRS = ['src', 'lib', 'app', 'pkg', 'internal', 'api', 'routes', 'controllers', 'handlers', 'packages']
const SOURCE_EXTS = new Set(['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx', '.py', '.go', '.rs', '.rb', '.java', '.cs', '.cpp', '.c', '.swift', '.kt'])
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '__pycache__', '.docutrack', 'docs', '.worktrees', 'coverage', '.turbo', '.claude'])
const IGNORE_RE   = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.d\.ts$/, /\.min\.js$/]

const root = process.cwd()
const lastClear = queue.lastClear ? new Date(queue.lastClear).getTime() : 0

// Prune any files that were queued before the last documentation run.
// This corrects state left by older project-level hooks that lacked the mtime check.
if (lastClear > 0 && queue.pending.length > 0) {
  const before = queue.pending.length
  queue.pending = queue.pending.filter(entry => {
    try {
      return fs.statSync(path.join(root, entry.file)).mtimeMs > lastClear
    } catch {
      return false
    }
  })
  if (queue.pending.length < before) {
    try { fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2)) } catch { /* ok */ }
  }
}

const queued = new Set(queue.pending.map(e => e.file))
const now = new Date().toISOString()
let caught = 0

const walk = (dir) => {
  if (!fs.existsSync(dir)) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name))
    } else if (e.isFile() && SOURCE_EXTS.has(path.extname(e.name).toLowerCase())) {
      if (IGNORE_RE.some(re => re.test(e.name))) continue
      const rel = path.relative(root, path.join(dir, e.name)).replace(/\\/g, '/')
      if (queued.has(rel)) continue
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

for (const dir of SOURCE_DIRS) walk(path.join(root, dir))

if (caught > 0) {
  try { fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2)) } catch { /* ok */ }
}

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
