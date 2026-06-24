'use strict'

const fs = require('fs')
const path = require('path')
const net = require('net')

const PORT = 4242

function isPortInUse(port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(true))
    server.once('listening', () => { server.close(); resolve(false) })
    server.listen(port, '127.0.0.1')
  })
}

async function run() {
  const busy = await isPortInUse(PORT)
  if (!busy) {
    console.log(`\n  No docutrack server running on port ${PORT}.\n`)
    return
  }

  // Try PID file first (clean shutdown)
  const pidFile = path.join('.docutrack', 'server.pid')
  if (fs.existsSync(pidFile)) {
    try {
      const { pid } = JSON.parse(fs.readFileSync(pidFile, 'utf8'))
      process.kill(pid, 'SIGTERM')
      fs.unlinkSync(pidFile)
      await new Promise(r => setTimeout(r, 400))
      console.log(`\n  ✓  Stopped docutrack server (pid ${pid})\n`)
      return
    } catch { /* fall through to port-based kill */ }
  }

  // Fallback: find and kill by port (platform-specific)
  try {
    const { execSync } = require('child_process')
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr ":${PORT}.*LISTENING"`, { encoding: 'utf8' })
      const pid = out.trim().split(/\s+/).pop()
      if (pid && !isNaN(pid)) {
        execSync(`taskkill /PID ${pid} /F`)
        console.log(`\n  ✓  Stopped docutrack server (pid ${pid})\n`)
      }
    } else {
      execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`)
      console.log(`\n  ✓  Stopped docutrack server on port ${PORT}\n`)
    }
  } catch {
    console.log(`\n  Could not stop server automatically. Kill port ${PORT} manually.\n`)
  }
}

module.exports = { run }
