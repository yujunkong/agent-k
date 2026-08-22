/**
 * AGENT-012…015 — Natural-language classifiers for loop control.
 * Observation-friendly: ClassifierDiagnostics can wrap these without changing logic.
 */

/** AGENT-013 — Looks like a real wrap-up (structured + outcome), not mid-work narration. */
export function looksLikeClosingSummary(prose: string): boolean {
  const t = (prose || '').trim();
  if (looksLikeTaskHandoff(t)) return true;
  if (t.length < 80) return false;
  const hasStructure =
    /^#{1,3}\s/m.test(t) ||
    /^[-*]\s/m.test(t) ||
    t.split('\n').filter((l) => l.trim()).length >= 3;
  const hasOutcome =
    /수정|변경|원인|결과|완료|추가|생성|fixed|changed|because|root cause|summary|요약/i.test(
      t
    );
  if (
    /이제\s*(작성|생성|구현)|proceeding to write|will (now )?write/i.test(t) &&
    !hasOutcome
  ) {
    return false;
  }
  return hasStructure && hasOutcome;
}

/** AGENT-012 — Empty / too short / status-only finals that should not end the run. */
export function isWeakFinalAnswer(prose: string): boolean {
  const t = (prose || '').trim();
  if (!t || t === '...') return true;
  if (looksLikeClosingSummary(t)) return false;
  if (t.length < 60) return true;
  if (claimsContinueWork(t) && t.length < 280) return true;
  if (
    /^(완료|끝|done|finished|ok\.?|완료했습니다\.?|수정했습니다\.?|적용했습니다\.?|진행했습니다\.?)$/i.test(
      t
    )
  ) {
    return true;
  }
  if (t.length < 120 && !/[#*\-\n]/.test(t) && claimsContinueWork(t)) {
    return true;
  }
  return false;
}

/** Soft handoff ("다음 작업으로 진행 가능") — treat as closing, not continue-work. */
export function looksLikeTaskHandoff(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  if (
    /(이제|바로)\s*(작성|생성|구현|수정)|will now (write|implement|create)|proceeding to (write|implement)/i.test(
      t
    )
  ) {
    return false;
  }
  return /진행\s*가능(?:합니다)?|다음\s*작업으로.{0,60}가능|이어서\s*(?:진행|작업)\s*가능|다음으로\s*(?:넘어가|진행)\s*가능|ready to (?:proceed|continue) (?:to|with)|can proceed to/i.test(
    t
  );
}

/** AGENT-014 — Model claims more work remains (should keep calling tools). */
export function claimsContinueWork(text: string): boolean {
  if (looksLikeTaskHandoff(text)) return false;
  return (
    /파일을\s*(작성|생성|저장)|코드를\s*작성|작성하(겠|고)|생성하(겠|고)|구현하(겠|고)|will (now )?(write|create|edit|implement)|proceed(ing)? to (write|implement)|다음\s*(단계|으로|은)|이어서\s*(진행|작업)|계속\s*(진행|하)|let me (continue|proceed|next)|next[,:]?\s*(i('ll| will)|step)|moving on to|now (that|i('ll| will))/i.test(
      text || ''
    )
  );
}

/** AGENT-015 — Prose that looks like a raw / broken tool-call dump. */
export function looksLikeBrokenToolPayload(content: string): boolean {
  return /```json\b|tool_calls|<tool\s|tool_code|function_call|"name"\s*:\s*"[^"]*"\s*,\s*"arguments"\s*:/i.test(
    content || ''
  );
}

export type ClassifierFnName =
  | 'isWeakFinalAnswer'
  | 'looksLikeClosingSummary'
  | 'claimsContinueWork'
  | 'looksLikeBrokenToolPayload';

export const CLASSIFIER_FNS = {
  isWeakFinalAnswer,
  looksLikeClosingSummary,
  claimsContinueWork,
  looksLikeBrokenToolPayload,
} as const;
