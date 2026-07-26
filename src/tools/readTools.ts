/**
 * 읽기 도구 8개 구현 (C1-T03 ~ C1-T10)
 * 
 * grep, glob, file_search, list_dir, read_file, codebase_search, lsp_definition, lsp_references
 */
import type { ToolDefinition } from '../agent/types';
import { toolRegistry } from './registry';

// ─── grep ──────────────────────────────────────────────
const grepTool: ToolDefinition = {
  name: 'grep',
  description:
    'Search file CONTENTS for a regex/symbol (ripgrep). Use for identifiers, strings, error text. ' +
    'Do NOT use glob patterns like **/*.ts here — that is the glob tool. ' +
    'Cursor UI shows this as Grepped.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex or literal to find inside files (e.g. ask_question|waitForQuestion)' },
      include: { type: 'string', description: 'Limit to file glob (e.g. "*.ts", "src/**/*.py")', optional: true },
      path: { type: 'string', description: 'Directory to search in', optional: true },
      maxResults: { type: 'number', description: 'Maximum results (default: 50)', optional: true }
    },
    required: ['pattern']
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search',
  requiresApproval: false
};

// ─── glob ──────────────────────────────────────────────
const globTool: ToolDefinition = {
  name: 'glob',
  description:
    'Find files by path/name glob (e.g. "**/*.ts", "rust-server/**/*.rs"). ' +
    'Not for searching inside file contents — use grep for that. Cursor UI shows this as Searched.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern to match' },
      path: { type: 'string', description: 'Root directory', optional: true },
      maxResults: { type: 'number', description: 'Maximum results (default: 100)', optional: true }
    },
    required: ['pattern']
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search'
};

// ─── file_search ───────────────────────────────────────
const fileSearchTool: ToolDefinition = {
  name: 'file_search',
  description: 'Search for files by name pattern. Supports fuzzy matching.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'File name or pattern to search' },
      path: { type: 'string', description: 'Directory to search in', optional: true },
      maxResults: { type: 'number', description: 'Maximum results (default: 50)', optional: true }
    },
    required: ['query']
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search'
};

// ─── list_dir ──────────────────────────────────────────
const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description: 'List files and directories in a path.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path to list' },
      depth: { type: 'number', description: 'Recursion depth (default: 1)', optional: true }
    },
    required: ['path']
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search'
};

// ─── read_file ─────────────────────────────────────────
const readFileTool: ToolDefinition = {
  name: 'read_file',
  description:
    'Read a slice of one file (Cursor-style). Default ~250 lines. For several known paths prefer read_files in one call. Prefer grep/codebase_search first, then windowed reads.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' },
      offset: {
        type: 'number',
        description: 'Starting line (1-indexed). Use match line − context.',
        optional: true
      },
      limit: {
        type: 'number',
        description: 'Max lines to read (default 250 when omitted)',
        optional: true
      },
      maxChars: { type: 'number', description: 'Maximum characters (default: 50000)', optional: true }
    },
    required: ['path']
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search'
};

// ─── read_files (batch) ────────────────────────────────
const readFilesTool: ToolDefinition = {
  name: 'read_files',
  description:
    'Read slices of many files in one call (up to 12). Required: paths (string array). Aliases path/files also accepted. Use when exploring so you do not drip-read 2–4 files per turn. Same offset/limit defaults as read_file.',
  parameters: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        description: 'Non-empty list of workspace-relative or absolute file paths (max 12). Required.',
        items: { type: 'string' }
      },
      offset: {
        type: 'number',
        description: 'Starting line for each file (1-indexed)',
        optional: true
      },
      limit: {
        type: 'number',
        description: 'Max lines per file (default 250)',
        optional: true
      },
      maxChars: {
        type: 'number',
        description: 'Max characters per file (default: 50000)',
        optional: true
      }
    },
    required: ['paths']
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search'
};

// ─── codebase_search ───────────────────────────────────
const codebaseSearchTool: ToolDefinition = {
  name: 'codebase_search',
  description:
    'Find relevant code regions (path + startLine/endLine + snippet). Prefer this or grep before read_file. Then read only those windows with offset/limit.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language or keyword query about the codebase' },
      maxResults: { type: 'number', description: 'Maximum results (default: 10)', optional: true }
    },
    required: ['query']
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search'
};

// ─── lsp_definition ────────────────────────────────────
const lspDefinitionTool: ToolDefinition = {
  name: 'lsp_definition',
  description: 'Go to definition for a symbol. Uses LSP to find symbol definitions.',
  parameters: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Symbol name to find' },
      path: { type: 'string', description: 'File path context', optional: true }
    },
    required: ['symbol']
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search'
};

// ─── lsp_references ────────────────────────────────────
const lspReferencesTool: ToolDefinition = {
  name: 'lsp_references',
  description: 'Find all references to a symbol. Uses LSP to find symbol usages.',
  parameters: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Symbol name to find references for' },
      path: { type: 'string', description: 'File path context', optional: true }
    },
    required: ['symbol']
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search'
};

// ─── read_lints (HARB-T06 / T30) ───────────────────────
/** 워크스페이스 진단(린트) 조회 — edit 후 자동 검증 루프에서도 사용 */
const readLintsTool: ToolDefinition = {
  name: 'read_lints',
  description: 'Read linter/diagnostics for one or more file paths. Returns errors and warnings.',
  parameters: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        description: 'Absolute or workspace-relative file paths to lint',
        optional: true
      }
    },
    required: []
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search',
  requiresApproval: false
};

// ─── Register all tools ────────────────────────────────
export function registerReadTools() {
  toolRegistry.registerTool(grepTool);
  toolRegistry.registerTool(globTool);
  toolRegistry.registerTool(fileSearchTool);
  toolRegistry.registerTool(listDirTool);
  toolRegistry.registerTool(readFileTool);
  toolRegistry.registerTool(readFilesTool);
  toolRegistry.registerTool(codebaseSearchTool);
  toolRegistry.registerTool(lspDefinitionTool);
  toolRegistry.registerTool(lspReferencesTool);
  toolRegistry.registerTool(readLintsTool);
}
