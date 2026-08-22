/**
 * TimelineCheckpoint - 타임라인 체크포인트 노드 + Restore 버튼 (C4-T05)
 */
import React from 'react';
import type { Checkpoint } from '../../checkpoint/CheckpointManager';

interface TimelineCheckpointProps {
  checkpoint: Checkpoint;
  onRestore: (checkpointId: string) => void;
  onHover?: (checkpointId: string) => void;
  isLatest?: boolean;
}

export function TimelineCheckpoint({ checkpoint, onRestore, onHover, isLatest }: TimelineCheckpointProps) {
  const triggerLabels: Record<string, string> = {
    first_write: 'First write',
    n_files: 'Batch edit',
    user_request: 'User requested',
    dangerous_tool: 'Dangerous tool'
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div
      className="timeline-checkpoint"
      onMouseEnter={() => onHover?.(checkpoint.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', margin: '4px 0',
        borderRadius: 6,
        background: isLatest ? 'rgba(59,130,246,0.1)' : 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.03))',
        border: `1px solid ${isLatest ? 'rgba(59,130,246,0.3)' : 'var(--vscode-panel-border, #333)'}`,
        fontSize: '0.85em'
      }}
    >
      <span style={{ fontSize: '1.1em' }}>📸</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500 }}>{checkpoint.label}</div>
        <div style={{ display: 'flex', gap: 8, fontSize: '0.8em', opacity: 0.6 }}>
          <span>{formatTime(checkpoint.timestamp)}</span>
          <span>•</span>
          <span>{triggerLabels[checkpoint.metadata?.trigger] || checkpoint.metadata?.trigger}</span>
          <span>•</span>
          <span>{checkpoint.fileSnapshots.length} file(s)</span>
        </div>
      </div>
      {isLatest && (
        <span style={{
          padding: '1px 6px', borderRadius: 3, fontSize: '0.7em',
          background: 'rgba(59,130,246,0.2)', color: '#60a5fa'
        }}>
          Latest
        </span>
      )}
      <button
        onClick={() => onRestore(checkpoint.id)}
        className="settings-btn"
        style={{ fontSize: '0.8em', padding: '2px 8px', color: '#f59e0b' }}
        title="Restore to this checkpoint"
      >
        ↩ Restore
      </button>
    </div>
  );
}
