/**
 * 도구 실행기 구현 (Read Tools)
 * 
 * 각 도구의 실제 실행 로직. 
 * extension host에서 실행됨 (Node.js 환경).
 */
import type { ToolInput, ToolOutput } from './types';

export async function executeGrep(input: ToolInput): Promise<ToolOutput> {
  const { pattern, include, path, maxResults = 50 } = input;
  try {
    // Use ripgrep via child_process
    const { execSync } = require('child_process');
    const args = ['rg', '-n', '--no-heading', '--color', 'never'];
    if (include) args.push('-g', include);
    args.push(pattern);
    if (path) args.push(path);
    
    const result = execSync(args.join(' '), { 
      encoding: 'utf-8', 
      maxBuffer: 1024 * 1024,
      timeout: 30000
    });
    
    const lines = result.split('\n').filter(Boolean).slice(0, maxResults);
    const truncated = result.split('\n').filter(Boolean).length > maxResults;
    
    return {
      success: true,
      data: { results: lines, count: lines.length, truncated },
      metadata: { duration: 0 }
    };
  } catch (error: any) {
    // rg returns exit code 1 when no matches found
    if (error.status === 1) {
      return { success: true, data: { results: [], count: 0 }, metadata: { duration: 0 } };
    }
    return { success: false, error: error.message, metadata: { duration: 0 } };
  }
}

export async function executeGlob(input: ToolInput): Promise<ToolOutput> {
  const { pattern, path: rootPath, maxResults = 100 } = input;
  try {
    const { globSync } = require('fast-glob') as any;
    const results = globSync(pattern, { 
      cwd: rootPath || process.cwd(),
      onlyFiles: true,
      absolute: true
    }).slice(0, maxResults);
    return {
      success: true,
      data: { files: results, count: results.length },
      metadata: { duration: 0 }
    };
  } catch (error: any) {
    return { success: false, error: error.message, metadata: { duration: 0 } };
  }
}

export async function executeReadFile(input: ToolInput): Promise<ToolOutput> {
  const { path, offset, limit, maxChars = 50000 } = input;
  try {
    const fs = require('fs');
    const content = fs.readFileSync(path, 'utf-8');
    let lines = content.split('\n');
    const totalLines = lines.length;
    
    // Apply offset/limit
    if (offset) lines = lines.slice(offset - 1);
    if (limit) lines = lines.slice(0, limit);
    
    let result = lines.join('\n');
    const truncated = result.length > maxChars;
    if (truncated) result = result.slice(0, maxChars) + '\n...(truncated)';
    
    return {
      success: true,
      data: {
        content: result,
        totalLines,
        startLine: offset || 1,
        endLine: (offset || 1) + lines.length - 1,
        truncated
      },
      metadata: { duration: 0 }
    };
  } catch (error: any) {
    return { success: false, error: `Cannot read file: ${error.message}`, metadata: { duration: 0 } };
  }
}

export async function executeListDir(input: ToolInput): Promise<ToolOutput> {
  const { path: dirPath, depth = 1 } = input;
  try {
    const fs = require('fs');
    const path = require('path');
    
    function list(dir: string, currentDepth: number): any[] {
      if (currentDepth > depth) return [];
      const entries: any[] = fs.readdirSync(dir, { withFileTypes: true });
      return entries.map((entry: any) => {
        const fullPath = path.join(dir, entry.name);
        const item: any = { name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' };
        if (entry.isDirectory() && currentDepth < depth) {
          item.children = list(fullPath, currentDepth + 1);
        }
        return item;
      });
    }
    
    const items = list(dirPath, 1);
    return { success: true, data: { path: dirPath, items }, metadata: { duration: 0 } };
  } catch (error: any) {
    return { success: false, error: error.message, metadata: { duration: 0 } };
  }
}

export async function executeCodebaseSearch(input: ToolInput): Promise<ToolOutput> {
  const { query, maxResults = 10 } = input;
  return {
    success: true,
    data: {
      message: 'Semantic search is available in C7 (Production)',
      query,
      results: []
    },
    metadata: { duration: 0 }
  };
}

export async function executeLspDefinition(input: ToolInput): Promise<ToolOutput> {
  const { symbol, path } = input;
  return {
    success: true,
    data: {
      symbol,
      message: 'LSP definition lookup via VS Code API. Use vscode.commands.executeCommand("vscode.executeDefinitionProvider")',
      definitions: []
    },
    metadata: { duration: 0 }
  };
}

export async function executeLspReferences(input: ToolInput): Promise<ToolOutput> {
  const { symbol, path } = input;
  return {
    success: true,
    data: {
      symbol,
      message: 'LSP references lookup via VS Code API',
      references: []
    },
    metadata: { duration: 0 }
  };
}
