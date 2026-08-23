/**
 * SUB-010 — seed / scrub helpers for independent subagent ChatSessions.
 */

import { v4 as uuidv4 } from 'uuid';
import type { StreamDelta } from './types';
import type { ChatMessage } from './types';
import { sessionStore } from './hooks/useChatSessions';
import type { Mode } from './types';

/** Drop parent-group tags so child MessageSteps uses main chrome. */
export function scrubChildStreamDelta(delta: StreamDelta): StreamDelta {
  const next: StreamDelta = { ...delta };
  if (next.workEvent && next.workEvent.subagentId) {
    next.workEvent = { ...next.workEvent, subagentId: undefined };
  }
  if (next.timeline?.subagentId) {
    next.timeline = { ...next.timeline, subagentId: undefined };
  }
  return next;
}

/**
 * One-line parent SubagentRunRow status from child transcript.
 * Live: keypoints only (Thinking / Read / Ran…).
 * Settled: Completed / Failed — never leave last tool keypoint (Edited) stuck.
 */
export function rollingLineFromChildMessages(
  messages: ChatMessage[]
): string | undefined {
  const lastAsst = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!lastAsst) return undefined;
  // Comment: SUB-011 — parent RunRow must flip off Edited when child settles
  if (lastAsst.status === 'complete') return 'Completed';
  if (lastAsst.status === 'error') return 'Failed';
  const items = lastAsst.workItems || [];
  for (let i = items.length - 1; i >= 0; i--) {
    const e = items[i];
    if (e.status === 'running' || e.status === 'pending') {
      const kp = keypointFromWorkItem(e);
      if (kp) return kp;
    }
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const e = items[i];
    if (e.type === 'subagent') continue;
    const kp = keypointFromWorkItem(e);
    if (kp) return kp;
  }
  const steps = lastAsst.steps || [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const kp = keypointFromStep(steps[i]);
    if (kp) return kp;
  }
  return undefined;
}

/** Map child work row → short chrome label (Cursor-style keypoint). */
function keypointFromWorkItem(e: {
  type?: string;
  label?: string;
  toolName?: string;
}): string | undefined {
  const type = String(e.type || '').toLowerCase();
  const tool = String(e.toolName || '').toLowerCase();
  if (type === 'thinking' || type === 'plan') return 'Thinking';
  if (type === 'read' || tool === 'read_file' || tool === 'read_files') {
    return 'Read';
  }
  if (
    type === 'search' ||
    tool === 'grep' ||
    tool === 'glob' ||
    tool === 'file_search' ||
    tool === 'codebase_search' ||
    tool === 'list_dir'
  ) {
    return tool === 'grep' ? 'Grepped' : 'Searched';
  }
  if (type === 'edit' || tool === 'edit_file' || tool === 'write_file') {
    return 'Edited';
  }
  if (
    type === 'terminal' ||
    tool === 'run_terminal_cmd' ||
    tool === 'terminal_output'
  ) {
    return 'Ran';
  }
  if (type === 'verify') return 'Verified';
  if (tool === 'web_search' || tool === 'web_fetch') return 'Browsed';
  const label = String(e.label || '').trim();
  if (label && label.length <= 16 && !/[\/\\`$]/.test(label)) return label;
  return undefined;
}

function keypointFromStep(s: {
  kind?: string;
  label?: string;
  toolName?: string;
}): string | undefined {
  const kind = String(s.kind || '').toLowerCase();
  const tool = String(s.toolName || '').toLowerCase();
  if (kind === 'thinking' || kind === 'planning') return 'Thinking';
  if (kind === 'reading') return 'Read';
  if (kind === 'searching') return tool === 'grep' ? 'Grepped' : 'Searched';
  if (kind === 'editing') return 'Edited';
  if (kind === 'running') return 'Ran';
  if (kind === 'browsing') return 'Browsed';
  if (kind === 'verifying') return 'Verified';
  return keypointFromWorkItem({
    type: kind,
    label: s.label,
    toolName: s.toolName
  });
}

/** Re-open sealed child assistant so late deltas are not dropped. */
export function ensureChildAssistantStreaming(
  childSessionId: string,
  mode?: Mode
): void {
  const existing = sessionStore.get(childSessionId);
  if (!existing?.messages?.length) return;
  const last = existing.messages[existing.messages.length - 1];
  if (last?.role === 'assistant' && last.status === 'streaming') return;
  if (last?.role === 'assistant' && last.status !== 'streaming') {
    const msgs = existing.messages.map((m, i) =>
      i === existing.messages.length - 1 && m.role === 'assistant'
        ? { ...m, status: 'streaming' as const }
        : m
    );
    sessionStore.saveMessages(
      childSessionId,
      msgs,
      mode || existing.mode || 'agent',
      {
        setCurrent: false
      }
    );
  }
}

/**
 * Idempotent seed: create child session + [user, streaming assistant] once.
 * Never append a second turn on complete/error — that produced ghost "Subagent"
 * rows when late status deltas or tab-open called ensure again (SUB-010).
 */
export function ensureSubagentChildSession(opts: {
  childSessionId: string;
  parentSessionId: string;
  title: string;
  taskId?: string;
  mode?: Mode;
  userPrompt?: string;
}): void {
  const title = String(opts.title || 'Subagent').trim() || 'Subagent';
  sessionStore.createSubagentSession({
    id: opts.childSessionId,
    parentSessionId: opts.parentSessionId,
    title,
    mode: opts.mode || 'agent',
    taskId: opts.taskId
  });
  const existing = sessionStore.get(opts.childSessionId);
  // Comment: any existing transcript wins — open/detail must not rewrite history
  if (existing && existing.messages.length > 0) {
    if (opts.title.trim() && existing.title !== title) {
      sessionStore.createSubagentSession({
        id: opts.childSessionId,
        parentSessionId: opts.parentSessionId,
        title,
        mode: opts.mode || existing.mode || 'agent',
        taskId: opts.taskId
      });
    }
    // Comment: upgrade truncated seed (host used to send prompt.slice(0,80))
    const fullPrompt = String(opts.userPrompt || '').trim();
    if (fullPrompt.length > 0) {
      const firstUserIdx = existing.messages.findIndex((m) => m.role === 'user');
      if (firstUserIdx >= 0) {
        const prev = String(existing.messages[firstUserIdx].content || '');
        if (
          prev.length < fullPrompt.length &&
          (fullPrompt.startsWith(prev) || prev.length <= 80)
        ) {
          const msgs = existing.messages.map((m, i) =>
            i === firstUserIdx ? { ...m, content: fullPrompt } : m
          );
          sessionStore.saveMessages(
            opts.childSessionId,
            msgs,
            opts.mode || existing.mode || 'agent',
            { setCurrent: false }
          );
        }
      }
    }
    return;
  }
  const seed: ChatMessage[] = [
    {
      id: uuidv4(),
      role: 'user',
      content: opts.userPrompt || title,
      status: 'complete',
      timestamp: Date.now()
    },
    {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      status: 'streaming',
      workItems: [],
      timestamp: Date.now()
    }
  ];
  sessionStore.saveMessages(opts.childSessionId, seed, opts.mode || 'agent', {
    setCurrent: false
  });
}
