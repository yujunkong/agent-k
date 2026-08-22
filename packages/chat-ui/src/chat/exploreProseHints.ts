/**
 * Cursor-style mid-timeline prose hints.
 * Shared by MessageSteps (phase routing) and sealTurnProse (keep visible vs Thought).
 */

/** Still digging after a partial understanding — keep Exploring (do NOT close) */
export function looksLikeExploreContinue(text: string): boolean {
  return /let me read (a )?few more|few more key|complete the picture|read the remaining|이어서 읽|더 읽|몇 개 더|나머지 .{0,20}(읽|확인)|추가로 읽|complete my understanding|to complete the/i.test(
    text
  );
}

/** Forward-looking intent (next dig / will write later) — not a settle wrap-up */
export function looksLikeExploreStart(text: string): boolean {
  if (looksLikeExploreContinue(text)) return true;
  return /시작하|파악하겠|파악하고\s*있|파악한 뒤|살펴보|탐색하|리서치|읽어보|확인하겠|분석하|작성하겠|작성할|먼저 .{0,40}(읽|파악|탐색|작성)|let me (read|search|explore|check|look|write)|i('ll| will) (read|search|explore|check|start|write)|starting (research|to)|currently (understanding|reading|exploring)|계획을\s*작성하겠/i.test(
    text
  );
}

/** Intent prose that means curiosity settled enough to close → Explored */
export function looksLikeExploreSettled(text: string): boolean {
  if (looksLikeExploreContinue(text) || looksLikeExploreStart(text)) return false;
  return /파악했|이해했|확인했|정리하면|충분하|문서화|이제 .{0,40}(작성|구현|수정|문서)|thorough understanding|I (have|now) (a )?(thorough |good )?(understanding|reviewed|read)|enough (context|information)|before writing the plan|next I('ll| will) (write|implement|plan)|계획을\s*작성했|계획\s*문서\s*작성\s*(완료|했)/i.test(
    text
  );
}

/**
 * Visible mid-timeline ack (screenshot: between Exploring batches).
 * Must stay as turnProse — never fold into collapsed Thought.
 */
export function looksLikeVisibleMidReply(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (looksLikeExploreStart(t) || looksLikeExploreContinue(t) || looksLikeExploreSettled(t)) {
    return true;
  }
  // Short Hangul / English dig-bridge — Cursor mid-timeline ack, not a reasoning dump
  if (t.length <= 280 && !/^#{1,6}\s/m.test(t) && !/```/.test(t)) {
    if (/[가-힣]/.test(t)) return true;
    if (
      /^(I'll |I will |Let me |Next[,:]? |Now[,:]? |Checking |Reading |Searching )/i.test(
        t
      )
    ) {
      return true;
    }
  }
  return false;
}
