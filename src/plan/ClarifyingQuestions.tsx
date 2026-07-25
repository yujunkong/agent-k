/**
 * ClarifyingQuestions - 객관식 질문 UI + ask_question 도구 (C5-T02)
 * 
 * single/multiple/text 타입 지원
 * 필수 미답 시 계획 저장/다음 단계 차단
 * 답변 → Plan ## Questions 섹션에 기록
 * 취소 시 Plan 플로우 cancelled
 */
import React, { useState } from 'react';

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
}

export function ClarifyingQuestions({
  questions,
  onAnswer,
  onComplete,
  onCancel,
  readOnly
}: ClarifyingQuestionsProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const unansweredRequired = questions.filter(
    q => q.required && (!q.answer || q.answer.trim().length === 0)
  );

  const handleComplete = () => {
    if (unansweredRequired.length > 0) {
      const errs: Record<string, string> = {};
      unansweredRequired.forEach(q => { errs[q.id] = 'This question is required'; });
      setErrors(errs);
      return;
    }
    onComplete();
  };

  return (
    <div className="clarifying-questions" style={{
      padding: 16, borderRadius: 8,
      background: 'var(--vscode-editor-background, #1e1e1e)',
      border: '1px solid var(--vscode-panel-border, #333)',
      maxWidth: 640
    }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '1.1em', fontWeight: 600 }}>
        Question
      </h3>
      <p style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 16 }}>
        Answer to continue the agent. Choose an option or type a reply.
      </p>

      {questions.map(q => (
        <div key={q.id} style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: 4 }}>
            {q.question}
            {q.required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
          </label>

          {q.type === 'single' && q.options && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {q.options.map(opt => (
                <label key={opt} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                  borderRadius: 4, cursor: readOnly ? 'default' : 'pointer',
                  background: q.answer === opt ? 'rgba(59,130,246,0.1)' : 'transparent'
                }}>
                  <input
                    type="radio" name={q.id} value={opt}
                    checked={q.answer === opt}
                    onChange={() => onAnswer(q.id, opt)}
                    disabled={readOnly}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}

          {q.type === 'multiple' && q.options && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {q.options.map(opt => {
                const selected = q.answer?.includes(opt);
                return (
                  <label key={opt} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                    borderRadius: 4, cursor: readOnly ? 'default' : 'pointer',
                    background: selected ? 'rgba(59,130,246,0.1)' : 'transparent'
                  }}>
                    <input
                      type="checkbox" value={opt}
                      checked={!!selected}
                      onChange={() => {
                        const current = q.answer ? q.answer.split(', ') : [];
                        const next = selected
                          ? current.filter(v => v !== opt)
                          : [...current, opt];
                        onAnswer(q.id, next.join(', '));
                      }}
                      disabled={readOnly}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          )}

          {q.type === 'text' && (
            <textarea
              value={q.answer || ''}
              onChange={e => onAnswer(q.id, e.target.value)}
              disabled={readOnly}
              placeholder="Your answer..."
              rows={3}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 4,
                background: 'var(--vscode-input-background, #3c3c3c)',
                color: 'var(--vscode-input-foreground, #ccc)',
                border: errors[q.id] ? '1px solid #ef4444' : '1px solid var(--vscode-panel-border, #555)',
                resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9em'
              }}
            />
          )}

          {errors[q.id] && (
            <span style={{ fontSize: '0.8em', color: '#ef4444', marginTop: 2 }}>
              {errors[q.id]}
            </span>
          )}
        </div>
      ))}

      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="settings-btn"
            style={{ padding: '6px 16px', opacity: 0.8 }}>
            Cancel
          </button>
          <button onClick={handleComplete} className="settings-btn primary"
            style={{
              padding: '6px 16px',
              background: unansweredRequired.length > 0 ? 'var(--vscode-button-secondaryBackground, #555)' : 'var(--vscode-button-background, #0078d4)',
              color: '#fff', fontWeight: 600, cursor: unansweredRequired.length > 0 ? 'not-allowed' : 'pointer'
            }}
            disabled={unansweredRequired.length > 0}>
            Complete Questions
          </button>
        </div>
      )}
    </div>
  );
}
