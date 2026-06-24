'use strict'

// PostToolUse hook — fires after every Write, Edit, or MultiEdit
// Adds the modified file to .docutrack/queue.json

const fs = require('fs')
const path = require('path')

// Only source code files belong in the documentation queue
const SOURCE_EXTS = new Set(['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx', '.py', '.go', '.rs', '.rb', '.java', '.cs', '.cpp', '.c', '.swift', '.kt'])

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { raw += chunk })
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw)
    const filePath = extractFilePath(event)
    if (filePath) addToQueue(filePath)
  } catch {
    // Never crash the agent session over a hook error
  }
  process.exit(0)
})

function extractFilePath(event) {
  const { tool_name, tool_input } = event
  if (!tool_input) return null
  if (tool_name === 'Write' || tool_name === 'Edit' || tool_name === 'MultiEdit') {
    return tool_input.file_path || null
  }
  return null
}

function addToQueue(filePath) {
  const normalized = filePath.replace(/\\/g, '/')

  // Filter by extension — only source code files
  const ext = path.extname(normalized).toLowerCase()
  if (!SOURCE_EXTS.has(ext)) return

  // Filter by path — works for both relative and absolute paths
  const IGNORED = ['docs/', '.docutrack/', '.claude/', 'node_modules/', '.git/', 'dist/', 'build/', '.next/', 'coverage/']
  if (IGNORED.some(seg => normalized.includes('/' + seg) || normalized.startsWith(seg))) return

  const queuePath = path.join('.docutrack', 'queue.json')
  if (!fs.existsSync(path.dirname(queuePath))) return // not initialized

  let queue = { pending: [], lastClear: null }
  try { queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')) } catch { /* start fresh */ }

  if (queue.pending.some(e => e.file === normalized)) return

  queue.pending.push({ file: normalized, addedAt: new Date().toISOString() })
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2))
}
