# Ask Mode

## Overview
Ask Mode (Read-only mode) is Agent-K's safe exploration mode. When in Ask mode, the agent can only use read-only tools — no file edits, terminal commands, or debug operations.

## Tool Whitelist
- `grep` — Pattern search across workspace
- `glob` — File pattern matching
- `file_search` — File name search
- `list_dir` — Directory listing
- `read_file` — File content reading
- `codebase_search` — Semantic code search
- `lsp_definition` — Go to definition
- `lsp_references` — Find references
- `ask_question` — Ask user for clarification

## Architecture
- `modeRegistry.ts` defines 4 modes: `ask`, `edit`, `architect`, `debug`
- `ASK_WHITELIST` constant lists 10 permitted tools
- `isToolAllowed(mode, toolName)` checks permission
- Double guard: ToolRegistry.getSchemas(mode) + AgentLoopController.executeTool

## Guard Mechanism
1. ToolRegistry.getSchemas('ask'): only returns read-tool schemas
2. AgentLoopController.executeTool: verifies tool is allowed for current mode
3. ModeBadge.tsx shows 🔒 read-only indicator in Ask mode

## Side Chat (@side-)
Ask mode supports parallel `@side-` sessions for non-blocking research:
- SideChatSession starts in read-only mode
- Results merged via getMergeBlock()
- Max 5 concurrent sessions
