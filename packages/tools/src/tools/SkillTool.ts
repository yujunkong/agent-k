/**
 * TOOL-013 SkillTool — list/load skill markdown from workspace skills dirs.
 * Ported from v2.1 SkillRegistry + SkillTool (Feature-ID transplant).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ToolDefinition, ToolResult } from '../types';
import { withToolTiming } from '../pathUtils';

const MAX_CONTENT = 8_000;

/** @deprecated alias — prefer SkillLoadResult */
export type SkillStubResult = SkillLoadResult;

export interface SkillLoadResult {
  kind: 'skill_result';
  skillId: string;
  status: 'loaded' | 'listed' | 'missing';
  description?: string;
  content?: string;
  truncated?: boolean;
  skills?: Array<{ id: string; description: string; size: number }>;
  message?: string;
}

function skillDirs(workspaceRoot: string): string[] {
  return [
    path.join(workspaceRoot, 'skills'),
    path.join(workspaceRoot, '.agent-k', 'skills'),
    path.join(workspaceRoot, '.agents', 'skills'),
  ];
}

function listSkills(workspaceRoot: string): Array<{
  id: string;
  description: string;
  size: number;
  filePath: string;
}> {
  const out: Array<{
    id: string;
    description: string;
    size: number;
    filePath: string;
  }> = [];
  const seen = new Set<string>();
  for (const dir of skillDirs(workspaceRoot)) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      const id = file.replace(/\.md$/i, '');
      if (seen.has(id)) continue;
      seen.add(id);
      const filePath = path.join(dir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const first = content.split('\n')[0] || '';
        const description = first.replace(/^#\s*/, '').trim() || id;
        out.push({ id, description, size: content.length, filePath });
      } catch {
        /* skip unreadable */
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function loadSkill(
  workspaceRoot: string,
  skillId: string,
): { ok: true; content: string; description: string } | { ok: false; error: string } {
  const hit = listSkills(workspaceRoot).find((s) => s.id === skillId);
  if (!hit) {
    return {
      ok: false,
      error: `Skill not found: "${skillId}". Use action=list to see available skills.`,
    };
  }
  return {
    ok: true,
    content: fs.readFileSync(hit.filePath, 'utf8'),
    description: hit.description,
  };
}

export const skillTool: ToolDefinition = {
  name: 'skill',
  description:
    'List or load a workspace skill (skills/*.md). Loaded content should guide this turn.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'list | load | run (run = load + follow instructions)',
      },
      skillId: { type: 'string', description: 'Skill id (filename without .md)' },
      id: { type: 'string', description: 'Alias for skillId' },
      filter: { type: 'string', description: 'Optional filter for list' },
      input: { type: 'string', description: 'Optional user input for run' },
    },
    required: [],
  },
  permissionHint: 'none',
  timeoutMs: 10_000,
  cancelSupported: true,
  timelineEventType: 'task',
  modeAllowlist: ['agent', 'debug', 'plan', 'ask'],
  category: 'orchestration',
  async execute(input, ctx): Promise<ToolResult> {
    return withToolTiming(ctx.signal, async () => {
      const action = String(input.action ?? 'load').toLowerCase();
      const skillId = String(input.skillId ?? input.id ?? '').trim();

      if (action === 'list') {
        const filter = String(input.filter ?? '').toLowerCase();
        let skills = listSkills(ctx.workspaceRoot);
        if (filter) {
          skills = skills.filter(
            (s) =>
              s.id.toLowerCase().includes(filter) ||
              s.description.toLowerCase().includes(filter),
          );
        }
        const result: SkillLoadResult = {
          kind: 'skill_result',
          skillId: '',
          status: 'listed',
          skills: skills.map((s) => ({
            id: s.id,
            description: s.description,
            size: s.size,
          })),
          message: `Found ${skills.length} skill(s).`,
        };
        return { success: true, data: result };
      }

      if (!skillId) {
        return { success: false, error: 'skill requires skillId (or action=list)' };
      }

      const loaded = loadSkill(ctx.workspaceRoot, skillId);
      if (!loaded.ok) {
        return { success: false, error: loaded.error };
      }

      const truncated = loaded.content.length > MAX_CONTENT;
      const content = loaded.content.slice(0, MAX_CONTENT);
      const result: SkillLoadResult = {
        kind: 'skill_result',
        skillId,
        status: 'loaded',
        description: loaded.description,
        content,
        truncated,
        message:
          action === 'run'
            ? `Skill "${skillId}" loaded. Follow the skill content in this turn.${
                input.input ? ` User input: ${String(input.input)}` : ''
              }`
            : `Skill "${skillId}" loaded.`,
      };
      return { success: true, data: result };
    });
  },
};
