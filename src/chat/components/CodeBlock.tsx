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
  const codeRef = useRef(code);
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
    codeRef.current = code;
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!language || !ready) {
      setHighlighted(escapeHtml(code));
      return;
    }

    debounceRef.current = setTimeout(() => {
      const isDark = document.body.classList.contains('vscode-dark');
      highlightCode(code, language, isDark).then(setHighlighted);
    }, streaming ? 50 : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, language, ready, streaming]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-lang-label">{language || 'text'}</span>
        <button className="code-copy-btn" onClick={handleCopy} title="Copy code">
          📋 Copy
        </button>
      </div>
      <pre className={`code-block language-${language || 'text'}`}>
        <code
          className={`language-${language || 'text'}`}
          dangerouslySetInnerHTML={{
            __html: highlighted || (ready ? escapeHtml(code) : escapeHtml(code))
          }}
        />
        {streaming && <span className="streaming-cursor">█</span>}
      </pre>
    </div>
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
