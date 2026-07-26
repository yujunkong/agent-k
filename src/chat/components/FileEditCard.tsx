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

  return (
    <div
      className="ak-file-edit-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        margin: '8px 0',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'var(--vscode-editor-background, #1e1e1e)',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <button
        type="button"
        className="ak-file-edit-header"
        title={`Open ${path}`}
        onClick={() => onOpenFile?.(openTarget)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 10px',
          border: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'var(--vscode-sideBar-background, #252526)',
          color: 'var(--vscode-foreground, #ccc)',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit'
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 22,
            height: 16,
            padding: '0 4px',
            borderRadius: 3,
            background: '#3178c6',
            color: '#fff',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.2
          }}
        >
          {languageBadge(path)}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 500,
            fontSize: 12.5
          }}
        >
          {basename(path)}
        </span>
        <span style={{ display: 'inline-flex', gap: 6, fontSize: 11, flexShrink: 0 }}>
          {additions > 0 && (
            <span style={{ color: '#4ade80', fontWeight: 600 }}>+{additions}</span>
          )}
          {deletions > 0 && (
            <span style={{ color: '#f87171', fontWeight: 600 }}>-{deletions}</span>
          )}
          {additions === 0 && deletions === 0 && (
            <span style={{ opacity: 0.5 }}>0</span>
          )}
        </span>
      </button>

      {visible.length > 0 && (
        <div
          className="ak-file-edit-diff"
          style={{
            fontFamily: 'var(--vscode-editor-font-family, ui-monospace, monospace)',
            fontSize: 11.5,
            lineHeight: 1.45,
            maxHeight: expanded ? 320 : undefined,
            overflow: expanded ? 'auto' : 'hidden'
          }}
        >
          {visible.map((line, i) => {
            const bg =
              line.type === 'add'
                ? 'rgba(74,222,128,0.12)'
                : line.type === 'delete'
                  ? 'rgba(239,68,68,0.12)'
                  : 'transparent';
            const fg =
              line.type === 'add'
                ? '#86efac'
                : line.type === 'delete'
                  ? '#fca5a5'
                  : 'var(--vscode-foreground, #ccc)';
            const mark =
              line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
            return (
              <div
                key={`${line.type}-${line.lineNumber}-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 14px 1fr',
                  gap: 0,
                  background: bg,
                  color: fg,
                  whiteSpace: 'pre',
                  overflow: 'hidden'
                }}
              >
                <span
                  style={{
                    opacity: 0.45,
                    textAlign: 'right',
                    padding: '0 6px',
                    userSelect: 'none'
                  }}
                >
                  {line.lineNumber}
                </span>
                <span style={{ opacity: 0.7, userSelect: 'none' }}>{mark}</span>
                <span
                  style={{
                    paddingRight: 8,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {line.text}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {(canExpand || hovered) && lines.length > 0 && (
        <button
          type="button"
          className="ak-file-edit-expand"
          title={expanded ? 'Collapse diff' : 'Expand diff'}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            padding: hovered || expanded ? '4px 0 6px' : 0,
            height: hovered || expanded ? undefined : 0,
            overflow: 'hidden',
            border: 'none',
            borderTop:
              hovered || expanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
            background: 'transparent',
            color: 'var(--vscode-descriptionForeground, #9d9d9d)',
            cursor: 'pointer',
            opacity: hovered || expanded ? 0.85 : 0,
            transition: 'opacity 0.15s ease'
          }}
        >
          <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>
            {expanded ? '⌃' : '⌄'}
          </span>
        </button>
      )}
    </div>
  );
}
