/**
 * PlanReview - 사용자 리뷰 UI (C5-T06)
 * 
 * - MD 편집 가능
 * - 불필요 스텝 삭제 (체크박스)
 * - [Approve & Execute] 버튼
 * - 승인 전 소스 쓰기 0
 * - 필수 질문 미답 시 승인 불가
 */
import React, { useState } from 'react';
import type { PlanDocument } from './PlanGenerator';
import { planGenerator } from './PlanGenerator';

interface PlanReviewProps {
  document: PlanDocument;
  questionsAnswered: boolean;
  onApprove: (content: string) => void;
  onReject: (reason?: string) => void;
  onEdit: (content: string) => void;
}

export function PlanReview({
  document,
  questionsAnswered,
  onApprove,
  onReject,
  onEdit
}: PlanReviewProps) {
  const [content, setContent] = useState(document.content);
  const [removedSteps, setRemovedSteps] = useState<Set<number>>(new Set());
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const todos = planGenerator.extractTodos(content);
  const visibleTodos = todos.filter((_, i) => !removedSteps.has(i));

  const toggleStep = (index: number) => {
    const next = new Set(removedSteps);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setRemovedSteps(next);
  };

  const handleApprove = () => {
    if (!questionsAnswered) return;
    // Remove rejected steps from content
    let finalContent = content;
    if (removedSteps.size > 0) {
      const lines = content.split('\n');
      const filtered = lines.filter(line => {
        const todoMatch = line.match(/- \[ \] \*\*Step (\d+)\*\*/);
        if (todoMatch && removedSteps.has(parseInt(todoMatch[1]) - 1)) return false;
        return true;
      });
      finalContent = filtered.join('\n');
    }
    onApprove(finalContent);
  };

  const handleReject = () => {
    if (rejectReason.trim()) {
      onReject(rejectReason.trim());
    } else {
      onReject(undefined);
    }
  };

  const canApprove = questionsAnswered && visibleTodos.length > 0;

  return (
    <div className="plan-review" style={{ padding: 16, maxWidth: 800 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, paddingBottom: 12,
        borderBottom: '1px solid var(--vscode-panel-border, #333)'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1em', fontWeight: 600 }}>
            📋 Review Plan
          </h3>
          <span style={{ fontSize: '0.8em', opacity: 0.6 }}>
            {document.title} • {visibleTodos.length} steps • {document.sections.length} sections
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowRejectInput(!showRejectInput)}
            className="settings-btn"
            style={{ padding: '6px 16px', color: '#f87171' }}>
            ✕ Request Changes
          </button>
          <button onClick={handleApprove}
            className="settings-btn primary"
            disabled={!canApprove}
            title={!questionsAnswered ? 'Answer all questions first' : ''}
            style={{
              padding: '6px 16px', fontWeight: 600,
              background: canApprove ? 'var(--vscode-button-background, #0078d4)' : 'var(--vscode-button-secondaryBackground, #555)',
              color: '#fff', cursor: canApprove ? 'pointer' : 'not-allowed'
            }}>
            ✅ Approve & Execute
          </button>
        </div>
      </div>

      {/* Reject input */}
      {showRejectInput && (
        <div style={{
          marginBottom: 16, padding: 12, borderRadius: 6,
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)'
        }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>What changes are needed?</label>
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Describe what needs to be changed..."
            style={{
              width: '100%', padding: '6px 8px', borderRadius: 4, marginBottom: 8,
              background: 'var(--vscode-input-background, #3c3c3c)',
              color: 'var(--vscode-input-foreground, #ccc)',
              border: '1px solid var(--vscode-panel-border, #555)',
              resize: 'vertical', fontFamily: 'inherit'
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowRejectInput(false)} className="settings-btn"
              style={{ padding: '4px 12px', fontSize: '0.85em' }}>
              Cancel
            </button>
            <button onClick={handleReject} className="settings-btn"
              style={{ padding: '4px 12px', fontSize: '0.85em', color: '#f87171' }}>
              Send Feedback
            </button>
          </div>
        </div>
      )}

      {/* Question status */}
      {!questionsAnswered && (
        <div style={{
          padding: '8px 12px', marginBottom: 12, borderRadius: 4,
          background: 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.3)',
          fontSize: '0.85em', color: '#facc15'
        }}>
          ⚠️ Answer all clarifying questions before approving the plan.
        </div>
      )}

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Plan content */}
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: '0.8em', opacity: 0.6, marginBottom: 4, display: 'block' }}>
            Plan Content (editable)
          </label>
          <textarea
            value={content}
            onChange={e => {
              setContent(e.target.value);
              onEdit(e.target.value);
            }}
            rows={20}
            style={{
              width: '100%', padding: 12, borderRadius: 6, resize: 'vertical',
              fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: '0.85em',
              lineHeight: 1.6,
              background: 'var(--vscode-editor-background, #1e1e1e)',
              color: 'var(--vscode-editor-foreground, #d4d4d4)',
              border: '1px solid var(--vscode-panel-border, #333)'
            }}
          />
        </div>

        {/* Steps sidebar */}
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '0.8em', opacity: 0.6, marginBottom: 8, display: 'block' }}>
            Steps ({visibleTodos.length}/{todos.length})
          </label>
          <div style={{
            padding: 8, borderRadius: 6,
            background: 'var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.02))',
            border: '1px solid var(--vscode-panel-border, #333)'
          }}>
            {todos.map((todo, i) => {
              const removed = removedSteps.has(i);
              return (
                <label key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 6,
                  padding: '4px 0', cursor: 'pointer',
                  opacity: removed ? 0.4 : 1,
                  textDecoration: removed ? 'line-through' : 'none'
                }}>
                  <input
                    type="checkbox"
                    checked={!removed}
                    onChange={() => toggleStep(i)}
                    style={{ marginTop: 2, accentColor: '#3b82f6' }}
                  />
                  <span style={{ fontSize: '0.85em' }}>{todo}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
