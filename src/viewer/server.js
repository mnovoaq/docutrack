'use strict'

const http = require('http')
const https = require('https')
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
    this.generating = false
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
    if (p === '/api/scan' && req.method === 'POST')          return this.serveScan(res)
    if (p === '/api/generate' && req.method === 'POST')      return this.serveGenerate(res, req)
    if (p === '/api/generate-arch' && req.method === 'POST') return this.serveGenerateArch(res, req)
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
    if (this.generating) {
      res.writeHead(409, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'Generation already in progress' }))
    }

    const apiKey = this.readApiKey()
    if (!apiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({
        error: 'no_api_key',
        message: 'ANTHROPIC_API_KEY not found. Set it in your environment or .env.local file.',
      }))
    }

    // Read request body for options (lang, force)
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      let opts = {}
      try { opts = JSON.parse(body) } catch { /* ok, use defaults */ }

      const lang = opts.lang || 'es'
      const force = !!opts.force

      const queuePath = path.join(this.root, '.docutrack', 'queue.json')
      let queue = { pending: [] }
      try { queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')) } catch { /* ok */ }

      let files = queue.pending.map(e => e.file)

      // --force: re-queue all source files regardless of existing docs
      if (force || files.length === 0) {
        files = this.scanSourceFiles()
        if (files.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'No source files found.' }))
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ started: true, total: files.length, lang }))

      this.runGeneration(apiKey, files, queuePath, lang, force).catch(err => {
        this.generating = false
        this.broadcast(`error:${err.message}`)
      })
    })
  }

  async runGeneration(apiKey, files, queuePath, lang = 'es', force = false) {
    this.generating = true
    fs.mkdirSync(path.join(this.root, 'docs', 'modules'), { recursive: true })

    let done = 0
    for (const file of files) {
      const fullPath = path.join(this.root, file)
      if (!fs.existsSync(fullPath)) { done++; continue }

      const isRoute = (file.includes('/api/') && (file.endsWith('route.ts') || file.endsWith('route.js')))
      const docName = isRoute ? this.routeDocName(file) : this.moduleDocName(file)
      const docPath = isRoute
        ? path.join(this.root, 'docs', 'api', docName + '.md')
        : path.join(this.root, 'docs', 'modules', docName + '.md')

      // Skip existing docs unless force=true
      if (!force && fs.existsSync(docPath) && fs.readFileSync(docPath, 'utf8').length > 200) {
        done++
        this.broadcast(`progress:${done}/${files.length}:skip:${file}`)
        continue
      }

      this.broadcast(`progress:${done}/${files.length}:working:${file}`)

      let content
      try { content = fs.readFileSync(fullPath, 'utf8') } catch { done++; continue }

      if (content.length > 8000) content = content.slice(0, 8000) + '\n// ... (truncated)'

      try {
        const doc = await this.generateDoc(apiKey, file, content, isRoute, lang)
        fs.mkdirSync(path.dirname(docPath), { recursive: true })
        fs.writeFileSync(docPath, doc)
        done++
        this.broadcast(`progress:${done}/${files.length}:done:${file}`)
        // NO per-file reload — sidebar updates in one shot at the end
      } catch (err) {
        done++
        this.broadcast(`progress:${done}/${files.length}:error:${file}`)
      }
    }

    // Clear the queue
    try { fs.writeFileSync(queuePath, JSON.stringify({ pending: [], lastClear: new Date().toISOString() }, null, 2)) } catch { /* ok */ }

    this.generating = false
    this.broadcast('reload')
    this.broadcast(`done:${done}`)
  }

  async generateDoc(apiKey, file, content, isRoute, lang = 'es') {
    const name = path.basename(file, path.extname(file))
    const ext = path.extname(file).slice(1)

    const langInstruction = lang === 'es'
      ? 'Escribe toda la documentación en español. Los títulos de sección también en español.'
      : 'Write all documentation in English.'

    const systemPrompt = `You are a technical writer generating concise module documentation for a software project.
Output ONLY the markdown document, no preamble or explanation.
${langInstruction}`

    const userPrompt = isRoute
      ? `Document this API route file. File: ${file}

\`\`\`${ext}
${content}
\`\`\`

Write a markdown doc with:
# ${name} API

**Route**: \`${this.fileToApiPath(file)}\`

## Endpoints
[List each exported HTTP method (GET/POST/etc), what it does, request params/body, response shape]

## Auth
[Authentication/authorization requirements if visible]

## Notes
[Anything non-obvious about this route]

Keep it concise and technical.`
      : `Document this source file. File: ${file}

\`\`\`${ext}
${content}
\`\`\`

Write a markdown doc with:
# ${name}

**Responsibility**: [one sentence — what this module does]

## Public API
[exported functions/classes with brief description of params and return value]

## Dependencies
[what it imports from — internal and external]

## Data Shapes
[key types, interfaces, schemas, Prisma models if relevant]

## Notes
[constraints, gotchas, non-obvious decisions — omit if nothing notable]

Keep it concise. Skip sections that don't apply.`

    const response = await this.callClaude(apiKey, systemPrompt, userPrompt)
    return response
  }

  callClaude(apiKey, system, user) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: user }],
      })

      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          try {
            const r = JSON.parse(data)
            if (r.content?.[0]?.text) resolve(r.content[0].text)
            else reject(new Error(r.error?.message || `API error ${res.statusCode}`))
          } catch (e) { reject(e) }
        })
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }

  readApiKey() {
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
    for (const envFile of ['.env.local', '.env']) {
      const p = path.join(this.root, envFile)
      if (!fs.existsSync(p)) continue
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^ANTHROPIC_API_KEY\s*=\s*(.+)/)
        if (m) return m[1].trim().replace(/^["']|["']$/g, '')
      }
    }
    return null
  }

  serveGenerateArch(res, req) {
    const apiKey = this.readApiKey()
    if (!apiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'no_api_key' }))
    }

    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      let opts = {}
      try { opts = JSON.parse(body) } catch { /* ok */ }
      const lang = opts.lang || 'es'

      // Gather project context
      let pkg = {}
      try { pkg = JSON.parse(fs.readFileSync(path.join(this.root, 'package.json'), 'utf8')) } catch { /* ok */ }

      const files = this.scanSourceFiles().slice(0, 80)
      const fileTree = files.join('\n')

      // Read a few key files for context
      const contextFiles = []
      for (const f of files.slice(0, 6)) {
        try {
          const content = fs.readFileSync(path.join(this.root, f), 'utf8').slice(0, 1500)
          contextFiles.push(`### ${f}\n\`\`\`\n${content}\n\`\`\``)
        } catch { /* ok */ }
      }

      // Read existing ARCHITECTURE.md (the template)
      let existingArch = ''
      try { existingArch = fs.readFileSync(path.join(this.root, 'ARCHITECTURE.md'), 'utf8') } catch { /* ok */ }

      const langInstruction = lang === 'es'
        ? 'Escribe toda la documentación en español. Los títulos de sección también en español.'
        : 'Write all documentation in English.'

      const system = `You are a senior software architect writing project documentation.
Output ONLY the markdown document. No preamble, no explanation.
${langInstruction}`

      const user = `Fill in this ARCHITECTURE.md for a real project. Replace ALL placeholder content with real information derived from the project files below.

Package.json:
\`\`\`json
${JSON.stringify({ name: pkg.name, description: pkg.description, dependencies: pkg.dependencies, devDependencies: pkg.devDependencies }, null, 2).slice(0, 2000)}
\`\`\`

Source file list (${files.length} files):
\`\`\`
${fileTree}
\`\`\`

Sample source files:
${contextFiles.join('\n\n')}

Current ARCHITECTURE.md template to fill in:
${existingArch}

Instructions:
- Fill every empty table cell and placeholder comment with real content derived from the project
- For the Tech Stack table: detect framework, styling, auth, database, ORM from package.json dependencies
- For Module Map: list the most important modules from the file list with their actual responsibilities
- For App Structure: show the real directory tree
- For Data Flow: describe the actual flow based on the code
- Keep the same markdown structure and headers
- Remove placeholder comments like <!-- Describe... -->
- If a section truly doesn't apply, write "N/A" rather than leaving it blank`

      try {
        const arch = await this.callClaude(apiKey, system, user)
        fs.writeFileSync(path.join(this.root, 'ARCHITECTURE.md'), arch)
        this.broadcast('reload')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
  }

  scanSourceFiles() {
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
    return found
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
