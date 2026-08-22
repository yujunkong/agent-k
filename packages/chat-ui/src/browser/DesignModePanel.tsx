/**
 * DesignModePanel — Design Mode 오버레이 UI (RW-C7-05)
 * 주석 추가 → DesignModeContext에 저장 → 다음 턴 컨텍스트 주입.
 */
import React, { useState } from 'react';
import { DesignModeOverlay } from './DesignModeOverlay';
import { DesignModeContext } from './DesignModeContext';

/** Module singleton so ChatApp handleSend can read last context */
export const designOverlay = new DesignModeOverlay();
export const designModeContext = new DesignModeContext(designOverlay);

interface DesignModePanelProps {
  onClose: () => void;
  onContextReady?: (block: string) => void;
}

export function DesignModePanel({ onClose, onContextReady }: DesignModePanelProps) {
  const [comment, setComment] = useState('');
  const [x, setX] = useState(100);
  const [y, setY] = useState(100);
  const [annotations, setAnnotations] = useState(designOverlay.getAnnotations());

  const addAnnotation = () => {
    if (!comment.trim()) return;
    designOverlay.ensureLocalSnapshot();
    designOverlay.addAnnotation({
      x,
      y,
      width: 40,
      height: 40,
      comment: comment.trim()
    });
    setAnnotations(designOverlay.getAnnotations());
    setComment('');
    const ctx = designModeContext.buildContext();
    if (ctx?.contextBlock) {
      onContextReady?.(ctx.contextBlock);
    }
  };

  return (
    <div
      className="design-mode-panel"
      style={{
        border: '1px solid var(--vscode-panel-border, #555)',
        borderRadius: 6,
        padding: 12,
        margin: '8px 0',
        background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.03))'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Design Mode</strong>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <p style={{ fontSize: '0.85em', opacity: 0.75, marginTop: 0 }}>
        Add annotations; they inject into the next chat turn as design context.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <input type="number" value={x} onChange={(e) => setX(Number(e.target.value))} placeholder="x" style={{ width: 64 }} />
        <input type="number" value={y} onChange={(e) => setY(Number(e.target.value))} placeholder="y" style={{ width: 64 }} />
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comment…"
          style={{ flex: 1, minWidth: 120 }}
        />
        <button type="button" onClick={addAnnotation}>Add</button>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85em' }}>
        {annotations.map((a, i) => (
          <li key={`${a.timestamp}-${i}`}>
            ({a.x},{a.y}) {a.comment}
          </li>
        ))}
      </ul>
    </div>
  );
}
