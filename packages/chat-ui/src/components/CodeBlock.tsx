/**
 * UI-024 — Code block chrome (syntax later via host/shiki).
 */
import type { JSX } from 'react';

export type CodeBlockProps = {
  code: string;
  language?: string;
};

export function CodeBlock(props: CodeBlockProps): JSX.Element {
  const { code, language } = props;
  return (
    <div className="code-block" data-testid="ui-code-block">
      {language ? <div className="code-block__lang">{language}</div> : null}
      <pre className="code-block__pre"><code>{code}</code></pre>
    </div>
  );
}
