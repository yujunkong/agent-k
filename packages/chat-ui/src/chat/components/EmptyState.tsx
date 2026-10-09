/**
 * V31-UI-01 (UX-01) — First-run empty state.
 * Presentation-only: welcome, three start actions, provider hint.
 * Comment: no vscode / host imports (chat-ui boundary).
 */
import React from 'react';

export interface EmptyStateProps {
  /** True when both provider base URL and model are configured. */
  providerReady: boolean;
  /** Send a start-action prompt through the normal composer send flow. */
  onAction: (prompt: string) => void;
  /** Open the Settings overlay (AI Providers tab). */
  onOpenSettings: () => void;
}

interface StartAction {
  label: string;
  prompt: string;
}

/** Scoped prompts — avoid "dump the entire multi-root workspace" briefs. */
const START_ACTIONS: StartAction[] = [
  {
    label: 'Explain this codebase',
    prompt:
      'In under 15 bullets, summarize the main packages under packages/ and how they relate. Do not paste large file trees.',
  },
  {
    label: 'Find and fix a bug',
    prompt:
      'Find one concrete bug or failing test in this workspace, explain the root cause briefly, and propose a minimal fix.',
  },
  {
    label: 'Write tests',
    prompt:
      'Pick one important untested module and draft focused unit tests for it. Ask before writing files if scope is unclear.',
  },
];

export function EmptyState({
  providerReady,
  onAction,
  onOpenSettings,
}: EmptyStateProps) {
  return (
    <section className="ak-empty-state" aria-label="Get started">
      <h2 className="ak-empty-state__title">Agent-K</h2>
      <p className="ak-empty-state__subtitle">
        Ask a question, describe a task, or start from one of the actions below.
      </p>
      <div className="ak-empty-state__actions">
        {START_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            className="ak-empty-state__action"
            onClick={() => onAction(action.prompt)}
          >
            {action.label}
          </button>
        ))}
      </div>
      {!providerReady && (
        <p className="ak-empty-state__hint">
          <span>No provider configured — open Settings → AI Providers</span>
          <button
            type="button"
            className="ak-empty-state__settings-btn"
            onClick={onOpenSettings}
          >
            Open Settings
          </button>
        </p>
      )}
    </section>
  );
}
