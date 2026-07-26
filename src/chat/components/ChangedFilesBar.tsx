/**
 * Cursor-style changed-files bar above the composer.
 */
import React, { useState } from 'react';
import type { FileEditPreview } from '../types';
import { languageBadge } from '../editDiffPreview';
import { IconRefresh } from './Icons';

export interface ChangedFilesBarProps {
  files: FileEditPreview[];
  onOpenFile?: (path: string) => void;
  onUndoAll?: () => void;
  onReview?: () => void;
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}

export function ChangedFilesBar({
  files,
  onOpenFile,
  onUndoAll,
  onReview
}: ChangedFilesBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (!files.length) return null;

  const totalAdd = files.reduce((s, f) => s + (f.additions || 0), 0);
  const totalDel = files.reduce((s, f) => s + (f.deletions || 0), 0);

  return (
    <div className="changed-files-bar">
      <div className="changed-files-bar__row">
        <button
          type="button"
          className="changed-files-bar__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? '파일 목록 접기' : '파일 목록 펼치기'}
          aria-label={expanded ? '파일 목록 접기' : '파일 목록 펼치기'}
        >
          <span className="changed-files-bar__chevron" aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
          <span className="changed-files-bar__count">
            {files.length} {files.length === 1 ? 'File' : 'Files'}
          </span>
          <span className="changed-files-bar__stats">
            <span className="add">+{totalAdd}</span>
            <span className="del">-{totalDel}</span>
          </span>
        </button>
        <div className="changed-files-bar__actions">
          {onUndoAll ? (
            <button
              type="button"
              className="changed-files-bar__icon-btn"
              onClick={onUndoAll}
              title="이번 세션의 모든 수정 되돌리기"
              aria-label="모든 수정 되돌리기"
            >
              <IconRefresh size={13} />
            </button>
          ) : null}
          {onReview ? (
            <button
              type="button"
              className="changed-files-bar__icon-btn"
              onClick={() => {
                setExpanded(true);
                onReview();
              }}
              title="변경된 파일 검토"
              aria-label="변경된 파일 검토"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <ul className="changed-files-bar__list">
          {files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="changed-files-bar__file"
                onClick={() => onOpenFile?.(f.absPath || f.path)}
                title={f.path}
              >
                <span className="changed-files-bar__badge">
                  {languageBadge(f.path)}
                </span>
                <span className="changed-files-bar__name">{basename(f.path)}</span>
                <span className="changed-files-bar__path">{f.path}</span>
                <span className="changed-files-bar__file-stats">
                  {f.additions > 0 && (
                    <span className="add">+{f.additions}</span>
                  )}
                  {f.deletions > 0 && (
                    <span className="del">-{f.deletions}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
