/**
 * UI — Timeline presentation shell (v2.1 chrome).
 */
import type { JSX, ReactNode } from 'react';

export type TimelineProps = {
  title?: string;
  children?: ReactNode;
  className?: string;
};

export function Timeline(props: TimelineProps): JSX.Element {
  const { title, children, className } = props;
  return (
    <div className={`timeline${className ? ` ${className}` : ''}`} data-testid="ui-timeline">
      {title ? <div className="timeline__title">{title}</div> : null}
      <div className="timeline__body">{children}</div>
    </div>
  );
}
