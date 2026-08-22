/**
 * ArtifactGallery — 스크린샷/diff 갤러리 UI (RW-C7-10)
 * ArtifactStore 목록을 렌더하고 browser/review 훅에서 저장한 항목을 표시.
 */
import React from 'react';
import type { Artifact } from './ArtifactStore';

interface ArtifactGalleryProps {
  artifacts: Artifact[];
  onClose: () => void;
  onSelect?: (artifact: Artifact) => void;
}

export function ArtifactGallery({ artifacts, onClose, onSelect }: ArtifactGalleryProps) {
  return (
    <div
      className="artifact-gallery"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'var(--vscode-editor-background, #1e1e1e)',
        display: 'flex',
        flexDirection: 'column',
        padding: 12
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1.1em' }}>Artifacts ({artifacts.length})</h2>
        <button type="button" onClick={onClose} style={{ cursor: 'pointer' }}>
          Close
        </button>
      </div>
      {artifacts.length === 0 ? (
        <p style={{ opacity: 0.7 }}>No artifacts yet. Browser screenshots and review diffs appear here.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 10,
            overflow: 'auto'
          }}
        >
          {artifacts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect?.(a)}
              style={{
                textAlign: 'left',
                padding: 8,
                borderRadius: 6,
                border: '1px solid var(--vscode-panel-border, #444)',
                background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.04))',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: '0.75em', opacity: 0.6 }}>{a.type}</div>
              <div style={{ fontWeight: 600, fontSize: '0.9em' }}>{a.title}</div>
              {a.type === 'screenshot' && a.data ? (
                <img
                  src={a.data.startsWith('data:') ? a.data : `data:image/png;base64,${a.data}`}
                  alt={a.title}
                  style={{ width: '100%', marginTop: 6, borderRadius: 4 }}
                />
              ) : (
                <pre style={{ fontSize: '0.7em', maxHeight: 80, overflow: 'hidden', marginTop: 6 }}>
                  {a.data?.slice(0, 200)}
                </pre>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
