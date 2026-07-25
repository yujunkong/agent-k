/**
 * SkillTool — skill 도구: 목록/본문 로드 → 프롬프트·워크플로 주입 (C7-T20, PRD-28 FR-05)
 *
 * Zod 스키마 등록, 이름 조회 실패 시 명확 에러, 본문 truncate,
 * 핀 스킬과 중복 주입 시 예산 준수
 */
import { z } from 'zod';
import { SkillRegistry, getSkillRegistry } from '../../skills/SkillRegistry';

// ===== Schemas =====

export const skillListSchema = z.object({
  filter: z.string().optional().describe('Optional filter string to search skills by name/description')
});

export const skillLoadSchema = z.object({
  name: z.string().describe('Name of the skill to load (without .md extension)')
});

export const skillPinSchema = z.object({
  name: z.string().describe('Name of the skill to pin')
});

export const skillUnpinSchema = z.object({
  name: z.string().describe('Name of the skill to unpin')
});

// ===== Tool Handlers =====

export interface SkillToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

const MAX_DISPLAY_CONTENT = 8000; // Max chars for skill content in display

export class SkillTool {
  private registry: SkillRegistry;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  /**
   * Handle skill_list — list available skills
   */
  handleList(params: z.infer<typeof skillListSchema>): SkillToolResult {
    const all = this.registry.getAll();
    const filtered = params.filter
      ? all.filter((s: { name: string; description: string }) =>
          s.name.toLowerCase().includes(params.filter!.toLowerCase()) ||
          s.description.toLowerCase().includes(params.filter!.toLowerCase()))
      : all;

    return {
      success: true,
      data: filtered.map((s: { name: string; description: string; pinned: boolean; content: { length: number } }) => ({
        name: s.name,
        description: s.description,
        pinned: s.pinned,
        size: s.content.length
      }))
    };
  }

  /**
   * Handle skill_load — load skill content
   */
  handleLoad(params: z.infer<typeof skillLoadSchema>): SkillToolResult {
    const skill = this.registry.get(params.name);

    if (!skill) {
      return {
        success: false,
        error: `Skill not found: "${params.name}". Use skill_list to see available skills. Check the skills directory for available files.`
      };
    }

    return {
      success: true,
      data: {
        name: skill.name,
        description: skill.description,
        content: skill.content.slice(0, MAX_DISPLAY_CONTENT),
        pinned: skill.pinned,
        truncated: skill.content.length > MAX_DISPLAY_CONTENT
      }
    };
  }

  /**
   * Handle skill_pin
   */
  handlePin(params: z.infer<typeof skillPinSchema>): SkillToolResult {
    const success = this.registry.pin(params.name);
    if (!success) {
      return {
        success: false,
        error: `Cannot pin: skill "${params.name}" not found. Load it first with skill_load.`
      };
    }

    return {
      success: true,
      data: { pinned: params.name, pinnedCount: this.registry.pinnedCount }
    };
  }

  /**
   * Handle skill_unpin
   */
  handleUnpin(params: z.infer<typeof skillUnpinSchema>): SkillToolResult {
    this.registry.unpin(params.name);
    return {
      success: true,
      data: { unpinned: params.name, pinnedCount: this.registry.pinnedCount }
    };
  }

  /**
   * Handle skill_run — 스킬 본문 + 선택 입력을 턴 컨텍스트로 반환 (C7-T20 / RW-C7-07)
   */
  handleRun(params: { skill: string; input?: string }): SkillToolResult {
    const loadResult = this.handleLoad({ name: params.skill });
    if (!loadResult.success) {
      return loadResult;
    }
    return {
      success: true,
      data: {
        ...(loadResult.data as Record<string, unknown>),
        userInput: params.input,
        message: `Skill "${params.skill}" loaded. Follow the skill content in this turn.`
      }
    };
  }
}

/** Singleton SkillTool for AgentLoop dispatch */
let _skillTool: SkillTool | null = null;

export function getSkillTool(registry?: SkillRegistry): SkillTool {
  if (!_skillTool) {
    _skillTool = new SkillTool(registry ?? getSkillRegistry());
  }
  return _skillTool;
}

// ===== Tool Metadata =====

export const SKILL_TOOL_META = {
  skill_list: { name: 'skill_list', description: 'List available skills', tierAccess: 'B', category: 'orchestration' },
  skill_load: { name: 'skill_load', description: 'Load a skill by name to see its content', tierAccess: 'B', category: 'orchestration' },
  skill_pin: { name: 'skill_pin', description: 'Pin a skill for auto-injection into prompts', tierAccess: 'B', category: 'orchestration' },
  skill_unpin: { name: 'skill_unpin', description: 'Unpin a skill (stops injection immediately)', tierAccess: 'B', category: 'orchestration' }
};
