# Debug Mode 진입 기준 & 가이드라인

## When to Enter Debug Mode

Enter Debug Mode when any of the following are true:

### 1. 🎯 Reproduce Difficulties
- Error occurs intermittently (flaky test / race condition)
- Error only appears in production / CI / specific environment
- User reports cannot reliably reproduce the issue
- Error requires specific timing (concurrent requests, websocket ordering)

### 2. 🔀 Concurrency / Race Conditions
- Suspected data races between multiple async operations
- Shared state mutation from event handlers
- WebSocket message ordering issues
- Timer/setInterval race with state updates
- Database transaction interleaving

### 3. 🧠 Heap / Memory Analysis
- Memory leak suspected (heap grows unbounded)
- Object retention analysis needed
- Cache invalidation issues
- Large object graphs causing GC pressure
- Detached DOM node accumulation

### 4. ❓ Root Cause Unknown
- Error message is generic (e.g., "undefined is not a function")
- Stack trace points to generated/bundled code (sourcemap unreliable)
- Multiple possible causes, need to narrow down

## When NOT to Enter Debug Mode

- Simple type errors caught by TypeScript compiler
- Known configuration issues (wrong env vars, missing files)
- Missing imports / bad module resolution
- Linting issues / style violations
- Feature gaps that should be normal coding tasks

## Entry Flow

```
User reports bug / error
├─ Is error type-only or config? → Fix directly (no debug)
├─ Is error simple logic error? → Fix with unit test (no debug)
└─ Is error complex, intermittent, or unknown cause?
   └─ → ENTER DEBUG MODE
       ├─ 1. Hypothesis generation (auto from stack trace)
       ├─ 2. Select hypothesis to investigate
       ├─ 3. Agent injects instrumentation
       ├─ 4. User reproduces; agent collects logs
       ├─ 5. Agent analyzes logs → detects pattern
       ├─ 6. Agent generates fix
       └─ 7. Agent removes instrumentation + verifies
```

## Debug vs Plan Mode

| Aspect | Plan Mode | Debug Mode |
|--------|-----------|------------|
| **When** | New feature / refactor / migration | Bug fix / unknown error |
| **Output** | Implementation plan (step-by-step) | Root cause analysis + fix patch |
| **Key tool** | `todo_write`, `research`, `web_search` | `add_instrumentation`, `collect_runtime_logs` |
| **Files modified** | Multiple (feature implementation) | Targeted (instrument → fix → cleanup) |
| **Verification** | Tests pass after implementation | Tests pass + zero markers remain |

## Best Practices

1. **One hypothesis at a time** — Don't inject instrumentation for multiple hypotheses simultaneously. The log noise will obscure the signal.
2. **Minimal instrumentation** — Instrument the MINIMUM number of points to test the hypothesis. Over-instrumentation pollutes logs.
3. **Clean up immediately** — After fix is verified, remove ALL instrumentation markers before moving on.
4. **Use template library** — Prefer templates from `Templates.ts` over ad-hoc instrumentation patterns.
5. **Export session on completion** — Save the debug session for future reference if the bug is likely to recur.
