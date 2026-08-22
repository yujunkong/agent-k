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

function hasHighlightMarkup(html: string): boolean {
  return (
    html.includes('shiki') ||
    html.includes('style="color:') ||
    html.includes("style='color:")
  );
}

export function CodeBlock({ language, code, streaming }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<string>('');
  const [ready, setReady] = useState(isHighlighterReady());
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestGen = useRef(0);
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

    // While the fence is still streaming, keep plain/stable text — avoid
    // remount/rehighlight flicker. Highlight once the fence closes (or after settle).
    const delay = streaming ? 180 : ready ? 0 : 40;

    debounceRef.current = setTimeout(() => {
      const gen = ++requestGen.current;
      const isDark =
        document.body.classList.contains('vscode-dark') ||
        document.body.classList.contains('vscode-high-contrast') ||
        !document.body.classList.contains('vscode-light');
      void highlightCode(code, lang, isDark).then((html) => {
        if (gen !== requestGen.current) return;
        if (html && hasHighlightMarkup(html)) {
          setHighlighted(html);
        }
      });
    }, delay);

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

  // Keep last good highlight while a newer pass runs — never flash empty → plain → colored
  const useHighlighted = Boolean(highlighted && hasHighlightMarkup(highlighted));
  // During active streaming of this fence, prefer plain for stability unless we already
  // highlighted an earlier snapshot (then keep it until fence closes).
  const showHighlight = useHighlighted && (!streaming || highlighted.length > 0);

  return (
    <div className="ak-code">
      <div className="ak-code__header">
        <span className="ak-code__lang">{label}</span>
        <button
          type="button"
          className="ak-code__copy"
          onClick={handleCopy}
          title={copied ? 'Copied' : 'Copy code'}
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
        </button>
      </div>
      {showHighlight ? (
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
