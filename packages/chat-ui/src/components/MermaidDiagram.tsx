/**
 * UI-024 — Mermaid diagram chrome (render when mermaid dep is wired).
 */
import type { JSX } from 'react';

export function MermaidDiagram(props: { source: string }): JSX.Element {
  return (
    <div className="mermaid-diagram" data-testid="ui-mermaid">
      <pre className="mermaid">{props.source}</pre>
    </div>
  );
}
