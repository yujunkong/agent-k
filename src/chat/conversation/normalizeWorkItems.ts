import type { WorkItem, WorkItemKind, WorkItemStatus } from '../components/WorkTimeline';

export type ConversationWorkEvent = {
  id?: string;
  type?: string;
  kind?: string;
  label?: string;
  name?: string;
  detail?: string;
  status?: string;
  state?: string;
};

const kindOf = (event: ConversationWorkEvent): WorkItemKind => {
  const value = (event.kind ?? event.type ?? '').toLowerCase();
  if (value.includes('read') || value.includes('file')) return 'read';
  if (value.includes('search') || value.includes('grep')) return 'search';
  if (value.includes('edit') || value.includes('write') || value.includes('patch')) return 'edit';
  if (value.includes('terminal') || value.includes('command') || value.includes('shell')) return 'terminal';
  if (value.includes('verify') || value.includes('test') || value.includes('check')) return 'verify';
  return 'generic';
};

const statusOf = (event: ConversationWorkEvent): WorkItemStatus => {
  const value = (event.status ?? event.state ?? '').toLowerCase();
  if (value.includes('run') || value.includes('progress') || value === 'active') return 'running';
  if (value.includes('error') || value.includes('fail')) return 'error';
  if (value.includes('pending') || value.includes('queued')) return 'pending';
  return 'complete';
};

/** Normalize existing agent/tool events without coupling the presentation layer to host event names. */
export function normalizeWorkItems(events: ConversationWorkEvent[] = []): WorkItem[] {
  return events.map((event, index) => ({
    id: event.id ?? `${event.type ?? event.kind ?? 'work'}-${index}`,
    label: event.label ?? event.name ?? event.type ?? event.kind ?? 'Working',
    detail: event.detail,
    kind: kindOf(event),
    status: statusOf(event),
  }));
}
