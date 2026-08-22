/**
 * UI — Diff review panel chrome.
 */
import type { JSX } from 'react';

export function DiffReviewPanel(props: {
  path: string;
  diff: string;
  onAccept?: () => void;
  onReject?: () => void;
}): JSX.Element {
  return (
    <div className="diff-review-panel" data-testid="ui-diff-review">
      <header className="diff-review-panel__header">{props.path}</header>
      <pre className="diff-review-panel__diff">{props.diff}</pre>
      <div className="diff-review-panel__actions">
        <button type="button" onClick={props.onAccept}>Accept</button>
        <button type="button" onClick={props.onReject}>Reject</button>
      </div>
    </div>
  );
}
