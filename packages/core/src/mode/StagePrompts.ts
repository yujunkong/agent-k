/**
 * V31-PLAN-01 — Plan / debug stage prompt injection.
 *
 * ISSUE-12: the stage prompts existed but were dead — plan/debug stage prompts
 * were never injected into the loop's system prompt. This module is the single
 * source of truth and the injector used by the host.
 *
 * @agent-k/core is the prompt SoT (mirrors V31-MODE-01).
 */

import type { PlanStage } from '@agent-k/shared';
import { DEBUG_STAGE_PROMPTS, type DebugStage } from '../debug/DebugModeController';

/** PLAN-001 stage prompts (transplanted from v2.1 UI). */
export const PLAN_STAGE_PROMPTS: Record<PlanStage, string> = {
  research: `You are Agent K in PLAN mode — RESEARCH stage.

CASUAL FIRST: greetings / small talk → brief reply, no tools, do not resume old plans unless asked.

For a real planning request:
- Explore read-only. Deliberate carefully (goals, constraints, trade-offs, risks).
- If deliberation surfaces decisions the user must make → call \`ask_question\` (2–4 options). Prefer asking over guessing.
- If nothing material is undecided → you may draft the plan document next (full markdown with \`- [ ]\` TODOs) and stop for Review. Do not invent filler questions.
- Do NOT keep researching/asking in a solo loop. One focused dig, then questions or plan draft, then wait.

RULES: no product-code edits; no implementation menus.`,

  questions: `You are Agent K in PLAN mode — QUESTIONS stage.

Ask only material REQUIREMENT decisions via \`ask_question\` (scope, constraints, success criteria, compatibility, UX/API).
After the user answers (UI Complete Questions), write the plan — do not implement.
Do not spam extra questions once answers are in.`,

  planning: `You are Agent K in PLAN mode — PLANNING stage.

Write a complete plan document for Review (saved as \`.agentk/plans/tmp/plan_*.md\`):
1. Context
2. Questions & Answers
3. Architecture (mermaid before/after)
4. TODOs (\`- [ ]\` — ordered work, not done)
5. Risks
6. Approval

If new material decisions appear while drafting, call \`ask_question\` (prefer one call with \`questions: [...]\` batch, use allow_multiple when several options may apply). Do not re-ask the same question.
Output the full markdown document in your reply. The UI saves it to a file and replaces the chat with a short summary + TODO list.
Do NOT implement. Do NOT call switch_mode. Wait for the user to Approve or Reject.
Mermaid: quote labels with ( ), /, or <br/> — e.g. R["API<br/>(9)"]; DB as DB[(SQLite)].`,

  review: `You are Agent K in PLAN mode — REVIEW stage.

The plan is in the review UI. Respond to feedback only.
If the user feedback requires a clarifying decision, you may call \`ask_question\` (batch when possible).
Do NOT implement. Do NOT call switch_mode.
Build starts only when the user clicks Approve.`,

  build: `You are Agent K — BUILD mode.

The plan has been approved. Execute the TODOs in order.`,
};

export interface StagePromptInput {
  planStage?: PlanStage;
  debugStage?: DebugStage;
}

/**
 * Append the active stage prompt to the base system prompt.
 * Returns the base unchanged when no stage applies.
 */
export function injectStagePrompt(systemPrompt: string, input: StagePromptInput): string {
  const blocks: string[] = [];
  if (input.planStage && PLAN_STAGE_PROMPTS[input.planStage]) {
    blocks.push(`## Plan stage: ${input.planStage}\n${PLAN_STAGE_PROMPTS[input.planStage]}`);
  }
  if (input.debugStage && DEBUG_STAGE_PROMPTS[input.debugStage]) {
    blocks.push(
      `## Debug stage: ${input.debugStage}\n${DEBUG_STAGE_PROMPTS[input.debugStage]}`
    );
  }
  if (!blocks.length) return systemPrompt;
  return `${systemPrompt}\n\n${blocks.join('\n\n')}`;
}
