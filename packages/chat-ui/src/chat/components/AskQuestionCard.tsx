/**
 * AskQuestionCard — one timeline card for a batch of ask_question items.
 * Live: 20s auto-skip if idle; any click engages → infinite wait + one Skip/Confirm.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { renderInlineMarkdown } from '../inlineMarkdown';
import {
  OTHER_OPTION,
  formatMultiAnswers,
  isOtherOption,
  parseMultiAnswers,
} from '../normalizeAskQuestion';
import {
  askCardConfirm,
  askCardSelect,
  askCardSkip,
} from '../askQuestionCardBridge';

/** Idle auto-skip window when the user never touches the card. */
export const ASK_CARD_IDLE_SKIP_SEC = 20;

export interface AskQuestionItem {
  askQid?: string;
  question: string;
  options?: string[];
  answer?: string;
  allowMultiple?: boolean;
}

export interface AskQuestionCardProps {
  /** One or more questions shown in a single card. */
  items: AskQuestionItem[];
  live?: boolean;
  durationMs?: number;
}

function formatMs(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function selectedParts(answer: string | undefined): string[] {
  if (!answer?.trim()) return [];
  return parseMultiAnswers(answer).map((p) => p.trim()).filter(Boolean);
}

function itemKey(item: AskQuestionItem, index: number): string {
  return String(item.askQid || `q_${index}`);
}

export function AskQuestionCard({
  items,
  live = false,
  durationMs,
}: AskQuestionCardProps) {
  const normalized = useMemo(
    () =>
      items
        .map((it) => ({
          ...it,
          question: String(it.question || '').trim(),
          options: (it.options || []).map(String).filter((o) => o.trim()),
        }))
        .filter((it) => it.question.length > 0),
    [items]
  );

  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    normalized.forEach((it, i) => {
      init[itemKey(it, i)] = String(it.answer || '');
    });
    return init;
  });
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [engaged, setEngaged] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(ASK_CARD_IDLE_SKIP_SEC);
  const engagedRef = useRef(false);
  const skippedRef = useRef(false);

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      normalized.forEach((it, i) => {
        const k = itemKey(it, i);
        if (it.answer != null && next[k] !== String(it.answer)) {
          next[k] = String(it.answer);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [normalized]);

  useEffect(() => {
    engagedRef.current = engaged;
  }, [engaged]);

  // Comment: one countdown for the whole batch card
  useEffect(() => {
    if (!live || engaged || skipped) return;
    setSecondsLeft(ASK_CARD_IDLE_SKIP_SEC);
    const started = Date.now();
    const tick = window.setInterval(() => {
      const left = Math.max(
        0,
        ASK_CARD_IDLE_SKIP_SEC - Math.floor((Date.now() - started) / 1000)
      );
      setSecondsLeft(left);
      if (left <= 0) {
        window.clearInterval(tick);
        if (skippedRef.current || engagedRef.current) return;
        skippedRef.current = true;
        setSkipped(true);
        askCardSkip({
          items: normalized.map((it, i) => ({
            qid: itemKey(it, i),
            question: it.question,
          })),
          reason: 'timeout',
        });
      }
    }, 250);
    return () => window.clearInterval(tick);
  }, [live, engaged, skipped, normalized]);

  if (normalized.length === 0) return null;

  const interactive = live && !skipped;
  const settled = !live;

  const engage = () => {
    if (!engaged) setEngaged(true);
  };

  const answerSatisfied = (k: string, allowMultiple: boolean): boolean => {
    const parts = selectedParts(drafts[k]);
    const other = String(otherTexts[k] || '').trim();
    const presets = parts.filter((p) => !isOtherOption(p));
    if (presets.length > 0) return true;
    if (other) return true;
    if (parts.some((p) => isOtherOption(p)) && other) return true;
    void allowMultiple;
    return false;
  };

  const canConfirm =
    interactive &&
    normalized.every((it, i) => answerSatisfied(itemKey(it, i), Boolean(it.allowMultiple)));

  const emitSelect = (it: AskQuestionItem, index: number, parts: string[]) => {
    const k = itemKey(it, index);
    const next = formatMultiAnswers(parts);
    setDrafts((prev) => ({ ...prev, [k]: next }));
    engage();
    const qid = String(it.askQid || '').trim();
    if (!qid) return;
    askCardSelect({ qid, answer: next, question: it.question });
  };

  const toggleOption = (it: AskQuestionItem, index: number, opt: string) => {
    if (!interactive) return;
    engage();
    const k = itemKey(it, index);
    const allowMultiple = Boolean(it.allowMultiple);
    const selected = selectedParts(drafts[k]);
    const otherOn =
      selected.some((p) => isOtherOption(p)) ||
      Boolean(String(otherTexts[k] || '').trim());
    const otherDraft = String(otherTexts[k] || '');

    if (isOtherOption(opt)) {
      if (otherOn && !otherDraft.trim()) {
        setOtherTexts((prev) => {
          const n = { ...prev };
          delete n[k];
          return n;
        });
        emitSelect(
          it,
          index,
          selected.filter((p) => !isOtherOption(p))
        );
      } else {
        setOtherTexts((prev) => ({ ...prev, [k]: otherDraft || '' }));
        const presets = selected.filter((p) => !isOtherOption(p));
        emitSelect(it, index, [...presets, OTHER_OPTION]);
      }
      return;
    }
    if (allowMultiple) {
      const next = new Set(selected.filter((p) => !isOtherOption(p)));
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      const parts = [...next];
      if (otherOn) parts.push(otherDraft.trim() || OTHER_OPTION);
      emitSelect(it, index, parts);
    } else {
      setOtherTexts((prev) => {
        const n = { ...prev };
        delete n[k];
        return n;
      });
      emitSelect(it, index, [opt]);
    }
  };

  const finalizeAnswer = (it: AskQuestionItem, index: number): string => {
    const k = itemKey(it, index);
    const selected = selectedParts(drafts[k]);
    const presets = selected.filter((p) => !isOtherOption(p));
    const other = String(otherTexts[k] || '').trim();
    const parts = [...presets];
    if (other) parts.push(other);
    return formatMultiAnswers(parts);
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    askCardConfirm({
      answers: normalized.map((it, i) => ({
        qid: itemKey(it, i),
        answer: finalizeAnswer(it, i),
        question: it.question,
      })),
    });
  };

  const handleSkip = () => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    setSkipped(true);
    engage();
    askCardSkip({
      items: normalized.map((it, i) => ({
        qid: itemKey(it, i),
        question: it.question,
      })),
      reason: 'user',
    });
  };

  return (
    <section
      className={`ak-ask-card${live ? ' ak-ask-card--live' : ''}${
        settled ? ' ak-ask-card--settled' : ''
      }${engaged ? ' ak-ask-card--engaged' : ''}`}
      aria-label={live ? 'Waiting for answers' : 'Asked questions'}
      onPointerDown={interactive ? engage : undefined}
    >
      <header className="ak-ask-card__header">
        <span className="ak-ask-card__title">
          {live
            ? engaged
              ? 'Answer'
              : normalized.length > 1
                ? `Asking · ${normalized.length}`
                : 'Asking'
            : settled
              ? normalized.length > 1
                ? `Asked · ${normalized.length}`
                : 'Asked'
              : 'Questions'}
        </span>
        {live && !engaged ? (
          <span className="ak-ask-card__countdown" aria-live="polite">
            Auto-skip in {secondsLeft}s
          </span>
        ) : null}
        {durationMs != null && !live ? (
          <span className="ak-ask-card__ms">{formatMs(durationMs)}</span>
        ) : null}
      </header>

      <div className="ak-ask-card__list">
        {normalized.map((it, index) => {
          const k = itemKey(it, index);
          const allowMultiple = Boolean(it.allowMultiple);
          const selected = selectedParts(drafts[k]);
          const selectedSet = new Set(selected.map((s) => s.toLowerCase()));
          const otherOn =
            selected.some((p) => isOtherOption(p)) ||
            Boolean(String(otherTexts[k] || '').trim());
          const otherDraft = String(otherTexts[k] || '');
          const opts = it.options;

          return (
            <div key={k} className="ak-ask-card__item">
              <div className="ak-ask-card__prompt">
                {normalized.length > 1 ? (
                  <span className="ak-ask-card__item-idx">{index + 1}. </span>
                ) : null}
                {renderInlineMarkdown(it.question)}
                {allowMultiple ? (
                  <span className="ak-ask-card__multi-hint"> · multiple</span>
                ) : null}
              </div>

              {opts.length > 0 ? (
                <ul
                  className="ak-ask-card__options"
                  role={allowMultiple ? 'group' : 'radiogroup'}
                >
                  {opts.map((opt) => {
                    const isOther = isOtherOption(opt);
                    const isSel = isOther
                      ? otherOn
                      : selectedSet.has(opt.toLowerCase());
                    return (
                      <li key={opt}>
                        <button
                          type="button"
                          className={`ak-ask-card__option${
                            isSel ? ' is-selected' : ''
                          }`}
                          disabled={!interactive}
                          onClick={() => toggleOption(it, index, opt)}
                        >
                          <span className="ak-ask-card__option-mark" aria-hidden>
                            {isSel ? '✓' : allowMultiple ? '□' : '○'}
                          </span>
                          <span className="ak-ask-card__option-text">
                            {renderInlineMarkdown(opt)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {interactive && otherOn ? (
                <textarea
                  className="ak-ask-card__other"
                  value={otherDraft}
                  placeholder="Other — type your own…"
                  rows={2}
                  onChange={(e) => {
                    engage();
                    const v = e.target.value;
                    setOtherTexts((prev) => ({ ...prev, [k]: v }));
                    const presets = selected.filter((p) => !isOtherOption(p));
                    emitSelect(it, index, [
                      ...presets,
                      v.trim() || OTHER_OPTION,
                    ]);
                  }}
                />
              ) : null}

              {settled && selected.length > 0 ? (
                <div className="ak-ask-card__answer">
                  <span className="ak-ask-card__answer-label">Selected</span>
                  <span className="ak-ask-card__answer-text">
                    {renderInlineMarkdown(selected.join(' · '))}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {live && !engaged ? (
        <p className="ak-ask-card__waiting">
          No action → skip in {secondsLeft}s. Click an option to answer.
        </p>
      ) : null}

      {/* Comment: one Skip/Confirm for the whole batch */}
      {interactive && engaged ? (
        <div className="ak-ask-card__actions">
          <button type="button" className="settings-btn" onClick={handleSkip}>
            Skip
          </button>
          <button
            type="button"
            className="settings-btn primary"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            Confirm
          </button>
        </div>
      ) : null}
    </section>
  );
}
