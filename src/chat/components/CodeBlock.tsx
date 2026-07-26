import React, { useState, useEffect, useRef } from 'react';
import { highlightCode, isHighlighterReady } from '../shiki/highlighter';

interface CodeBlockProps {
  language: string;
  code: string;
  streaming?: boolean;
}

export function CodeBlock({ language, code, streaming }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<string>('');
  const [ready, setReady] = useState(isHighlighterReady());
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const checkReady = setInterval(() => {
      if (isHighlighterReady()) {
        setReady(true);
        clearInterval(checkReady);
      }
    }, 100);
    return () => clearInterval(checkReady);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!language || !ready) {
      setHighlighted('');
      return;
    }

    debounceRef.current = setTimeout(() => {
      const isDark =
        document.body.classList.contains('vscode-dark') ||
        document.body.classList.contains('vscode-high-contrast') ||
        !document.body.classList.contains('vscode-light');
      highlightCode(code, language, isDark).then(setHighlighted);
    }, streaming ? 50 : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, language, ready, streaming]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const label = (language || 'text').toLowerCase();
  const useShiki = Boolean(highlighted && highlighted.includes('shiki'));

  return (
    <div className="ak-code">
      <div className="ak-code__header">
        <span className="ak-code__lang">{label}</span>
        <button
          type="button"
          className="ak-code__copy"
          onClick={handleCopy}
          title="Copy code"
          aria-label="Copy code"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {useShiki ? (
        <div className="ak-code__body">
          <div dangerouslySetInnerHTML={{ __html: highlighted }} />
          {streaming ? <span className="ak-code__cursor" aria-hidden /> : null}
        </div>
      ) : (
        <pre className="ak-code__pre">
          <code>{code}</code>
          {streaming ? <span className="ak-code__cursor" aria-hidden /> : null}
        </pre>
      )}
    </div>
  );
}
