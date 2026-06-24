'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

const GLOBAL_SETTINGS  = path.join(os.homedir(), '.claude', 'settings.json')
const GLOBAL_CLAUDE_MD = path.join(os.homedir(), '.claude', 'CLAUDE.md')
const MARKER = '<!-- docutrack -->'

const GLOBAL_SNIPPET = `
## DocuTrack — documentation auto-pilot

DocuTrack is installed globally on this machine. When a user asks to use DocuTrack,
or asks to build a project "with docutrack" or "with documentation":

**Step 1 — ask these questions in the chat** (in the user's language):
1. Documentation language? (e.g. Español, English, Português…)
2. Describe the project in one sentence
3. Who reads the docs? → \`team\` (technical) / \`onboarding\` (new devs) / \`mixed\`
4. Documentation depth? → \`concise\` / \`standard\` / \`detailed\`

**Step 2 — run init with the answers as flags:**
\`\`\`bash
docutrack init --lang=<es|en|…> --description="<desc>" --audience=<team|onboarding|mixed> --depth=<concise|standard|detailed>
\`\`\`

**Step 3 — build the project normally.**
Files you create will be queued automatically. When the session ends, run the
documentalista subagent to document everything.

If the project already has \`.docutrack/\` (already initialized), skip to Step 3.
`

async function run() {
  const hooksDir    = path.join(__dirname, '..', 'hooks')
  const postHookPath = path.join(hooksDir, 'global-post-tool-use.js')
  const stopHookPath = path.join(hooksDir, 'global-on-stop.js')
  const dir = path.dirname(GLOBAL_SETTINGS)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // ── 1. settings.json — hooks ───────────────────────────────────
  let settings = {}
  if (fs.existsSync(GLOBAL_SETTINGS)) {
    try { settings = JSON.parse(fs.readFileSync(GLOBAL_SETTINGS, 'utf8')) } catch {}
  }

  const hooksAlreadyInstalled = settings?.hooks?.PostToolUse?.some(h =>
    h.hooks?.some(c => c.command?.includes('global-post-tool-use'))
  )

  if (!hooksAlreadyInstalled) {
    if (!settings.hooks) settings.hooks = {}
    if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = []
    settings.hooks.PostToolUse.push({
      matcher: 'Write|Edit|MultiEdit',
      hooks: [{ type: 'command', command: `node "${postHookPath}"` }],
    })
    if (!settings.hooks.Stop) settings.hooks.Stop = []
    settings.hooks.Stop.push({
      hooks: [{ type: 'command', command: `node "${stopHookPath}"` }],
    })
    fs.writeFileSync(GLOBAL_SETTINGS, JSON.stringify(settings, null, 2))
    console.log(`  ✓  Hooks registered → ${GLOBAL_SETTINGS}`)
  } else {
    console.log(`  ✓  Hooks already registered`)
  }

  // ── 2. CLAUDE.md — global instructions ────────────────────────
  const claudeMdAlreadyInstalled = fs.existsSync(GLOBAL_CLAUDE_MD) &&
    fs.readFileSync(GLOBAL_CLAUDE_MD, 'utf8').includes(MARKER)

  if (!claudeMdAlreadyInstalled) {
    const existing = fs.existsSync(GLOBAL_CLAUDE_MD)
      ? fs.readFileSync(GLOBAL_CLAUDE_MD, 'utf8').trimEnd() + '\n\n---\n'
      : ''
    fs.writeFileSync(GLOBAL_CLAUDE_MD, existing + MARKER + GLOBAL_SNIPPET)
    console.log(`  ✓  Global instructions written → ${GLOBAL_CLAUDE_MD}`)
  } else {
    console.log(`  ✓  Global instructions already present`)
  }

  console.log(`
  DocuTrack is ready globally.

  From now on, in any Claude Code session just say:
  "build me X and use docutrack for documentation"

  Claude will ask for your preferences and set everything up automatically.
`)
}

module.exports = { run }
