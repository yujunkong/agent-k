import type { TimelineStep, TimelineStepKind } from '../conversation/timelinePresentation';
import type { FileEditPreview, TerminalRunPreview } from '../types';

export type TimelineStepCardView = {
  title: string;
  subtitle?: string;
  meta?: string;
  kind: TimelineStepKind;
  expandable: boolean;
  defaultOpen: boolean;
};

const CARD_TITLES: Partial<Record<TimelineStepKind, string>> = {
  reasoning: 'Thought',
  tool: 'Work',
  file: 'Edit',
  terminal: 'Terminal',
  subagent: 'Agent',
  verify: 'Verify',
  generic: 'Work'
};

function normalizeToolTitle(raw: string, kind: TimelineStepKind): string {
  const preset = CARD_TITLES[kind];
  if (preset && kind !== 'tool' && kind !== 'generic') return preset;
  const base = String(raw || '').trim();
  if (!base) return preset || 'Work';
  const head = base.split(' · ')[0]?.trim();
  if (!head) return preset || 'Work';
  if (/^(read|search|edit|terminal|verify|thought|thinking|agent|work)$/i.test(head)) {
    return head.charAt(0).toUpperCase() + head.slice(1).toLowerCase();
  }
  if (kind === 'tool' || kind === 'generic') {
    if (/^read/i.test(head)) return 'Read';
    if (/^search|^grep|^glob/i.test(head)) return 'Search';
    if (/^edit|^write/i.test(head)) return 'Edit';
  }
  return head;
}

function parseSubagentSubtitle(label: string): string | undefined {
  const text = String(label || '').trim();
  if (!text) return undefined;
  const parts = text.split(' · ');
  if (parts.length >= 2) {
    const tail = parts[parts.length - 1].trim().toLowerCase();
    if (['running', 'completed', 'failed', 'queued', 'complete'].includes(tail)) {
      const head = parts.slice(0, -1).join(' · ').trim();
      return head || undefined;
    }
  }
  return text;
}

function fileEditMeta(file: FileEditPreview): string | undefined {
  const parts: string[] = [];
  if (file.additions > 0) parts.push(`+${file.additions}`);
  if (file.deletions > 0) parts.push(`−${file.deletions}`);
  return parts.length ? parts.join(' ') : undefined;
}

function terminalMeta(run: TerminalRunPreview): string | undefined {
  if (run.status === 'running') return undefined;
  const output = [run.stdout, run.stderr].filter(Boolean).join('\n').trim();
  if (output) {
    const lines = output.split(/\r?\n/).filter(Boolean);
    const last = lines[lines.length - 1] || '';
    if (last) return last.length > 96 ? `${last.slice(0, 93)}…` : last;
  }
  if (run.error) return run.error;
  if (run.exitCode != null) return `Exit ${run.exitCode}`;
  return run.status === 'error' ? 'Failed' : undefined;
}

function reasoningPreview(body: string | undefined): string | undefined {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

/** Map a presentation step onto unified card chrome fields. */
export function buildTimelineStepCardView(step: TimelineStep): TimelineStepCardView {
  const title = normalizeToolTitle(step.title, step.kind);
  let subtitle = step.subtitle;
  let meta: string | undefined;
  let expandable = Boolean(step.body || step.fileEdit || step.terminalRun);
  let defaultOpen = step.status === 'running';

  if (step.kind === 'subagent') {
    subtitle = parseSubagentSubtitle(step.title);
    if (step.result?.summary) meta = step.result.summary;
    expandable = Boolean(step.result?.summary);
    defaultOpen = step.status === 'running';
  } else if (step.kind === 'reasoning') {
    subtitle = reasoningPreview(step.body);
    expandable = Boolean(step.body && step.body.length > 120);
    defaultOpen = step.status === 'running';
  } else if (step.kind === 'file' && step.fileEdit) {
    subtitle = step.fileEdit.path || subtitle;
    meta = fileEditMeta(step.fileEdit);
    defaultOpen = defaultOpen || expandable;
  } else if (step.kind === 'terminal' && step.terminalRun) {
    subtitle = step.terminalRun.command || subtitle;
    meta = terminalMeta(step.terminalRun);
    defaultOpen = defaultOpen || step.terminalRun.status === 'running';
  } else if (step.body) {
    meta = reasoningPreview(step.body);
  }

  if (step.kind === 'file' && step.fileEdit) {
    expandable = true;
  }
  if (step.kind === 'terminal' && step.terminalRun) {
    expandable = true;
  }

  return {
    title,
    subtitle,
    meta,
    kind: step.kind,
    expandable,
    defaultOpen
  };
}

export function timelineStepMarker(
  status: TimelineStep['status'],
  live = false
): string {
  if (status === 'failed') return '×';
  if (status === 'running' || live) return '●';
  return '✓';
}
