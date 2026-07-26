/**
 * ClarifyingQuestions - 객관식 질문 UI + ask_question 도구 (C5-T02)
 *
 * Plan/Debug: 항상 라디오 + 기타(자유 입력).
 * 필수 미답 시 다음 단계 차단.
 */
import React, { useMemo, useState } from 'react';
import { renderInlineMarkdown } from '../chat/inlineMarkdown';
import {
  OTHER_OPTION,
  isOtherAnswer,
  isOtherOption,
  normalizeMcqQuestion
} from '../chat/normalizeAskQuestion';

export interface Question {
  id: string;
  type: 'single' | 'multiple' | 'text';
  question: string;
  options?: string[];
  required: boolean;
  answer?: string;
}

interface ClarifyingQuestionsProps {
  questions: Question[];
  onAnswer: (id: string, answer: string) => void;
  onComplete: () => void;
  onCancel: () => void;
  readOnly?: boolean;
  /** Force radio + 기타 (Plan / Debug). Default true. */
  forceRadio?: boolean;
}

export function ClarifyingQuestions({
  questions,
  onAnswer,
  onComplete,
  onCancel,
  readOnly,
  forceRadio = true
}: ClarifyingQuestionsProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Local draft while 기타 is selected but not yet committed */
  const [otherDraft, setOtherDraft] = useState<Record<string, string>>({});

  const normalized = useMemo(
    () =>
      questions.map((q) => {
        const n = normalizeMcqQuestion(q.question, q.options);
        return {
          ...q,
          type: forceRadio ? ('single' as const) : q.options?.length ? q.type : ('single' as const),
          question: n.question,
          options: n.options
        };
      }),
    [questions, forceRadio]
  );

  const unansweredRequired = normalized.filter((q) => {
    if (!q.required) return false;
    const ans = (q.answer || '').trim();
    if (!ans) return true;
    if (isOtherOption(ans)) return true; // bare 기타 without detail
    return false;
  });

  const handleComplete = () => {
    if (unansweredRequired.length > 0) {
      const errs: Record<string, string> = {};
      unansweredRequired.forEach((q) => {
        errs[q.id] = isOtherOption((q.answer || '').trim())
          ? '기타를 선택한 경우 내용을 입력하세요'
          : '필수 질문에 답해주세요';
      });
      setErrors(errs);
      return;
    }
    onComplete();
  };

  return (
    <div className="clarifying-questions">
      <div className="clarifying-questions__header">
        <h3>Questions</h3>
        <p>
          답을 고른 뒤 <strong>Complete Questions</strong>를 눌러야 다음 단계로 진행합니다.
        </p>
      </div>

      {normalized.map((q) => {
        const opts = q.options || [OTHER_OPTION];
        const otherSelected = isOtherAnswer(q.answer, opts);
        const draft =
          otherDraft[q.id] ??
          (otherSelected && q.answer && !isOtherOption(q.answer) ? q.answer : '');

        return (
          <div key={q.id} className="clarifying-questions__item">
            <div className="clarifying-questions__prompt">
              {renderInlineMarkdown(q.question)}
              {q.required ? (
                <span className="clarifying-questions__req" aria-hidden>
                  *
                </span>
              ) : null}
            </div>

            <div className="clarifying-questions__options" role="radiogroup">
              {opts.map((opt) => {
                const isOther = isOtherOption(opt);
                const selected = isOther
                  ? otherSelected
                  : q.answer === opt;
                return (
                  <label
                    key={opt}
                    className={`clarifying-questions__option${
                      selected ? ' clarifying-questions__option--selected' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      checked={selected}
                      onChange={() => {
                        if (isOther) {
                          setOtherDraft((prev) => ({ ...prev, [q.id]: draft || '' }));
                          onAnswer(q.id, draft.trim() || OTHER_OPTION);
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

            {otherSelected ? (
              <textarea
                className="clarifying-questions__textarea"
                value={draft}
                onChange={(e) => {
                  const v = e.target.value;
                  setOtherDraft((prev) => ({ ...prev, [q.id]: v }));
                  onAnswer(q.id, v.trim() || OTHER_OPTION);
                }}
                disabled={readOnly}
                placeholder="기타 — 직접 입력…"
                rows={3}
              />
            ) : null}

            {errors[q.id] ? (
              <span className="clarifying-questions__error">{errors[q.id]}</span>
            ) : null}
          </div>
        );
      })}

      {!readOnly ? (
        <div className="clarifying-questions__actions">
          <button type="button" className="settings-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="settings-btn primary"
            onClick={handleComplete}
            disabled={unansweredRequired.length > 0}
          >
            Complete Questions
          </button>
        </div>
      ) : null}
    </div>
  );
}
