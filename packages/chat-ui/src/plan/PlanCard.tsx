/**
 * PLAN-CARD-001…004 — Cursor-style Plan card (timeline/chrome SoT UX).
 * Structured PlanDocument only — markdown is render-only (PlanView preview).
 */
import React, { useMemo, useState } from 'react';
import { renderPlanMarkdown, type PlanDocument, type TaskStatus } from '@agent-k/plan';
import { StreamingMarkdown } from '../chat/StreamingMarkdown';

export type PlanCardPhase =
  | 'idle'
  | 'research'
  | 'planning'
  | 'review'
  | 'executing'
  | 'completed'
  | 'failed';

export interface PlanCardProps {
  document: PlanDocument;
  phase: PlanCardPhase;
  /** Live task status from session / card.patch */
  taskStatus?: Readonly<Record<string, TaskStatus>>;
  /** Research notes folded into plan.md Context section */
  researchContext?: string;
  statusText?: string;
  questionsAnswered?: boolean;
  tasksAwaitingVerification?: Array<{ id: string; title: string }>;
  onBuild: (taskIds?: string[]) => void;
  onReject: (reason?: string) => void;
  onDiscard?: () => void;
  onVerifyTask?: (taskId: string) => void;
  /** Optional: open the same plan.md in the VS Code editor */
  onOpenInEditor?: () => void;
  /** When true, hide Build (already executing). */
  buildDisabled?: boolean;
}

const STATUS_CHIP: Record<PlanCardPhase, string> = {
  idle: 'Idle',
  research: 'Research',
  planning: 'Planning',
  review: 'Review',
  executing: 'Building',
  completed: 'Done',
  failed: 'Failed',
};

function taskRowStatus(
  taskId: string,
  taskStatus: Readonly<Record<string, TaskStatus>> | undefined,
): TaskStatus {
  return taskStatus?.[taskId] ?? 'pending';
}

export function PlanCard({
  document,
  phase,
  taskStatus,
  researchContext = '',
  statusText,
  questionsAnswered = true,
  tasksAwaitingVerification = [],
  onBuild,
  onReject,
  onDiscard,
  onVerifyTask,
  onOpenInEditor,
  buildDisabled = false,
}: PlanCardProps) {
  // Comment: unchecked = excluded from partial Build (Cursor-style scope)
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [risksOpen, setRisksOpen] = useState(false);
  // Comment: PlanView — inline plan.md preview (not SoT; structured doc is)
  const [viewOpen, setViewOpen] = useState(false);

  const selectedIds = useMemo(
    () => document.tasks.filter((t) => !excluded.has(t.id)).map((t) => t.id),
    [document.tasks, excluded],
  );

  const planMd = useMemo(
    () => renderPlanMarkdown(document, researchContext, taskStatus ?? {}),
    [document, researchContext, taskStatus],
  );

  const toggleTask = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canBuild =
    questionsAnswered &&
    selectedIds.length > 0 &&
    !buildDisabled &&
    (phase === 'review' || phase === 'planning');

  const handleBuild = () => {
    if (!canBuild) return;
    // Comment: omit taskIds when all selected → full plan approve
    const all = selectedIds.length === document.tasks.length;
    onBuild(all ? undefined : selectedIds);
  };

  return (
    <section className="ak-plan-card" aria-label="Plan card">
      <header className="ak-plan-card__header">
        <div className="ak-plan-card__title-row">
          <h3 className="ak-plan-card__title">{document.summary || document.goal}</h3>
          <span className={`ak-plan-card__chip ak-plan-card__chip--${phase}`}>
            {STATUS_CHIP[phase]}
          </span>
        </div>
        {statusText ? (
          <p className="ak-plan-card__status">{statusText}</p>
        ) : (
          <p className="ak-plan-card__goal">{document.goal}</p>
        )}
      </header>

      <ul className="ak-plan-card__tasks">
        {document.tasks.map((task) => {
          const st = taskRowStatus(task.id, taskStatus);
          const checked = !excluded.has(task.id);
          return (
            <li key={task.id} className={`ak-plan-card__task ak-plan-card__task--${st}`}>
              <label className="ak-plan-card__task-label">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={phase === 'executing' || phase === 'completed'}
                  onChange={() => toggleTask(task.id)}
                />
                <span className="ak-plan-card__task-title">{task.title}</span>
                <span className="ak-plan-card__task-status">{st}</span>
              </label>
              {task.description ? (
                <p className="ak-plan-card__task-desc">{task.description}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {document.risks.length > 0 ? (
        <div className="ak-plan-card__risks">
          <button
            type="button"
            className="ak-plan-card__risks-toggle"
            onClick={() => setRisksOpen((v) => !v)}
          >
            Risks ({document.risks.length}) {risksOpen ? '▾' : '▸'}
          </button>
          {risksOpen ? (
            <ul>
              {document.risks.map((r) => (
                <li key={r.id}>
                  <strong>{r.risk}</strong>
                  {r.mitigation ? ` — ${r.mitigation}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {tasksAwaitingVerification.length > 0 && onVerifyTask ? (
        <div className="ak-plan-card__verify">
          <p>Manual verify needed:</p>
          <ul>
            {tasksAwaitingVerification.map((t) => (
              <li key={t.id}>
                {t.title}{' '}
                <button type="button" onClick={() => onVerifyTask(t.id)}>
                  Mark verified
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Comment: PlanView — rendered plan.md preview (SoT remains PlanDocument) */}
      {viewOpen ? (
        <div className="ak-plan-card__view" aria-label="plan.md preview">
          <div className="ak-plan-card__view-header">
            <span className="ak-plan-card__view-title">plan.md</span>
            <div className="ak-plan-card__view-tools">
              {onOpenInEditor ? (
                <button
                  type="button"
                  className="ak-plan-card__btn"
                  onClick={onOpenInEditor}
                >
                  Open in Editor
                </button>
              ) : null}
              <button
                type="button"
                className="ak-plan-card__btn"
                onClick={() => setViewOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
          <div className="ak-plan-card__view-body">
            <StreamingMarkdown content={planMd} isStreaming={false} />
          </div>
        </div>
      ) : null}

      {rejectOpen ? (
        <div className="ak-plan-card__reject">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="What should change?"
            rows={3}
          />
          <div className="ak-plan-card__actions">
            <button
              type="button"
              className="ak-plan-card__btn ak-plan-card__btn--primary"
              onClick={() => {
                onReject(rejectReason.trim() || undefined);
                setRejectOpen(false);
                setRejectReason('');
              }}
            >
              Send feedback
            </button>
            <button type="button" className="ak-plan-card__btn" onClick={() => setRejectOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="ak-plan-card__actions">
          <button
            type="button"
            className="ak-plan-card__btn ak-plan-card__btn--primary"
            disabled={!canBuild}
            onClick={handleBuild}
          >
            Build{selectedIds.length < document.tasks.length ? ` (${selectedIds.length})` : ''}
          </button>
          <button
            type="button"
            className="ak-plan-card__btn"
            disabled={phase === 'executing'}
            onClick={() => setRejectOpen(true)}
          >
            Reject
          </button>
          <button
            type="button"
            className={`ak-plan-card__btn${viewOpen ? ' ak-plan-card__btn--active' : ''}`}
            onClick={() => setViewOpen((v) => !v)}
            aria-pressed={viewOpen}
          >
            PlanView
          </button>
          {onDiscard ? (
            <button type="button" className="ak-plan-card__btn ak-plan-card__btn--danger" onClick={onDiscard}>
              Discard
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
