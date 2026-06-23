# Changelog

All notable changes to DocuTrack will be documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
