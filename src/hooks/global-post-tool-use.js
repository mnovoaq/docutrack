'use strict'

// Global DocuTrack PostToolUse hook
// Installed once in ~/.claude/settings.json — fires in every Claude Code session
// Delegates to the project-level hook only if this project has been initialized

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const projectHook = path.join(process.cwd(), '.docutrack', 'hooks', 'post-tool-use.js')
if (!fs.existsSync(projectHook)) process.exit(0)

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  spawnSync(process.execPath, [projectHook], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: process.cwd(),
  })
  process.exit(0)
})
