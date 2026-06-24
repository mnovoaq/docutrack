'use strict'

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { write: writeQueue, read: readQueue } = require('../utils/queue')
const { isPortInUse, startServerDaemon, isServerRunning } = require('../utils/daemon')

const PORT = 4242
const SOURCE_DIRS = ['src', 'lib', 'app', 'pkg', 'internal', 'api', 'routes', 'controllers', 'handlers', 'packages']
const SOURCE_EXTS = new Set(['.js', '.ts', '.mjs', '.jsx', '.tsx', '.py', '.go'])
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '__pycache__', '.docutrack', 'docs', '.worktrees', 'coverage', '.turbo'])
const IGNORE_RE = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.d\.ts$/, /\.min\.js$/]

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, answer => { rl.close(); resolve(answer.trim().toLowerCase()) })
  })
}

function step(icon, msg) { console.log(`  ${icon}  ${msg}`) }

function collectSourceFiles(root) {
  const files = []
  const walk = (dir, depth = 0) => {
    if (depth > 6 || !fs.existsSync(dir)) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), depth + 1)
      } else if (e.isFile() && SOURCE_EXTS.has(path.extname(e.name))) {
        if (!IGNORE_RE.some(re => re.test(e.name))) {
          files.push(path.relative(root, path.join(dir, e.name)).replace(/\\/g, '/'))
        }
      }
    }
  }
  for (const dir of SOURCE_DIRS) walk(path.join(root, dir))
  // Root-level source files (index.js, server.js, main.go, etc.)
  try {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (e.isFile() && SOURCE_EXTS.has(path.extname(e.name)) && !IGNORE_RE.some(re => re.test(e.name))) {
        files.push(e.name)
      }
    }
  } catch { /* ok */ }
  return files
}

async function run(args) {
  const cwd = process.cwd()

  console.log('\n  DocuTrack — setup\n  ' + '─'.repeat(40))

  // ── 1. Initialize if needed ───────────────────────────────────
  if (!fs.existsSync(path.join(cwd, '.docutrack'))) {
    step('⚙', 'Initializing DocuTrack...')
    console.log('')
    await require('./init').run([...(args || []), '--no-serve'])
    console.log('\n  ' + '─'.repeat(40))
  } else {
    step('✓', 'DocuTrack already initialized')
  }

  // ── 2. Scan existing source files ─────────────────────────────
  // read/write use a relative path (.docutrack/queue.json) — don't pass cwd as queuePath
  const queue = readQueue()
  const alreadyQueued = new Set(queue.pending.map(e => e.file))

  if (queue.pending.length === 0) {
    const all = collectSourceFiles(cwd)
    const newFiles = all.filter(f => !alreadyQueued.has(f))
    if (newFiles.length > 0) {
      const now = new Date().toISOString()
      for (const f of newFiles) queue.pending.push({ file: f, addedAt: now })
      writeQueue(queue)
      step('📂', `Scanned ${newFiles.length} source file(s) — queued for documentation`)
    } else {
      step('○', 'No existing source files found — fresh project')
    }
  } else {
    step('✓', `${queue.pending.length} file(s) already in documentation queue`)
  }

  console.log('')

  // ── 3. Start viewer server (with y/n prompt) ──────────────────
  const portBusy = await isPortInUse(PORT)
  const serverAlive = isServerRunning(cwd)

  if (portBusy || serverAlive) {
    step('✓', `Viewer already running → http://localhost:${PORT}`)
  } else {
    const answer = await ask(`  Start DocuTrack viewer on port ${PORT}? (y/n): `)
    console.log('')
    if (answer === 'y' || answer === 'yes') {
      const { pid } = startServerDaemon(cwd, PORT)
      await new Promise(r => setTimeout(r, 900))
      const up = await isPortInUse(PORT)
      step('✓', `Viewer ${up ? 'started' : 'starting'} → http://localhost:${PORT}  (pid ${pid})`)
    } else {
      step('○', 'Viewer skipped — run "docutrack serve" when ready')
    }
  }

  // ── 4. Next-step instructions ─────────────────────────────────
  const pending = readQueue().pending.length
  console.log('\n  ' + '─'.repeat(40))

  if (pending > 0) {
    console.log(`\n  ${pending} file(s) ready to document.\n`)
    console.log('  In Claude Code, say:')
    console.log('    "Run the documentalista to document all pending files"\n')
    console.log('  The documentalista subagent will process every file in the')
    console.log('  queue and write docs automatically.\n')
  } else {
    console.log('\n  DocuTrack is active.\n')
    console.log('  • Every file Claude writes gets added to the queue automatically')
    console.log('  • The Stop hook reminds Claude to document at session end')
    console.log('  • Tell Claude: "Run the documentalista" to process the queue\n')
  }
}

module.exports = { run }
