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
