/**
 * V31-UI-01 (UX-01) — First-run empty state.
 *
 * Presentation-only: welcome title, three start actions, and a provider hint
 * when no provider is configured. No host/vscode imports (chat-ui boundary).
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

const START_ACTIONS: StartAction[] = [
  {
    label: 'Explain this codebase',
    prompt:
      'Explain this codebase: what are the main packages and how do they fit together?'
  },
  {
    label: 'Find and fix a bug',
    prompt: 'Find a bug in this workspace, explain the root cause, and fix it.'
  },
  {
    label: 'Write tests',
    prompt: 'Write tests for the most important untested module in this workspace.'
  }
];

export function EmptyState({
  providerReady,
  onAction,
  onOpenSettings
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
