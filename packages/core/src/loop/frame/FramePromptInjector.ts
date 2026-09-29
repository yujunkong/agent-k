/**
 * V31-FRAME-01 — short frame instruction. Replaces a previous block; does not stack.
 * conversation skips. Not a second model call.
 */
import type { IntentKind } from '@agent-k/shared';

export const FRAME_HEADER = '## Problem frame';

const TASK_BODY = [
  'Before any edit, emit exactly one <problem_frame>{json}</problem_frame> block.',
  'JSON fields only: intent.outcome, intent.constraints, intent.ambiguous, intent.clarifyQuestion, symptom, doneWhen, hypotheses[{claim,killIf}] (max 3), nonGoals.',
  'If the request has two readings, set ambiguous true, call ask_question once, and stop. No hypothesis and no edit.',
  'Do not call edit_file, write_file, or delete_file until doneWhen is set and one read_file has succeeded.',
  'On this turn, thinking is only those fields. No patch draft, no file list, no restating the task.',
].join(' ');

const QUESTION_BODY =
  'State outcome and constraints for what to explain. Do not edit. Thinking is only those fields.';

export function injectProblemFramePrompt(
  systemPrompt: string,
  kind: IntentKind,
): string {
  const base = stripFrameBlock(systemPrompt);
  if (kind === 'conversation') return base;
  const body = kind === 'question' ? QUESTION_BODY : TASK_BODY;
  return `${base}\n\n${FRAME_HEADER}\n${body}`;
}

function stripFrameBlock(prompt: string): string {
  const marker = `\n\n${FRAME_HEADER}`;
  const idx = prompt.indexOf(marker);
  if (idx >= 0) return prompt.slice(0, idx).trimEnd();
  if (prompt.startsWith(FRAME_HEADER)) {
    return prompt.split('\n').slice(2).join('\n').trim();
  }
  return prompt.trimEnd();
}
