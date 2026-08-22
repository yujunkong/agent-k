/**
 * UI — WorkTimeline presentation shell (v2.1 chrome).
 */
import type { JSX, ReactNode } from 'react';

export type WorkTimelineProps = {
  title?: string;
  children?: ReactNode;
  className?: string;
};

export function WorkTimeline(props: WorkTimelineProps): JSX.Element {
  const { title, children, className } = props;
  return (
    <div className={`work-timeline${className ? ` ${className}` : ''}`} data-testid="ui-work-timeline">
      {title ? <div className="work-timeline__title">{title}</div> : null}
      <div className="work-timeline__body">{children}</div>
    </div>
  );
}
