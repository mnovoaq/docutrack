'use strict'

// Global DocuTrack Stop hook
// Installed once in ~/.claude/settings.json — fires in every Claude Code session
// Delegates to the project-level hook only if this project has been initialized

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const projectHook = path.join(process.cwd(), '.docutrack', 'hooks', 'on-stop.js')
if (!fs.existsSync(projectHook)) process.exit(0)

spawnSync(process.execPath, [projectHook], {
  stdio: 'inherit',
  cwd: process.cwd(),
})
process.exit(0)
