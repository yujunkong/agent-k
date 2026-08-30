/**
 * HARNESS-003 — Prefetch block formatting for AgentLoop sticky/user inject.
 */
export function formatPrefetchBlock(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return `<prefetch>\n${trimmed}\n</prefetch>`;
}

/** Prepend prefetch to user payload (API-only — not for UI bubbles). */
export function prependPrefetchToUserPrompt(
  userText: string,
  prefetchRaw: string,
): string {
  const block = formatPrefetchBlock(prefetchRaw);
  if (!block) return userText;
  return `${block}\n\n${userText}`;
}

/** Strip legacy harness blocks from display text. */
export function stripHarnessForDisplay(content: string): string {
  if (!content) return content;
  return content
    .replace(/<harness_system>[\s\S]*?<\/harness_system>\s*/gi, '')
    .replace(/<prefetch>[\s\S]*?<\/prefetch>\s*/gi, '')
    .replace(/<chat_ui_note>[\s\S]*?<\/chat_ui_note>\s*/gi, '')
    .trim();
}
