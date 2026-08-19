import type { TimelineStep, TimelineStepKind } from '../conversation/timelinePresentation';
import type { FileEditPreview, TerminalRunPreview } from '../types';
import { worktreeDiffTotals } from '../conversation/worktreeDiff';
import { subagentHasAggregatedChanges } from '../conversation/timelinePresentation';
import { formatSubagentFilesChanged } from '../conversation/subagentResult';

/** Visual density for Cursor-style progress hierarchy. */
export type TimelineStepDensity = 'active' | 'compact' | 'failed';

export type TimelineStepCardView = {
  title: string;
  subtitle?: string;
  meta?: string;
  kind: TimelineStepKind;
  density: TimelineStepDensity;
  expandable: boolean;
  defaultOpen: boolean;
  /** Reasoning uses a quieter secondary marker while running. */
  marker?: string;
};

export const REASONING_PREVIEW_MAX = 96;

const CARD_TITLES: Partial<Record<TimelineStepKind, string>> = {
  reasoning: 'Thinking',
  tool: 'Exploring',
  file: 'Editing',
  terminal: 'Running command',
  subagent: 'Agent',
  verify: 'Verifying',
  generic: 'Working'
};

const CARD_TITLES_COMPLETED: Partial<Record<TimelineStepKind, string>> = {
  reasoning: 'Thought',
  tool: 'Explored',
  file: 'Edited',
  terminal: 'Ran command',
  subagent: 'Agent',
  verify: 'Verified',
  generic: 'Worked'
};

function normalizeToolTitle(raw: string, kind: TimelineStepKind, completed = false): string {
  const titles = completed ? CARD_TITLES_COMPLETED : CARD_TITLES;
  const preset = titles[kind];
  if (preset && kind !== 'tool' && kind !== 'generic') return preset;
  const base = String(raw || '').trim();
  if (!base) return preset || (completed ? 'Worked' : 'Working');
  const head = base.split(' · ')[0]?.trim();
  if (!head) return preset || (completed ? 'Worked' : 'Working');
  if (kind === 'tool' || kind === 'generic') {
    if (/^read/i.test(head)) return completed ? 'Read' : 'Reading';
    if (/^search|^grep|^glob/i.test(head)) return completed ? 'Searched' : 'Searching';
    if (/^edit|^write/i.test(head)) return completed ? 'Edited' : 'Editing';
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

function reasoningPreview(
  body: string | undefined,
  max = REASONING_PREVIEW_MAX
): string | undefined {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function resolveTimelineStepDensity(
  step: TimelineStep,
  activeStepId?: string
): TimelineStepDensity {
  if (step.status === 'failed') return 'failed';
  if (step.status === 'running' || (activeStepId != null && step.id === activeStepId)) {
    return 'active';
  }
  return 'compact';
}

/** Map a presentation step onto unified card chrome fields. */
export function buildTimelineStepCardView(
  step: TimelineStep,
  options: { activeStepId?: string } = {}
): TimelineStepCardView {
  const density = resolveTimelineStepDensity(step, options.activeStepId);
  const live = density === 'active' && step.status === 'running';
  const completed = step.status === 'completed';
  let title = normalizeToolTitle(step.title, step.kind, completed);
  let subtitle = step.subtitle;
  let meta: string | undefined;
  let expandable = Boolean(step.body || step.fileEdit || step.terminalRun);
  let defaultOpen = live;
  let marker: string | undefined;

  if (step.kind === 'subagent') {
    subtitle = parseSubagentSubtitle(step.title);
    if (step.result && subagentHasAggregatedChanges(step.result)) {
      const totals = worktreeDiffTotals(
        step.result.worktreeReview,
        step.result.filesChanged
      );
      meta = formatSubagentFilesChanged(totals.fileCount);
      const statParts: string[] = [];
      if (totals.additions > 0) statParts.push(`+${totals.additions}`);
      if (totals.deletions > 0) statParts.push(`−${totals.deletions}`);
      if (statParts.length) meta = `${meta} ${statParts.join(' ')}`;
      expandable = step.status === 'completed';
      defaultOpen = false;
    } else if (step.result?.summary) {
      meta = reasoningPreview(step.result.summary, 80);
    }
    defaultOpen = live;
  } else if (step.kind === 'reasoning') {
    title = live ? 'Thinking…' : 'Thought';
    subtitle = reasoningPreview(step.body);
    expandable = Boolean(step.body && String(step.body).replace(/\s+/g, ' ').trim().length > REASONING_PREVIEW_MAX);
    // Reasoning stays collapsed even while streaming — subtitle carries the live preview.
    defaultOpen = false;
    marker = live ? '⌁' : undefined;
  } else if (step.kind === 'file' && step.fileEdit) {
    subtitle = step.fileEdit.path || subtitle;
    meta = fileEditMeta(step.fileEdit);
    expandable = true;
    // Active file edits expand; completed stay compact until clicked.
    defaultOpen = live;
  } else if (step.kind === 'terminal' && step.terminalRun) {
    subtitle = step.terminalRun.command || subtitle;
    meta = terminalMeta(step.terminalRun);
    expandable = true;
    defaultOpen = live || step.terminalRun.status === 'running';
  } else if (step.body) {
    meta = reasoningPreview(step.body);
    defaultOpen = false;
  }

  return {
    title,
    subtitle,
    meta,
    kind: step.kind,
    density,
    expandable,
    defaultOpen,
    marker
  };
}

export function timelineStepMarker(
  status: TimelineStep['status'],
  live = false,
  override?: string
): string {
  if (override) return override;
  if (status === 'failed') return '×';
  if (status === 'running' || live) return '●';
  return '✓';
}
