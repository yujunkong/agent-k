# HARB Harness Guide

> **Last updated**: 2026-07-25  
> **Phase**: HARB (Medium Model Harness)  
> **Status**: T01–T38 DONE queue + MVP evidence (`npm run compile`, `npm run test:harness` 6 passing)

### Honest residual (not blockers for MVP gate)

- Live LiteLLM E2E still needs local proxy (`mockResponse` / injected `provider` cover AC)
- `LintRunner` uses file heuristics until VS Code `getDiagnostics` is wired
- Some Tools D/F schemas (browser/MCP) register at activate; gapfill specs may overwrite-register in tests

---

## Architecture Overview

The HARB (Harness) is a middleware layer between the LLM and the tool execution system. It ensures that medium-capability models (Tier A: Flash, 7B~30B) can reliably perform software engineering tasks by providing structure, verification, and safety guards.

```
User Message
    │
    ▼
┌─────────────────────────────┐
│   PrefetchEngine            │  ← HARB-T09: Pre-fetch @mentioned files → inject <prefetch>
│   (ContextBlockBuilder)     │
└─────────┬───────────────────┘
          ▼
┌─────────────────────────────┐
│   ContextAssembler          │  ← HARB-T02/T03/T05/T07/T14: Inject harness prompts
│   (System + Rules + Tools   │
│    + Sticky + History)      │
└─────────┬───────────────────┘
          ▼
┌─────────────────────────────┐
│   AgentLoopController       │  ← HARB core loop
│   ├─ RoutingHeuristics      │  ← HARB-T12: A↔B tier routing
│   ├─ AWhitelist getSchemas  │  ← HARB-T06: Tier A = 10 tools incl. read_lints
│   ├─ autoVerificationHook   │  ← HARB-T10
│   ├─ CompactionEngine       │  ← HARB-T26 (messages applied)
│   └─ ToolCallParser         │  ← HARB-T19 / Spec-01
└─────────┬───────────────────┘
          ▼
       Tools / Disk
```

## Tier A whitelist (10)

`grep`, `glob`, `list_dir`, `read_file`, `edit_file`, `write_file`, `run_terminal_cmd`, `read_lints`, `ask_question`, `todo_write`

## Verify

```bash
npm run compile
npm run test:harness   # AC-1..4 (6 tests)
```

See also: `TODO_TASKS/HARB_AGENT_HANDOFF.md`, `TODO_TASKS/reports/harb-residual-reverify-2026-07-25.md`

