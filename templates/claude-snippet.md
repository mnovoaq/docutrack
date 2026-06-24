## DocuTrack — documentation auto-pilot

This project uses DocuTrack for living documentation.

### At the start of every session

**Step 1 — Check if DocuTrack is installed on this machine:**

```bash
node -e "const fs=require('fs'),os=require('os'),path=require('path');try{const s=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.claude','settings.json'),'utf8'));const ok=s?.hooks?.PostToolUse?.some(h=>h.hooks?.some(c=>c.command?.includes('docutrack')));console.log(ok?'HOOKS_OK':'HOOKS_MISSING')}catch{console.log('HOOKS_MISSING')}"
```

- **`HOOKS_MISSING`** → tell the user:
  > "DocuTrack no está instalado en tu máquina. Corre estos dos comandos en la terminal antes de continuar:
  > ```
  > npm install -g docutrack
  > docutrack install-global
  > ```
  > Después reinicia Claude Code y vuelve a abrir este proyecto."

  Do not proceed until the user confirms installation.

- **`HOOKS_OK`** → continue to Step 2.

**Step 2 — Check documentation status:**

```bash
node -e "const fs=require('fs');if(!fs.existsSync('.docutrack')){console.log('NEEDS_SETUP')}else{try{const q=JSON.parse(fs.readFileSync('.docutrack/queue.json','utf8'));console.log('PENDING:'+(q.pending||[]).length)}catch{console.log('PENDING:0')}}"
```

- **`NEEDS_SETUP`** → ask the user these questions (in the conversation), then run `docutrack init` with the answers as flags:
  1. *"Documentation language? (e.g. Spanish, English, Portuguese…)"*
  2. *"Describe this project in one sentence"*
  3. *"Who reads the docs? → `team` (technical) / `onboarding` (new devs) / `mixed`"*
  4. *"Documentation depth? → `concise` / `standard` / `detailed`"*

  Then run:
  ```bash
  docutrack init --lang=<es|en|…> --description="<desc>" --audience=<team|onboarding|mixed> --depth=<concise|standard|detailed>
  ```
- **`PENDING:N`** (N > 0) → run the **documentalista** subagent to process the queue
- **`PENDING:0`** → documentation is up to date ✓

### The documentalista subagent

The documentalista is at `.claude/agents/documentalista.md`. It reads `.docutrack/queue.json`, writes a doc for every queued file, and clears the queue. To invoke it, say: *"Run the documentalista"* — Claude will delegate to it automatically.

### During the session — documentation protocol

When you create or modify a module, update or create `docs/modules/<name>.md` with:
- **Responsibility**: what this module does (one sentence)
- **Public API**: exported functions/classes with brief descriptions
- **Dependencies**: what it imports and what depends on it
- **Data shapes**: key types, schemas, interfaces
- **Notes**: constraints, gotchas, non-obvious design decisions

When you add or change an API endpoint, update `docs/api/` — one file per service/router.

When you make a significant architectural decision, create `docs/decisions/ADR-<NNN>-<slug>.md`:
```
# ADR-NNN: Title
## Status: Proposed | Accepted | Deprecated
## Context
## Decision
## Consequences
```

### The Stop hook

The Stop hook fires when the session ends. If files are still pending, it will list them and ask you to run the documentalista before closing. This keeps docs in sync with the code automatically.
