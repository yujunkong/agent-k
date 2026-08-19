import type { FileEditPreview, TerminalRunPreview } from '../types';
import {
  upsertWorkEvents,
  type ConversationWorkEvent
} from './conversationWorkEvent';

export type WorkEventFileEdit = Pick<
  FileEditPreview,
  'id' | 'path' | 'absPath' | 'toolId' | 'turn'
>;
export type WorkEventTerminalRun = Pick<
  TerminalRunPreview,
  'id' | 'command' | 'description' | 'toolId' | 'turn' | 'status'
>;

function basename(path: string): string {
  const parts = String(path || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  return parts[parts.length - 1] || path;
}

function commandsMatch(eventDetail: string | undefined, command: string | undefined): boolean {
  const a = String(eventDetail || '').trim();
  const b = String(command || '').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.startsWith(a.replace(/…$/, ''))) return true;
  if (a.startsWith(b.slice(0, Math.min(b.length, 40)))) return true;
  return false;
}

export function linkWorkEventRef(
  events: ConversationWorkEvent[],
  eventId: string,
  ref: NonNullable<ConversationWorkEvent['ref']>
): ConversationWorkEvent[] {
  const current = events.find((event) => event.id === eventId);
  if (!current) return events;
  return upsertWorkEvents(events, { ...current, ref });
}

function findEditEvent(
  events: ConversationWorkEvent[],
  fileEdit: WorkEventFileEdit,
  used: Set<string>
): ConversationWorkEvent | undefined {
  if (fileEdit.toolId) {
    const hit = events.find(
      (event) => event.id === fileEdit.toolId && event.type === 'edit' && !used.has(event.id)
    );
    if (hit) return hit;
  }
  const name = basename(fileEdit.path || fileEdit.absPath || '');
  if (name) {
    const byPath = events.find(
      (event) =>
        event.type === 'edit' &&
        !used.has(event.id) &&
        (event.detail === name ||
          event.detail === fileEdit.path ||
          String(event.detail || '').includes(name))
    );
    if (byPath) return byPath;
  }
  return [...events].reverse().find((event) => event.type === 'edit' && !used.has(event.id));
}

function findTerminalEvent(
  events: ConversationWorkEvent[],
  run: WorkEventTerminalRun,
  used: Set<string>
): ConversationWorkEvent | undefined {
  if (run.toolId) {
    const hit = events.find(
      (event) =>
        event.id === run.toolId && event.type === 'terminal' && !used.has(event.id)
    );
    if (hit) return hit;
  }
  const byCommand = events.find(
    (event) =>
      event.type === 'terminal' &&
      !used.has(event.id) &&
      commandsMatch(event.detail, run.command || run.description)
  );
  if (byCommand) return byCommand;
  return [...events]
    .reverse()
    .find((event) => event.type === 'terminal' && !used.has(event.id));
}

/** Stamp fileEdit/terminal refs onto timeline rows (toolId first, then path/command, then last unmatched). */
export function linkPreviewToWorkEvents(
  events: ConversationWorkEvent[],
  preview:
    | { kind: 'fileEdit'; fileEdit: WorkEventFileEdit }
    | { kind: 'terminal'; terminalRun: WorkEventTerminalRun }
): ConversationWorkEvent[] {
  if (preview.kind === 'fileEdit') {
    const target = findEditEvent(events, preview.fileEdit, new Set());
    if (!target) {
      const created: ConversationWorkEvent = {
        id: preview.fileEdit.toolId || preview.fileEdit.id,
        type: 'edit',
        status: 'complete',
        label: 'Edit',
        detail: basename(preview.fileEdit.path || preview.fileEdit.absPath || ''),
        ref: { kind: 'fileEdit', id: preview.fileEdit.id }
      };
      return upsertWorkEvents(events, created);
    }
    return linkWorkEventRef(events, target.id, {
      kind: 'fileEdit',
      id: preview.fileEdit.id
    });
  }

  const target = findTerminalEvent(events, preview.terminalRun, new Set());
  if (!target) {
    const created: ConversationWorkEvent = {
      id: preview.terminalRun.toolId || preview.terminalRun.id,
      type: 'terminal',
      status:
        preview.terminalRun.status === 'error'
          ? 'error'
          : preview.terminalRun.status === 'done'
            ? 'complete'
            : 'running',
      label: 'Terminal',
      detail: preview.terminalRun.command || preview.terminalRun.description,
      ref: { kind: 'terminal', id: preview.terminalRun.id }
    };
    return upsertWorkEvents(events, created);
  }
  return linkWorkEventRef(events, target.id, {
    kind: 'terminal',
    id: preview.terminalRun.id
  });
}

export function resolveFileEditForEvent(
  event: ConversationWorkEvent,
  fileEdits: FileEditPreview[] = []
): FileEditPreview | undefined {
  if (event.type !== 'edit' || !fileEdits.length) return undefined;
  if (event.ref?.kind === 'fileEdit') {
    const hit = fileEdits.find((item) => item.id === event.ref?.id);
    if (hit) return hit;
  }
  return (
    fileEdits.find((item) => item.toolId === event.id) ||
    fileEdits.find((item) => basename(item.path) === event.detail)
  );
}

export function resolveTerminalRunForEvent(
  event: ConversationWorkEvent,
  terminalRuns: TerminalRunPreview[] = []
): TerminalRunPreview | undefined {
  if (event.type !== 'terminal' || !terminalRuns.length) return undefined;
  if (event.ref?.kind === 'terminal') {
    const hit = terminalRuns.find((item) => item.id === event.ref?.id);
    if (hit) return hit;
  }
  return (
    terminalRuns.find((item) => item.toolId === event.id) ||
    terminalRuns.find((item) => commandsMatch(event.detail, item.command))
  );
}
