'use strict'

const fs = require('fs')
const net = require('net')
const path = require('path')
const { spawn } = require('child_process')

function isPortInUse(port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(true))
    server.once('listening', () => { server.close(); resolve(false) })
    server.listen(port, '127.0.0.1')
  })
}

function startServerDaemon(projectRoot, port = 4242) {
  const binPath = path.resolve(__dirname, '../../bin/docutrack.js')
  const child = spawn(process.execPath, [binPath, 'serve'], {
    cwd: projectRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()

  const pidFile = path.join(projectRoot, '.docutrack', 'server.pid')
  try {
    fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, port, startedAt: new Date().toISOString() }))
  } catch { /* ok */ }

  return { pid: child.pid, port }
}

function isServerRunning(projectRoot) {
  const pidFile = path.join(projectRoot, '.docutrack', 'server.pid')
  if (!fs.existsSync(pidFile)) return false
  try {
    const { pid } = JSON.parse(fs.readFileSync(pidFile, 'utf8'))
    process.kill(pid, 0)
    return true
  } catch {
    try { fs.unlinkSync(pidFile) } catch { /* ok */ }
    return false
  }
}

module.exports = { isPortInUse, startServerDaemon, isServerRunning }
