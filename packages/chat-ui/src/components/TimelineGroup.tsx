/**
 * UI — TimelineGroup presentation shell (v2.1 chrome).
 */
import type { JSX, ReactNode } from 'react';

export type TimelineGroupProps = {
  title?: string;
  children?: ReactNode;
  className?: string;
};

export function TimelineGroup(props: TimelineGroupProps): JSX.Element {
  const { title, children, className } = props;
  return (
    <div className={`timeline-group${className ? ` ${className}` : ''}`} data-testid="ui-timeline-group">
      {title ? <div className="timeline-group__title">{title}</div> : null}
      <div className="timeline-group__body">{children}</div>
    </div>
  );
}
