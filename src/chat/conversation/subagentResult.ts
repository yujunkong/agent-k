/**
 * Compact subagent completion stats for WorkTimeline.
 * Built from host subagent.event — never a copy of the child transcript.
 */

export type SubagentResult = {
  summary?: string;
  filesChanged?: number;
  toolCount?: number;
  durationMs?: number;
};

const MAX_SUBAGENT_SUMMARY = 280;

export function clipSubagentSummary(text: string | undefined): string | undefined {
  const clipped = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clipped) return undefined;
  return clipped.length > MAX_SUBAGENT_SUMMARY
    ? `${clipped.slice(0, MAX_SUBAGENT_SUMMARY - 1)}…`
    : clipped;
}

function finiteNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Host completion payload → UI model. Extra transcript fields are ignored. */
export function parseSubagentResult(
  data: Record<string, unknown>
): SubagentResult | undefined {
  const summary = clipSubagentSummary(
    data.summary != null ? String(data.summary) : undefined
  );
  const filesChanged = finiteNumber(data.filesChanged);
  const toolCount = finiteNumber(data.toolCount ?? data.toolCalls);
  const durationMs = finiteNumber(data.durationMs ?? data.duration);
  if (
    summary == null &&
    filesChanged == null &&
    toolCount == null &&
    durationMs == null
  ) {
    return undefined;
  }
  return { summary, filesChanged, toolCount, durationMs };
}

export function formatSubagentDuration(durationMs: number): string {
  const sec = durationMs / 1000;
  if (sec < 10) return `${sec.toFixed(1)}s`;
  return `${Math.round(sec)}s`;
}

export function formatSubagentFilesChanged(count: number): string {
  return count === 1 ? '1 file changed' : `${count} files changed`;
}

export function formatSubagentToolCount(count: number): string {
  return count === 1 ? '1 tool' : `${count} tools`;
}

export function mergeSubagentResult(
  prev?: SubagentResult,
  incoming?: SubagentResult
): SubagentResult | undefined {
  if (!incoming) return prev;
  if (!prev) return incoming;
  return {
    summary: incoming.summary ?? prev.summary,
    filesChanged: incoming.filesChanged ?? prev.filesChanged,
    toolCount: incoming.toolCount ?? prev.toolCount,
    durationMs: incoming.durationMs ?? prev.durationMs
  };
}
