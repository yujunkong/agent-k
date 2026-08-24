/**
 * Prefetch barrel — CTX-009 Mention, CTX-010 File intent, CTX-011 Prefetch engine.
 */

export {
  extractMentions,
  extractFileMentions,
  extractSymbolMentions,
  hasCodebaseMention,
  parseFileMentionQuery,
  type Mention,
} from './MentionExtractor';

export {
  resolveFileIntent,
  resolveFileIntents,
  listUnresolvedFileTargets,
  isFileIntent,
  type FileIntent,
  type FileIntentRef,
  type FileTargetResolution,
  type ResolvedFileTarget,
  type FileExistenceChecker,
} from './FileIntent';

export { PrefetchEngine, type PrefetchConfig } from './PrefetchEngine';
export { ContextBlockBuilder, type PrefetchResult } from './ContextBlockBuilder';
export {
  collectIdeContextBag,
  collectGitDiffSync,
  type IdeContextBag,
  type IdeContextCollectorDeps,
} from './ideContextInjector';
export {
  collectLspCursorContext,
  type LspCursorContextDeps,
} from './lspCursorContext';
export {
  inferTaskType,
  selectContextItems,
  formatSelectedContext,
  CONTEXT_STRATEGIES,
  type TaskType,
  type ContextItemKey,
  type ContextStrategy,
  type RankedContextItem,
} from './taskContextStrategy';
export {
  parseStackTrace,
  getContextFiles,
  type StackFrame,
} from './StackTraceParser';
