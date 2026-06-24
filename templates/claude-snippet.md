## DocuTrack — documentation auto-pilot

This project uses DocuTrack for living documentation.

### At the start of every session

Run this check silently (no output to user needed):

```bash
node -e "const fs=require('fs');if(!fs.existsSync('.docutrack')){console.log('NEEDS_SETUP')}else{try{const q=JSON.parse(fs.readFileSync('.docutrack/queue.json','utf8'));console.log('PENDING:'+(q.pending||[]).length)}catch{console.log('PENDING:0')}}"
```

Based on the output:
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
