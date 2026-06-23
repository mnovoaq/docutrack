'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')
const { findStale } = require('../utils/stale')
const { analyzeComplexity } = require('../analyzer/complexity')
const { analyzeDrift } = require('../utils/drift')

const HTML_PATH = path.join(__dirname, 'index.html')

class DocuTrackServer {
  constructor(projectRoot, port = 4242) {
    this.root = projectRoot
    this.port = port
    this.sseClients = []
  }

  start() {
    this.server = http.createServer((req, res) => this.route(req, res))
    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`\n  DocuTrack docs → http://localhost:${this.port}\n`)
      console.log('  Press Ctrl+C to stop.\n')
    })
    this.watchDocs()
    return this
  }

  route(req, res) {
    const reqUrl = new URL(req.url, `http://127.0.0.1:${this.port}`)
    const p = reqUrl.pathname

    res.setHeader('Access-Control-Allow-Origin', '*')

    if (p === '/' || p === '/index.html') return this.serveShell(res)
    if (p === '/api/tree')       return this.serveTree(res)
    if (p === '/api/content')    return this.serveContent(res, reqUrl.searchParams.get('path'))
    if (p === '/api/status')     return this.serveStatus(res)
    if (p === '/api/openapi')    return this.serveOpenAPI(res)
    if (p === '/api/check')      return this.serveCheck(res)
    if (p === '/api/complexity') return this.serveComplexity(res)
    if (p === '/api/scan' && req.method === 'POST')           return this.serveScan(res)
    if (p === '/api/generate' && req.method === 'POST')      return this.serveGenerate(res, req)
    if (p === '/api/search')                                 return this.serveSearch(res, reqUrl.searchParams.get('q'))
    if (p === '/events')                                     return this.serveSSE(req, res)

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  }

  serveShell(res) {
    const html = fs.readFileSync(HTML_PATH, 'utf8')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  }

  serveTree(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(this.buildTree()))
  }

  serveContent(res, filePath) {
    if (!filePath) {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      return res.end('Missing path parameter')
    }

    // Allow only docs/, ARCHITECTURE.md, and a few safe root files
    const normalized = filePath.replace(/\\/g, '/').replace(/^\//, '')
    const SAFE_ROOT = new Set(['ARCHITECTURE.md', 'package.json', 'README.md'])
    const allowed = SAFE_ROOT.has(normalized) || normalized.startsWith('docs/')
    if (!allowed) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      return res.end('Forbidden')
    }

    const fullPath = path.join(this.root, normalized)
    if (!fs.existsSync(fullPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      return res.end('File not found')
    }

    const content = fs.readFileSync(fullPath, 'utf8')
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(content)
  }

  serveOpenAPI(res) {
    const specPath = path.join(this.root, 'docs', 'api', 'openapi.json')
    if (!fs.existsSync(specPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'No spec found. Run: npx docutrack analyze' }))
    }
    const spec = fs.readFileSync(specPath, 'utf8')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(spec)
  }

  serveStatus(res) {
    const queuePath = path.join(this.root, '.docutrack', 'queue.json')
    let queue = { pending: [], lastClear: null }
    try {
      if (fs.existsSync(queuePath)) queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'))
    } catch { /* ignore */ }

    const docCount = this.countDocs()
    const stale = findStale(this.root)
    const coverage = docCount + queue.pending.length > 0
      ? Math.round((docCount / (docCount + queue.pending.length)) * 100)
      : 100

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      pending: queue.pending.length,
      pendingFiles: queue.pending,
      docCount,
      coverage,
      stale: stale.map(s => ({ doc: s.doc, source: s.source, staleSinceMs: s.staleSinceMs })),
    }))
  }

  serveCheck(res) {
    const queuePath = path.join(this.root, '.docutrack', 'queue.json')
    let queue = { pending: [] }
    try { queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')) } catch { /* ok */ }

    let drift = []
    try { drift = analyzeDrift(this.root) } catch { /* ok */ }

    let complexity = { summary: { total: 0, critical: 0, warnings: 0, healthy: 0 }, files: [] }
    try { complexity = analyzeComplexity(this.root) } catch { /* ok */ }

    const stale = findStale(this.root)

    const critical = complexity.files.filter(f => f.warnings.some(w => w.level === 'critical'))
      .map(f => ({ file: path.relative(this.root, f.file), score: f.score, warnings: f.warnings }))
      .slice(0, 10)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      pending: queue.pending.length,
      stale: stale.length,
      drift: drift.map(d => ({ module: d.module, severity: d.severity, undocumented: d.undocumented.slice(0, 5), orphaned: d.orphaned.slice(0, 5) })),
      complexity: { summary: complexity.summary, critical },
      ok: queue.pending.length === 0 && stale.length === 0 && drift.filter(d => d.severity === 'high').length === 0 && critical.length === 0,
    }))
  }

  serveComplexity(res) {
    let report = { files: [], summary: { total: 0, critical: 0, warnings: 0, healthy: 0 } }
    try { report = analyzeComplexity(this.root) } catch { /* ok */ }

    const top = report.files.filter(f => f.warnings.length > 0).slice(0, 20).map(f => ({
      file: path.relative(this.root, f.file),
      score: f.score,
      lines: f.lines,
      exports: f.exports,
      complexity: f.complexity,
      maxNesting: f.maxNesting,
      warnings: f.warnings,
    }))

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ summary: report.summary, files: top }))
  }

  serveScan(res) {
    const SOURCE_DIRS = ['src', 'lib', 'app', 'pkg', 'internal', 'api', 'routes', 'controllers', 'handlers']
    const SOURCE_EXTS = new Set(['.js', '.ts', '.mjs', '.jsx', '.tsx', '.py', '.go'])
    const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '__pycache__', '.docutrack', 'docs', '.worktrees', 'coverage', '.turbo'])
    const IGNORE_RE = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.d\.ts$/, /\.min\.js$/]

    const found = []
    const walk = (dir, depth = 0) => {
      if (depth > 6) return
      let entries
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), depth + 1)
        } else if (e.isFile() && SOURCE_EXTS.has(path.extname(e.name))) {
          if (!IGNORE_RE.some(re => re.test(e.name))) {
            found.push(path.relative(this.root, path.join(dir, e.name)).replace(/\\/g, '/'))
          }
        }
      }
    }

    for (const dir of SOURCE_DIRS) {
      const full = path.join(this.root, dir)
      if (fs.existsSync(full)) walk(full)
    }

    // Load existing queue and add new files
    const queuePath = path.join(this.root, '.docutrack', 'queue.json')
    let queue = { pending: [], lastClear: null }
    try { queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')) } catch { /* ok */ }

    const alreadyQueued = new Set(queue.pending.map(e => e.file))
    const newFiles = found.filter(f => !alreadyQueued.has(f))
    const now = new Date().toISOString()
    for (const f of newFiles) queue.pending.push({ file: f, addedAt: now })

    try {
      fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: err.message }))
    }

    // Notify SSE clients so sidebar updates immediately
    this.broadcast('reload')

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      queued: newFiles.length,
      skipped: found.length - newFiles.length,
      total: found.length,
      files: newFiles.slice(0, 5),
      hasMore: newFiles.length > 5,
    }))
  }

  serveGenerate(res, req) {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      try {
        const { lang = 'es', force = false } = JSON.parse(body || '{}')
        const triggerPath = path.join(this.root, '.docutrack', 'generate.trigger')
        fs.writeFileSync(triggerPath, JSON.stringify({ lang, force, requestedAt: new Date().toISOString() }))
      } catch { /* ok */ }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ triggered: true }))
    })
  }

  moduleDocName(file) {
    // app/dashboard/SearchBar.tsx → dashboard-SearchBar
    // lib/rules-engine.ts        → rules-engine
    // src/utils/queue.js         → utils-queue
    const noExt = file.replace(/\.[^.]+$/, '')
    const parts = noExt.replace(/\\/g, '/').split('/')
    // Drop leading src/lib/app if only one level below
    if (['src', 'lib', 'app'].includes(parts[0]) && parts.length === 2) return parts[1]
    // For deeper paths, join last 2 segments with dash
    return parts.slice(-2).join('-')
  }

  routeDocName(file) {
    return file
      .replace(/^app\/api\//, '')
      .replace(/\/route\.[jt]s$/, '')
      .replace(/\[([^\]]+)\]/g, '$1')
      .replace(/\//g, '-') || 'api'
  }

  fileToApiPath(file) {
    return '/' + file
      .replace(/^app\//, '')
      .replace(/\/route\.[jt]s$/, '')
      .replace(/\[([^\]]+)\]/g, '{$1}')
  }

  serveSearch(res, q) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    if (!q || q.length < 2) return res.end(JSON.stringify([]))

    const lq = q.toLowerCase()
    const results = []

    const searchFile = (fullPath, relPath) => {
      if (results.length >= 8) return
      try {
        const content = fs.readFileSync(fullPath, 'utf8')
        const lc = content.toLowerCase()
        const idx = lc.indexOf(lq)
        if (idx === -1) return
        const start = Math.max(0, idx - 50)
        const end = Math.min(content.length, idx + lq.length + 100)
        const snippet = (start > 0 ? '…' : '') + content.slice(start, end).replace(/[#*`\n]/g, ' ').replace(/\s+/g, ' ').trim() + (end < content.length ? '…' : '')
        const titleMatch = content.match(/^#\s+(.+)/m)
        const title = titleMatch ? titleMatch[1].trim() : path.basename(relPath, '.md')
        results.push({ path: relPath.replace(/\\/g, '/'), title, snippet })
      } catch { /* skip */ }
    }

    const archPath = path.join(this.root, 'ARCHITECTURE.md')
    if (fs.existsSync(archPath)) searchFile(archPath, 'ARCHITECTURE.md')

    const walk = (dir) => {
      if (results.length >= 8 || !fs.existsSync(dir)) return
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(dir, e.name))
        else if (e.name.endsWith('.md') && e.name !== '.gitkeep') {
          const full = path.join(dir, e.name)
          searchFile(full, path.relative(this.root, full))
        }
      }
    }
    walk(path.join(this.root, 'docs'))

    res.end(JSON.stringify(results))
  }

  serveSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
    res.write('data: connected\n\n')

    this.sseClients.push(res)
    req.on('close', () => {
      this.sseClients = this.sseClients.filter(c => c !== res)
    })
  }

  broadcast(event) {
    for (const client of this.sseClients) {
      client.write(`data: ${event}\n\n`)
    }
  }

  buildTree() {
    const tree = { architecture: null, modules: [], decisions: [], api: [] }

    const arch = path.join(this.root, 'ARCHITECTURE.md')
    if (fs.existsSync(arch)) tree.architecture = 'ARCHITECTURE.md'

    const readDir = (rel, key) => {
      const full = path.join(this.root, rel)
      if (!fs.existsSync(full)) return
      for (const e of fs.readdirSync(full, { withFileTypes: true })) {
        if (e.isFile() && e.name.endsWith('.md') && e.name !== '.gitkeep') {
          tree[key].push({ path: `${rel}/${e.name}`, name: e.name.replace('.md', '') })
        }
      }
      tree[key].sort((a, b) => a.name.localeCompare(b.name))
    }

    readDir('docs/modules', 'modules')
    readDir('docs/decisions', 'decisions')
    readDir('docs/api', 'api')

    return tree
  }

  countDocs() {
    let n = 0
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(dir, e.name))
        else if (e.name.endsWith('.md') && e.name !== '.gitkeep') n++
      }
    }
    walk(path.join(this.root, 'docs'))
    return n
  }

  watchDocs() {
    const debounce = (fn, ms) => {
      let t
      return () => { clearTimeout(t); t = setTimeout(fn, ms) }
    }
    const reload = debounce(() => this.broadcast('reload'), 300)

    const targets = [
      path.join(this.root, 'docs'),
      path.join(this.root, 'ARCHITECTURE.md'),
      path.join(this.root, '.docutrack', 'queue.json'),
    ]
    for (const t of targets) {
      if (fs.existsSync(t)) {
        try { fs.watch(t, { recursive: true }, reload) } catch { /* ignore */ }
      }
    }
  }
}

module.exports = DocuTrackServer
