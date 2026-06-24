'use strict'

const path = require('path')

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']

// @app.get('/path', ...) or @router.post('/path', ...) — captures method, path, and the full decorator args
const DECORATOR_RE = /@(\w+)\.(get|post|put|patch|delete|options|head)\s*\(([^)]*(?:\)[^)]*)*?)\)/gi

// async def function_name — to infer operation name
const DEF_RE = /(?:async\s+)?def\s+(\w+)\s*\(/g

function extractSummary(decoratorArgs) {
  const m = decoratorArgs.match(/summary\s*=\s*["']([^"']+)["']/)
  return m ? m[1] : ''
}

function parse(filePath, content) {
  const tag = inferTag(filePath)
  const routes = []
  const seen = new Set()

  // Collect function names (for operationId inference)
  const functions = []
  let fm
  const defRe = new RegExp(DEF_RE.source, 'g')
  while ((fm = defRe.exec(content)) !== null) functions.push({ name: fm[1], index: fm.index })

  let m
  const re = new RegExp(DECORATOR_RE.source, 'gi')
  while ((m = re.exec(content)) !== null) {
    const method = m[2].toUpperCase()
    // First argument is the path — extract it from the full args string
    const argsStr = m[3]
    const pathMatch = argsStr.match(/^\s*["'](\/[^"']*)["']/)
    if (!pathMatch) continue
    const opPath = pathMatch[1]

    const key = `${method}:${opPath}`
    if (seen.has(key)) continue
    seen.add(key)

    // Find the function that follows this decorator
    const nearestFn = functions.find(f => f.index > m.index)
    const operationId = nearestFn?.name || toOperationId(method, opPath)
    const summary = extractSummary(argsStr)

    const params = extractPathParams(opPath)
    const route = {
      method,
      path: opPath,
      tag,
      summary,
      operationId,
      parameters: params.map(p => ({
        name: p,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      })),
      responses: { '200': { description: 'OK' } },
    }

    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      route.requestBody = {
        content: { 'application/json': { schema: { type: 'object' } } },
      }
    }

    routes.push(route)
  }

  return routes
}

function extractPathParams(p) {
  const params = []
  const re = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g
  let m
  while ((m = re.exec(p)) !== null) params.push(m[1])
  return params
}

function inferTag(filePath) {
  return path.basename(filePath, path.extname(filePath))
    .replace(/[-_]/g, ' ').split(' ')[0].toLowerCase()
}

function toOperationId(method, opPath) {
  const parts = opPath
    .replace(/\{([^}]+)\}/g, (_, n) => 'By' + n.charAt(0).toUpperCase() + n.slice(1))
    .replace(/^\//, '').split('/')
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
  return method.toLowerCase() + (parts || 'Root')
}

module.exports = { parse }
