'use strict'

const fs = require('fs')
const path = require('path')
const DocuTrackServer = require('../viewer/server')
const analyzeCmd = require('./analyze')

async function run(args) {
  if (!fs.existsSync('.docutrack')) {
    console.log('\nDocuTrack is not initialized. Run "npx docutrack init" first.\n')
    process.exit(1)
  }

  const port = parsePort(args) || 4242
  const projectRoot = process.cwd()

  // Auto-analyze on serve startup (quiet mode)
  await analyzeCmd.run(['--quiet'])

  const server = new DocuTrackServer(projectRoot, port).start()

  // Write PID file so `docutrack stop` can kill this server cleanly
  const pidFile = path.join('.docutrack', 'server.pid')
  try {
    fs.writeFileSync(pidFile, JSON.stringify({ pid: process.pid, port, startedAt: new Date().toISOString() }))
  } catch { /* ok */ }

  // Open browser after a short delay
  setTimeout(() => tryOpenBrowser(`http://localhost:${port}`), 800)

  // Keep process alive
  const cleanup = () => {
    try { fs.unlinkSync(pidFile) } catch { /* ok */ }
    console.log('\n\n  DocuTrack server stopped.\n')
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

function parsePort(args) {
  const i = args.indexOf('--port')
  if (i !== -1 && args[i + 1]) return parseInt(args[i + 1], 10)
  const p = args.find(a => /^--port=\d+$/.test(a))
  if (p) return parseInt(p.split('=')[1], 10)
  return null
}

function tryOpenBrowser(url) {
  const { exec } = require('child_process')
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`
  exec(cmd, () => {}) // ignore errors — browser open is best-effort
}

module.exports = { run }
