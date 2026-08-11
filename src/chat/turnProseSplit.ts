/**
 * Split mid-turn prose: short dig intents stay in Worked timeline;
 * settled findings / summaries render as the assistant answer below Worked.
 *
 * Classification is structural (length, line breaks, numbered/bullet lists) and
 * language-agnostic — never gate visibility on a single locale phrase.
 */

/** First sentence / lead line only — dig phrasing in a trailing closer must not
 *  poison a whole findings block. */
export function leadingProseSlice(text: string, max = 140): string {
  const t = (text || '').trim();
  if (!t) return '';
  const m = t.match(/^[\s\S]{1,200}?(?:[.!?。！？]\s|\n|$)/);
  const slice = (m ? m[0] : t).trim();
  return slice.length > max ? slice.slice(0, max) : slice;
}

/** Still digging after a partial understanding — keep Exploring */
export function looksLikeExploreContinue(text: string): boolean {
  return /let me (read|verify|check|confirm) (a )?few more|let me verify|few more (key|details|areas)|complete the picture|read the remaining|이어서 읽|더 읽|몇 개 더|나머지 .{0,20}(읽|확인)|추가로 읽|complete my understanding|to complete the|before writing the plan/i.test(
    text
  );
}

/** Forward-looking intent — not a settle wrap-up */
export function looksLikeExploreStart(text: string): boolean {
  if (looksLikeExploreContinue(text)) return true;
  // Avoid past-tense false positives (분석했습니다 / 읽어보았습니다 / 파악했다)
  return /시작하(?:겠|고|려|기|면|자|세)|파악하겠|파악하고\s*있|파악한 뒤|살펴보(?:겠|고|려|자|세|니)|탐색하(?:겠|고|려|기|면|자|세)|리서치하|읽어보(?:겠|고|려|자|세|니)|확인하겠|분석하(?:겠|고|려|기|면|자|세)|작성하겠|작성할|먼저 .{0,40}(읽|파악|탐색|작성)|프로젝트 구조를|let me (read|search|explore|check|look|write|verify)|i('ll| will) (read|search|explore|check|start|write)|starting (research|to)|currently (understanding|reading|exploring)|계획을\s*작성하겠/i.test(
    text
  );
}

/** Curiosity settled enough to close → Explored */
export function looksLikeExploreSettled(text: string): boolean {
  const lead = leadingProseSlice(text);
  if (looksLikeExploreContinue(lead) || looksLikeExploreStart(lead)) return false;
  // Mid-dig "I'll verify then write" is NOT a settled wrap-up
  if (
    /let me (verify|check|read|confirm)|few more|확인하겠|검증/i.test(lead) &&
    text.length < 500
  ) {
    return false;
  }
  // Plan-execute step boundary — close Exploring so the next dig is a new block
  if (looksLikePlanStepProgress(text)) return true;
  return /파악했|이해했|확인했|정리하면|충분하|문서화|꽤 깊이|이제 .{0,40}(작성|구현|수정|문서)|thorough understanding|I (have|now) (a )?(thorough |good )?(understanding|reviewed|read)|enough (context|information)|next I('ll| will) (write|implement|plan)|계획을\s*작성했|계획\s*문서\s*작성\s*(완료|했)/i.test(
    text
  );
}

/**
 * Mid-execution plan progress ("Step 1 완료", "Step 2 진행").
 * Closes the current Exploring block so progress shows between digs —
 * not folded into one giant Exploring Thought.
 */
export function looksLikePlanStepProgress(text: string): boolean {
  const t = (text || '').trim();
  if (!t || t.length > 1200) return false;
  // Dig-continue leads are not progress boundaries
  const lead = leadingProseSlice(t, 100);
  if (looksLikeExploreContinue(lead)) return false;
  if (
    /^(?:#{1,3}\s*)?(?:\*\*)?(?:Step|단계)\s*\d+/i.test(t) ||
    /(?:^|\n)\s*(?:\*\*)?(?:Step|단계)\s*\d+\s*[:：.]/im.test(t)
  ) {
    return true;
  }
  if (
    /Step\s*\d+\s*(?:완료|완료했습니다|done|complete)/i.test(t) ||
    /단계\s*\d+\s*(?:완료|끝)/.test(t)
  ) {
    return true;
  }
  if (
    /(?:BUG|TODO|A|B|C|D|E)\d*\s*[-–:]/i.test(t) &&
    /(?:완료|진행|수정|제거|추가|완료했습니다)/.test(t)
  ) {
    return true;
  }
  if (
    /완료\s*[✅✓✔]/.test(t) &&
    /(?:Step|단계|BUG|TODO|\.py|\.ts|\.tsx)/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** "Step N 완료" — later than a step-start intent in chronological order. */
export function looksLikePlanStepComplete(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  return (
    /Step\s*\d+\s*(?:완료|완료했습니다|done|complete)/i.test(t) ||
    /단계\s*\d+\s*(?:완료|끝)/.test(t) ||
    (/완료\s*[✅✓✔]/.test(t) && /(?:Step|단계)/i.test(t))
  );
}

/**
 * Forward step intent ("Step 1부터 시작합니다") — must render ABOVE later
 * "Step 1 완료" progress, never as the answer body under Worked.
 */
export function looksLikePlanStepStart(text: string): boolean {
  const t = (text || '').trim();
  if (!t || t.length > 2000) return false;
  if (looksLikePlanStepComplete(t)) return false;
  if (
    /Step\s*\d+\s*(?:\([^)]*\))?\s*부터\s*시작/i.test(t) ||
    /단계\s*\d+\s*(?:\([^)]*\))?\s*부터\s*시작/.test(t)
  ) {
    return true;
  }
  // "Step 1(T1)부터…" / heading + forward verbs without completion
  if (
    /(?:^|\n)\s*(?:\*\*)?(?:Step|단계)\s*\d+/im.test(t) &&
    /(?:시작|진행합니다|이동하고|전환합니다|추가합니다|확인합니다)/.test(t) &&
    !looksLikePlanStepComplete(leadingProseSlice(t, 160))
  ) {
    return true;
  }
  return false;
}

/**
 * Model re-dumps a forward plan ("Planning next moves" / "I need to: 1.") —
 * often AFTER an edit, which looks chronologically backwards in the UI.
 * Keep in Thought, never as the answer body.
 */
export function looksLikeInternalPlanningDump(text: string): boolean {
  const t = (text || '').trim();
  if (!t || t.length > 2000) return false;
  // Real step completion reports are not dumps
  if (looksLikePlanStepProgress(t) && !/Planning next moves/i.test(t)) {
    return false;
  }
  const first = (t.split(/\n/)[0] || '').trim();
  if (/^\*{0,2}Planning next moves\*{0,2}\s*$/i.test(first)) return true;
  if (
    /Planning next moves/i.test(t) &&
    /I (have|need)|Let me start|full picture/i.test(t)
  ) {
    return true;
  }
  if (/I have the full picture/i.test(t) && /I need to:/i.test(t)) return true;
  if (
    /I need to:\s*\n\s*\d+\./i.test(t) &&
    /Let me start with/i.test(t)
  ) {
    return true;
  }
  // English re-plan list right before "Step N" without a completion marker
  if (
    /\n\s*1\.\s+\S[\s\S]{0,200}\n\s*2\.\s+\S/.test(t) &&
    /Let me start with|I need to/i.test(t) &&
    !/완료|edited|modified|changed/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** Strip chrome the model copied from the timeline into the answer body. */
export function stripInternalPlanningChrome(text: string): string {
  let t = (text || '').trim();
  if (!t) return '';
  // Drop a leading "Planning next moves" heading (with optional bold)
  t = t.replace(/^\s*\*{0,2}Planning next moves\*{0,2}\s*\n+/i, '');
  return t.trim();
}

/** Structural: looks like a findings / issue dump users must still see. */
export function looksLikeSubstantialFindings(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  const lines = (t.match(/\n/g) || []).length;
  const numbered = (t.match(/(?:^|\n)\s*\d+[\.)]\s+\S+/gm) || []).length;
  const bullets = (t.match(/(?:^|\n)\s*[-*•]\s+\S+/gm) || []).length;
  if (numbered >= 2 && t.length >= 60) return true;
  if (bullets >= 3 && t.length >= 80) return true;
  if (lines >= 2 && t.length >= 160) return true;
  if (lines >= 3 && t.length >= 120) return true;
  if (t.length >= 320) return true;
  return false;
}

/**
 * User-visible answer (research wrap-up, findings) — must NOT live inside Worked.
 * Short dig acks stay in the timeline.
 */
export function isAnswerLikeTurnProse(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  // Re-plan dumps / step-start intent stay in the timeline, not under Worked
  if (looksLikeInternalPlanningDump(t)) return false;
  if (looksLikePlanStepStart(t)) return false;
  if (looksLikeSubstantialFindings(t)) return true;
  // Step progress stays inside the timeline (between Exploring blocks),
  // not as the final answer under Worked.
  if (looksLikePlanStepProgress(t) && t.length < 500) return false;
  if (looksLikeExploreSettled(t)) return true;

  // Dig-ack check only on the lead — a trailing "I'll confirm…" must not hide the body
  const lead = leadingProseSlice(t);
  const leadIsDig =
    looksLikeExploreStart(lead) || looksLikeExploreContinue(lead);

  if (t.length >= 160 && t.includes('\n') && !leadIsDig) return true;
  if (t.length >= 280 && !leadIsDig) return true;
  return false;
}

/** True only for short forward-looking dig self-talk (safe to fold into Thought). */
export function isShortDigAck(text: string): boolean {
  const t = (text || '').trim();
  if (!t || t.length >= 160) return false;
  if (looksLikeSubstantialFindings(t)) return false;
  return (
    looksLikeExploreStart(t) ||
    looksLikeExploreContinue(t)
  );
}

export function splitTurnProseForDisplay<
  T extends { content: string; turn?: number }
>(prose: T[]): { timeline: T[]; answer: T[] } {
  const timeline: T[] = [];
  const answer: T[] = [];
  for (const p of prose) {
    const c = String(p.content || '');
    // Step-start / step progress stay in the Worked timeline (chronological)
    if (looksLikePlanStepStart(c) || looksLikePlanStepProgress(c)) {
      timeline.push(p);
      continue;
    }
    if (isAnswerLikeTurnProse(c)) answer.push(p);
    else timeline.push(p);
  }
  // Step starts before completions when turn ties
  timeline.sort((a, b) => {
    const ta = typeof a.turn === 'number' && a.turn > 0 ? a.turn : 1;
    const tb = typeof b.turn === 'number' && b.turn > 0 ? b.turn : 1;
    if (ta !== tb) return ta - tb;
    const sa = looksLikePlanStepStart(String(a.content || '')) ? 0 : 1;
    const sb = looksLikePlanStepStart(String(b.content || '')) ? 0 : 1;
    return sa - sb;
  });
  return { timeline, answer };
}
