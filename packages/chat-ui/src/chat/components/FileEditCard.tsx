/**
 * Cursor-style file edit card: header opens file; full diff scrolls in max-height.
 * Diff lines use Shiki (or fallback) token colors.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { languageBadge, guessLanguageFromPath, type EditDiffLine } from '../editDiffPreview';
import { highlightLineHtml, isDarkTheme } from '../shiki/highlightLine';

export interface FileEditCardProps {
  path: string;
  absPath?: string;
  additions: number;
  deletions: number;
  lines: EditDiffLine[];
  onOpenFile?: (path: string) => void;
  /** Force larger scroll viewport (multi-file review). */
  expanded?: boolean;
  /** Nested under TimelineStepCard — hide duplicate header chrome. */
  embedded?: boolean;
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}

function escapeText(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function DiffCodeLine({ text, lang, htmlCache }: { text: string; lang: string; htmlCache: Map<string, string> }) {
  const key = `${lang}\0${text}`;
  const [html, setHtml] = useState(() => htmlCache.get(key) || escapeText(text));

  useEffect(() => {
    let cancelled = false;
    const cached = htmlCache.get(key);
    if (cached) {
      setHtml(cached);
      return;
    }
    void highlightLineHtml(text, lang, isDarkTheme()).then((h) => {
      if (cancelled) return;
      htmlCache.set(key, h);
      setHtml(h);
    });
    return () => {
      cancelled = true;
    };
  }, [key, text, lang, htmlCache]);

  return <span className="ak-file-edit-diff__text" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function FileEditCard({
  path,
  absPath,
  additions,
  deletions,
  lines,
  onOpenFile,
  expanded: expandedProp,
  embedded = false
}: FileEditCardProps) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const openTarget = absPath || path;
  // Comment: collapsed ≈ 4 lines (72px CSS); expand raises max-height only
  const isExpanded = expandedProp ?? localExpanded;
  const showExpand = !embedded && expandedProp == null && lines.length > 4;
  const lang = useMemo(() => guessLanguageFromPath(path), [path]);
  const htmlCache = useMemo(() => new Map<string, string>(), [path]);

  return (
    <div
      className={`ak-file-edit-card${isExpanded ? ' ak-file-edit-card--expanded' : ''}${
        embedded ? ' ak-file-edit-card--embedded' : ''
      }`}
    >
      {embedded ? null : (
        <button type="button" className="ak-file-edit-header" title={`Open ${path}`} onClick={() => onOpenFile?.(openTarget)}>
          <span className="ak-file-edit-header__lang" aria-hidden>{languageBadge(path)}</span>
          <span className="ak-file-edit-header__name">{basename(path)}</span>
          <span className="ak-file-edit-header__stats">
            {additions > 0 ? <span className="ak-file-edit-header__add">+{additions}</span> : null}
            {deletions > 0 ? <span className="ak-file-edit-header__del">-{deletions}</span> : null}
            {additions === 0 && deletions === 0 ? <span style={{ opacity: 0.5 }}>0</span> : null}
          </span>
        </button>
      )}

      {lines.length > 0 ? (
        <div className="ak-file-edit-diff">
          {lines.map((line, i) => {
            const kind = line.type === 'add' ? 'add' : line.type === 'delete' ? 'delete' : 'context';
            const mark = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
            return (
              <div key={`${line.type}-${line.lineNumber}-${i}`} className={`ak-file-edit-diff__line ak-file-edit-diff__line--${kind}`}>
                <span className="ak-file-edit-diff__ln">{line.lineNumber}</span>
                <span className="ak-file-edit-diff__mark">{mark}</span>
                <DiffCodeLine text={line.text} lang={lang} htmlCache={htmlCache} />
              </div>
            );
          })}
        </div>
      ) : null}

      {showExpand ? (
        <button
          type="button"
          className="ak-file-edit-expand"
          title={isExpanded ? 'Collapse' : 'Expand'}
          aria-expanded={isExpanded}
          onClick={() => setLocalExpanded((v) => !v)}
        >
          <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>
            {isExpanded ? '⌃' : '⌄'}
          </span>
        </button>
      ) : null}
    </div>
  );
}
