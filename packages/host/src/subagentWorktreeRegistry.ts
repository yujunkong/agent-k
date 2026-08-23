/**
 * HOST-013 — re-export WT-003 registry from @agent-k/worktree.
 */
export {
  registerSubagentWorktree,
  getRegisteredSubagentWorktree,
  unregisterSubagentWorktree,
  reviewRegisteredSubagentWorktree,
  applyRegisteredSubagentWorktree,
  rejectRegisteredSubagentWorktree,
  clearSubagentWorktreeRegistry,
  listRegisteredSubagentWorktrees,
  type RegisteredSubagentWorktree,
  type SubagentWorktree,
  type WorktreeReview,
  type WorktreeApplyResult,
} from '@agent-k/worktree';
