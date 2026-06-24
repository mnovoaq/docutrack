'use strict'

const fs = require('fs')
const path = require('path')
const { write: writeQueue, read: readQueue } = require('../utils/queue')

const SOURCE_DIRS = ['src', 'lib', 'app', 'pkg', 'internal', 'api', 'routes', 'controllers', 'handlers', 'packages']
const SOURCE_EXTS = new Set(['.js', '.ts', '.mjs', '.jsx', '.tsx', '.py', '.go'])
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '__pycache__', '.docutrack', 'docs', '.worktrees', 'coverage', '.turbo'])
const IGNORE_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.d\.ts$/, /\.min\.js$/]

async function run(args) {
  if (!fs.existsSync('.docutrack')) {
    console.log('\nDocuTrack is not initialized. Run "npx docutrack init" first.\n')
    process.exit(1)
  }

  const root = process.cwd()
  const force = args.includes('--force')
  const dryRun = args.includes('--dry-run')

  console.log('\nDocuTrack — scanning existing project files\n')

  const existing = readQueue(root)
  const alreadyQueued = new Set(existing.pending.map(e => e.file))

  // Find all source files — walk from root to handle any project structure
  const files = []
  walk(root, files, root)

  if (files.length === 0) {
    console.log('  No source files found to scan.\n')
    return
  }

  // Separate new vs already-queued
  const newFiles = files.filter(f => !alreadyQueued.has(f))
  const skipped = files.length - newFiles.length

  if (newFiles.length === 0 && !force) {
    console.log(`  All ${files.length} files already in queue.\n`)
    console.log('  Run "docutrack status" to see the full queue.\n')
    return
  }

  if (dryRun) {
    console.log(`  Would queue ${newFiles.length} files (${skipped} already queued):\n`)
    for (const f of newFiles.slice(0, 20)) console.log(`    ${f}`)
    if (newFiles.length > 20) console.log(`    …and ${newFiles.length - 20} more`)
    console.log()
    return
  }

  // Add all to queue
  const queue = readQueue(root)
  const now = new Date().toISOString()
  for (const f of newFiles) {
    queue.pending.push({ file: f, addedAt: now })
  }
  writeQueue(queue)

  console.log(`  Queued ${newFiles.length} file${newFiles.length !== 1 ? 's' : ''}`)
  if (skipped > 0) console.log(`  Skipped ${skipped} already in queue`)

  // Group by dir for summary
  const byDir = {}
  for (const f of newFiles) {
    const dir = f.split('/')[0]
    byDir[dir] = (byDir[dir] || 0) + 1
  }
  console.log()
  for (const [dir, count] of Object.entries(byDir).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${dir}/  →  ${count} file${count !== 1 ? 's' : ''}`)
  }

  console.log(`
Next step — run the documentalista subagent to generate docs for all queued files:

  In your Claude Code session, say:
  "Run the documentalista subagent to document all pending files"

  Or use: /arch-review (to see what needs docs first)

  The agent will read each file and write docs/modules/<name>.md for every module.
  This may take a few minutes for large projects.
`)
}

function walk(dir, acc, root, depth = 0) {
  if (depth > 6) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        walk(path.join(dir, entry.name), acc, root, depth + 1)
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name)
      if (!SOURCE_EXTS.has(ext)) continue
      if (IGNORE_PATTERNS.some(re => re.test(entry.name))) continue
      const rel = path.relative(root, path.join(dir, entry.name)).replace(/\\/g, '/')
      acc.push(rel)
    }
  }
}

module.exports = { run }
