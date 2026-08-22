/**
 * UI — Mode badge chrome.
 */
import type { JSX } from 'react';

export function ModeBadge(props: { mode: string }): JSX.Element {
  return (
    <span className={`mode-badge mode-badge--${props.mode}`} data-testid="ui-mode-badge">
      {props.mode}
    </span>
  );
}
