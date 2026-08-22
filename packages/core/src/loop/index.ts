/**
 * Loop domain barrel — AGENT-001…019 (core runtime pieces).
 */

export {
  AgentLoopController,
  type AgentLoopConfig,
  type AgentLoopDeps,
  type AgentLoopEvent,
  type AgentLoopRunInput,
  type AgentLoopRunResult,
  type AgentLoopStatus,
  type StopReason,
} from './AgentLoopController';

export {
  claimsContinueWork,
  CLASSIFIER_FNS,
  isWeakFinalAnswer,
  looksLikeBrokenToolPayload,
  looksLikeClosingSummary,
  looksLikeTaskHandoff,
  type ClassifierFnName,
} from './classifiers';

export {
  ClassifierDiagnostics,
  type ClassifyEvent,
  type ClassifyListener,
} from './ClassifierDiagnostics';

export { DoomLoopDetector, type DoomLoopInfo } from './DoomLoopDetector';

export {
  DoomLoopHandler,
  type DoomLoopAlert,
} from './DoomLoopHandler';

export {
  classifyError,
  ErrorRecovery,
  type ClassifiedError,
  type ErrorKind,
  type ErrorRecoveryOptions,
} from './ErrorRecovery';

export {
  isParallelSafeTool,
  ParallelExecutor,
  type ParallelTask,
} from './ParallelExecutor';

export {
  SEARCH_BEFORE_READ_MESSAGE,
  SEARCH_BEFORE_READ_NUDGE,
  SEARCH_TOOL_NAMES,
  READ_TOOL_NAMES,
  batchHasBlindRead,
  batchHasSearchTool,
  isBlindReadWithoutSearch,
  isReadTool,
  isSearchTool,
  shouldBlockBlindRead,
  userMessageHintsPath,
} from './searchBeforeRead';

export {
  StreamingToolExecutor,
  type StreamingToolRequest,
  type ToolChunkHandler,
} from './StreamingToolExecutor';

export {
  buildResynthesizeMessages,
  synthesizeInstructions,
  type SynthesizeInput,
} from './synthesizeInstructions';

export {
  DEFAULT_TURN_TIMEOUT_MS,
  resolveTurnTimeoutMs,
  RunTimeoutGuard,
  type RunTimeoutCallbacks,
} from './turnTimeout';
