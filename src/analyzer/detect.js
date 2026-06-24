'use strict'

const fs = require('fs')
const path = require('path')

const JS_EXTS = ['.js', '.ts', '.mjs', '.cjs']
const PY_EXTS = ['.py']
const GO_EXTS = ['.go']

const JS_ROUTE_DIRS = [
  'routes', 'src/routes',
  'api', 'src/api',
  'controllers', 'src/controllers',
  'handlers', 'src/handlers',
  'routers', 'src/routers',
]

const PY_ROUTE_DIRS = [
  'routers', 'app/routers',
  'api', 'app/api',
  'routes', 'app/routes',
  'src', 'src/routers', 'src/api', 'src/routes',
]
const GO_ROUTE_DIRS = ['internal/handlers', 'handlers', 'api', 'cmd']

function detectFramework(root) {
  // Python project?
  const isPython = fs.existsSync(path.join(root, 'requirements.txt'))
    || fs.existsSync(path.join(root, 'pyproject.toml'))
    || fs.existsSync(path.join(root, 'setup.py'))
    || fs.existsSync(path.join(root, 'Pipfile'))
    || ['main.py', 'app.py', 'server.py', 'asgi.py', 'wsgi.py'].some(f => fs.existsSync(path.join(root, f)))
  if (isPython) {
    const isFastAPI = checkFileContent(root, ['requirements.txt', 'pyproject.toml', 'Pipfile', 'main.py', 'app.py', 'server.py'], 'fastapi')
    const framework = isFastAPI ? 'fastapi' : 'python'
    const routeFiles = findFiles(root, PY_ROUTE_DIRS, PY_EXTS)
    // Also include root-level entry files common in FastAPI projects
    for (const candidate of ['main.py', 'app.py', 'server.py', 'asgi.py']) {
      const full = path.join(root, candidate)
      if (fs.existsSync(full) && !routeFiles.includes(full)) routeFiles.push(full)
    }
    return { framework, name: path.basename(root), version: '0.0.0', routeFiles, lang: 'python' }
  }

  // Go project?
  if (fs.existsSync(path.join(root, 'go.mod'))) {
    const modContent = fs.readFileSync(path.join(root, 'go.mod'), 'utf8')
    const modMatch = modContent.match(/^module\s+(\S+)/m)
    return { framework: 'go', name: modMatch?.[1]?.split('/').pop() || path.basename(root), version: '0.0.0', routeFiles: findFiles(root, GO_ROUTE_DIRS, GO_EXTS), lang: 'go' }
  }

  // Node.js project
  let pkg = {}
  try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) } catch { /* ok */ }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
  const name = pkg.name || path.basename(root)
  const version = pkg.version || '0.0.0'

  // Next.js — detect API routes in app/ or pages/api/
  if (deps.next) {
    return { framework: 'nextjs', name, version, routeFiles: findNextJsRoutes(root), lang: 'js' }
  }

  let framework = 'generic'
  if (deps.express || deps['@types/express']) framework = 'express'
  else if (deps.fastify) framework = 'fastify'
  else if (deps.koa || deps['koa-router']) framework = 'koa'
  else if (deps.hapi || deps['@hapi/hapi']) framework = 'hapi'

  const routeFiles = findFiles(root, JS_ROUTE_DIRS, JS_EXTS)
  if (routeFiles.length === 0) {
    // Shallow scan src/
    const srcDir = path.join(root, 'src')
    if (fs.existsSync(srcDir)) walkFiles(srcDir, routeFiles, JS_EXTS, 2)
  }

  return { framework, name, version, routeFiles, lang: 'js' }
}

function findNextJsRoutes(root) {
  const files = []
  // App router: app/**/route.{js,ts}
  const appDir = path.join(root, 'app')
  if (fs.existsSync(appDir)) {
    walkFilesWhere(appDir, files, JS_EXTS, f => path.basename(f, path.extname(f)) === 'route')
  }
  // Pages router: pages/api/**/*.{js,ts}
  const pagesApi = path.join(root, 'pages', 'api')
  if (fs.existsSync(pagesApi)) walkFiles(pagesApi, files, JS_EXTS, 10)

  return files
}

function findFiles(root, dirs, exts) {
  const found = []
  for (const dir of dirs) {
    const full = path.join(root, dir)
    if (fs.existsSync(full)) walkFiles(full, found, exts)
  }
  return found
}

function walkFiles(dir, acc, exts, maxDepth = 10, depth = 0) {
  if (depth > maxDepth) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      walkFiles(full, acc, exts, maxDepth, depth + 1)
    } else if (entry.isFile() && exts.includes(path.extname(entry.name))) {
      acc.push(full)
    }
  }
}

function walkFilesWhere(dir, acc, exts, predicate, maxDepth = 10, depth = 0) {
  if (depth > maxDepth) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      walkFilesWhere(full, acc, exts, predicate, maxDepth, depth + 1)
    } else if (entry.isFile() && exts.includes(path.extname(entry.name)) && predicate(full)) {
      acc.push(full)
    }
  }
}

function checkFileContent(root, files, keyword) {
  for (const f of files) {
    const full = path.join(root, f)
    if (!fs.existsSync(full)) continue
    if (fs.readFileSync(full, 'utf8').toLowerCase().includes(keyword)) return true
  }
  return false
}

module.exports = { detectFramework }
