/**
 * ClarifyingQuestions - 객관식 질문 UI + ask_question 도구 (C5-T02)
 *
 * Plan: Complete Questions gate.
 * Supports single (radio) and multiple (checkbox) selection + 기타.
 */
import React, { useMemo, useState } from 'react';
import { renderInlineMarkdown } from '../chat/inlineMarkdown';
import {
  OTHER_OPTION,
  isOtherOption,
  normalizeMcqQuestion,
  parseMultiAnswers,
  formatMultiAnswers
} from '../chat/normalizeAskQuestion';

export interface Question {
  id: string;
  type: 'single' | 'multiple' | 'text';
  question: string;
  options?: string[];
  required: boolean;
  answer?: string;
  allowMultiple?: boolean;
}

interface ClarifyingQuestionsProps {
  questions: Question[];
  onAnswer: (id: string, answer: string) => void;
  onComplete: () => void;
  onCancel: () => void;
  readOnly?: boolean;
  /**
   * plan = Complete Questions gate
   * agent/ask/debug = answer continues when all required are answered
   */
  variant?: 'plan' | 'agent' | 'ask' | 'debug';
}

function selectedSet(answer: string | undefined, opts: string[]): Set<string> {
  const chosen = new Set(parseMultiAnswers(answer));
  // Drop bare 기타 marker from selection chips — textarea owns custom text
  for (const c of [...chosen]) {
    if (isOtherOption(c)) chosen.delete(c);
  }
  // Keep only known options (custom other text is not an option chip)
  for (const c of [...chosen]) {
    if (!opts.some((o) => o === c) && !isOtherOption(c)) {
      // custom free-text lives as "other path"
    }
  }
  return chosen;
}

function isOtherSelected(answer: string | undefined, opts: string[]): boolean {
  if (!answer?.trim()) return false;
  const parts = parseMultiAnswers(answer);
  if (parts.some((p) => isOtherOption(p))) return true;
  const presets = opts.filter((o) => !isOtherOption(o));
  // Custom text that isn't a preset option → other path
  return parts.some((p) => !presets.includes(p) && !isOtherOption(p));
}

function otherText(answer: string | undefined, opts: string[]): string {
  if (!answer?.trim()) return '';
  const presets = new Set(opts.filter((o) => !isOtherOption(o)));
  const parts = parseMultiAnswers(answer).filter(
    (p) => !presets.has(p) && !isOtherOption(p)
  );
  return parts.join('\n');
}

export function ClarifyingQuestions({
  questions,
  onAnswer,
  onComplete,
  onCancel,
  readOnly,
  variant = 'plan'
}: ClarifyingQuestionsProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [otherDraft, setOtherDraft] = useState<Record<string, string>>({});
  const isPlan = variant === 'plan';

  const normalized = useMemo(
    () =>
      questions.map((q) => {
        const n = normalizeMcqQuestion(q.question, q.options);
        const multi = Boolean(q.allowMultiple || q.type === 'multiple');
        return {
          ...q,
          type: multi ? ('multiple' as const) : ('single' as const),
          allowMultiple: multi,
          question: n.question,
          options: n.options
        };
      }),
    [questions]
  );

  const unansweredRequired = normalized.filter((q) => {
    if (!q.required) return false;
    const ans = (q.answer || '').trim();
    if (!ans) return true;
    const opts = q.options || [OTHER_OPTION];
    if (isOtherSelected(ans, opts)) {
      const custom = otherDraft[q.id] ?? otherText(ans, opts);
      if (!custom.trim()) return true;
    }
    return false;
  });

  const commitAnswer = (
    q: (typeof normalized)[0],
    nextSelected: string[],
    customOther: string
  ) => {
    const parts = [...nextSelected];
    const trimmed = customOther.trim();
    if (trimmed) parts.push(trimmed);
    else if (nextSelected.length === 0 && isOtherSelected(q.answer, q.options || [])) {
      parts.push(OTHER_OPTION);
    }
    onAnswer(q.id, formatMultiAnswers(parts));
  };

  const handleComplete = () => {
    if (unansweredRequired.length > 0) {
      const errs: Record<string, string> = {};
      unansweredRequired.forEach((q) => {
        const opts = q.options || [OTHER_OPTION];
        errs[q.id] = isOtherSelected(q.answer, opts)
          ? 'Enter a note if you selected Other'
          : 'Please answer required questions';
      });
      setErrors(errs);
      return;
    }
    onComplete();
  };

  return (
    <div className={`clarifying-questions clarifying-questions--${variant}`}>
      <div className="clarifying-questions__header">
        <h3>{isPlan ? 'Questions' : 'Quick question'}</h3>
        <p>
          {isPlan ? (
            <>
              Pick an answer, then press <strong>Complete Questions</strong> to continue.
              {normalized.some((q) => q.allowMultiple) ? (
                <> Use checkboxes to select more than one.</>
              ) : null}
            </>
          ) : (
            <>
              {normalized.length > 1
                ? 'Answer every required question to continue.'
                : 'Selecting an option continues immediately.'}
            </>
          )}
        </p>
      </div>

      <div className="clarifying-questions__body">
        {normalized.map((q) => {
        const opts = q.options || [OTHER_OPTION];
        const multi = Boolean(q.allowMultiple);
        const selected = selectedSet(q.answer, opts);
        const otherOn = isOtherSelected(q.answer, opts);
        const draft =
          otherDraft[q.id] ?? (otherOn ? otherText(q.answer, opts) : '');

        return (
          <div key={q.id} className="clarifying-questions__item">
            <div className="clarifying-questions__prompt">
              {renderInlineMarkdown(q.question)}
              {q.required ? (
                <span className="clarifying-questions__req" aria-hidden>
                  *
                </span>
              ) : null}
              {multi ? (
                <span className="clarifying-questions__multi-hint"> · Multiple choice</span>
              ) : null}
            </div>

            <div
              className="clarifying-questions__options"
              role={multi ? 'group' : 'radiogroup'}
            >
              {opts.map((opt) => {
                const isOther = isOtherOption(opt);
                const checked = isOther ? otherOn : selected.has(opt);
                return (
                  <label
                    key={opt}
                    className={`clarifying-questions__option${
                      checked ? ' clarifying-questions__option--selected' : ''
                    }`}
                  >
                    <input
                      type={multi ? 'checkbox' : 'radio'}
                      name={q.id}
                      value={opt}
                      checked={checked}
                      onChange={() => {
                        if (isOther) {
                          if (multi) {
                            if (otherOn) {
                              setOtherDraft((prev) => {
                                const next = { ...prev };
                                delete next[q.id];
                                return next;
                              });
                              commitAnswer(q, [...selected], '');
                            } else {
                              setOtherDraft((prev) => ({
                                ...prev,
                                [q.id]: draft || ''
                              }));
                              commitAnswer(
                                q,
                                [...selected],
                                draft.trim() || OTHER_OPTION
                              );
                            }
                          } else {
                            setOtherDraft((prev) => ({
                              ...prev,
                              [q.id]: draft || ''
                            }));
                            onAnswer(q.id, draft.trim() || OTHER_OPTION);
                          }
                        } else if (multi) {
                          const next = new Set(selected);
                          if (next.has(opt)) next.delete(opt);
                          else next.add(opt);
                          commitAnswer(
                            q,
                            [...next],
                            otherOn ? draft : ''
                          );
                        } else {
                          setOtherDraft((prev) => {
                            const next = { ...prev };
                            delete next[q.id];
                            return next;
                          });
                          onAnswer(q.id, opt);
                        }
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next[q.id];
                          return next;
                        });
                      }}
                      disabled={readOnly}
                    />
                    <span className="clarifying-questions__option-text">
                      {renderInlineMarkdown(opt)}
                    </span>
                  </label>
                );
              })}
            </div>

            {otherOn ? (
              <textarea
                className="clarifying-questions__textarea"
                value={draft}
                onChange={(e) => {
                  const v = e.target.value;
                  setOtherDraft((prev) => ({ ...prev, [q.id]: v }));
                  if (multi) {
                    commitAnswer(q, [...selected], v);
                  } else {
                    onAnswer(q.id, v.trim() || OTHER_OPTION);
                  }
                }}
                disabled={readOnly}
                placeholder="Other — type your own…"
                rows={3}
              />
            ) : null}

            {errors[q.id] ? (
              <span className="clarifying-questions__error">{errors[q.id]}</span>
            ) : null}
          </div>
        );
      })}
      </div>

      {!readOnly ? (
        <div className="clarifying-questions__actions">
          <button type="button" className="settings-btn" onClick={onCancel}>
            Cancel
          </button>
          {isPlan ? (
            <button
              type="button"
              className="settings-btn primary"
              onClick={handleComplete}
              disabled={unansweredRequired.length > 0}
            >
              Complete Questions
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
