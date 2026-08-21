# @agent-k/host

Extension Host bridge (`vscode` API). No React UI / agent loop body.

## Feature IDs

| ID | Scope |
|----|--------|
| **EXT-001~005** | Activation, Chat View, commands, CSP, workspace paths |
| **HOST-001** | ChatViewProvider + typed message router |
| **HOST-002** | chatSend bridge (abort maps; loop stub until AGENT-001) |
| **HOST-003** | Composer host (search / attachments / open file) |
| **HOST-004/005** | Config + project JSON bridges (`HostConfigStore` until CFG-001) |
| **HOST-006** | Runtime singleton holders |
| **HOST-007** | Session host (in-memory until SessionManager) |
| **HOST-008** | Plan generate/execute stubs until `packages/plan` |
| **HOST-009** | Workspace file index for Plan context |
| **HOST-010** | Provider probe + model.context refresh |
| **HOST-011~013** | Subagent helpers + worktree registry/bridge |
| **HOST-014** | Timeline labels (pure) |
| **HOST-015** | Host WorktreeManager (git) |

## Commands

```bash
npm test -w @agent-k/host
npm run typecheck -w @agent-k/host
```

Assembler: `extensions/agent-k` (contributes + thin `activate`).
