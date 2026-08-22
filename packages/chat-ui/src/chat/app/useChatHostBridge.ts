/**
 * CHAT-001 follow-up — Host → webview message binders for ChatApp.
 * Keeps useHostMessages wiring out of the orchestrator body.
 */
import { useHostMessages } from '../hooks/useHostMessages';
import { configManager } from '../../core/ConfigManager';
import { planGenerator } from '../../plan/PlanGenerator';
import {
  finalizePlanExecution,
  recordTaskExecutionFailed,
  recordTaskExecutionStarted,
  startPlanExecution,
  updatePlanExecutionSnapshot
} from '../../plan/execution/planExecutionPersistence';
import type { ExecutionPlan } from '../../plan/execution';
import { toObservedToolCall } from '../../plan/session';
import {
  applyWorkEvent,
  settleWorkEvents,
  workEventFromSubagentHostEvent
} from '../conversation/conversationWorkEvent';
import type { ConversationWorkEvent } from '../conversation/conversationWorkEvent';
import { parseInlineEditHostMessage, type InlineEditContext } from '../inlineEdit';
import type { ChatSessionMeta } from '../ChatSessionStore';
import type { Mode } from '../types';
import {
  buildPlanResearchContext,
  textFromPlanController
} from '../chatAppHelpers';
import type { UseChatPanelsReturn, SettingsTabId } from './useChatPanels';
import type { UseChatPlanModeReturn } from './useChatPlanMode';
import type { UseChatDebugModeReturn } from './useChatDebugMode';
import type { UseChatProviderReturn } from './useChatProvider';
import type { UseChatFileEditsReturn } from './useChatFileEdits';

export interface UseChatHostBridgeParams {
  sessionIdRef: React.MutableRefObject<string>;
  setMode: (mode: Mode) => void;
  setError: (error: string | null) => void;
  setInlineEditSeed: (ctx: InlineEditContext | null) => void;
  setComposerSeed: (seed: { text: string; nonce: number } | null) => void;
  handleNewChat: () => void;
  applyHostHydration: (metas: ChatSessionMeta[]) => void;
  updateSessionMessages: (
    id: string,
    updater: (prev: import('../types').ChatMessage[]) => import('../types').ChatMessage[]
  ) => void;
  panels: UseChatPanelsReturn;
  plan: UseChatPlanModeReturn;
  debug: UseChatDebugModeReturn;
  provider: UseChatProviderReturn;
  fileEdits: UseChatFileEditsReturn;
}

/** Bind Extension Host postMessage handlers used by the chat shell. */
export function useChatHostBridge(p: UseChatHostBridgeParams): void {
  const {
    sessionIdRef,
    setMode,
    setError,
    setInlineEditSeed,
    setComposerSeed,
    handleNewChat,
    applyHostHydration,
    updateSessionMessages,
    panels,
    plan,
    debug,
    provider,
    fileEdits
  } = p;

  useHostMessages({
    'session.new': () => {
      handleNewChat();
    },
    'ui.history.open': () => {
      panels.setShowHistory(true);
    },
    'ui.design.open': () => {
      panels.setShowDesignMode(true);
    },
    'ui.review.open': (data) => {
      panels.setShowReview(true);
      if (Array.isArray(data.findings) && data.findings.length) {
        panels.setReviewFindings(data.findings as any[]);
      } else if (Array.isArray(data.findings)) {
        panels.setReviewFindings([]);
      } else {
        panels.setReviewFindings((prev) =>
          prev.length
            ? prev
            : [
                {
                  id: 'f-demo',
                  file: 'src/example.ts',
                  line: 1,
                  severity: 'warning',
                  message: 'Review session started. Run Agent Review on dirty files.',
                  suggestion: 'Open a dirty workspace and Accept Fix to apply patches.'
                }
              ]
        );
      }
    },
    'ui.artifacts.open': () => {
      panels.setShowArtifacts(true);
    },
    'settings.open': (data) => {
      if (typeof data.tab === 'string') {
        const tab = data.tab === 'secrets' ? 'models' : data.tab;
        panels.rememberSettingsTab(tab as SettingsTabId);
      }
      panels.setShowSettings(true);
    },
    'plan.saved': (data) => {
      if (!data.slug) return;
      const ownerId = String(data.sessionId || sessionIdRef.current || '').trim();
      const ctrl = plan.ensurePlanAdapter(ownerId).legacy;
      const existing = ctrl.getState().planDocument;
      if (existing) {
        void ctrl.setPlanDocument({
          ...existing,
          slug: String(data.slug),
          title: String(data.title || existing.title)
        });
      }
      if (data.filePath) {
        console.info('[Agent K] Plan saved:', data.filePath);
        if (ownerId === sessionIdRef.current) setError(null);
      }
    },
    'plan.loaded': (data) => {
      if (data.content == null) return;
      const ownerId = String(data.sessionId || sessionIdRef.current || '').trim();
      const ctrl = plan.ensurePlanAdapter(ownerId).legacy;
      const existing = ctrl.getState().planDocument;
      if (existing) {
        void ctrl.setPlanDocument({
          ...existing,
          slug: String(data.slug || existing.slug),
          title: String(data.title || existing.title),
          content: String(data.content),
          sections: planGenerator.parseDocument(String(data.content)),
          todoCount: planGenerator.extractTodos(String(data.content)).length
        });
      }
    },
    'plan.save.error': (data) => {
      if (data.error) setError(`Plan save failed: ${String(data.error)}`);
    },
    'plan.load.error': (data) => {
      if (data.error) setError(`Plan load failed: ${String(data.error)}`);
    },
    'debug.saved': (data) => {
      if (!data.slug) return;
      debug.debugSessionSlugRef.current = String(data.slug);
      if (data.filePath) console.info('[Agent K] Debug saved:', data.filePath);
    },
    'debug.save.error': (data) => {
      if (data.error) setError(`Debug save failed: ${String(data.error)}`);
    },
    'model.context': (data) => {
      const n = Number(data.maxInputTokens);
      if (Number.isFinite(n) && n > 0) provider.setModelContextBudget(Math.floor(n));
      if (typeof data.source === 'string') provider.setModelContextSource(data.source);
      if (typeof data.providerType === 'string') provider.setProviderType(data.providerType);
    },
    'checkpoint.listResult': (data) => {
      const list = Array.isArray(data.checkpoints) ? data.checkpoints : [];
      fileEdits.setCheckpoints(
        list.map((c: { id?: unknown; label?: unknown; timestamp?: unknown }) => ({
          id: String(c.id),
          label: String(c.label || 'Checkpoint'),
          timestamp: Number(c.timestamp) || Date.now()
        }))
      );
    },
    'host.sessions.hydrate': (data) => {
      const metas = Array.isArray(data.sessions) ? data.sessions : [];
      applyHostHydration(metas as ChatSessionMeta[]);
    },
    'config.hydrate': (data) => {
      if (data.values && typeof data.values === 'object') {
        configManager.syncFromVSCode(data.values as Record<string, unknown>);
        void import('../../providers/ProviderConnections').then(({ getProviderConnections }) =>
          getProviderConnections()
        );
        void import('../providerModels').then(({ getComposerModels }) =>
          provider.setComposerModels(getComposerModels())
        );
      }
    },
    'plan.fileExists.result': (data) => {
      if (data.requestId == null) return;
      const requestId = String(data.requestId);
      const resolver = plan.planFileExistsResolversRef.current.get(requestId);
      if (resolver) {
        plan.planFileExistsResolversRef.current.delete(requestId);
        resolver.resolve(Boolean(data.exists));
      }
    },
    'plan.generate.started': (data) => {
      if (data.requestId == null) return;
      plan.planGenerateResolversRef.current.get(String(data.requestId))?.beginGenerateTimeout();
    },
    'plan.generate.result': (data) => {
      if (data.requestId == null) return;
      const requestId = String(data.requestId);
      const resolver = plan.planGenerateResolversRef.current.get(requestId);
      if (resolver) {
        plan.planGenerateResolversRef.current.delete(requestId);
        if (data.error) {
          resolver.reject(new Error(String(data.error)));
        } else {
          resolver.resolve(data.result as any);
        }
        return;
      }
      if (plan.planGenerateTimedOutRef.current.has(requestId)) {
        plan.planGenerateTimedOutRef.current.delete(requestId);
        if (data.aborted || data.error) return;
        const late = data.result as any;
        if (late?.ok && late.plan) {
          const ownerSessionId = String(data.sessionId || '').trim();
          if (!ownerSessionId) return;
          void plan.commitPlanResult(late, ownerSessionId, { late: true });
        }
      }
    },
    'plan.toolEvidence': (data) => {
      try {
        const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
        const ownerAdapter = plan.getPlanAdapterForSession(ownerSessionId);
        const phase = ownerAdapter.session.getPhase();
        if (phase !== 'executing' && phase !== 'completed') return;
        ownerAdapter.recordToolEvent(
          toObservedToolCall(
            String(data.name || ''),
            data.args as Record<string, unknown> | undefined,
            { success: Boolean(data.success) }
          )
        );
      } catch {
        /* evidence correlation must never break the chat loop */
      }
    },
    'plan.execution.started': (data) => {
      const execPlan = data.executionPlan as ExecutionPlan | undefined;
      if (!execPlan) return;
      const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
      const ownerAdapter = plan.getPlanAdapterForSession(ownerSessionId);
      if (!ownerAdapter.session.getExecutionPlan()) {
        startPlanExecution(ownerAdapter.session, execPlan);
      }
    },
    'plan.execution.updated': (data) => {
      const execPlan = data.executionPlan as ExecutionPlan | undefined;
      if (!execPlan) return;
      const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
      const ownerAdapter = plan.getPlanAdapterForSession(ownerSessionId);
      const taskId = data.taskId as string | undefined;
      const taskEvent = data.taskEvent as string | undefined;
      if (taskId && taskEvent) {
        const execTask = execPlan.tasks.find((t) => t.id === taskId);
        if (execTask) {
          if (taskEvent === 'started') {
            recordTaskExecutionStarted(
              ownerAdapter.session,
              taskId,
              execTask.execution,
              execTask.subagentId
            );
          } else if (taskEvent === 'failed') {
            const errMsg = (data.error as string) || `Task "${execTask.title}" failed`;
            recordTaskExecutionFailed(ownerAdapter.session, execTask, errMsg);
          }
        }
      }
      updatePlanExecutionSnapshot(ownerAdapter.session, execPlan);
    },
    'plan.execution.complete': (data) => {
      const execPlan = data.executionPlan as ExecutionPlan | undefined;
      if (!execPlan) return;
      const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
      const ownerAdapter = plan.getPlanAdapterForSession(ownerSessionId);
      finalizePlanExecution(ownerAdapter.session, execPlan);
      const fail = execPlan.status === 'failed';
      if (fail && ownerSessionId === sessionIdRef.current) {
        setError(ownerAdapter.session.getExecutionError() ?? 'Plan execution failed.');
      }
      updateSessionMessages(ownerSessionId, (prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant' || !last.workItems?.length) return prev;
        return [
          ...prev.slice(0, -1),
          { ...last, workItems: settleWorkEvents(last.workItems, fail ? 'error' : 'complete') }
        ];
      });
    },
    'plan.execution.error': (data) => {
      const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
      if (ownerSessionId === sessionIdRef.current) {
        setError(String(data.error || 'Plan execution failed.'));
      }
    },
    'plan.execution.diagnostic': (_data) => {
      // workEvent 변형이 타임라인 행을 처리 — no-op
    },
    'plan.execution.workEvent': (data) => {
      const workEvent = data.workEvent as ConversationWorkEvent | undefined;
      if (!workEvent?.id) return;
      const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
      updateSessionMessages(ownerSessionId, (prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        const updated = applyWorkEvent(last.workItems, workEvent);
        return [...prev.slice(0, -1), { ...last, workItems: updated }];
      });
    },
    'subagent.event': (data) => {
      const workEvent = workEventFromSubagentHostEvent(data as Record<string, unknown>);
      if (!workEvent) return;
      const ownerSessionId = String(data.sessionId || '') || sessionIdRef.current;
      updateSessionMessages(ownerSessionId, (prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        const updated = applyWorkEvent(last.workItems, workEvent);
        return [...prev.slice(0, -1), { ...last, workItems: updated }];
      });
    },
    'plan.buildFromEditor': (data) => {
      const content = String(data.content || '').trim();
      if (!content) {
        setError('Editor Plan is empty — cannot Build.');
        return;
      }
      const slugRaw = String(data.slug || '');
      const slug = slugRaw && /^plan_[a-f0-9]+$/i.test(slugRaw) ? slugRaw : 'plan_pending';
      const title = String(data.title || 'Plan');
      setMode('plan');
      plan.setShowPlanReview(false);
      void (async () => {
        try {
          await plan.planController.setPlanDocument({
            slug,
            title,
            content,
            sections: planGenerator.parseDocument(content),
            todoCount: planGenerator.extractTodos(content).length,
            createdAt: Date.now()
          });
          const researchContext =
            plan.planAdapter.session.getState().researchFindings ||
            buildPlanResearchContext(plan.planController) ||
            content;
          const goalFallback =
            plan.planAdapter.session.getState().goal ||
            textFromPlanController(plan.planController) ||
            title;
          await plan.planAdapter.ensureStructuredPlan({
            goalFallback,
            researchContext,
            generate: () =>
              plan.requestPlanGenerate({
                goal: goalFallback,
                researchContext,
                rejectionFeedback: plan.planAdapter.session.getState().rejectionFeedback.slice(-1)[0]
              })
          });
          await plan.planAdapter.approve();
          await plan.planController.advanceToBuild();
          plan.setShowPlanReview(false);
          plan.setPlanStage('build');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not start Build from the editor.');
        }
      })();
    },
    'plan.openReviewFromEditor': (data) => {
      const content = String(data.content || '').trim();
      if (!content) {
        setError('Editor Plan is empty — cannot open Review.');
        return;
      }
      setMode('plan');
      const slugRaw = String(data.slug || '');
      plan.promotePlanToReview(content, { slug: slugRaw, title: String(data.title || '') });
    },
    'inline.edit.request': (data) => {
      const parsed = parseInlineEditHostMessage(data);
      if (!parsed) return;
      setInlineEditSeed(parsed.context);
      if (parsed.instruction) setComposerSeed({ text: parsed.instruction, nonce: Date.now() });
    }
  });
}
