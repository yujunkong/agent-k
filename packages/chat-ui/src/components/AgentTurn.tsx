/**
 * UI-001 — Agent turn container (v2.1 AgentTurn chrome).
 */
import type { JSX, ReactNode } from 'react';

export type AgentTurnProps = {
  title?: string;
  status?: 'running' | 'done' | 'error';
  children: ReactNode;
};

export function AgentTurn(props: AgentTurnProps): JSX.Element {
  const { title = 'Agent', status = 'done', children } = props;
  return (
    <section className={`agent-turn agent-turn--${status}`} data-testid="ui-agent-turn">
      <header className="agent-turn__header">
        <span className="agent-turn__title">{title}</span>
        <span className="agent-turn__status">{status}</span>
      </header>
      <div className="agent-turn__body">{children}</div>
    </section>
  );
}
