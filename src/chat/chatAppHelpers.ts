/**
 * Pure helpers extracted from ChatApp (phase 1 split).
 */
import type { PlanModeController } from '../plan/PlanModeController';
import { stripResynthForDisplay } from '../loop/synthesizeInstructions';
import { stripFakeToolMarkup } from './displaySanitize';
import { stripHarnessForDisplay } from './harnessBridge';
import { dedupeAssistantBody } from './assistantStreamSession';
import type { ChatMessage, FileEditPreview, ModePicker } from './types';

export const MODE_LABELS: Record<ModePicker, string> = {
  auto: 'Auto',
  ask: 'Ask',
  agent: 'Agent',
  plan: 'Plan',
  debug: 'Debug'
};

export const MODE_TOOLTIPS: Record<ModePicker, string> = {
  auto: 'Pick Ask / Plan / Debug / Agent from the message.',
  ask: 'Read-only exploration. No file edits.',
  agent: 'Autonomous implementation. Tools: read, edit, terminal.',
  plan: 'Design first. Outputs PLAN.md with Mermaid.',
  debug: 'Hypothesis → Instrument → Reproduce → Minimal fix.'
};

export const PLAN_STICKY_PHASES = new Set(['research', 'planning', 'review']);

export function textFromPlanController(controller: PlanModeController): string {
  return controller.getState().researchResults || 'Plan';
}

export function buildPlanResearchContext(controller: PlanModeController): string {
  const state = controller.getState();
  const questions = controller
    .getQuestions()
    .map((q) => `- Q: ${q.question}\n  A: ${q.answer || '(no answer)'}`)
    .join('\n');
  return [
    state.researchResults ? `Research notes:\n${state.researchResults.slice(0, 8000)}` : '',
    questions ? `Clarifying answers:\n${questions}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function shortModelName(raw: string): string {
  const base = (raw || '').split('/').pop() || raw || 'model';
  return base.length > 32 ? `${base.slice(0, 30)}…` : base;
}

/** Dedupe session file edits by path (latest wins) */
export function collectSessionFileEdits(messages: ChatMessage[]): FileEditPreview[] {
  const map = new Map<string, FileEditPreview>();
  for (const m of messages) {
    if (!Array.isArray(m.fileEdits)) continue;
    for (const fe of m.fileEdits) {
      const key = (fe.absPath || fe.path || '').replace(/\\/g, '/');
      if (!key) continue;
      map.set(key, fe);
    }
  }
  return [...map.values()];
}

/** Finalize or drop a streaming assistant (shared by tab switch / reload). */
export function finalizeStreamingAssistant(m: ChatMessage): ChatMessage | null {
  if (m.role !== 'assistant' || m.status !== 'streaming') return m;
  const hasBody = Boolean(m.content?.trim());
  const hasSteps = (m.steps?.length ?? 0) > 0;
  const hasProse =
    Boolean(m.openingLead?.trim()) || (m.turnProse?.length ?? 0) > 0;
  const hasCards =
    (m.fileEdits?.length ?? 0) > 0 || (m.terminalRuns?.length ?? 0) > 0;
  if (!hasBody && !hasSteps && !hasProse && !hasCards) return null;
  return {
    ...m,
    status: 'complete',
    content: hasBody ? m.content : m.content,
    workedDurationMs:
      typeof m.workedDurationMs === 'number'
        ? m.workedDurationMs
        : Math.max(0, Date.now() - (m.timestamp || Date.now()))
  };
}

export function finalizeStreamingMessages(prev: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of prev) {
    if (m.role === 'assistant' && m.status === 'streaming') {
      const next = finalizeStreamingAssistant(m);
      if (next) out.push(next);
    } else {
      out.push(m);
    }
  }
  return out;
}

export function sanitizeLoadedMessages(parsed: ChatMessage[]): ChatMessage[] {
  return parsed
    .map((m) => {
      if (m.role === 'user') {
        let content = stripHarnessForDisplay(m.content);
        content = stripResynthForDisplay(content);
        return { ...m, content };
      }
      if (m.role === 'assistant') {
        return dedupeAssistantBody({
          ...m,
          content: stripFakeToolMarkup(m.content)
        });
      }
      return m;
    })
    .map((m) => {
      if (m.role !== 'assistant' || m.status !== 'streaming') return m;
      return finalizeStreamingAssistant(m);
    })
    .filter((m): m is ChatMessage => m != null);
}
