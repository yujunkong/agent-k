/**
 * DiffView - Side-by-side / Unified Diff 뷰어 (C2-T12)
 */
import React, { useState } from 'react';

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
  type: 'add' | 'delete' | 'context';
  checked?: boolean;
}

export interface DiffFile {
  filePath: string;
  hunks: DiffHunk[];
  originalPath?: string;
  newPath?: string;
}

interface DiffViewProps {
  files: DiffFile[];
  viewMode?: 'unified' | 'side-by-side';
  onToggleHunk?: (filePath: string, hunkIndex: number, checked: boolean) => void;
  onToggleFile?: (filePath: string, checked: boolean) => void;
}

function HunkContent({ content, type }: { content: string; type: string }) {
  const bgColor = type === 'add' ? 'rgba(74,222,128,0.1)' :
                  type === 'delete' ? 'rgba(239,68,68,0.1)' : 'transparent';
  const prefix = type === 'add' ? '+' : type === 'delete' ? '-' : ' ';

  return (
    <pre style={{
      margin: 0, padding: '1px 8px',
      background: bgColor,
      color: type === 'add' ? '#4ade80' : type === 'delete' ? '#f87171' : '#d1d5db',
      fontSize: '0.8em', fontFamily: 'var(--vscode-editor-font-family, monospace)',
      whiteSpace: 'pre', overflow: 'hidden'
    }}>
      {prefix} {content}
    </pre>
  );
}

export function DiffView({ files, viewMode = 'unified', onToggleHunk, onToggleFile }: DiffViewProps) {
  const [mode, setMode] = useState<'unified' | 'side-by-side'>(viewMode);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set(files.map(f => f.filePath)));

  const handleFileToggle = (filePath: string) => {
    const next = new Set(selectedFiles);
    if (next.has(filePath)) next.delete(filePath);
    else next.add(filePath);
    setSelectedFiles(next);
    onToggleFile?.(filePath, next.has(filePath));
  };

  if (files.length === 0) {
    return <div style={{ padding: 16, opacity: 0.5, textAlign: 'center' }}>No changes to review</div>;
  }

  return (
    <div className="diff-view" style={{ fontSize: '0.85em' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--vscode-panel-border, #333)' }}>
        <span style={{ fontWeight: 600 }}>📝 Review Changes</span>
        <span style={{ opacity: 0.5 }}>({files.length} file{files.length > 1 ? 's' : ''})</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            onClick={() => setMode('unified')}
            style={{ fontWeight: mode === 'unified' ? 700 : 400 }}
            className="settings-btn"
          >
            Unified
          </button>
          <button
            onClick={() => setMode('side-by-side')}
            style={{ fontWeight: mode === 'side-by-side' ? 700 : 400 }}
            className="settings-btn"
          >
            Side-by-side
          </button>
        </div>
      </div>

      {files.map((file) => (
        <div key={file.filePath} className="diff-file" style={{ borderBottom: '1px solid var(--vscode-panel-border, #333)' }}>
          <div
            className="diff-file-header"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', cursor: 'pointer',
              background: 'var(--vscode-sideBar-background, #1e1e1e)'
            }}
            onClick={() => handleFileToggle(file.filePath)}
          >
            <input
              type="checkbox"
              checked={selectedFiles.has(file.filePath)}
              onChange={() => {}} // handled by onClick
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 500, fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
              {file.filePath}
            </span>
            <span style={{
              fontSize: '0.8em', padding: '1px 6px', borderRadius: 3,
              background: file.hunks.some(h => h.type === 'add') ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.2)',
              color: file.hunks.some(h => h.type === 'add') ? '#4ade80' : '#f87171'
            }}>
              +{file.hunks.filter(h => h.type === 'add').length}/-{file.hunks.filter(h => h.type === 'delete').length}
            </span>
          </div>

          {selectedFiles.has(file.filePath) && (
            <div className="diff-file-content" style={{ overflowX: 'auto' }}>
              {file.hunks.map((hunk, idx) => (
                <div key={idx} className="diff-hunk" style={{ display: 'flex' }}>
                  <div style={{ padding: '4px 4px', minWidth: 24 }}>
                    <input
                      type="checkbox"
                      checked={hunk.checked !== false}
                      onChange={(e) => onToggleHunk?.(file.filePath, idx, e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <HunkContent content={hunk.content} type={hunk.type} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="diff-actions" style={{
        display: 'flex', gap: 8, padding: '8px 12px',
        borderTop: '1px solid var(--vscode-panel-border, #333)',
        justifyContent: 'flex-end'
      }}>
        <button className="settings-btn" style={{ color: '#f87171' }}>Cancel</button>
        <button className="settings-btn primary">Apply Selected</button>
      </div>
    </div>
  );
}
