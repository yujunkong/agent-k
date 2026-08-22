/**
 * Debug domain barrel — DEBUG-001…010 (domain only, no UI).
 */

export {
  countInstrumentationMarkers,
  DEBUG_STAGE_PROMPTS,
  DEBUG_STAGE_TOOLS,
  DebugModeController,
  INSTRUMENTATION_TEMPLATES,
  isDebugToolAllowedForStage,
  MULTI_FILE_DEBUG_TEMPLATES,
  pickMultiFileTemplate,
  type DebugEvidenceItem,
  type DebugStage,
  type DebugState,
  type DebugTimelineEntry,
  type Hypothesis,
  type HypothesisStatus,
  type MultiFileDebugTemplate,
} from './DebugModeController';
