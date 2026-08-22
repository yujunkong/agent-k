/**
 * UI — TimelineStepCard presentation shell (v2.1 chrome).
 */
import type { JSX, ReactNode } from 'react';

export type TimelineStepCardProps = {
  title?: string;
  children?: ReactNode;
  className?: string;
};

export function TimelineStepCard(props: TimelineStepCardProps): JSX.Element {
  const { title, children, className } = props;
  return (
    <div className={`timeline-step-card${className ? ` ${className}` : ''}`} data-testid="ui-timeline-step">
      {title ? <div className="timeline-step-card__title">{title}</div> : null}
      <div className="timeline-step-card__body">{children}</div>
    </div>
  );
}
