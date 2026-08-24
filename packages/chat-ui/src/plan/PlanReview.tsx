/**
 * PlanReview - legacy overlay (PLAN-CARD-005: superseded by PlanCard).
 * Kept for reference / optional Open-in-Editor markdown path; ChatModeChrome
 * no longer mounts this component.
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
  /** When true, PlanTask[] is authoritative and Markdown is read-only. */
  structuredSourceOfTruth?: boolean;
  /** Tasks with no automatic verification command that are waiting for the
   *  user to manually confirm they're actually done. Only meaningful when
   *  structuredSourceOfTruth is true. */
  tasksAwaitingVerification?: Array<{ id: string; title: string }>;
  /** Confirms a task in tasksAwaitingVerification as verified. */
  onVerifyTask?: (taskId: string) => void;
  onClose?: () => void;
  /** Discard plan and return to Research */
  onDiscard?: () => void;
}

export function PlanReview({
  document,
  questionsAnswered,
  onApprove,
  onReject,
  onEdit,
  onOpenInEditor,
  structuredSourceOfTruth = false,
  tasksAwaitingVerification = [],
  onVerifyTask,
  onClose,
  onDiscard
}: PlanReviewProps) {
  const [content, setContent] = useState(document.content);
  const [removedSteps, setRemovedSteps] = useState<Set<number>>(new Set());
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [armDiscard, setArmDiscard] = useState(false);

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
    if (structuredSourceOfTruth) {
      onApprove(content);
      return;
    }
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
            Reject
          </button>
          {onDiscard ? (
            <button
              type="button"
              className={
                armDiscard
                  ? 'settings-btn plan-review__discard plan-review__discard--armed'
                  : 'settings-btn plan-review__discard'
              }
              onClick={() => {
                if (!armDiscard) {
                  setArmDiscard(true);
                  return;
                }
                setArmDiscard(false);
                onDiscard();
              }}
              onBlur={() => setArmDiscard(false)}
              title={
                armDiscard
                  ? 'Click again to discard the plan and return to Research'
                  : 'Discard the plan and return to Research'
              }
            >
              {armDiscard ? 'Discard for real?' : 'Discard plan'}
            </button>
          ) : null}
          <button
            type="button"
            className="settings-btn primary"
            onClick={handleApprove}
            disabled={!canApprove}
            title={
              !questionsAnswered
                ? 'Answer all questions before approving'
                : !canApprove
                  ? 'Plan content or steps are required'
                  : 'Approve to leave review and execute the plan'
            }
          >
            Approve
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
              Confirm reject
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
            {onOpenInEditor && !structuredSourceOfTruth ? (
              <button
                type="button"
                className="settings-btn primary plan-review__open-editor"
                onClick={() => {
                  onEdit(content);
                  onOpenInEditor(content);
                }}
                title="Save to .agentk/plans/tmp and open in the editor"
              >
                Open in Editor
              </button>
            ) : null}
          </div>
          <pre className="plan-review__preview" tabIndex={0}>
            {preview || '(empty plan)'}
          </pre>
          <p className="plan-review__hint">
            {structuredSourceOfTruth
              ? 'This Plan is backed by a structured TaskGraph. To change it, leave a reject reason so the planner can regenerate.'
              : <>Edit the file with <strong>Open in Editor</strong>. Changes apply when you return to Review. You can also run <strong>Build</strong> from the editor CodeLens.</>}
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
                      disabled={structuredSourceOfTruth}
                    />
                    <span>{todo}</span>
                  </label>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {structuredSourceOfTruth && tasksAwaitingVerification.length > 0 ? (
        <div className="plan-review__manual-verify" role="status">
          <div className="plan-review__section-head">
            <span className="plan-review__label">
              Manual verification needed ({tasksAwaitingVerification.length})
            </span>
          </div>
          <p className="plan-review__hint">
            These tasks have no automatic verification command, so completion cannot be judged automatically.
            Confirm them yourself, then mark as done.
          </p>
          <ul className="plan-review__manual-verify-list">
            {tasksAwaitingVerification.map((task) => (
              <li key={task.id} className="plan-review__manual-verify-item">
                <span className="plan-review__manual-verify-title">{task.title}</span>
                <button
                  type="button"
                  className="settings-btn primary"
                  onClick={() => onVerifyTask?.(task.id)}
                  disabled={!onVerifyTask}
                  title="Mark this task as verified"
                >
                  Mark verified
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
