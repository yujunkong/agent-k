/**
 * UI — TimelineCheckpoint presentation shell (v2.1 chrome).
 */
import type { JSX, ReactNode } from 'react';

export type TimelineCheckpointProps = {
  title?: string;
  children?: ReactNode;
  className?: string;
};

export function TimelineCheckpoint(props: TimelineCheckpointProps): JSX.Element {
  const { title, children, className } = props;
  return (
    <div className={`timeline-checkpoint${className ? ` ${className}` : ''}`} data-testid="ui-timeline-checkpoint">
      {title ? <div className="timeline-checkpoint__title">{title}</div> : null}
      <div className="timeline-checkpoint__body">{children}</div>
    </div>
  );
}
