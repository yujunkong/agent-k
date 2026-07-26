/**
 * Cursor-style file edit card: header opens file, hover chevron expands diff.
 */
import React, { useState } from 'react';
import { languageBadge, type EditDiffLine } from '../editDiffPreview';

export interface FileEditCardProps {
  path: string;
  absPath?: string;
  additions: number;
  deletions: number;
  lines: EditDiffLine[];
  onOpenFile?: (path: string) => void;
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}

export function FileEditCard({
  path,
  absPath,
  additions,
  deletions,
  lines,
  onOpenFile
}: FileEditCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const openTarget = absPath || path;
  const previewCount = 5;
  const visible = expanded ? lines : lines.slice(0, previewCount);
  const canExpand = lines.length > previewCount;
  const showExpand = canExpand || hovered;

  return (
    <div
      className="ak-file-edit-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="ak-file-edit-header"
        title={`Open ${path}`}
        onClick={() => onOpenFile?.(openTarget)}
      >
        <span className="ak-file-edit-header__lang" aria-hidden>
          {languageBadge(path)}
        </span>
        <span className="ak-file-edit-header__name">{basename(path)}</span>
        <span className="ak-file-edit-header__stats">
          {additions > 0 ? (
            <span className="ak-file-edit-header__add">+{additions}</span>
          ) : null}
          {deletions > 0 ? (
            <span className="ak-file-edit-header__del">-{deletions}</span>
          ) : null}
          {additions === 0 && deletions === 0 ? (
            <span style={{ opacity: 0.5 }}>0</span>
          ) : null}
        </span>
      </button>

      {visible.length > 0 ? (
        <div
          className="ak-file-edit-diff"
          style={{
            maxHeight: expanded ? 320 : undefined,
            overflow: expanded ? 'auto' : 'hidden'
          }}
        >
          {visible.map((line, i) => {
            const kind =
              line.type === 'add'
                ? 'add'
                : line.type === 'delete'
                  ? 'delete'
                  : 'context';
            const mark =
              line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
            return (
              <div
                key={`${line.type}-${line.lineNumber}-${i}`}
                className={`ak-file-edit-diff__line ak-file-edit-diff__line--${kind}`}
              >
                <span className="ak-file-edit-diff__ln">{line.lineNumber}</span>
                <span className="ak-file-edit-diff__mark">{mark}</span>
                <span className="ak-file-edit-diff__text">{line.text}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {showExpand && lines.length > 0 ? (
        <button
          type="button"
          className={`ak-file-edit-expand${
            hovered || expanded ? '' : ' ak-file-edit-expand--collapsed'
          }`}
          title={expanded ? 'Collapse diff' : 'Expand diff'}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>
            {expanded ? '⌃' : '⌄'}
          </span>
        </button>
      ) : null}
    </div>
  );
}
