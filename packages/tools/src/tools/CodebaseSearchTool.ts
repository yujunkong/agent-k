/**
 * TOOL-004 companion — codebase_search: NL locate via grep snippets.
 * (Embedding/index path deferred; grep fallback matches v2.1 last resort.)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';
import { grepWorkspace } from './GrepTool';

export const codebaseSearchTool: ToolDefinition = {
  name: 'codebase_search',
  description:
    'Semantic-style codebase locate. Returns path + line windows; then use read_file/read_files with offset/limit. Prefer for conceptual queries; use grep for exact symbols.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural-language or keyword query' },
      maxResults: { type: 'number', description: 'Max hits (default 10, max 25)' },
    },
    required: ['query'],
  },
  permissionHint: 'read',
  timeoutMs: 45_000,
  cancelSupported: true,
  timelineEventType: 'searching',
  modeAllowlist: ['ask', 'agent', 'plan', 'debug'],
  category: 'search',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const query = String(input.query ?? '').trim();
      const maxResults = Math.min(25, Math.max(1, Number(input.maxResults) || 10));
      if (!query) {
        return { success: false, error: 'codebase_search requires query' };
      }

      const token =
        query
          .split(/\s+/)
          .filter(
            (t) =>
              t.length >= 3 &&
              !/^(the|and|for|with|from|that|this|file|code|how|what)$/i.test(t)
          )
          .slice(0, 4)
          .join('|') || query.slice(0, 80);

      const pattern = token.includes('|')
        ? token
        : token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const { results: rows } = await grepWorkspace({
        workspaceRoot: ctx.workspaceRoot,
        pattern,
        maxResults: maxResults * 3,
        signal: ctx.signal,
      });

      const out: Array<{
        path: string;
        startLine: number;
        endLine: number;
        matchLine: number;
        snippet: string;
      }> = [];
      const seen = new Set<string>();

      for (const row of rows) {
        const m = row.match(/^(.*?):(\d+):(.*)$/);
        if (!m) continue;
        const rel = m[1];
        const matchLine = Number(m[2]);
        const key = `${rel}:${matchLine}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let snippet = m[3];
        let startLine = matchLine;
        let endLine = matchLine;
        try {
          const abs = path.join(ctx.workspaceRoot, rel);
          const text = await fs.readFile(abs, 'utf-8');
          const all = text.split(/\r?\n/);
          startLine = Math.max(1, matchLine - 15);
          endLine = Math.min(all.length, matchLine + 15);
          snippet = all
            .slice(startLine - 1, endLine)
            .map((ln, i) => `${startLine + i}|${ln}`)
            .join('\n')
            .slice(0, 2000);
        } catch {
          /* keep single-line */
        }

        out.push({ path: rel, startLine, endLine, matchLine, snippet });
        if (out.length >= maxResults) break;
      }

      return {
        success: true,
        data: {
          query,
          method: 'grep',
          results: out,
          count: out.length,
          note: 'Use read_file/read_files with offset/limit around startLine–endLine; do not dump whole files.',
        },
      };
    });
  },
};
