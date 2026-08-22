/**
 * UI-003 — Message bubble chrome (v2.1 MessageBubble layout).
 */
import type { JSX, ReactNode } from 'react';

export type MessageBubbleProps = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  live?: boolean;
  className?: string;
};

export function MessageBubble(props: MessageBubbleProps): JSX.Element {
  const { role, children, header, footer, live, className } = props;
  const cls = [
    'message-bubble',
    role,
    live ? 'message-bubble--live-phase' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <article className={cls} data-role={role} data-testid={`ui-message-bubble-${role}`}>
      {header ? <header className="message-header">{header}</header> : null}
      <div className="message-content">{children}</div>
      {footer ? <footer className="message-actions">{footer}</footer> : null}
    </article>
  );
}
