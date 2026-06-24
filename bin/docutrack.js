#!/usr/bin/env node

'use strict'

const [, , command, ...args] = process.argv

const commands = {
  'install-global': () => require('../src/commands/install-global'),
  stop: () => require('../src/commands/stop'),
  setup: () => require('../src/commands/setup'),
  init: () => require('../src/commands/init'),
  serve: () => require('../src/commands/serve'),
  analyze: () => require('../src/commands/analyze'),
  status: () => require('../src/commands/status'),
  clear: () => require('../src/commands/clear'),
  badge: () => require('../src/commands/badge'),
  export: () => require('../src/commands/export'),
  check: () => require('../src/commands/check'),
  onboard: () => require('../src/commands/onboard'),
  scan: () => require('../src/commands/scan'),
}

if (!command || command === '--help' || command === '-h') {
  console.log(`
docutrack — Claude Code documentation plugin

Usage:
  docutrack install-global                Install hooks globally — run once after npm install
  docutrack setup                         One-command setup: init + scan + start viewer
  docutrack init                          Initialize DocuTrack (runs interactive questionnaire)
  docutrack init --lang=es --description="<desc>" --audience=team --depth=standard
                                          Non-interactive init (for Claude Code or CI)
  docutrack init --template <name>        Init with a specific stack template
  docutrack serve                         Start the documentation web viewer (port 4242)
  docutrack analyze                       Scan routes and generate docs/api/openapi.json
  docutrack status                        Show coverage, pending files, and stale docs
  docutrack status --json                 Machine-readable output for CI
  docutrack badge                         Generate docs/badge.svg for your README
  docutrack clear                         Clear the documentation queue
  docutrack export --format mintlify      Export docs to Mintlify format
  docutrack export --format docusaurus    Export docs to Docusaurus format
  docutrack export --format <f> --out <dir>   Export to a custom output directory
  docutrack check                             Full health: drift, complexity, stale docs
  docutrack check --json                      Machine-readable health report for CI
  docutrack onboard                           Generate docs/ONBOARDING.md
  docutrack onboard --force                   Regenerate ONBOARDING.md
  docutrack scan                              Queue ALL existing source files for initial documentation
  docutrack scan --dry-run                    Preview what would be queued

Templates (auto-detected from project files):
  nextjs, fastapi, express, monorepo, go

Options:
  --help, -h              Show this help message
  --version, -v           Show version
`)
  process.exit(0)
}

if (command === '--version' || command === '-v') {
  console.log(require('../package.json').version)
  process.exit(0)
}

const handler = commands[command]
if (!handler) {
  console.error(`Unknown command: ${command}\nRun "docutrack --help" for usage.`)
  process.exit(1)
}

handler().run(args).catch(err => {
  console.error(`\nError: ${err.message}`)
  process.exit(1)
})
