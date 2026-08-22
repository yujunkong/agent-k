/**
 * UI — Plan mode header chrome.
 */
import type { JSX } from 'react';

export function PlanModeHeader(props: { title?: string; status?: string }): JSX.Element {
  return (
    <div className="plan-mode-header" data-testid="ui-plan-mode-header">
      <strong>{props.title ?? 'Plan'}</strong>
      {props.status ? <span>{props.status}</span> : null}
    </div>
  );
}
