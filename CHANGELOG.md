# Changelog

All notable changes to DocuTrack will be documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.4] — 2026-06-23

### Changed
- **No API key required** — removed all direct Anthropic API calls from the viewer
- Bootstrap panel, Regenerate panel, and ARCHITECTURE.md banner now show a copyable command to paste in Claude Code instead of a "Generate with AI" button
- `setLang()` toggle now updates command text in real-time across all panels
- Server.js simplified: removed `serveGenerate`, `serveGenerateArch`, `runGeneration`, `generateDoc`, `callClaude`, `readApiKey`, `scanSourceFiles` — server went from 694 → 369 lines

---

## [0.1.3] — 2026-06-23

### Fixed
- README: Stop hook never triggered docs automatically — corrected to "warns, then user tells Claude"
- README: `npx docutrack init` → `docutrack serve` required global install — now explicit
- README: `onboard` described as "AI-generated" — it assembles existing docs, no API call
- README: `clear` command was missing from the commands table
- README: added `--port`, `--json`, `--dry-run` flags and badge output path

---

## [0.1.2] — 2026-06-23

### Added
- **Hash-based URL routing** — each view has its own URL; reload restores the same page
- **Command palette** doc search via `/api/search`

### Fixed
- README clarifies new project vs existing project flows
- Empty code blocks no longer show Copy button
- Heading anchor renderer handles undefined text gracefully
- API Explorer "Try it out" error message distinguishes server-down from CORS

---

## [0.1.1] — 2026-06-23

### Added
- **Command palette** — `Cmd/Ctrl+K` opens fuzzy-searchable overlay over all docs, keyboard-navigable
- **Content search** — palette searches inside doc content (debounced, `/api/search`)
- **Copy button** on code blocks — appears on hover, copies to clipboard
- **Heading anchor links** — h2/h3 get `#` on hover; click to copy section URL
- **CI matrix** — Node 18/20/22 × Ubuntu/macOS/Windows (9 jobs)
- **13 unit tests** — queue.js and server.js covered

### Fixed
- README translated to English for global reach (npm page was showing Spanish)

---

## [0.1.0] — 2026-06-23

### Added
- `docutrack init` — initializes DocuTrack with hooks, templates, and slash commands
- `docutrack serve` — web viewer at port 4242 with sidebar, markdown renderer, dark mode
- `docutrack scan` — queues all existing source files for documentation
- `docutrack status` — coverage, pending files, stale doc detection
- `docutrack check` — full health check: drift, complexity, stale docs
- `docutrack analyze` — auto-detect API routes and generate OpenAPI spec
- `docutrack onboard` — generate ONBOARDING.md for new team members
- `docutrack export` — export to Mintlify or Docusaurus format
- `docutrack badge` — generate coverage badge SVG
- **Bootstrap panel** — scan and generate docs from the web UI, no terminal needed
- **AI generation** — calls Claude Haiku via native `https`, zero npm dependencies
- **Language toggle** — generate docs in Spanish (default) or English
- **Regenerate panel** — re-generate all docs with force overwrite, language switchable
- **API Explorer** — interactive Swagger-like explorer built from OpenAPI spec
- **Health Check panel** — drift analysis, complexity heatmap with scores
- **Architecture generation** — AI fills in ARCHITECTURE.md from source files
- **Stack templates** — nextjs, fastapi, express, monorepo, go
- **SSE live reload** — docs update in real-time during generation
- **moduleDocName** — namespaced filenames to avoid collisions (`dashboard-SearchBar.md`)
