# @agent-k/worktree

Managed git worktree, patch validate/apply, adopt/reject (WT-*). **R-003:** Prepare → Validate → Snapshot → Apply → Verify → Commit/Adopt / rollback.

| Feature | Module |
|---------|--------|
| WT-001 manager | `WorktreeManager` |
| WT-002 creation | `bindWorktreeManager` |
| WT-003 registry | `registry.ts` |
| WT-004 path validation | `pathValidation.ts` |
| WT-005 isolation | `isolation.ts` |
| WT-006 snapshot | `captureWorktreeSnapshot` |
| WT-007 / 013 diff | `worktreeDiff.ts` (UI panel already in chat-ui) |
| WT-008 porcelain | `statusPorcelain.ts` + manager.status |
| WT-009 / 010 patch | `gitPatch.ts` + `applySubagentWorktree` |
| WT-011 untracked | `untrackedTransfer.ts` |
| WT-012 review | `reviewSubagentWorktree` |
| WT-014 adopt/reject | `AdoptWinner` / `rejectSubagentWorktree` |
| WT-015 bridge | `bridge.ts` → host vscode adapter |

Path base: `.agentk/worktrees` (flat dirs: `subagent/t1` → `subagent__t1`). No `vscode` / React.

## Cross-platform (Windows / macOS / Linux)

- All git calls use `execFile('git', argv)` — **no shell**, no `&&` / `/dev/null`.
- Path compare: `realpath` + win32 case-insensitive (`pathsEqual` / `pathIsInside`).
- Worktree dirs flatten `/` → `__` so nested branches work on Windows and `removeAll` is correct.
- CRLF-safe porcelain / status parsing.
- Adopt prefers `main`, then `master`, then current branch.
- `.agentk/` excluded via `.git/info/exclude` (does not dirty the tree).


## How to verify worktrees

### 1) Automated (recommended)

```bash
npm run test -w @agent-k/worktree
```

Includes porcelain/registry/bridge unit tests **and** a real-git smoke test that:
create → edit in worktree → review → apply into clean parent → assert files → cleanup.

### 2) Manual CLI in any git repo

```bash
# From a clean git repo (no dirty parent — apply requires clean working tree)
node -e "
const { WorktreeManager, bindWorktreeManager } = require('./packages/worktree/src/WorktreeManager.ts');
" 
```

Prefer a one-liner via vitest smoke, or from Node with tsx:

```bash
npx --yes tsx -e "
import { WorktreeManager, bindWorktreeManager } from '@agent-k/worktree';
const root = process.cwd();
const m = new WorktreeManager(root);
m.ensureRepo();
const b = bindWorktreeManager(m, root);
const wt = await b.create('manual-check');
console.log('created', wt);
console.log(m.list().map(w => w.path));
console.log('status', m.status(wt.path));
await m.remove(wt.path);
console.log('removed');
"
```

Then inspect with git:

```bash
git worktree list
ls -la .agentk/worktrees
```

### 3) Extension / UI path (after SUB wires register)

1. Subagent finishes → host calls `registerSubagentWorktree(id, repoRoot, wt)`.
2. Webview sends `worktree.review` / `worktree.apply` / `worktree.reject`.
3. Host bridge (`packages/host/...Bridge`) posts `*.result` — already wired in `handleWebviewMessage`.

Until SUB-* creates + registers worktrees, use (1) or (2). Diff review chrome already exists in chat-ui (`worktreeDiff` / SubagentChangesCard) once a review payload arrives.
