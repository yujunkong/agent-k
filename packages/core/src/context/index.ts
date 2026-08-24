/**
 * Context domain barrel — CTX-001…005 (+ re-exports CTX-006…012 barrels).
 */

export {
  COMPACTION_TRIGGER_RATIO,
  DEFAULT_CONTEXT_BUDGET_TOKENS,
  createContextBudget,
  estimateMessagesTokens,
  estimateTokens,
  isOverBudget,
  type ContextBudget,
} from './budget';

export {
  DEFAULT_READ_MAX_LINES,
  resolveReadMaxLines,
  truncateToMaxLines,
} from './readMaxLines';

export {
  CompactionEngine,
  repairToolCallPairs,
  validateToolCallPairIntegrity,
  type CompactLevel,
  type CompactionResult,
} from './CompactionEngine';

export {
  ContextAssembler,
  type AssembleInput,
  type AssembleResult,
} from './ContextAssembler';

export {
  WorkspaceContext,
  type WorkspaceContextSnapshot,
  type WorkspaceRoot,
} from './WorkspaceContext';

/** CTX-006…008 live under src/indexing — re-exported for context consumers. */
export * from '../indexing';
/** CTX-009…011 live under src/prefetch. */
export * from '../prefetch';
/** CTX-012 lives under src/search. */
export * from '../search';
