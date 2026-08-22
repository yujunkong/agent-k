/**
 * UI — Changed files bar chrome (v2.1 ChangedFilesBar).
 */
import type { JSX } from 'react';

export type ChangedFile = {
  path: string;
  additions?: number;
  deletions?: number;
};

export type ChangedFilesBarProps = {
  files: ChangedFile[];
  expanded?: boolean;
  onToggle?: () => void;
  onReview?: () => void;
  onOpenFile?: (path: string) => void;
};

export function ChangedFilesBar(props: ChangedFilesBarProps): JSX.Element | null {
  const { files, expanded, onToggle, onReview, onOpenFile } = props;
  if (files.length === 0) return null;
  return (
    <div className="changed-files-bar" data-testid="ui-changed-files-bar">
      <div className="changed-files-bar__row">
        <button type="button" className="changed-files-bar__toggle" onClick={onToggle}>
          <span className="changed-files-bar__chevron">{expanded ? '▾' : '▸'}</span>
          <span className="changed-files-bar__count">{files.length} changed</span>
        </button>
        <div className="changed-files-bar__actions">
          {onReview ? (
            <button type="button" className="changed-files-bar__review" onClick={onReview}>
              Review
            </button>
          ) : null}
        </div>
      </div>
      {expanded ? (
        <ul className="changed-files-bar__list">
          {files.map((f) => (
            <li key={f.path} className="changed-files-bar__li">
              <button
                type="button"
                className="changed-files-bar__file"
                onClick={() => onOpenFile?.(f.path)}
              >
                <span className="changed-files-bar__name">{f.path.split('/').pop()}</span>
                <span className="changed-files-bar__file-stats">
                  <span className="add">+{f.additions ?? 0}</span>
                  <span className="del">-{f.deletions ?? 0}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
