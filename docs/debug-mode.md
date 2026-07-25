# Debug Mode (C6)

## Overview

Debug Mode implements a **scientific method** for diagnosing runtime errors and logical defects in Agent-K. It guides the agent through 6 stages:

1. **Hypothesis** — Generate candidate explanations from error messages/stack traces
2. **Instrument** — Inject `DEBUG_INSTRUMENT` markers at suspicion points
3. **Reproduce** — Record user reproduction actions
4. **Analyze** — Collect runtime logs, identify patterns/anomalies
5. **Fix** — Generate targeted patches (null check, async, timeout, etc.)
6. **Cleanup** — Remove all instrumentation markers and verify

## Architecture

```
src/debug/
├── DebugModeController.ts     # State machine (6 stages)
├── HypothesisGenerator.ts     # Hypothesis generation/refinement
├── InstrumentationPatterns.ts # Code insertion patterns
├── DebugLogServer.ts          # Runtime log ingestion/query
├── LogAnalyzer.ts             # Pattern detection/anomaly analysis
├── TargetedFixGenerator.ts    # Fix generation (null/async/timeout/etc)
├── VerifyCleanup.ts           # Marker removal + verification
├── Templates.ts               # Instrumentation code templates
├── MultiFileDebug.ts          # Cross-file correlation
├── DebugSessionStore.ts       # Session persistence
├── DebugTools.ts              # Mode-specific tool whitelist
├── ReproduceRecorder.ts       # Action recording
└── BrowserEvidence.ts         # Screenshot/console/network capture

src/tools/debug/
├── AddInstrumentationTool.ts  # Inject DEBUG_INSTRUMENT markers
├── CollectRuntimeLogsTool.ts  # Query runtime logs
├── RequestReproduceTool.ts    # Request reproduction steps
└── RemoveInstrumentationTool.ts # Remove all markers

src/chat/components/
├── DebugTimeline.tsx          # Stage progress bar
└── DebugModeUI.tsx            # Debug badge + hypothesis selector
```

## Debug 6-Stage Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEBUG MODE                               │
├─────────────┬──────────────┬──────────────┬─────────────────────┤
│  1.Hypothesis │ 2.Instrument  │ 3.Reproduce  │ User provides steps  │
│  (auto-gen)   │ (agent inje-  │ (user action)  │   or agent records   │
│               │  cts markers)  │               │                      │
├─────────────┼──────────────┼──────────────┼─────────────────────┤
│  4.Analyze    │ 5.Fix          │ 6.Cleanup    │ 🧹 All markers       │
│  (logs +      │ (targeted      │ (remove +    │    removed.           │
│   patterns)   │  patch)        │  verify)     │    Verified.          │
└─────────────┴──────────────┴──────────────┴─────────────────────┘
```

## Instrumentation Lifecycle

```
AddInstrumentationTool
  └─ generateInstrumentation(request) → code string with DEBUG_INSTRUMENT:<hypId>
  └─ recordMarker(request, originalContent, line) → stored for cleanup
  └─ getMarkers(hypothesisId) → MarkerRecord[]

CollectRuntimeLogsTool
  └─ collect(filePaths, hypothesisId) → LogEntry[]
  └─ forwardToLogAnalyzer() → anomaly detection

RemoveInstrumentationTool
  └─ buildCleanupPlan(hypothesisId, files) → markdown plan
  └─ verifyClean(content, hypothesisId?) → { clean, remaining }
  └─ buildCleanupReport(hypothesisId, files, results) → report markdown

VerifyCleanup
  └─ verify({ hypothesisId, fileContents, testResults }) → VerifyResult
  └─ needsRollback(result) → boolean
```

## Allowed Tools in Debug Mode

| Tool | Purpose |
|------|---------|
| `edit_file` | Instrumentation injection |
| `read_file` | Reading instrumented code |
| `bash` | Running/debugging commands |
| `add_instrumentation` | Insert DEBUG_INSTRUMENT |
| `collect_runtime_logs` | Query runtime log data |
| `request_reproduce` | Ask user for reproduction |
| `remove_instrumentation` | Clean up markers |
| `search_files`, `grep` | Locating code |
| `web_search` | Research, docs |
| `web_fetch` | API specs, docs |
| `browser_preview` | If client-side bug |

## Template Library

| Template | Languages | Use Case |
|----------|-----------|----------|
| `console_log` | TS, Python | Log method entry/exit with args |
| `perf_mark` | TS, JS | Performance.mark / console.time |
| `error_boundary` | TS, Python, Go | try/catch with structured logging |

## Session Persistence

Debug sessions are stored in localStorage (`agent-k.debugSessions`). Each session captures:
- Full state (stage, hypotheses, active hypothesis)
- Last 20 log entries
- Reproduce script
- Patch summary

Export to markdown via `DebugSessionStore.exportSession(id)`.

## Browser Evidence

`BrowserEvidenceCollector` stubs for screenshot/console/network capture. Full Playwright integration is planned in C7.

## Verification Gates

- All `DEBUG_INSTRUMENT:` markers must be removed before cleanup is considered complete
- Tests must pass post-fix
- If fix + tests fail → rollback instrumentation and re-analyze
