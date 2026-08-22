/**
 * UI — Explore mode chrome shell.
 */
import type { JSX, ReactNode } from 'react';

export function ExploreChrome(props: { children?: ReactNode }): JSX.Element {
  return (
    <div className="explore-chrome" data-testid="ui-explore-chrome">
      {props.children}
    </div>
  );
}
