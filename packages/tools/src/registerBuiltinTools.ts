/**
 * registerBuiltinTools — register TOOL-001…017 + explore/web/MCP/aliases (R-005).
 */

import type { ToolRegistry } from './ToolRegistry';
import { readTool } from './tools/ReadTool';
import { readFilesTool } from './tools/ReadFilesTool';
import { listDirTool } from './tools/ListDirTool';
import { fileSearchTool } from './tools/FileSearchTool';
import { codebaseSearchTool } from './tools/CodebaseSearchTool';
import { editTool } from './tools/EditTool';
import { writeTool } from './tools/WriteTool';
import { deleteFileTool } from './tools/DeleteFileTool';
import { grepTool } from './tools/GrepTool';
import { globTool } from './tools/GlobTool';
import { terminalTool } from './tools/TerminalTool';
import { askQuestionTool } from './tools/AskQuestionTool';
import { todoWriteTool } from './tools/TodoWriteTool';
import { taskTool } from './tools/TaskTool';
import { skillTool } from './tools/SkillTool';
import { browserToolGroup } from './tools/BrowserToolGroup';
import { debugTools } from './tools/DebugTools';
import { webFetchTool, webSearchTool } from './tools/WebTools';
import {
  lspDefinitionTool,
  lspReferencesTool,
  readLintsTool,
} from './tools/LspLintTools';
import { mcpCallTool, mcpListToolsTool } from './tools/McpTools';
import { switchModeTool } from './tools/SwitchModeTool';
import { aliasTool } from './tools/aliasTool';
import { requestReproduceTool } from './tools/RequestReproduceTool';
import {
  checkpointCreateTool,
  checkpointRestoreTool,
  processListTool,
  terminalOutputTool,
} from './tools/SessionTerminalExtras';

/** All built-in tool definitions in registration order. */
export function builtinTools() {
  const [addInst, removeInst, collectLogs] = debugTools;
  return [
    readTool,
    readFilesTool,
    listDirTool,
    fileSearchTool,
    codebaseSearchTool,
    grepTool,
    globTool,
    editTool,
    writeTool,
    deleteFileTool,
    terminalTool,
    terminalOutputTool,
    processListTool,
    askQuestionTool,
    todoWriteTool,
    taskTool,
    aliasTool(taskTool, 'task_run', 'Alias for task — spawn a subagent.'),
    skillTool,
    aliasTool(skillTool, 'skill_run', 'Alias for skill — load/run a skill.'),
    ...browserToolGroup,
    ...debugTools,
    // Comment: harness/debug FSM still use add_instrumentation names
    aliasTool(addInst, 'add_instrumentation'),
    aliasTool(removeInst, 'remove_instrumentation'),
    aliasTool(collectLogs, 'collect_runtime_logs'),
    requestReproduceTool,
    webFetchTool,
    webSearchTool,
    lspDefinitionTool,
    lspReferencesTool,
    readLintsTool,
    mcpListToolsTool,
    mcpCallTool,
    switchModeTool,
    checkpointCreateTool,
    checkpointRestoreTool,
  ];
}

/** Register every built-in tool onto the given registry. */
export function registerBuiltinTools(registry: ToolRegistry): void {
  for (const tool of builtinTools()) {
    registry.register(tool);
  }
}
