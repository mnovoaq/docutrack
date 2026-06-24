'use strict'

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { exec } = require('child_process')
const { installHooks, SETTINGS_PATH } = require('../utils/settings')
const { isPortInUse, startServerDaemon, isServerRunning } = require('../utils/daemon')
const { write: writeQueue } = require('../utils/queue')

// ── Questionnaire strings (bilingual) ─────────────────────────
const Q = {
  es: {
    q2: '  Describe el proyecto en una oración:\n  > ',
    q3: '\n  ¿Quién lee estos docs?\n  [1] Solo yo / equipo pequeño  (técnico, conciso)\n  [2] Incorporamos devs nuevos  (más contexto y explicación)\n  [3] Mixto\n  > ',
    q4: '\n  ¿Profundidad de los docs?\n  [1] Conciso   — resumen + API pública\n  [2] Estándar  — + decisiones de diseño y gotchas  (recomendado)\n  [3] Detallado — + ejemplos y contexto completo\n  > ',
    saved: '✓  Preferencias guardadas',
  },
  en: {
    q2: '  Describe this project in one sentence:\n  > ',
    q3: '\n  Who reads these docs?\n  [1] Just me / small team  (technical, concise)\n  [2] Onboarding new devs  (more context and explanation)\n  [3] Mixed\n  > ',
    q4: '\n  Documentation depth?\n  [1] Concise   — summary + public API\n  [2] Standard  — + design decisions and gotchas  (recommended)\n  [3] Detailed  — + examples and full context\n  > ',
    saved: '✓  Preferences saved',
  },
}

function parseFlags(args) {
  const get = (name) => {
    const eq = args?.find(a => a.startsWith(`--${name}=`))
    if (eq) return eq.slice(`--${name}=`.length)
    const idx = args?.indexOf(`--${name}`)
    if (idx !== undefined && idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1]
    return null
  }
  return { lang: get('lang'), description: get('description'), audience: get('audience'), depth: get('depth') }
}

async function runQuestionnaire(args) {
  // Flags override everything — Claude (or CI) passes these directly
  const flags = parseFlags(args)
  if (flags.lang) {
    const audience = ['onboarding', 'mixed', 'team'].includes(flags.audience) ? flags.audience : 'team'
    const docDepth  = ['concise', 'detailed', 'standard'].includes(flags.depth) ? flags.depth : 'standard'
    return { lang: flags.lang, projectDescription: flags.description || '', audience, docDepth }
  }

  // In non-interactive mode (CI, pipes) without flags: silent defaults
  if (!process.stdin.isTTY) {
    return { lang: 'en', projectDescription: '', audience: 'team', docDepth: 'standard' }
  }

  // Single readline instance for the whole questionnaire
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (prompt) => new Promise(resolve => rl.question(prompt, a => resolve(a.trim())))

  console.log('')

  // Q1: Language — always bilingual so any developer understands it
  const langRaw = await ask(
    '  Documentation language? / ¿Idioma de la documentación?\n' +
    '  [1] Español  [2] English  [3] Otro/Other: ___\n' +
    '  > '
  )

  let lang
  const l = langRaw.toLowerCase()
  if (l === '1' || l.startsWith('es') || l.startsWith('sp')) lang = 'es'
  else if (l === '2' || l.startsWith('en')) lang = 'en'
  else lang = langRaw || 'en'

  const s = Q[lang] || Q.en

  // Q2–Q4 in the chosen language
  const description = await ask('\n' + s.q2)
  const audRaw     = await ask(s.q3)
  const depthRaw   = await ask(s.q4)

  rl.close()

  const audience = audRaw === '2' ? 'onboarding' : audRaw === '3' ? 'mixed' : 'team'
  const docDepth  = depthRaw === '1' ? 'concise'   : depthRaw === '3' ? 'detailed' : 'standard'

  console.log(`\n  ${s.saved}\n`)
  return { lang, projectDescription: description, audience, docDepth }
}

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates')
const VALID_TEMPLATES = ['nextjs', 'fastapi', 'express', 'monorepo', 'go']
const PORT = 4242

const SOURCE_DIRS = ['src', 'lib', 'app', 'pkg', 'internal', 'api', 'routes', 'controllers', 'handlers', 'packages']
const SOURCE_EXTS = new Set(['.js', '.ts', '.mjs', '.jsx', '.tsx', '.py', '.go'])
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '__pycache__', '.docutrack', 'docs', '.worktrees', 'coverage', '.turbo'])
const IGNORE_RE = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.d\.ts$/, /\.min\.js$/]

function copyFile(src, dest) {
  const dir = path.dirname(dest)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(src, dest)
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(srcPath, destPath)
    else copyFile(srcPath, destPath)
  }
}

function step(msg) { process.stdout.write(`  ${msg}\n`) }

function openBrowser(url) {
  try {
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"`
      : `xdg-open "${url}"`
    exec(cmd)
  } catch { /* best-effort */ }
}

function autoDetectTemplate() {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (deps.next) return 'nextjs'
    if (pkg.workspaces || fs.existsSync('pnpm-workspace.yaml') || fs.existsSync('turbo.json')) return 'monorepo'
    if (deps.express || deps['@types/express'] || deps.fastify || deps.koa) return 'express'
  } catch { /* not a node project */ }
  for (const f of ['requirements.txt', 'pyproject.toml', 'Pipfile']) {
    if (!fs.existsSync(f)) continue
    if (fs.readFileSync(f, 'utf8').toLowerCase().includes('fastapi')) return 'fastapi'
  }
  if (fs.existsSync('go.mod')) return 'go'
  return null
}

function collectSourceFiles(root) {
  const files = []
  const seen = new Set()
  const walk = (dir, depth = 0) => {
    if (depth > 8 || !fs.existsSync(dir)) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), depth + 1)
      } else if (e.isFile() && SOURCE_EXTS.has(path.extname(e.name).toLowerCase())) {
        if (!IGNORE_RE.some(re => re.test(e.name))) {
          const rel = path.relative(root, path.join(dir, e.name)).replace(/\\/g, '/')
          if (!seen.has(rel)) { seen.add(rel); files.push(rel) }
        }
      }
    }
  }
  // Walk from root — handles any project structure, not just known conventions
  walk(root)
  return files
}

async function run(args) {
  const root = process.cwd()
  const noServe = args?.includes('--no-serve')

  // ── Guard: already initialized ────────────────────────────────
  if (fs.existsSync('.docutrack')) {
    // If called again, just ensure server is running
    if (!noServe) {
      const portBusy = await isPortInUse(PORT)
      const alive = isServerRunning(root)
      if (!portBusy && !alive) {
        const { pid } = startServerDaemon(root, PORT)
        await new Promise(r => setTimeout(r, 900))
        console.log(`\n  DocuTrack viewer → http://localhost:${PORT}  (pid ${pid})\n`)
        openBrowser(`http://localhost:${PORT}`)
      } else {
        console.log(`\n  DocuTrack already active → http://localhost:${PORT}\n`)
        openBrowser(`http://localhost:${PORT}`)
      }
    } else {
      console.log('\n  DocuTrack already initialized. Run "docutrack status" to see the queue.\n')
    }
    return
  }

  console.log('\n  DocuTrack — setting up your project\n  ' + '─'.repeat(42))

  // ── Resolve template ───────────────────────────────────────────
  const templateFlag = args?.find(a => a.startsWith('--template='))?.split('=')[1]
    || (args?.indexOf('--template') !== -1 ? args[args.indexOf('--template') + 1] : null)
  const template = (templateFlag && VALID_TEMPLATES.includes(templateFlag))
    ? templateFlag
    : autoDetectTemplate()

  if (templateFlag && !VALID_TEMPLATES.includes(templateFlag)) {
    console.error(`Unknown template: "${templateFlag}". Valid options: ${VALID_TEMPLATES.join(', ')}\n`)
    process.exit(1)
  }

  // ── 1. .docutrack/ structure ───────────────────────────────────
  fs.mkdirSync('.docutrack/hooks', { recursive: true })
  step('✓  Created .docutrack/')

  // ── 2. Queue ───────────────────────────────────────────────────
  fs.writeFileSync('.docutrack/queue.json', JSON.stringify({ pending: [], lastClear: null }, null, 2))

  // ── 3. Hook scripts ────────────────────────────────────────────
  copyFile(path.join(TEMPLATES_DIR, 'hooks', 'post-tool-use.js'), '.docutrack/hooks/post-tool-use.js')
  copyFile(path.join(TEMPLATES_DIR, 'hooks', 'on-stop.js'), '.docutrack/hooks/on-stop.js')
  step('✓  Installed hooks (PostToolUse + Stop)')

  // ── 4. /docs structure ─────────────────────────────────────────
  copyDir(path.join(TEMPLATES_DIR, 'docs'), 'docs')

  // ── 5. ARCHITECTURE.md ─────────────────────────────────────────
  if (!fs.existsSync('ARCHITECTURE.md')) {
    const stackArch = template && path.join(TEMPLATES_DIR, 'stacks', template, 'ARCHITECTURE.md')
    const archSrc = (stackArch && fs.existsSync(stackArch))
      ? stackArch
      : path.join(TEMPLATES_DIR, 'ARCHITECTURE.md')
    copyFile(archSrc, 'ARCHITECTURE.md')
  }
  step(`✓  Created docs/ and ARCHITECTURE.md${template ? ` (${template})` : ''}`)

  // ── 6. Slash commands ──────────────────────────────────────────
  const commandsDir = path.join(TEMPLATES_DIR, 'commands')
  for (const name of fs.readdirSync(commandsDir)) {
    copyFile(path.join(commandsDir, name), path.join('.claude', 'commands', name))
  }

  // ── 7. Documentalista subagent ─────────────────────────────────
  const stackAgent = template && path.join(TEMPLATES_DIR, 'stacks', template, 'documentalista.md')
  const agentSrc = (stackAgent && fs.existsSync(stackAgent))
    ? stackAgent
    : path.join(TEMPLATES_DIR, 'agents', 'documentalista.md')
  copyFile(agentSrc, '.claude/agents/documentalista.md')
  step('✓  Installed slash commands + documentalista subagent')

  // ── 8. Hooks in .claude/settings.json ────────────────────────
  const installed = installHooks()
  step(installed
    ? `✓  Registered hooks in ${SETTINGS_PATH}`
    : `✓  Hooks already registered`)

  // ── 9. Questionnaire — language, description, audience, depth ─
  console.log('\n  ' + '─'.repeat(42))
  const prefs = await runQuestionnaire(args)

  // ── 10. docutrack.config.json — merge template + prefs ────────
  {
    const cfgSrc = path.join(TEMPLATES_DIR, 'docutrack.config.json')
    let cfg = JSON.parse(fs.readFileSync(cfgSrc, 'utf8'))
    if (template) cfg.template = template
    else delete cfg.template
    cfg.lang = prefs.lang
    cfg.projectDescription = prefs.projectDescription
    cfg.audience = prefs.audience
    cfg.docDepth = prefs.docDepth
    fs.writeFileSync('docutrack.config.json', JSON.stringify(cfg, null, 2))
  }

  // ── 12. Auto-write snippet to CLAUDE.md (with language injected) ─
  const snippetPath = path.join(TEMPLATES_DIR, 'claude-snippet.md')
  const snippetBase = fs.readFileSync(snippetPath, 'utf8')
  copyFile(snippetPath, '.docutrack/claude-snippet.md')

  // Inject the configured language so Claude always knows — without needing to read config.json
  const LANG_LINE = {
    es: '> **Idioma de documentación**: Español. Escribe TODA la documentación en español, sin excepción.',
    en: '> **Documentation language**: English. Write ALL documentation in English.',
  }
  const langLine = LANG_LINE[prefs.lang] || `> **Documentation language**: ${prefs.lang}. Write ALL documentation in ${prefs.lang}.`
  // Insert lang note after the first line (the heading) — avoids em-dash encoding mismatches
  const snippetLines = snippetBase.split('\n')
  snippetLines.splice(1, 0, '', langLine)
  const snippet = snippetLines.join('\n')

  const CLAUDE_MD = 'CLAUDE.md'
  const SNIPPET_MARKER = 'DocuTrack — documentation auto-pilot'
  if (!fs.existsSync(CLAUDE_MD)) {
    fs.writeFileSync(CLAUDE_MD, snippet + '\n')
    step('✓  Created CLAUDE.md with DocuTrack auto-pilot')
  } else {
    const existing = fs.readFileSync(CLAUDE_MD, 'utf8')
    if (!existing.includes(SNIPPET_MARKER)) {
      fs.writeFileSync(CLAUDE_MD, existing.trimEnd() + '\n\n---\n\n' + snippet + '\n')
      step('✓  Added DocuTrack auto-pilot to existing CLAUDE.md')
    } else {
      step('✓  CLAUDE.md already has DocuTrack auto-pilot')
    }
  }

  // ── 13. Scan existing source files ────────────────────────────
  const sourceFiles = collectSourceFiles(root)
  if (sourceFiles.length > 0) {
    const now = new Date().toISOString()
    writeQueue({ pending: sourceFiles.map(f => ({ file: f, addedAt: now })), lastClear: null })
    step(`✓  Scanned ${sourceFiles.length} existing source file(s) — queued for documentation`)
  } else {
    step('✓  No existing source files — starting fresh')
  }

  // ── 14. Start viewer server ────────────────────────────────────
  if (!noServe) {
    const portBusy = await isPortInUse(PORT)
    if (!portBusy) {
      const { pid } = startServerDaemon(root, PORT)
      await new Promise(r => setTimeout(r, 900))
      step(`✓  Viewer started → http://localhost:${PORT}  (pid ${pid})`)
      openBrowser(`http://localhost:${PORT}`)
    } else {
      step(`✓  Viewer already running → http://localhost:${PORT}`)
      openBrowser(`http://localhost:${PORT}`)
    }
  }

  // ── Done ───────────────────────────────────────────────────────
  console.log('\n  ' + '─'.repeat(42))

  // Briefing message — copied to clipboard so the user can paste it into an open Claude session
  const isEs = prefs.lang === 'es'
  const briefing = isEs
    ? 'DocuTrack fue inicializado en este proyecto. Revisa el CLAUDE.md actualizado y ejecuta el documentalista para los archivos pendientes. Para el resto de esta sesión documenta manualmente cada archivo nuevo que crees.'
    : 'DocuTrack was just initialized in this project. Read the updated CLAUDE.md and run the documentalista for pending files. For the rest of this session, manually document each new file you create.'

  copyToClipboard(briefing)

  const queueNote = sourceFiles.length > 0
    ? (isEs ? `${sourceFiles.length} archivo(s) en cola.` : `${sourceFiles.length} file(s) queued.`)
    : (isEs ? 'Listo para nuevos archivos.' : 'Ready for new files.')

  console.log(isEs
    ? `\n  DocuTrack listo. ${queueNote}\n\n  Si ya tienes Claude Code abierto en este proyecto, pega esto (ya está en el portapapeles):\n\n  ${briefing}\n\n  Si no, abre Claude Code — documentará todo automáticamente.\n`
    : `\n  DocuTrack ready. ${queueNote}\n\n  If Claude Code is already open in this project, paste this (already in clipboard):\n\n  ${briefing}\n\n  Otherwise, open Claude Code — it will document everything automatically.\n`
  )
}

function copyToClipboard(text) {
  try {
    const { spawnSync } = require('child_process')
    if (process.platform === 'win32') spawnSync('clip', [], { input: text, encoding: 'utf8' })
    else if (process.platform === 'darwin') spawnSync('pbcopy', [], { input: text, encoding: 'utf8' })
  } catch { /* best-effort */ }
}

module.exports = { run }
