/**
 * UI — Terminal run card chrome (v2.1).
 */
import type { JSX } from 'react';

export type TerminalRunCardProps = {
  command: string;
  output?: string;
  exitCode?: number | null;
  running?: boolean;
};

export function TerminalRunCard(props: TerminalRunCardProps): JSX.Element {
  const { command, output, exitCode, running } = props;
  return (
    <div className={`terminal-run-card${running ? ' is-running' : ''}`} data-testid="ui-terminal-run-card">
      <div className="terminal-run-card__cmd"><code>{command}</code></div>
      {output ? <pre className="terminal-run-card__out">{output}</pre> : null}
      {exitCode != null ? (
        <div className="terminal-run-card__exit">exit {exitCode}</div>
      ) : null}
    </div>
  );
}
