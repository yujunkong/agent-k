/**
 * Context domain barrel — CTX-001…005 (+ shared AGENT-005/006).
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
