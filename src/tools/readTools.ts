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
  description: 'Search files for a regex pattern. Uses ripgrep. Supports file pattern filtering.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      include: { type: 'string', description: 'File glob pattern to include (e.g. "*.ts")', optional: true },
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
  description: 'Find files by glob pattern (e.g. "**/*.ts", "src/**/*.test.*")',
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
  description: 'Read a file from the filesystem. Returns content with line numbers.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' },
      offset: { type: 'number', description: 'Starting line number (1-indexed)', optional: true },
      limit: { type: 'number', description: 'Maximum lines to read', optional: true },
      maxChars: { type: 'number', description: 'Maximum characters (default: 50000)', optional: true }
    },
    required: ['path']
  },
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search'
};

// ─── codebase_search ───────────────────────────────────
const codebaseSearchTool: ToolDefinition = {
  name: 'codebase_search',
  description: 'Semantic search across the codebase. Uses embedding-based similarity search.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language query about the codebase' },
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

// ─── Register all tools ────────────────────────────────
export function registerReadTools() {
  toolRegistry.registerTool(grepTool);
  toolRegistry.registerTool(globTool);
  toolRegistry.registerTool(fileSearchTool);
  toolRegistry.registerTool(listDirTool);
  toolRegistry.registerTool(readFileTool);
  toolRegistry.registerTool(codebaseSearchTool);
  toolRegistry.registerTool(lspDefinitionTool);
  toolRegistry.registerTool(lspReferencesTool);
}
