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
