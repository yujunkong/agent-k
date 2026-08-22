/**
 * ChatComposerFooter — footer 영역 (Queue + Clarifying dock + ChangedFilesBar + Composer)
 *
 * 렌더링:
 *   - QueueUI (메시지 큐 표시)
 *   - ClarifyingQuestions dock (ask_question 응답 UI)
 *   - ChangedFilesBar (편집 파일 요약 + 체크포인트)
 *   - Composer (입력창 + 모드/모델 선택기)
 *   - subagent 탭 활성 시 placeholder 표시
 */
import React from 'react';
import { Composer } from '../components/Composer';
import type { ModelSelectorOption } from '../components/ModelSelector';
import { ChangedFilesBar } from '../components/ChangedFilesBar';
import type { CheckpointSummary } from '../components/ChangedFilesBar';
import { QueueUI } from '../components/MessageQueueUI';
import { ClarifyingQuestions } from '../../plan/ClarifyingQuestions';
import type { PendingQuestion } from '../../tools/session/AskQuestionTool';
import type { FileEditPreview, Mode, ModePicker, Attachment } from '../types';
import type { ThinkingEffort } from '../../agent/thinkingEffort';
import type { SlashCommand } from '../composerPalette';
import type { InlineEditContext } from '../inlineEdit';
import type { MessageQueue } from '../../loop/MessageQueue';

export interface ChatComposerFooterProps {
  // Queue
  msgQueue: MessageQueue;
  queueTick: number;
  onQueueApplyNow: (messageId: string) => void;
  onQueueCancel: (messageId: string) => void;
  // Clarifying questions
  showClarifying: boolean;
  pendingQuestions: PendingQuestion[];
  mode: Mode;
  activeSubagentTab: { id: string; title: string; parentSessionId: string } | null;
  onPlanAnswer: (id: string, answer: string) => void;
  onQuestionsComplete: () => void;
  onQuestionsCancel: () => void;
  // ChangedFilesBar
  sessionFileEdits: FileEditPreview[];
  onOpenFile: (filePath: string) => void;
  onUndoAll: () => void;
  onReview: () => void;
  isStreaming: boolean;
  onStop: () => void;
  checkpoints: CheckpointSummary[];
  onListCheckpoints: () => void;
  onRestoreCheckpoint: (id: string) => void;
  onAcceptFile: (file: FileEditPreview) => void;
  onRejectFile: (file: FileEditPreview) => void;
  // Composer
  sessionId: string;
  onSend: (text: string, files: Attachment[], opts?: any) => Promise<void>;
  disabled: boolean;
  seedText: string | null;
  seedNonce: number;
  inlineEdit: InlineEditContext | null;
  onClearInlineEdit: () => void;
  onSlashCommand: (cmd: SlashCommand) => void;
  onRegenerate: () => void;
  onQueueMessage: (text: string) => void;
  onResynthesize: (text: string, opts?: { drainQueue?: boolean }) => void;
  isAwaitingUser: boolean;
  isGeneratingPlan: boolean;
  /**
   * Hide footer composer (e.g. subagent detail). Do NOT use for pencil edit —
   * Cursor keeps the bottom "new message" composer while editing mid-thread.
   */
  composerHidden?: boolean;
  modeValue: Mode | 'auto';
  onModeChange: (newMode: ModePicker) => void;
  modeLabels: Record<string, string>;
  modeTooltips: Record<string, string>;
  modelLabel: string;
  modelId: string;
  modelOptions: Array<string | ModelSelectorOption>;
  onModelChange: (next: string) => void;
  thinkingEffort: ThinkingEffort;
  onThinkingEffortChange: ((next: ThinkingEffort) => void) | undefined;
  /** Matches Composer — title is used for the select tooltip. */
  thinkingOptions: Array<{ value: ThinkingEffort; label: string; title: string }>;
  contextUsagePercent: number;
  contextUsageLabel: string;
  /** Hover tooltip — may include budget; visible label stays used-only */
  contextUsageTitle?: string;
}

export function ChatComposerFooter(props: ChatComposerFooterProps) {
  const {
    msgQueue, queueTick, onQueueApplyNow, onQueueCancel,
    showClarifying, pendingQuestions, mode, activeSubagentTab,
    onPlanAnswer, onQuestionsComplete, onQuestionsCancel,
    sessionFileEdits, onOpenFile, onUndoAll, onReview, isStreaming, onStop,
    checkpoints, onListCheckpoints, onRestoreCheckpoint, onAcceptFile, onRejectFile,
    sessionId,
    onSend, disabled, seedText, seedNonce,
    inlineEdit, onClearInlineEdit, onSlashCommand, onRegenerate,
    onQueueMessage, onResynthesize,
    isAwaitingUser, isGeneratingPlan,
    composerHidden = false,
    modeValue, onModeChange, modeLabels, modeTooltips,
    modelLabel, modelId, modelOptions, onModelChange,
    thinkingEffort, onThinkingEffortChange, thinkingOptions,
    contextUsagePercent, contextUsageLabel, contextUsageTitle
  } = props;

  return (
    <footer className="chat-footer">
      {/* 큐 — Composer 위에 고정; 메시지 리스트와 섞이지 않음 */}
      <QueueUI
        key={queueTick}
        messages={msgQueue.state.messages}
        isProcessing={msgQueue.state.isProcessing}
        onApplyNow={onQueueApplyNow}
        onCancel={onQueueCancel}
      />

      {/* ask_question UI — Composer 바로 위 고정 (스크롤 off-screen 방지) */}
      {showClarifying && pendingQuestions.length > 0 && !activeSubagentTab && (
        <div className="clarifying-dock" role="region" aria-label="Clarifying questions">
          <ClarifyingQuestions
            questions={pendingQuestions.map((q) => ({
              id: q.id,
              type: q.allowMultiple ? ('multiple' as const) : ('single' as const),
              question: q.question,
              options: q.options,
              required: q.required,
              answer: q.answer,
              allowMultiple: Boolean(q.allowMultiple)
            }))}
            variant={mode}
            onAnswer={onPlanAnswer}
            onComplete={onQuestionsComplete}
            onCancel={onQuestionsCancel}
          />
        </div>
      )}

      {/* 편집 파일 요약 바 */}
      <ChangedFilesBar
        files={sessionFileEdits}
        onOpenFile={onOpenFile}
        onUndoAll={onUndoAll}
        onReview={onReview}
        isStreaming={isStreaming}
        onStop={onStop}
        checkpoints={checkpoints}
        onListCheckpoints={onListCheckpoints}
        onRestoreCheckpoint={onRestoreCheckpoint}
        onAcceptFile={onAcceptFile}
        onRejectFile={onRejectFile}
      />

      {/* Composer — subagent 탭 활성 중에도 마운트 유지 (모델·드래프트 상태 보존) */}
      <div
        className={
          activeSubagentTab || composerHidden
            ? 'ak-composer-host ak-composer-host--hidden'
            : 'ak-composer-host'
        }
        aria-hidden={Boolean(activeSubagentTab || composerHidden)}
      >
        <Composer
          sessionId={sessionId}
          onSend={onSend}
          disabled={disabled}
          onStop={onStop}
          seedText={seedText}
          seedNonce={seedNonce}
          inlineEdit={inlineEdit}
          onClearInlineEdit={onClearInlineEdit}
          onSlashCommand={onSlashCommand}
          onRegenerate={onRegenerate}
          onQueueMessage={onQueueMessage}
          onResynthesize={onResynthesize}
          isStreaming={isStreaming}
          isAwaitingUser={isAwaitingUser}
          isGeneratingPlan={isGeneratingPlan}
          mode={modeValue}
          onModeChange={onModeChange}
          modeLabels={modeLabels}
          modeTooltips={modeTooltips}
          modelLabel={modelLabel}
          modelId={modelId}
          modelOptions={modelOptions}
          onModelChange={onModelChange}
          thinkingEffort={thinkingEffort}
          onThinkingEffortChange={onThinkingEffortChange}
          thinkingOptions={thinkingOptions}
          contextUsagePercent={contextUsagePercent}
          contextUsageLabel={contextUsageLabel}
          contextUsageTitle={contextUsageTitle}
        />
      </div>

      {activeSubagentTab ? (
        <div className="ak-subagent-detail__composer-placeholder" aria-hidden>
          Agent progress — chat input stays on the main session tab
        </div>
      ) : null}
    </footer>
  );
}
