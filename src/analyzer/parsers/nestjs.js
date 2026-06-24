'use strict'

const path = require('path')

// Matches: @Controller('prefix') or @Controller("prefix") or @Controller()
const CONTROLLER_RE = /@Controller\s*\(\s*['"`]?([^'"`),\s]*)['"`]?\s*\)/

// Matches: @Get('/path'), @Post(), @Put(':id'), etc.
const METHOD_RE = /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*['"`]?([^'"`),]*)['"`]?\s*\)/gi

// Matches: @Param('name') to extract path params declared in method args
const PARAM_RE = /@Param\s*\(\s*['"`]([^'"`]+)['"`]/g

// Matches: @ApiOperation({ summary: '...' }) from @nestjs/swagger
const SUMMARY_RE = /@ApiOperation\s*\(\s*\{[^}]*summary\s*:\s*['"`]([^'"`]+)['"`]/

function parse(filePath, content) {
  const routes = []

  // Extract controller-level prefix
  const ctrlMatch = content.match(CONTROLLER_RE)
  const prefix = ctrlMatch ? ctrlMatch[1].replace(/^\//, '') : ''

  // Tag from filename: user.controller.ts → user
  const tag = path.basename(filePath).replace(/\.controller\.[jt]sx?$/, '').replace(/[-_]/g, '-') || 'api'

  // Split into method blocks to associate decorators with their method
  // Strategy: scan line by line, collect decorators, apply to next function
  const lines = content.split('\n')
  let pendingDecorators = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Collect HTTP method decorators
    const methodMatch = /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*['"`]?([^'"`),]*)['"`]?\s*\)/i.exec(line)
    if (methodMatch) {
      pendingDecorators.push({ method: methodMatch[1].toUpperCase(), subPath: methodMatch[2] || '' })
      continue
    }

    // Collect summary from @ApiOperation
    const summaryMatch = SUMMARY_RE.exec(line)
    if (summaryMatch) {
      if (pendingDecorators.length > 0) {
        pendingDecorators[pendingDecorators.length - 1].summary = summaryMatch[1]
      }
      continue
    }

    // When we hit a method/function definition, emit routes for accumulated decorators
    if (pendingDecorators.length > 0 && /(?:async\s+)?\w+\s*\(/.test(line) && !line.startsWith('@')) {
      // Look ahead a few lines for @Param declarations
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join(' ')
      const params = []
      let pm
      PARAM_RE.lastIndex = 0
      while ((pm = PARAM_RE.exec(block)) !== null) {
        params.push(pm[1])
      }

      for (const dec of pendingDecorators) {
        const fullPath = buildPath(prefix, dec.subPath)
        const pathParams = extractPathParams(fullPath, params)
        const operationId = dec.method.toLowerCase() + '_' + fullPath.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_')

        const route = {
          method: dec.method,
          path: fullPath,
          tag,
          summary: dec.summary || '',
          operationId,
          parameters: pathParams,
          responses: { '200': { description: 'OK' } },
        }

        if (['POST', 'PUT', 'PATCH'].includes(dec.method)) {
          route.requestBody = { content: { 'application/json': { schema: { type: 'object' } } } }
        }

        routes.push(route)
      }

      pendingDecorators = []
    } else if (line.startsWith('@') && !/@(Get|Post|Put|Patch|Delete|Options|Head|Param|Body|ApiOperation|Controller)/i.test(line)) {
      // Unrelated decorator — clear pending
      pendingDecorators = []
    }
  }

  return routes
}

function buildPath(prefix, subPath) {
  const parts = [prefix, subPath].filter(Boolean).join('/')
  const normalized = '/' + parts.replace(/\/+/g, '/').replace(/^\//, '')
  // Convert NestJS :param to OpenAPI {param}
  return normalized.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}')
}

function extractPathParams(fullPath, declaredParams) {
  const inPath = (fullPath.match(/\{([^}]+)\}/g) || []).map(p => p.slice(1, -1))
  const allParams = [...new Set([...inPath, ...declaredParams])]
  return allParams.map(name => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }))
}

module.exports = { parse }
