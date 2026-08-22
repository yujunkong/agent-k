/**
 * @agent-k/tools — Tool registry and executors (R-005 contracts).
 *
 * Feature IDs (Phase 2):
 * TOOL-001 ReadTool · TOOL-002 EditTool · TOOL-003 WriteTool
 * TOOL-004 GrepTool · TOOL-005 GlobTool · TOOL-006 TerminalTool
 * TOOL-007 AskQuestionTool · TOOL-008 ToolCallParser
 * TOOL-009 ExecutorAbstraction · TOOL-010 WriteExecutor
 * TOOL-011 TodoWriteTool · TOOL-012 TaskTool · TOOL-013 SkillTool
 * TOOL-014 BrowserToolGroup · TOOL-015 DebugTools
 * TOOL-016 ToolRegistry · TOOL-017 ParallelSearch
 */

export * from './types';
export * from './pathUtils';
export * from './ToolRegistry';
export * from './ExecutorAbstraction';
export * from './ToolCallParser';
export * from './WriteExecutor';
export * from './ParallelSearch';
export * from './registerBuiltinTools';

export { readTool } from './tools/ReadTool';
export { editTool, applySearchReplace } from './tools/EditTool';
export { writeTool } from './tools/WriteTool';
export { grepTool, grepWorkspace, simpleGlobToRegExp } from './tools/GrepTool';
export { globTool, globWorkspace } from './tools/GlobTool';
export { terminalTool, runTerminalCommand } from './tools/TerminalTool';
export { askQuestionTool } from './tools/AskQuestionTool';
export type { AskQuestionPayload } from './tools/AskQuestionTool';
export { todoWriteTool } from './tools/TodoWriteTool';
export { taskTool } from './tools/TaskTool';
export type { SubAgentTaskDescriptor } from './tools/TaskTool';
export { skillTool } from './tools/SkillTool';
export type { SkillStubResult } from './tools/SkillTool';
export {
  browserToolGroup,
  browserNavigateTool,
  browserSnapshotTool,
} from './tools/BrowserToolGroup';
export {
  debugTools,
  addInstrumentationTool,
  removeInstrumentationTool,
  collectRuntimeLogsTool,
  resetDebugInstrumentation,
} from './tools/DebugTools';
