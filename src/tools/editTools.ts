/**
 * 편집 도구 정의 (C2)
 * 
 * edit_file, write_file, run_terminal_cmd
 */
import type { ToolDefinition } from '../agent/types';
import { toolRegistry } from './registry';

const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description: 'Edit a file using search-replace. Each hunk must match exactly one unique location. Supports fuzzy matching for whitespace flexibility.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to edit' },
      hunks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            oldText: { type: 'string', description: 'Text to find (must match exactly one location)' },
            newText: { type: 'string', description: 'Text to replace with' }
          },
          required: ['oldText', 'newText']
        },
        description: 'Array of search-replace hunks'
      },
      isComplete: { type: 'boolean', description: 'If false, more edits follow. Skip final post-edit validation.', optional: true }
    },
    required: ['path', 'hunks']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'edit',
  requiresApproval: true,
  destructive: true
};

const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Create a new file or overwrite a short file (<200 lines). For existing files, use edit_file instead.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to create' },
      content: { type: 'string', description: 'File content' }
    },
    required: ['path', 'content']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'edit',
  requiresApproval: true,
  destructive: true
};

const runTerminalCmdTool: ToolDefinition = {
  name: 'run_terminal_cmd',
  description:
    'Run a terminal command in the workspace root (build, test, lint, git, cargo, etc.). Prefer arg name `command` (alias `cmd` also accepted). ' +
    'Do not search source with FINDSTR/findstr/Select-String — use the grep tool (FINDSTR exit 1 = no match, not a hard failure).',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      cmd: {
        type: 'string',
        description: 'Alias for command',
        optional: true
      },
      description: {
        type: 'string',
        description: 'What this command does (visible in timeline)',
        optional: true
      },
      timeout: {
        type: 'number',
        description: 'Timeout in ms (default: 120000)',
        optional: true
      },
      requireApproval: {
        type: 'boolean',
        description: 'Force approval even in auto mode',
        optional: true
      }
    },
    required: ['command']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'terminal',
  requiresApproval: true,
  destructive: true
};

const terminalOutputTool: ToolDefinition = {
  name: 'terminal_output',
  description: 'Get output from a running terminal session.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Terminal session ID', optional: true }
    },
    required: []
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'terminal'
};

const processListTool: ToolDefinition = {
  name: 'process_list',
  description: 'List running terminal processes.',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'terminal'
};

// instrument_code is deprecated — use add_instrumentation (PRD-C6 standard name, registered in c5c7Tools.ts)
// @deprecated RW-C6-02: removed duplicate, add_instrumentation is the canonical name

const askQuestionTool: ToolDefinition = {
  name: 'ask_question',
  description:
    'Ask the user clarifying REQUIREMENT question(s) (Clarifying Questions UI). ' +
    'Prefer ONE call that batches all open decisions via questions:[{question,options,allow_multiple}]. ' +
    'Set allow_multiple=true when the user may pick several options (checkboxes). ' +
    'Do not repeat the same question. options MUST be plain strings, never objects.',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'Single question (or use questions[] for a batch)',
        optional: true
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Choices for the single question — plain strings only',
        optional: true
      },
      allow_multiple: {
        type: 'boolean',
        description:
          'If true, user can select multiple options (checkboxes). Default false (radio).',
        optional: true
      },
      questions: {
        type: 'array',
        description:
          'Batch of questions in one UI round. Prefer this over calling ask_question repeatedly.',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' }, optional: true },
            allow_multiple: { type: 'boolean', optional: true }
          },
          required: ['question']
        },
        optional: true
      }
    },
    required: []
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'session'
};

const todoWriteTool: ToolDefinition = {
  name: 'todo_write',
  description: 'Record a todo item or update task progress.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['add', 'update', 'complete'], description: 'Action' },
      text: { type: 'string', description: 'Todo text' },
      status: { type: 'string', optional: true }
    },
    required: ['action', 'text']
  },
  modeAllowlist: ['ask', 'agent', 'plan'],
  category: 'session'
};

const deleteFileTool: ToolDefinition = {
  name: 'delete_file',
  description: 'Delete a file in the workspace (high risk — requires approval).',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to delete' }
    },
    required: ['path']
  },
  modeAllowlist: ['agent', 'debug'],
  category: 'edit',
  requiresApproval: true,
  destructive: true
};

// ─── Register all edit/session tools ──────────────────
export function registerEditTools() {
  toolRegistry.registerTool(editFileTool);
  toolRegistry.registerTool(writeFileTool);
  toolRegistry.registerTool(deleteFileTool);
  toolRegistry.registerTool(runTerminalCmdTool);
  toolRegistry.registerTool(terminalOutputTool);
  toolRegistry.registerTool(processListTool);
  // instrument_code removed — use add_instrumentation (RW-C6-02)
  toolRegistry.registerTool(askQuestionTool);
  toolRegistry.registerTool(todoWriteTool);
}
