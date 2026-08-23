/**
 * @agent-k/worktree — Phase 4 WT-001…015 domain (no vscode / React).
 * Git via execFile argv — Windows / macOS / Linux.
 */
export {
  WorktreeManager,
  parseWorktreePorcelain,
  WORKTREE_BASE,
  type WorktreeInfo,
} from './WorktreeManager';
export {
  runGit,
  tryGit,
  canonicalPath,
  pathsEqual,
  pathIsInside,
  worktreeDirFromBranch,
} from './gitExec';
export {
  bindWorktreeManager,
  type SubagentWorktree,
  type SubagentWorktreeSnapshot,
  type SubagentWorktreeBindings,
} from './subagentWorktree';
export {
  WORKTREE_BASE_SEGMENTS,
  managedWorktreeBase,
  isInside,
  assertManagedWorktree,
  isManagedWorktreePath,
} from './pathValidation';
export {
  parseStatusPorcelain,
  porcelainPaths,
  type PorcelainEntry,
} from './statusPorcelain';
export { assertIsolatedWorktree, captureWorktreeSnapshot } from './isolation';
export {
  parseWorktreeUnifiedDiff,
  buildWorktreeDiffFiles,
  worktreeDiffTotals,
  normalizeRepoPath,
  type WorktreeDiffFile,
  type WorktreeDiffLine,
  type WorktreeDiffTotals,
  type WorktreeDiffPreview,
} from './worktreeDiff';
export {
  checkGitPatch,
  applyGitPatch,
  reverseGitPatch,
  type GitPatchCheckResult,
} from './gitPatch';
export {
  preflightUntrackedTransfer,
  copyUntrackedFiles,
  rollbackCreatedFiles,
} from './untrackedTransfer';
export {
  reviewSubagentWorktree,
  applySubagentWorktree,
  rejectSubagentWorktree,
  type WorktreeReview,
  type WorktreeApplyResult,
} from './subagentWorktreeReview';
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
} from './registry';
export { AdoptWinner, type AdoptionResult, type AdoptableTrial } from './AdoptWinner';
export { BestOfN, type BoNTrial, type BoNConfig, type BoNTrialRunner } from './BestOfN';
export { StalenessChecker } from './staleness';
export {
  handleWorktreeReviewMessage,
  handleWorktreeApplyMessage,
  handleWorktreeRejectMessage,
  type WorktreeBridgePost,
} from './bridge';
