/**
 * PlanReview - 사용자 리뷰 UI (C5-T06)
 *
 * - Steps 체크리스트
 * - Approve & Execute / Request Changes
 * - Plan 본문은 에디터에서 열기 (웹뷰 textarea 대신)
 */
import React, { useEffect, useState } from 'react';
import type { PlanDocument } from './PlanGenerator';
import { planGenerator } from './PlanGenerator';

interface PlanReviewProps {
  document: PlanDocument;
  questionsAnswered: boolean;
  onApprove: (content: string) => void;
  onReject: (reason?: string) => void;
  onEdit: (content: string) => void;
  /** Save + open plan markdown in the VS Code editor */
  onOpenInEditor?: (content: string) => void;
  onClose?: () => void;
}

export function PlanReview({
  document,
  questionsAnswered,
  onApprove,
  onReject,
  onEdit,
  onOpenInEditor,
  onClose
}: PlanReviewProps) {
  const [content, setContent] = useState(document.content);
  const [removedSteps, setRemovedSteps] = useState<Set<number>>(new Set());
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  useEffect(() => {
    setContent(document.content);
  }, [document.content, document.slug]);

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
    let finalContent = content;
    if (removedSteps.size > 0) {
      const lines = content.split('\n');
      const drop = new Set(
        [...removedSteps].map((i) => todos[i]).filter(Boolean)
      );
      // Prefer removing matching checklist lines
      const filtered = lines.filter((line) => {
        const m = line.match(/^\s*[-*]\s+\[ \]\s+(.+)$/);
        if (!m) return true;
        const text = m[1]
          .replace(/^\*\*Step\s+\d+\*\*\s*:\s*/i, '')
          .replace(/^Step\s+\d+\s*:\s*/i, '')
          .trim();
        return ![...drop].some((t) => text.includes(t) || t.includes(text));
      });
      finalContent = filtered.join('\n');
    }
    onApprove(finalContent);
  };

  const handleReject = () => {
    onReject(rejectReason.trim() || undefined);
  };

  const canApprove =
    questionsAnswered && (visibleTodos.length > 0 || content.trim().length > 80);

  const preview =
    content.length > 1200 ? `${content.slice(0, 1200).trim()}…` : content;

  return (
    <div className="plan-review">
      <header className="plan-review__header">
        <div className="plan-review__heading">
          <h3 className="plan-review__title">Review Plan</h3>
          <p className="plan-review__meta">
            {document.title || document.slug} · {visibleTodos.length} steps
            {document.sections.length > 0
              ? ` · ${document.sections.length} sections`
              : ''}
          </p>
        </div>
        <div className="plan-review__actions">
          <button
            type="button"
            className="settings-btn"
            onClick={() => setShowRejectInput((v) => !v)}
          >
            Request Changes
          </button>
          <button
            type="button"
            className="settings-btn primary"
            onClick={handleApprove}
            disabled={!canApprove}
            title={
              !questionsAnswered
                ? 'Answer all questions first'
                : !canApprove
                  ? 'Plan content or steps required'
                  : 'Approve and start Build'
            }
          >
            Approve &amp; Execute
          </button>
          {onClose ? (
            <button
              type="button"
              className="settings-btn plan-review__close"
              onClick={onClose}
              aria-label="Close plan review"
            >
              ✕
            </button>
          ) : null}
        </div>
      </header>

      {showRejectInput ? (
        <div className="plan-review__reject">
          <label className="plan-review__label">What changes are needed?</label>
          <textarea
            className="plan-review__reject-input"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Describe what needs to be changed…"
          />
          <div className="plan-review__reject-actions">
            <button
              type="button"
              className="settings-btn"
              onClick={() => setShowRejectInput(false)}
            >
              Cancel
            </button>
            <button type="button" className="settings-btn" onClick={handleReject}>
              Send Feedback
            </button>
          </div>
        </div>
      ) : null}

      {!questionsAnswered ? (
        <div className="plan-review__banner" role="status">
          Answer all clarifying questions before approving the plan.
        </div>
      ) : null}

      <div className="plan-review__body">
        <section className="plan-review__main">
          <div className="plan-review__section-head">
            <span className="plan-review__label">Plan</span>
            {onOpenInEditor ? (
              <button
                type="button"
                className="settings-btn primary plan-review__open-editor"
                onClick={() => {
                  onEdit(content);
                  onOpenInEditor(content);
                }}
                title="프로젝트 .agentk/plans/tmp 에 저장하고 에디터에서 엽니다"
              >
                Open in Editor
              </button>
            ) : null}
          </div>
          <pre className="plan-review__preview" tabIndex={0}>
            {preview || '(empty plan)'}
          </pre>
          <p className="plan-review__hint">
            편집은 <strong>Open in Editor</strong>로 파일에서 하세요. 저장 후 Review로
            돌아오면 반영됩니다. 에디터 상단 CodeLens의 <strong>Build</strong>로도 바로
            실행할 수 있습니다.
          </p>
        </section>

        <aside className="plan-review__aside">
          <div className="plan-review__section-head">
            <span className="plan-review__label">
              Steps ({visibleTodos.length}/{todos.length})
            </span>
          </div>
          <div className="plan-review__steps">
            {todos.length === 0 ? (
              <p className="plan-review__empty">No checklist items found.</p>
            ) : (
              todos.map((todo, i) => {
                const removed = removedSteps.has(i);
                return (
                  <label
                    key={`${i}-${todo.slice(0, 24)}`}
                    className={`plan-review__step${
                      removed ? ' plan-review__step--removed' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!removed}
                      onChange={() => toggleStep(i)}
                    />
                    <span>{todo}</span>
                  </label>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
