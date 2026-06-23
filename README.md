<div align="center">

# DocuTrack

**Your AI agent writes code. DocuTrack makes sure it documents what it builds.**

[![npm version](https://img.shields.io/npm/v/docutrack?color=6366f1&label=npm)](https://www.npmjs.com/package/docutrack)
[![License: MIT](https://img.shields.io/badge/license-MIT-6366f1)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-6366f1)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-6366f1)](CONTRIBUTING.md)

</div>

---

## The problem

Claude Code edits 30 files in a session. When it's done, none of them have updated documentation. You end up with a codebase that works but no one understands — including you, three months later.

## The solution

DocuTrack hooks into Claude Code's lifecycle events to automatically queue every modified file and generate technical documentation using AI — without interrupting your workflow.

```bash
npx docutrack init
```

That's it. From that point on, every file your AI agent touches gets documented.

---

## How it works

```
Claude edits a file
       ↓
PostToolUse hook fires → file added to .docutrack/queue.json
       ↓
Session ends → documentalista subagent runs
       ↓
Docs written to docs/modules/ and docs/api/
       ↓
docutrack serve → beautiful web viewer at localhost:4242
```

DocuTrack installs two hooks in your Claude Code settings:

- **PostToolUse** — fires after every file edit, queues the file
- **Stop** — fires at end of session, triggers the documentalista subagent

---

## Web viewer

Run `docutrack serve` to open a Notion-like documentation viewer at `http://localhost:4242`:

- **Modules** — auto-generated docs for every source file
- **Architecture** — AI-generated overview of your tech stack, structure, and data flow
- **API Explorer** — interactive Swagger-like explorer built from your route files
- **Decisions** — Architecture Decision Records (ADRs)
- **Health Check** — drift analysis, complexity heatmap, stale doc detection
- **Multilingual** — generates docs in Spanish or English, switchable from the UI

### Bootstrapping an existing project

Already have a codebase? No problem. Open the viewer and click **"✨ Regenerate docs"** — DocuTrack scans all your source files and generates documentation for everything, no terminal needed.

---

## Quick start

```bash
# Initialize in your project
npx docutrack init

# Open the documentation viewer
docutrack serve
# → http://localhost:4242

# Check documentation health
docutrack check
```

To use AI generation, set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or add it to .env.local in your project
```

---

## Commands

| Command | Description |
|---------|-------------|
| `docutrack init` | Initialize DocuTrack in the current project |
| `docutrack serve` | Open the web viewer at port 4242 |
| `docutrack scan` | Queue all existing source files for documentation |
| `docutrack status` | Show coverage, pending files, and stale docs |
| `docutrack check` | Full health check: drift, complexity, stale |
| `docutrack analyze` | Auto-detect routes and generate `docs/api/openapi.json` |
| `docutrack onboard` | Generate `docs/ONBOARDING.md` for new team members |
| `docutrack export` | Export to Mintlify or Docusaurus format |
| `docutrack badge` | Generate coverage badge SVG for your README |

---

## Stack templates

DocuTrack auto-detects your stack from `package.json`, `go.mod`, etc. You can also specify it manually:

```bash
docutrack init --template nextjs    # Next.js App Router
docutrack init --template fastapi   # Python FastAPI
docutrack init --template express   # Node.js Express / Fastify
docutrack init --template monorepo  # Turborepo / pnpm workspaces
docutrack init --template go        # Go modules
```

Each template ships with a stack-specific `documentalista` subagent that understands your framework's conventions.

---

## What gets generated

```
docs/
├── modules/          ← one .md per source file (responsibility, exports, dependencies)
├── api/              ← one .md per API route + openapi.json
└── decisions/        ← Architecture Decision Records
ARCHITECTURE.md       ← AI-generated: tech stack, app structure, data flow, module map
docs/ONBOARDING.md    ← AI-generated: setup guide, conventions, key modules
```

---

## Zero dependencies

DocuTrack calls the Anthropic API directly using Node.js built-in `https` — no SDK, no extra packages to install, nothing added to your `node_modules`.

---

## Requirements

- Node.js 18+
- [Claude Code](https://claude.ai/code) CLI
- `ANTHROPIC_API_KEY` (only required for AI doc generation)

---

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

---

## License

MIT © [novolabs](https://github.com/mnovoaq)
