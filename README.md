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

DocuTrack hooks into Claude Code's lifecycle events to automatically track every modified file. When the session ends, it tells you exactly what needs documenting — and you ask Claude to do it.

```bash
npm install -g docutrack
docutrack init
```

That's it. From that point on, every file your AI agent touches gets queued for documentation.

---

## How it works

```
Claude edits a file
       ↓
PostToolUse hook fires → file added to .docutrack/queue.json
       ↓
Session ends → Stop hook prints: "3 files need documentation"
       ↓
You tell Claude: "Update the docs for files in .docutrack/queue.json"
       ↓
Docs written to docs/modules/ and docs/api/
       ↓
docutrack serve → web viewer at localhost:4242
```

DocuTrack installs two hooks in your Claude Code settings:

- **PostToolUse** — fires after every file edit, queues the modified file
- **Stop** — fires at end of session, warns if there are undocumented files

---

## Two flows

### New project

```bash
npm install -g docutrack
docutrack init              # installs hooks and templates
# → work with Claude Code normally
# → session ends: Stop hook shows "X files need documentation"
# → tell Claude: "Update the docs for files in .docutrack/queue.json"
docutrack serve             # view docs at localhost:4242
```

### Existing codebase

```bash
npm install -g docutrack
docutrack init              # installs hooks and templates
docutrack serve             # open the viewer
# → Bootstrap panel appears automatically
# → click "Scan project files" — queues all source files
# → click "Generate docs with AI" — generates everything in real-time
```

The Bootstrap panel only requires `ANTHROPIC_API_KEY` to be set. No extra terminal commands.

---

## Web viewer

Run `docutrack serve` to open a documentation viewer at `http://localhost:4242`:

- **Modules** — auto-generated docs for every source file
- **Architecture** — AI-generated overview of your tech stack, structure, and data flow
- **API Explorer** — interactive Swagger-like explorer built from your route files
- **Decisions** — Architecture Decision Records (ADRs)
- **Health Check** — drift analysis, complexity heatmap, stale doc detection
- **Command palette** — `Cmd/Ctrl+K` to jump to any doc or search content
- **Multilingual** — generates docs in Spanish or English, switchable from the UI
- **Persistent URLs** — each view has its own URL; reload lands on the same page

---

## Quick start

```bash
# Install globally (required — lets you run docutrack from any project)
npm install -g docutrack

# Initialize in your project
docutrack init

# Set your Anthropic API key (required for AI generation)
export ANTHROPIC_API_KEY=sk-ant-...
# or add it to .env.local in your project root

# Open the documentation viewer
docutrack serve
# → http://localhost:4242
```

---

## Commands

| Command | Description |
|---------|-------------|
| `docutrack init` | Initialize DocuTrack in the current project |
| `docutrack init --template <name>` | Init with a specific stack template |
| `docutrack serve` | Open the web viewer (default port 4242) |
| `docutrack serve --port 3333` | Open on a custom port |
| `docutrack scan` | Queue all existing source files for documentation |
| `docutrack scan --dry-run` | Preview what would be queued |
| `docutrack status` | Show coverage, pending files, and stale docs |
| `docutrack status --json` | Machine-readable output |
| `docutrack clear` | Clear the documentation queue |
| `docutrack check` | Full health check: drift, complexity, stale |
| `docutrack check --json` | Machine-readable health report for CI |
| `docutrack analyze` | Auto-detect routes and generate `docs/api/openapi.json` |
| `docutrack onboard` | Assemble `docs/ONBOARDING.md` from your existing docs |
| `docutrack onboard --force` | Regenerate even if it already exists |
| `docutrack export --format mintlify` | Export to Mintlify format |
| `docutrack export --format docusaurus` | Export to Docusaurus format |
| `docutrack badge` | Generate a coverage badge SVG at `docs/badge.svg` |

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
├── decisions/        ← Architecture Decision Records
├── ONBOARDING.md     ← assembled from your existing docs for new team members
└── badge.svg         ← coverage badge for your README
ARCHITECTURE.md       ← AI-generated: tech stack, app structure, data flow, module map
```

---

## Zero dependencies

DocuTrack calls the Anthropic API directly using Node.js built-in `https` — no SDK, no extra packages added to your `node_modules`.

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
