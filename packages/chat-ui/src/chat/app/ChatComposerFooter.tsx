/**
 * ChatComposerFooter — footer 영역 (Queue + ChangedFilesBar + Composer)
 *
 * ask_question UI는 timeline AskQuestionCard만 사용 (Clarifying dock 중복 제거).
 */
import React from 'react';
import { Composer } from '../components/Composer';
import type { ModelSelectorOption } from '../components/ModelSelector';
import { ChangedFilesBar } from '../components/ChangedFilesBar';
import type { CheckpointSummary } from '../components/ChangedFilesBar';
import { QueueUI } from '../components/MessageQueueUI';
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
  mode: Mode;
  activeSubagentTab: { id: string; title: string; parentSessionId: string } | null;
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
  /** Session tab click → focus composer textarea */
  focusNonce?: number;
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
    activeSubagentTab,
    sessionFileEdits, onOpenFile, onUndoAll, onReview, isStreaming, onStop,
    checkpoints, onListCheckpoints, onRestoreCheckpoint, onAcceptFile, onRejectFile,
    sessionId,
    onSend, disabled, seedText, seedNonce, focusNonce = 0,
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
      <QueueUI
        key={queueTick}
        messages={msgQueue.state.messages}
        isProcessing={msgQueue.state.isProcessing}
        onApplyNow={onQueueApplyNow}
        onCancel={onQueueCancel}
      />

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

      {composerHidden || activeSubagentTab ? (
        activeSubagentTab ? (
          <div className="composer-subagent-placeholder" role="status">
            Viewing subagent — switch back to the parent tab to send.
          </div>
        ) : null
      ) : (
        <Composer
          key={sessionId}
          onSend={onSend}
          disabled={disabled}
          seedText={seedText}
          seedNonce={seedNonce}
          focusNonce={focusNonce}
          inlineEdit={inlineEdit}
          onClearInlineEdit={onClearInlineEdit}
          onSlashCommand={onSlashCommand}
          onStop={onStop}
          isStreaming={isStreaming}
          onRegenerate={onRegenerate}
          onQueueMessage={onQueueMessage}
          onResynthesize={onResynthesize}
          isAwaitingUser={isAwaitingUser}
          isGeneratingPlan={isGeneratingPlan}
          modeValue={modeValue}
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
      )}
    </footer>
  );
}
