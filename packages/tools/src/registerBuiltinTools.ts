/**
 * registerBuiltinTools — register TOOL-001…015 + browser/debug group (R-005).
 */

import type { ToolRegistry } from './ToolRegistry';
import { readTool } from './tools/ReadTool';
import { editTool } from './tools/EditTool';
import { writeTool } from './tools/WriteTool';
import { grepTool } from './tools/GrepTool';
import { globTool } from './tools/GlobTool';
import { terminalTool } from './tools/TerminalTool';
import { askQuestionTool } from './tools/AskQuestionTool';
import { todoWriteTool } from './tools/TodoWriteTool';
import { taskTool } from './tools/TaskTool';
import { skillTool } from './tools/SkillTool';
import { browserToolGroup } from './tools/BrowserToolGroup';
import { debugTools } from './tools/DebugTools';

/** All built-in tool definitions in registration order. */
export function builtinTools() {
  return [
    readTool,
    editTool,
    writeTool,
    grepTool,
    globTool,
    terminalTool,
    askQuestionTool,
    todoWriteTool,
    taskTool,
    skillTool,
    ...browserToolGroup,
    ...debugTools,
  ];
}

/** Register every built-in tool onto the given registry. */
export function registerBuiltinTools(registry: ToolRegistry): void {
  for (const tool of builtinTools()) {
    registry.register(tool);
  }
}
