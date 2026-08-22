/**
 * UI — Debug mode chrome shell.
 */
import type { JSX } from 'react';

export type DebugHypothesis = { id: string; title: string };

export function DebugModeUI(props: {
  hypotheses: DebugHypothesis[];
  activeId?: string;
  onSelect?: (id: string) => void;
}): JSX.Element {
  return (
    <div className="debug-mode-ui" data-testid="ui-debug-mode">
      <span className="debug-mode-ui__label">Hypotheses</span>
      {props.hypotheses.map((h) => (
        <button
          key={h.id}
          type="button"
          className={`debug-mode-ui__hypo${props.activeId === h.id ? ' is-active' : ''}`}
          onClick={() => props.onSelect?.(h.id)}
        >
          <span className="debug-mode-ui__hypo-title">{h.title}</span>
        </button>
      ))}
    </div>
  );
}
