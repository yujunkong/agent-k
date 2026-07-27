import React, { useState, useEffect, useRef } from 'react';
import { highlightCode, isHighlighterReady, normalizeLang } from '../shiki/highlighter';
import { IconCheck, IconCopy } from './Icons';

interface CodeBlockProps {
  language: string;
  code: string;
  streaming?: boolean;
}

function looksLikeMarkdown(code: string): boolean {
  const t = code.trim();
  if (!t) return false;
  return (
    /^#{1,6}\s/m.test(t) ||
    /^\s*[-*]\s+\[[ xX]\]/m.test(t) ||
    /^\s*[-*]\s+\S/m.test(t) ||
    /^\|.+\|/m.test(t) ||
    /\[.+\]\(.+\)/.test(t)
  );
}

export function CodeBlock({ language, code, streaming }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<string>('');
  const [ready, setReady] = useState(isHighlighterReady());
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  let lang = normalizeLang(language);
  if (
    (lang === 'plaintext' || lang === 'text' || !language) &&
    looksLikeMarkdown(code)
  ) {
    lang = 'markdown';
  }

  useEffect(() => {
    if (ready) return;
    const checkReady = setInterval(() => {
      if (isHighlighterReady()) {
        setReady(true);
        clearInterval(checkReady);
      }
    }, 100);
    // Don't wait forever — fallback highlighter kicks in via highlightCode
    const giveUp = setTimeout(() => {
      clearInterval(checkReady);
      setReady(true);
    }, 2500);
    return () => {
      clearInterval(checkReady);
      clearTimeout(giveUp);
    };
  }, [ready]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const isDark =
        document.body.classList.contains('vscode-dark') ||
        document.body.classList.contains('vscode-high-contrast') ||
        !document.body.classList.contains('vscode-light');
      highlightCode(code, lang, isDark).then(setHighlighted);
    }, streaming ? 80 : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, lang, ready, streaming]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const label =
    lang === 'markdown' && (!language || /^(text|plaintext|txt|plain)?$/i.test(language))
      ? 'markdown'
      : lang === 'plaintext' && !language
        ? 'text'
        : (language || lang).toLowerCase();
  const useHighlighted = Boolean(
    highlighted &&
      (highlighted.includes('shiki') ||
        highlighted.includes('style="color:') ||
        highlighted.includes("style='color:"))
  );

  return (
    <div className="ak-code">
      <div className="ak-code__header">
        <span className="ak-code__lang">{label}</span>
        <button
          type="button"
          className="ak-code__copy"
          onClick={handleCopy}
          title={copied ? '복사됨' : '코드 복사'}
          aria-label={copied ? '복사됨' : '코드 복사'}
        >
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
        </button>
      </div>
      {useHighlighted ? (
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
