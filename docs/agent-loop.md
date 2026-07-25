# Agent Loop Architecture

## Overview
The Agent Loop is the core execution engine that drives Agent-K's reasoning and tool use in a turn-based cycle.

## Loop Cycle
1. **Assemble Context**: ContextAssembler builds message context with 6 budget slots
2. **Stream Response**: Model streams tokens via SSE
3. **Execute Tools**: Tool calls dispatched to parallel or sequential executors
4. **Verify**: Post-execution verification (lint, test, custom hooks)
5. **Repeat**: Until maxTurns, stop signal, or final answer

## Core Components

### AgentLoopController
- `runLoop()`: Main loop (assemble → stream → execute → verify → repeat)
- `stop()`: Abort signal via AbortController
- `executeTool()`: Dispatches with mode check + error recovery
- `maxTurns`: Configurable turn limit

### MessageQueue
- Resynthesize mode (Enter): Interrupts and processes immediately
- Queue mode (Alt+Enter): Adds to queue, processes sequentially
- Dequeue: Fires debounced after 300ms
- Running lock: Prevents concurrent processing
- Interrupt: Cancels in-flight + queued messages

### DoomLoopDetector
- Tracks last N (default 20) `(toolName, argsHash, errorSig)` tuples
- Detection: 3 consecutive identical fingerprints
- Reset on successful tool execution
- Triggers DoomLoopHandler on detection

### ContextCompactionEngine
- 4 levels: `truncate`, `drop`, `micro_summary`, `full`
- Protected slots: `system`, `rules`, recent 6 turns
- Max 128k token budget
- Automatic compaction every N turns

## Tool Execution
- `ToolRegistry`: Modes filter available schemas
- `ParallelExecutor`: Priority-sorted, concurrency-limited
- `PrefetchEngine`: Reads mentioned files before tool execution
- `StreamingToolExecutor`: Pre-executes read tools during streaming (30s cache)

## Error Handling
- Tool-level: try/catch with error result injection
- Mode-level: `isToolAllowed` double guard
- Loop-level: maxTurns + stop signal + doom loop detection
