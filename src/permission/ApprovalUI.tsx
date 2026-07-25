/**
 * ApprovalUI - 승인 UI 웹뷰 (C4-T02)
 * 
 * 명령/경로/Diff 프리뷰 + Allow once / Always for session / Reject
 */
import React, { useState } from 'react';
import type { PermissionRequest, PermissionDecision } from '../permission/PermissionGate';

interface ApprovalUIProps {
  request: PermissionRequest;
  onDecision: (decision: PermissionDecision) => void;
}

export function ApprovalUI({ request, onDecision }: ApprovalUIProps) {
  const [showDiff, setShowDiff] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);

  const destructiveWarning = request.destructive
    ? '⚠️ This action modifies files and cannot be easily undone.'
    : null;

  return (
    <div className="approval-dialog" style={{
      padding: 16, margin: 8, borderRadius: 8,
      background: 'var(--vscode-editor-background, #1e1e1e)',
      border: '1px solid var(--vscode-panel-border, #333)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: '1.2em' }}>🔒</span>
        <span style={{ fontWeight: 600 }}>Permission Required</span>
        {request.destructive && (
          <span style={{
            padding: '2px 8px', borderRadius: 4,
            background: 'rgba(239,68,68,0.2)', color: '#f87171',
            fontSize: '0.8em', fontWeight: 500
          }}>
            Destructive
          </span>
        )}
      </div>

      <div className="approval-details" style={{ marginBottom: 12, fontSize: '0.9em' }}>
        <div style={{ marginBottom: 4 }}>
          <span style={{ opacity: 0.6 }}>Tool: </span>
          <span style={{ fontFamily: 'monospace' }}>{request.toolName}</span>
        </div>
        {request.path && (
          <div style={{ marginBottom: 4 }}>
            <span style={{ opacity: 0.6 }}>Target: </span>
            <span style={{ fontFamily: 'monospace' }}>{request.path}</span>
          </div>
        )}
        <div style={{ marginBottom: 4 }}>
          <span style={{ opacity: 0.6 }}>Description: </span>
          <span>{request.description}</span>
        </div>
      </div>

      {destructiveWarning && (
        <div style={{
          padding: '8px 12px', marginBottom: 12, borderRadius: 4,
          background: 'rgba(239,68,68,0.1)', color: '#f87171',
          fontSize: '0.85em'
        }}>
          {destructiveWarning}
        </div>
      )}

      <div className="approval-args" style={{
        marginBottom: 12, padding: 8, borderRadius: 4,
        background: 'var(--vscode-dropdown-background, #2d2d2d)',
        maxHeight: 200, overflow: 'auto', fontSize: '0.8em',
        fontFamily: 'var(--vscode-editor-font-family, monospace)',
        whiteSpace: 'pre-wrap'
      }}>
        {JSON.stringify(request.args, null, 2)}
      </div>

      <div className="approval-actions" style={{
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'
      }}>
        <button
          onClick={() => onDecision('reject')}
          className="settings-btn"
          style={{ color: '#f87171' }}
        >
          ✕ Reject
        </button>

        <button
          onClick={() => onDecision('allow_once')}
          className="settings-btn primary"
        >
          ✓ Allow Once
        </button>

        <button
          onClick={() => onDecision('allow_session')}
          className="settings-btn"
          style={{
            border: '1px solid var(--vscode-focusBorder, #4fc1ff)',
            color: 'var(--vscode-focusBorder, #4fc1ff)'
          }}
        >
          ✓ Always for Session
        </button>

        <label style={{ marginLeft: 'auto', fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
          />
          Remember for session
        </label>
      </div>
    </div>
  );
}
