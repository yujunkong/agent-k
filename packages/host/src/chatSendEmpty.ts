/**
 * HOST-002 — pure empty-reply classifier (no vscode).
 * Tool-only turns with no closing prose must not be hard errors.
 */

/** True when the finished loop produced no content, reasoning, or tools. */
export function isTrueEmptyModelReply(opts: {
  finalBody: string;
  streamedChars: number;
  reasoningChars: number;
  toolEvents: number;
}): boolean {
  return (
    !opts.finalBody.trim() &&
    opts.streamedChars === 0 &&
    opts.reasoningChars === 0 &&
    opts.toolEvents === 0
  );
}
