<div align="center">

# DocuTrack

**Your AI agent writes code. DocuTrack makes sure it documents what it builds.**

[![npm version](https://img.shields.io/npm/v/docutrack?color=6366f1&label=npm)](https://www.npmjs.com/package/docutrack)
[![License: MIT](https://img.shields.io/badge/license-MIT-6366f1)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-6366f1)](https://nodejs.org)

</div>

---

## The problem

Claude Code edits 30 files in a session. When it's done, none of them have updated documentation. You end up with a codebase that works but no one understands — including you, three months later.

## The solution

DocuTrack hooks into Claude Code's lifecycle to automatically track every file your AI agent touches. When the session ends, a specialized subagent documents everything — in your language, at your preferred depth.

---

## Install once, use everywhere

```bash
npm install -g docutrack
docutrack install-global
```

`install-global` does two things:

1. Registers global PostToolUse and Stop hooks in `~/.claude/settings.json` — active in every Claude Code session from now on
2. Writes a `~/.claude/CLAUDE.md` snippet that teaches Claude how to set up DocuTrack for any project

After this, you never think about DocuTrack again — Claude handles the rest.

---

## How it works per project

### The recommended flow — let Claude do it

Open any project in Claude Code and ask:

> *"Build me an inventory API and use docutrack for documentation"*

Claude will:
1. Ask you four quick questions in the chat (in your language)
2. Run `docutrack init --lang=… --description="…" --audience=… --depth=…`
3. Build your project — every file created is queued automatically via the global hooks
4. At session end, run the documentalista subagent to write all docs
5. Start the viewer at `http://localhost:4242`

### The manual flow — you control the init

```bash
cd my-project
docutrack init        # interactive questionnaire in the terminal
```

Then open Claude Code. It reads `CLAUDE.md`, sees pending files, and documents everything without being asked.

---

## The questionnaire

Whether run interactively or via Claude, DocuTrack asks four questions before setting up:

| Question | Options |
|----------|---------|
| Documentation language | Spanish, English, or any other |
| Project description | One sentence |
| Who reads the docs | `team` · `onboarding` · `mixed` |
| Documentation depth | `concise` · `standard` · `detailed` |

These preferences are saved to `docutrack.config.json` and used by every documentation run.

---

## What gets generated

```
docs/
├── modules/        ← one .md per source file
│                      responsibility · public API · dependencies · data shapes · notes
├── api/            ← one .md per API router + openapi.json
├── decisions/      ← Architecture Decision Records (ADRs)
└── ONBOARDING.md   ← assembled guide for new team members
ARCHITECTURE.md     ← tech stack · module map · data flow · env vars
```

---

## The web viewer

`docutrack serve` opens a local documentation browser at `http://localhost:4242`:

- Browse modules, API docs, decisions, and architecture in one place
- **Live reload** — docs update in the browser the moment the documentalista finishes, no manual refresh
- **API Explorer** — visual OpenAPI browser auto-generated from your routes (Express, FastAPI, Next.js, Go)
- Full-text search with `Cmd/Ctrl+K`
- Mermaid diagram rendering
- Dark/light mode
- Persistent URLs — reload lands on the same page

---

## Commands

| Command | Description |
|---------|-------------|
| `docutrack install-global` | **One-time setup** — registers global hooks and Claude instructions |
| `docutrack init` | Initialize DocuTrack in a project (interactive questionnaire) |
| `docutrack init --lang=es --description="…" --audience=team --depth=standard` | Non-interactive init (used by Claude Code) |
| `docutrack init --template <name>` | Init with a specific stack template |
| `docutrack serve` | Open the web viewer at `http://localhost:4242` |
| `docutrack stop` | Stop the running viewer server |
| `docutrack scan` | Queue all existing source files for documentation |
| `docutrack scan --dry-run` | Preview what would be queued |
| `docutrack status` | Show coverage, pending files, and stale docs |
| `docutrack status --json` | Machine-readable output for CI |
| `docutrack clear` | Clear the documentation queue |
| `docutrack check` | Full health check: drift, complexity, stale docs |
| `docutrack analyze` | Scan routes and generate `docs/api/openapi.json` |
| `docutrack onboard` | Generate `docs/ONBOARDING.md` |
| `docutrack badge` | Generate a coverage badge SVG |
| `docutrack export --format mintlify` | Export docs to Mintlify format |
| `docutrack export --format docusaurus` | Export docs to Docusaurus format |

---

## Stack templates

DocuTrack auto-detects your stack from `package.json`, `go.mod`, etc.

```bash
docutrack init --template nextjs     # Next.js App Router
docutrack init --template fastapi    # Python FastAPI
docutrack init --template express    # Node.js Express / Fastify / Koa
docutrack init --template monorepo   # Turborepo / pnpm workspaces
docutrack init --template go         # Go modules
```

---

## How the hooks work

DocuTrack registers two hooks globally (via `install-global`) and per-project (via `init`):

- **PostToolUse** — fires after every Write/Edit, adds the file to `.docutrack/queue.json`
- **Stop** — fires when the session ends; scans for any files that were missed, then prompts Claude to run the documentalista

The **global Stop hook** is the authoritative implementation. It embeds the full catch-all logic with mtime tracking, so only files modified *after* the last documentation run are flagged — never already-documented files. It also self-corrects the queue if an older project hook left stale entries.

The global hooks silently skip projects that haven't been initialized. No noise in other projects.

---

## Requirements

- Node.js 18+
- [Claude Code](https://claude.ai/code)

---

## License

MIT © [novolabs](https://github.com/mnovoaq)
