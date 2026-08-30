/**
 * HARNESS domain barrel — project rules (HARNESS-005) and related helpers.
 */
export {
  CURSOR_RULES_DIR,
  DEFAULT_RULES_FILE,
  PROJECT_CUSTOM_RULES_DIR,
  PROJECT_RULES_FILES,
  formatProjectRulesBlock,
  getProjectRulesCached,
  invalidateProjectRulesCache,
  isAllowedCustomRuleName,
  listCursorRuleFileNames,
  listCustomRuleFileNames,
  listProjectRuleFiles,
  loadProjectRulesFromFs,
  resolveProjectRulesContent,
  titleFromRuleContent,
  type ProjectRuleFile,
  type ProjectRuleKind,
} from './ProjectRulesLoader';
export {
  injectVerificationFirst,
  VERIFICATION_FIRST_PROMPT,
} from './VerificationFirstPrompt';
export {
  POST_EDIT_VERIFY_TOOLS,
  PostEditVerificationTracker,
  extractEditedFilePath,
  formatPostEditVerificationFailure,
  parseLintErrorsFromToolResult,
  type LintDiagnostic,
} from './PostEditVerification';
export {
  createVerifyExitState,
  evaluateVerifyExit,
  markPathEdited,
  markPathVerified,
  type EvaluateVerifyExitResult,
  type VerifyExitState,
} from './VerifyExitCheck';
export {
  formatPrefetchBlock,
  prependPrefetchToUserPrompt,
  stripHarnessForDisplay,
} from './HarnessBridge';
export {
  inferTierFromModelId,
  getPolicyForModel,
  getPolicyForTier,
  estimateComplexity,
  hasSecurityKeywords,
  TIER_POLICIES,
  type ModelTier,
  type TierPolicy,
} from './ModelTiers';
export {
  TIER_A_CORE,
  getToolNamesForTier,
  isToolAllowedForTier,
  type TierToolFilterOptions,
} from './AWhitelist';
export {
  routeByHeuristics,
  type RoutingDecision,
  type RoutingSignal,
} from './RoutingHeuristics';
export { injectCursorPattern, CURSOR_PATTERN_PROMPT } from './CursorPattern';
export {
  injectTurnStructure,
  TURN_STRUCTURE_PROMPT,
} from './PromptTurnStructure';
