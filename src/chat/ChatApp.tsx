/**
 * ChatApp - 메인 채팅 애플리케이션 (C5-C7 UI 통합)
 *
 * mode=plan → PlanModeHeader + ClarifyingQuestions/PlanEditor
 * mode=debug → DebugModeUI 패널
 * ⚙️ 설정 → SettingsPanel
 * ask_question 도구 → ClarifyingQuestions 모달
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MessageBubble } from './components/MessageBubble';
import { Composer } from './components/Composer';
import { ModeSelector } from './components/ModeSelector';
import { useChatStream } from './hooks/useChatStream';
import { configManager } from '../core/ConfigManager';
import type { ChatMessage, Mode, StreamDelta, Attachment } from './types';
import './chat.css';

// C5-C7 UI 컴포넌트 (RW-C57-02: ChatApp 마운트)
import { PlanModeHeader } from './components/PlanModeHeader';
import type { PlanStage } from '../plan/PlanModeController';
import { PlanModeController } from '../plan/PlanModeController';
import { ClarifyingQuestions } from '../plan/ClarifyingQuestions';
import { PlanEditor } from '../plan/PlanEditor';
import { DebugModeUI } from './components/DebugModeUI';
import { DebugTimeline } from './components/DebugTimeline';
import { DebugModeController } from '../debug/DebugModeController';
import type { DebugStage, Hypothesis } from '../debug/DebugModeController';
import { SettingsPanel } from '../settings/SettingsPanel';
// RW-C5-02: ask_question 도구 → ClarifyingQuestions 브리지
import { askQuestionTool } from '../tools/session/AskQuestionTool';
import type { PendingQuestion } from '../tools/session/AskQuestionTool';
// RW-C5-04: Plan → Agent 핸드오프
import { PlanToAgent } from '../plan/PlanToAgent';
// RW-C6-05-R2: ReproduceUI 대기 루프
import { ReproduceUI } from '../debug/ReproduceUI';
import { requestReproduceTool } from '../tools/debug/RequestReproduceTool';
import { RuntimeServices } from '../core/RuntimeServices';
// RW-P0-04: Interrupt & Resynthesize
import { MessageQueue } from '../loop/MessageQueue';
import { QueueUI } from './components/MessageQueueUI';
import { StopHandler } from '../loop/StopHandler';
import { buildResynthesizeMessages, stripResynthForDisplay } from '../loop/synthesizeInstructions';
import type { AgentMessage } from '../loop/AgentLoopController';
// RW-C7-05 / RW-C7-06 / RW-C7-10
import { DesignModePanel, designModeContext } from '../browser/DesignModePanel';
import { FindingList } from '../review/FindingList';
import { AcceptFix } from '../review/AcceptFix';
import type { ReviewFinding } from '../review/AgentReviewLoop';
import { ArtifactGallery } from '../artifacts/ArtifactGallery';
import type { Artifact } from '../artifacts/ArtifactStore';
import { UXForMediumPanel } from '../harness/UXForMediumPanel';
import type { HarnessUXState, UXEventType } from '../harness/UXForMedium';
import {
  buildHarnessTurnContext,
  prependHarnessToUserPayload,
  stripHarnessForDisplay
} from './harnessBridge';
import { stripFakeToolMarkup } from './displaySanitize';

const MODE_LABELS: Record<Mode, string> = {
  ask: 'Ask',
  agent: 'Agent',
  plan: 'Plan',
  debug: 'Debug'
};

const MODE_TOOLTIPS: Record<Mode, string> = {
  ask: 'Read-only exploration. No file edits.',
  agent: 'Autonomous implementation. Tools: read, edit, terminal.',
  plan: 'Design first. Outputs PLAN.md with Mermaid.',
  debug: 'Hypothesis → Instrument → Reproduce → Minimal fix.'
};

const STORAGE_KEY = 'agent-k.chat.history';

export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored) as ChatMessage[];
      // 이전 버전에서 harness/resynth 래퍼가 user content에 저장된 이력 정리
      return parsed.map((m) => {
        if (m.role === 'user') {
          let content = stripHarnessForDisplay(m.content);
          content = stripResynthForDisplay(content);
          return { ...m, content };
        }
        // Strip fake [todo_write] markup left in saved assistant bubbles
        if (m.role === 'assistant') {
          return { ...m, content: stripFakeToolMarkup(m.content) };
        }
        return m;
      }).map((m) =>
        m.role === 'assistant' && m.status === 'streaming'
          ? { ...m, status: m.content?.trim() ? 'complete' : 'error', content: m.content?.trim() || '(interrupted)' }
          : m
      );
    } catch {
      return [];
    }
  });
  const [mode, setMode] = useState<Mode>('agent');
  const [error, setError] = useState<string | null>(null);

  // HARB: 중급 모델 UX 상태바
  const [uxState, setUxState] = useState<HarnessUXState>({
    tier: 'A',
    modelName: 'flash',
    toolsUsed: 0,
    maxTools: 4,
    prefetchCount: 0,
    prefetchLatencyMs: 0,
    verificationRetries: 0,
    doomLoopDetected: false,
    latencyMs: 0,
    contextTokens: 0
  });
  const [stuckEvent, setStuckEvent] = useState<UXEventType | null>(null);

  // Cursor-style: steps attach to the streaming assistant bubble (not a top panel)
  const stepStartRef = useRef<Record<string, number>>({});

  // ─── C5-C7 UI 상태 ─────────────────────────────────────
  // Plan mode state
  const [planController] = useState(() => new PlanModeController());
  const [planStage, setPlanStage] = useState<PlanStage>('research');
  const [showClarifying, setShowClarifying] = useState(false);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  // Clarifying questions via AskQuestionTool bridge (RW-C5-02)
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  /** True while host is blocked on ask_question — Composer shows Waiting… not Streaming… */
  const [awaitingUser, setAwaitingUser] = useState(false);

  // Debug mode controller (RW-C6-01)
  const [debugController] = useState(() => new DebugModeController());
  const [, setDebugTick] = useState(0);
  // RW-C6-05-R2: Reproduce overlay
  const [showReproduce, setShowReproduce] = useState(false);
  const [reproduceSteps, setReproduceSteps] = useState<{ order: number; description: string }[]>([]);
  const [reproduceHypothesisId, setReproduceHypothesisId] = useState('debug');

  // Settings / Design / Review / Artifacts
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'models' | 'secrets' | 'permission' | 'queue' | 'harness' | 'context' | 'mcp' | 'features' | 'privacy'>('models');
  const [showDesignMode, setShowDesignMode] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewFindings, setReviewFindings] = useState<ReviewFinding[]>([]);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  // RW-P0-04: MessageQueue (debounce from config, default 300ms)
  const [msgQueue] = useState(() => {
    const ms =
      Number(configManager.get('agent-k.queue.resynthesizeDebounceMs')) ||
      Number(configManager.get('agent-k.queue.debounceMs')) ||
      300;
    return new MessageQueue(ms);
  });
  const [queueTick, setQueueTick] = useState(0);
  const stopHandlerRef = useRef<StopHandler | null>(null);

  const { streaming, sendMessage, stop, regenerate } = useChatStream({
    baseUrl: configManager.get('agent-k.provider.baseUrl') || 'http://127.0.0.1:52415',
    model: configManager.get('agent-k.provider.model') || 'mlx-community/Qwen3.6-35B-A3B-4bit',
    apiKey: configManager.get('agent-k.provider.apiKey') || undefined
  });

  const queuedMessageRef = useRef<string | null>(null);
  const turnNumberRef = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  /** Bumped on stop/resynth so in-flight handleSend (awaiting harness) is abandoned. */
  const sendEpochRef = useRef(0);

  useEffect(() => {
    return msgQueue.subscribe(() => setQueueTick((t) => t + 1));
  }, [msgQueue]);

  useEffect(() => {
    stopHandlerRef.current = new StopHandler({ abort: stop, queue: msgQueue });
  }, [stop, msgQueue]);

  /**
   * Clear history: stop stream if needed, empty UI + localStorage, clear error.
   * Allowed while streaming (stop first, then clear).
   */
  const handleClearHistory = useCallback(() => {
    if (streaming) {
      stopHandlerRef.current?.stop('user_stop');
      sendEpochRef.current += 1; // abandon in-flight harness/send
    }
    setMessages([]);
    stepStartRef.current = {};
    localStorage.removeItem(STORAGE_KEY);
    setError(null);
  }, [streaming]);

  /** New chat = same transcript reset as Clear */
  const handleNewChat = useCallback(() => {
    handleClearHistory();
  }, [handleClearHistory]);

  // Host commands → panel toggles + session clear/new (RW-C7-05/06/10)
  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      // Title-bar Clear / New posts these; mirror header button handlers
      if (data.type === 'session.clear' || data.type === 'session.new') {
        handleClearHistory();
        return;
      }
      if (data.type === 'ui.design.open') setShowDesignMode(true);
      if (data.type === 'ui.review.open') {
        setShowReview(true);
        // Static sample findings when git review not available in webview
        setReviewFindings((prev) =>
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
      if (data.type === 'ui.artifacts.open') setShowArtifacts(true);
      if (data.type === 'settings.open') {
        if (typeof data.tab === 'string') setSettingsTab(data.tab);
        setShowSettings(true);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [handleClearHistory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  // Process queued message when streaming completes (legacy single-slot + MessageQueue queue_only)
  useEffect(() => {
    if (!streaming && queuedMessageRef.current) {
      const queued = queuedMessageRef.current;
      queuedMessageRef.current = null;
      handleSend(queued, []);
    }
  }, [streaming]);

  // RW-C6-05-R2: mount ReproduceUI when tool wait starts (callback + poll)
  useEffect(() => {
    requestReproduceTool.onPendingCallback((req) => {
      setReproduceHypothesisId(req.hypothesisId);
      setReproduceSteps(req.steps.map((s, i) => ({ order: i + 1, description: s })));
      setShowReproduce(true);
    });
    const id = setInterval(() => {
      const pending = RuntimeServices.isReproducePending();
      if (pending && !showReproduce) {
        const req = requestReproduceTool.getPending();
        setReproduceHypothesisId(req?.hypothesisId || 'active');
        setReproduceSteps(
          (req?.steps || ['Follow the reproduce steps, then click Reproduced.']).map((s, i) => ({
            order: i + 1,
            description: s
          }))
        );
        setShowReproduce(true);
      }
      if (!pending && showReproduce) {
        setShowReproduce(false);
      }
    }, 400);
    return () => {
      clearInterval(id);
      requestReproduceTool.onPendingCallback(() => {});
    };
  }, [showReproduce]);

  const handleReproduced = useCallback(() => {
    RuntimeServices.resolveReproduce(true);
    setShowReproduce(false);
  }, []);

  const handleReproduceCancel = useCallback(() => {
    RuntimeServices.resolveReproduce(false);
    setShowReproduce(false);
  }, []);

  // ─── Plan mode lifecycle (RW-C5-01) ───────────────────
  useEffect(() => {
    planController.onStageChangeCallback((stage: PlanStage) => {
      setPlanStage(stage);
      setShowClarifying(stage === 'questions');
      setShowPlanEditor(stage === 'planning' || stage === 'review');
    });
    // Build-ready: switch to Agent mode with plan context (RW-C5-04)
    planController.onBuildReadyCallback((_context: string) => {
      const planState = planController.getState();
      if (planState.planDocument) {
        const planToAgent = new PlanToAgent();
        planToAgent.setPlanDocument(planState.planDocument);
        const transition = planToAgent.buildTransitionContext(
          planState.planDocument,
          planState.researchResults,
          planState.questions.map(q => ({ question: q.question, answer: q.answer }))
        );
        // Set mode to agent — tools like edit_file/write_file become available
        setMode('agent');
        setMessages([]);
        // Queue the plan execution context as the first agent message
        const msgContent: string = transition.messages[0]?.content ?? _context;
        queuedMessageRef.current = msgContent;
      } else {
        // Fallback: simple context string
        setMode('agent');
        setMessages([]);
        queuedMessageRef.current = `I have approved the plan. Here is the context:\n\n${_context}\n\nPlease execute the plan step by step.`;
      }
    });
  }, [planController]);

  // ─── AskQuestionTool in-process callback (same-bundle tests only)
  // Live Agent path uses host postMessage ask_question → delta.askQuestion
  useEffect(() => {
    askQuestionTool.onNewQuestionCallback((q: PendingQuestion) => {
      setPendingQuestions(prev => {
        if (prev.find(p => p.id === q.id)) return prev;
        planController.addQuestion({ id: q.id, question: q.question });
        return [...prev, q];
      });
      setShowClarifying(true);
      setAwaitingUser(true);
    });
    return () => {
      askQuestionTool.onNewQuestionCallback(() => {});
    };
  }, [planController]);

  // ─── Debug mode lifecycle (RW-C6-01) ──────────────────
  // Force re-render when debug controller state changes
  useEffect(() => {
    debugController.onStageChangeCallback((_stage: DebugStage) => {
      setDebugTick(t => t + 1);
    });
  }, [debugController]);

  // Reset debug when switching away from debug mode
  useEffect(() => {
    if (mode !== 'debug') {
      debugController.reset();
    }
  }, [mode]);

  // Reset plan when switching away from plan mode
  useEffect(() => {
    if (mode !== 'plan') {
      planController.reset();
      askQuestionTool.clear();
      setPlanStage('research');
      setShowClarifying(false);
      setShowPlanEditor(false);
      setPendingQuestions([]);
    } else {
      // Start plan flow on entering plan mode (RW-C5-01 AC1)
      planController.run('Planning session started');
    }
  }, [mode]);

  /**
   * Remove orphan empty streaming assistants; finalize non-empty ones.
   * Prevents hourglass bubbles left after abort/stop/resynth.
   */
  const cleanupStreamingAssistants = useCallback((prev: ChatMessage[]): ChatMessage[] => {
    const out: ChatMessage[] = [];
    for (const m of prev) {
      if (m.role === 'assistant' && m.status === 'streaming') {
        if (!m.content?.trim()) continue; // drop empty placeholder
        out.push({ ...m, status: 'complete' }); // keep partial text
      } else {
        out.push(m);
      }
    }
    return out;
  }, []);

  // ─── Message handler ───────────────────────────────────
  /**
   * @param text - UI bubble에 보여줄 사용자 입력 (깨끗한 텍스트)
   * @param files - attachments
   * @param opts.apiUserContent - API 전용 본문 (resynth wrapper 등). 없으면 text 사용
   */
  const handleSend = useCallback(async (
    text: string,
    files: Attachment[],
    opts?: { apiUserContent?: string }
  ) => {
    if (!text.trim() && files.length === 0) return;
    setError(null);

    const epoch = ++sendEpochRef.current;

    // Prefetch는 사용자 의도 + 드롭 첨부(@file/@folder) 기준
    const displayText = text;
    const mentionBlock = files
      .map((f) =>
        f.type === 'folder' ? `@folder:${f.path}` : `@file:${f.path}`
      )
      .join('\n');
    let payload = opts?.apiUserContent ?? text;
    if (mentionBlock) {
      // API/harness: Cursor-like context from chips (UI bubble keeps plain text + chips)
      payload = payload.trim()
        ? `${mentionBlock}\n\n${payload}`
        : `${mentionBlock}\n\nPlease analyze the attached path(s).`;
    }

    // RW-C7-05: prepend Design Mode annotations into user turn context
    const designCtx = designModeContext.getLastContext();
    if (designCtx?.hasAnnotations && designCtx.contextBlock) {
      payload = `${designCtx.contextBlock}\n\n---\n\n${payload}`;
    }

    // HARB: Prefetch + ContextAssembler → user payload 주입 (API only)
    try {
      const t0 = Date.now();
      const prefetchSource = [mentionBlock, displayText].filter(Boolean).join('\n');
      const harnessCtx = await buildHarnessTurnContext(prefetchSource || displayText, mode, 'A');
      if (epoch !== sendEpochRef.current) return; // superseded by stop/resynth
      payload = prependHarnessToUserPayload(payload, harnessCtx, mode);
      const fileHits = (harnessCtx.prefetchRaw.match(/Read file:/g) || []).length;
      setUxState((prev) => ({
        ...prev,
        tier: 'A',
        prefetchCount: fileHits || (harnessCtx.prefetchRaw ? 1 : 0),
        prefetchLatencyMs: Date.now() - t0
      }));
      setStuckEvent(null);
    } catch {
      if (epoch !== sendEpochRef.current) return;
      /* prefetch 실패는 비치명 */
    }

    if (epoch !== sendEpochRef.current) return;

    // UI: 사용자 입력만 — harness/resynth wrapper는 API 요청에만 주입
    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: displayText,
      timestamp: Date.now(),
      attachments: files,
      status: 'complete'
    };
    const assistantMsg: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming'
    };

    // Snapshot + clean before append (avoid stale closure undoing interrupt cleanup)
    const cleaned = cleanupStreamingAssistants(messagesRef.current);
    const nextMessages = [...cleaned, userMsg, assistantMsg];
    const apiMessages = nextMessages
      .filter((m) => m.id !== assistantMsg.id)
      .map((m) => (m.id === userMsg.id ? { ...m, content: payload } : m));
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    // Fresh steps for this assistant bubble (Cursor-style, on the message)
    stepStartRef.current = {};
    turnNumberRef.current += 1;

    // AgentLoop status → toolStatus (never mix into content)
    let sawProse = false;

    sendMessage(
      payload,
      files,
      apiMessages,
      mode,
      // onDelta — timeline (PRD-C0 §5.3) | ask_question | status | streamed prose
      (delta: StreamDelta) => {
        if (epoch !== sendEpochRef.current) return;
        // Host ask_question → show ClarifyingQuestions (webview cannot see host singleton)
        if (delta.askQuestion?.id && delta.askQuestion.question) {
          const q = delta.askQuestion;
          setPendingQuestions((prev) => {
            if (prev.find((p) => p.id === q.id)) return prev;
            planController.addQuestion({ id: q.id, question: q.question });
            return [
              ...prev,
              {
                id: q.id,
                question: q.question,
                options: q.options,
                required: q.required !== false,
                answered: false,
              },
            ];
          });
          setShowClarifying(true);
          setAwaitingUser(true);
          return;
        }
        // Cursor-style: append/upsert steps on the streaming assistant bubble
        if (delta.timeline) {
          const tl = delta.timeline;
          // Cursor-quiet: drop Planning/Done noise; keep thinking done so turns collapse
          if (tl.kind === 'planning' || tl.kind === 'done') {
            return;
          }
          const id =
            tl.id ||
            `step_${tl.kind}_${tl.turn}_${tl.toolName || 'x'}_${Date.now()}`;
          const now = Date.now();
          if (!stepStartRef.current[id]) stepStartRef.current[id] = now;
          const durationMs =
            tl.itemStatus === 'done' || tl.itemStatus === 'error'
              ? now - stepStartRef.current[id]
              : undefined;
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (
              lastIdx < 0 ||
              prev[lastIdx].role !== 'assistant' ||
              prev[lastIdx].status !== 'streaming'
            ) {
              return prev;
            }
            const msg = prev[lastIdx];
            const steps = [...(msg.steps || [])];
            const idx = steps.findIndex((s) => s.id === id);
            const nextStep = {
              id,
              kind: tl.kind,
              label: tl.label,
              // Preserve Thought text when host closes thinking without re-sending detail
              detail: tl.detail !== undefined ? tl.detail : steps[idx]?.detail,
              toolName: tl.toolName,
              turn: tl.turn,
              itemStatus: tl.itemStatus,
              durationMs: durationMs ?? steps[idx]?.durationMs
            };
            if (idx >= 0) steps[idx] = { ...steps[idx], ...nextStep };
            else steps.push(nextStep);
            const copy = [...prev];
            copy[lastIdx] = { ...msg, steps };
            return copy;
          });
          return;
        }
        // Ask-path / direct: append reasoning chunks into Thought step
        if (delta.reasoning) {
          const id = `tl_thinking_${turnNumberRef.current || 1}`;
          const now = Date.now();
          if (!stepStartRef.current[id]) stepStartRef.current[id] = now;
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (
              lastIdx < 0 ||
              prev[lastIdx].role !== 'assistant' ||
              prev[lastIdx].status !== 'streaming'
            ) {
              return prev;
            }
            const msg = prev[lastIdx];
            const steps = [...(msg.steps || [])];
            const idx = steps.findIndex((s) => s.id === id);
            const prevDetail = idx >= 0 ? steps[idx].detail || '' : '';
            const nextStep = {
              id,
              kind: 'thinking',
              label: 'Thought',
              detail: prevDetail + delta.reasoning,
              turn: turnNumberRef.current || 1,
              itemStatus: 'running' as const
            };
            if (idx >= 0) steps[idx] = { ...steps[idx], ...nextStep };
            else steps.push(nextStep);
            const copy = [...prev];
            copy[lastIdx] = { ...msg, steps };
            return copy;
          });
          return;
        }
        if (delta.status !== undefined) {
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
              const newMsgs = [...prev];
              newMsgs[lastIdx] = {
                ...newMsgs[lastIdx],
                toolStatus: undefined, // status lives in MessageSteps now
                content: sawProse ? newMsgs[lastIdx].content : ''
              };
              return newMsgs;
            }
            return prev;
          });
          return;
        }
        if (delta.content) {
          sawProse = true;
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
              const newMsgs = [...prev];
              newMsgs[lastIdx] = {
                ...newMsgs[lastIdx],
                toolStatus: undefined,
                content: (newMsgs[lastIdx].content || '') + delta.content!
              };
              return newMsgs;
            }
            return prev;
          });
        }
      },
      // onComplete - sanitize display + mark complete; close any stuck running steps
      () => {
        if (epoch !== sendEpochRef.current) return;
        setAwaitingUser(false);
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
            const newMsgs = [...prev];
            let content = stripFakeToolMarkup(newMsgs[lastIdx].content);
            // Drop leftover status if somehow still in content
            if (/^🔧/.test(content.trim()) && content.length < 80) {
              content = '';
            }
            const prevSteps = newMsgs[lastIdx].steps || [];
            const steps = prevSteps.map((s) =>
              s.itemStatus === 'running' ? { ...s, itemStatus: 'done' as const } : s
            );
            newMsgs[lastIdx] = {
              ...newMsgs[lastIdx],
              status: content.trim() ? 'complete' : 'error',
              toolStatus: undefined,
              content: content.trim() || '(no response)',
              steps
            };
            return newMsgs;
          }
          return prev;
        });
        if (mode === 'plan' && planStage === 'research' && planController.getQuestions().length > 0) {
          setShowClarifying(true);
        }
      },
      // onError (incl. idle timeout) — collapse steps so UI is not stuck Thinking
      (err: string) => {
        if (epoch !== sendEpochRef.current) return;
        setAwaitingUser(false);
        setError(err);
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
            const newMsgs = [...prev];
            const prevSteps = newMsgs[lastIdx].steps || [];
            const steps = prevSteps.map((s) =>
              s.itemStatus === 'running' ? { ...s, itemStatus: 'error' as const } : s
            );
            newMsgs[lastIdx] = {
              ...newMsgs[lastIdx],
              status: 'error',
              toolStatus: undefined,
              steps,
              content: newMsgs[lastIdx].content?.trim()
                ? `${newMsgs[lastIdx].content}\n\n⚠ ${err}`
                : err
            };
            return newMsgs;
          }
          return prev;
        });
      }
    );
  }, [mode, sendMessage, planStage, planController, cleanupStreamingAssistants]);

  /** Alt+Enter: Queue-only — no abort (RW-P0-04) */
  const handleQueueMessage = useCallback((text: string) => {
    msgQueue.enqueue(text, 'queue_only');
    if (!streaming) {
      // Idle: flush immediately as normal send
      const drained = msgQueue.drain();
      if (drained[0]) handleSend(drained.join('\n'), []);
    }
  }, [msgQueue, streaming, handleSend]);

  /**
   * Enter while streaming: Interrupt & Resynthesize (RW-P0-04).
   * UI bubble = user typed text only; API gets synthesizeInstructions wrapper.
   * Empty text → drain queue and resynthesize with drained texts.
   */
  const handleResynthesize = useCallback((text: string) => {
    stopHandlerRef.current?.interruptForResynthesize();
    // Invalidate any handleSend still awaiting harness from a prior turn
    sendEpochRef.current += 1;
    const drained = msgQueue.drain();
    // Do NOT enqueue resynthesize into MessageQueue — that left stuck "Resynth" badges
    // (onProcess is unused; ChatApp drives resynth directly).
    const instruction = [text, ...drained].filter(Boolean).join('\n');

    const cleaned = cleanupStreamingAssistants(messagesRef.current);
    setMessages(cleaned);

    // Abort path with no new instruction: just clean UI so composer is usable
    if (!instruction.trim()) return;

    const agentMsgs: AgentMessage[] = cleaned.map((m) => ({
      role: m.role as AgentMessage['role'],
      content: m.content,
      name: undefined
    }));
    const rebuilt = buildResynthesizeMessages(
      agentMsgs,
      instruction,
      turnNumberRef.current,
      mode
    );
    const synthesisText = rebuilt[rebuilt.length - 1]?.content || instruction;

    // Defer send so abort settles; display=instruction, API=wrapper
    const epochAtSchedule = sendEpochRef.current;
    setTimeout(() => {
      if (epochAtSchedule !== sendEpochRef.current) return; // another interrupt won
      handleSend(instruction, [], { apiUserContent: synthesisText });
    }, 50);
  }, [msgQueue, mode, handleSend, cleanupStreamingAssistants]);

  /** Stop button — abort + clear streaming orphans; composer accepts new messages */
  const handleStop = useCallback(() => {
    stopHandlerRef.current?.stop('user_stop');
    sendEpochRef.current += 1; // abandon in-flight handleSend awaiting harness
    setAwaitingUser(false);
    setShowClarifying(false);
    setMessages(cleanupStreamingAssistants);
    setError(null);
  }, [cleanupStreamingAssistants]);

  const handleQueueApplyNow = useCallback((messageId: string) => {
    const msg = msgQueue.applyNow(messageId);
    if (msg) {
      handleResynthesize(msg.text);
    }
  }, [msgQueue, handleResynthesize]);

  const handleQueueCancel = useCallback((_messageId: string) => {
    msgQueue.cancelQueued();
  }, [msgQueue]);

  const acceptFix = useRef(new AcceptFix()).current;
  const handleAcceptFinding = useCallback(async (id: string) => {
    const finding = reviewFindings.find((f) => f.id === id);
    if (!finding) return;
    const result = await acceptFix.accept(finding);
    if (result.applied && result.patch) {
      setArtifacts((prev) => [
        {
          id: `art-${Date.now()}`,
          type: 'diff',
          title: `Fix ${finding.file}`,
          description: finding.message,
          data: result.patch!,
          filePath: finding.file,
          timestamp: Date.now(),
          tags: ['review', 'fix']
        },
        ...prev
      ]);
    }
    setReviewFindings((prev) => prev.filter((f) => f.id !== id));
  }, [reviewFindings, acceptFix]);

  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      const newMessages = [...prev];
      newMessages.splice(idx + 1);
      newMessages[idx] = { ...newMessages[idx], content: newContent };
      return newMessages;
    });
    const msg = messages.find((m) => m.id === messageId);
    if (msg?.role === 'user') {
      handleSend(newContent, msg.attachments || []);
    }
  }, [messages, handleSend]);

  const handleRetry = useCallback((messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    const msg = messages[idx];
    if (!msg) return;
    setMessages((prev) => prev.slice(0, idx));
    if (msg.role === 'user') {
      handleSend(msg.content, msg.attachments || []);
    }
  }, [messages, handleSend]);

  const handleDelete = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const handleModeChange = useCallback((newMode: Mode) => {
    if (newMode !== mode) {
      setMode(newMode);
      setMessages([]);
      stepStartRef.current = {};
      setShowSettings(false);
    }
  }, [mode]);

  // ─── C5-C7 핸들러 ─────────────────────────────────────

  /** Plan/Agent: 질문 답변 → host RuntimeServices.resolveQuestion */
  const handlePlanAnswer = useCallback((id: string, answer: string) => {
    setPendingQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, answer, answered: true } : q))
    );
    // Resolve host waiter (Extension Development Host path)
    try {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({ type: 'chat.answer', qid: id, answer });
    } catch {
      /* ignore */
    }
    // Same-bundle fallback (unit tests)
    askQuestionTool.answerQuestion(id, answer);
    planController.answerQuestion(id, answer);
    // Agent mode: one question → dismiss UI; loop resumes after host resolves
    if (mode !== 'plan') {
      setShowClarifying(false);
      setAwaitingUser(false);
    }
  }, [planController, mode]);

  /** Plan: 질문 완료 → Planning 단계 진입 (agent ask_question: just dismiss UI) */
  const handleQuestionsComplete = useCallback(() => {
    if (mode === 'plan') {
      planController.moveToPlanning().catch(() => {
        setError('All questions must be answered before planning.');
      });
    }
    setShowClarifying(false);
    setAwaitingUser(false);
  }, [planController, mode]);

  /** Plan/Agent: 질문 취소 — must unblock host waiter */
  const handleQuestionsCancel = useCallback(() => {
    try {
      const api = (window as any).__vscodeApi || (window as any).acquireVsCodeApi?.();
      api?.postMessage?.({ type: 'chat.question.cancel' });
    } catch {
      /* ignore */
    }
    askQuestionTool.clear();
    setShowClarifying(false);
    setPendingQuestions([]);
    setAwaitingUser(false);
  }, []);

  /** Plan: 에디터 저장 */
  const handlePlanSave = useCallback((content: string) => {
    const doc = planController.getState().planDocument;
    if (doc) {
      planController.setPlanDocument({ ...doc, content });
      planController.moveToReview().catch(() => {});
    }
    setShowPlanEditor(false);
  }, [planController]);

  /** Plan: 에디터 취소 */
  const handlePlanCancel = useCallback(() => {
    setShowPlanEditor(false);
    planController.reset();
    setPlanStage('research');
  }, [planController]);

  /** Plan: 스테이지 클릭 */
  const handleStageClick = useCallback((stage: PlanStage) => {
    if (stage === 'questions') setShowClarifying(true);
    if (stage === 'planning' || stage === 'review') setShowPlanEditor(true);
  }, []);

  /** Debug: 가설 선택 → 계측 단계 진입 (RW-C6-01) */
  const handleSelectHypothesis = useCallback((id: string) => {
    try {
      debugController.selectHypothesis(id);
      setDebugTick(t => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to select hypothesis');
    }
  }, [debugController]);

  /** Settings 토글 — 명시적 type=button + 라벨 (아이콘만이면 클릭 인식이 애매함) */
  const handleToggleSettings = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setShowSettings((prev) => {
      const next = !prev;
      console.log('[Agent K] Settings toggle →', next);
      return next;
    });
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  // ─── Render ────────────────────────────────────────────
  return (
    <div className="chat-container" data-ak-ui="v0.0.2">
      <header className="chat-header">
        <ModeSelector
          value={mode}
          onChange={handleModeChange}
          disabled={streaming}
          labels={MODE_LABELS}
          tooltips={MODE_TOOLTIPS}
        />
        <div className="chat-actions">
          <button type="button" onClick={handleNewChat} title="New Chat">
            New
          </button>
          <button
            type="button"
            onClick={handleClearHistory}
            title="Clear History"
          >
            Clear
          </button>
          <button
            type="button"
            className="settings-open-btn"
            onClick={handleToggleSettings}
            title="Open Settings"
            aria-pressed={showSettings}
          >
            Settings
          </button>
        </div>
      </header>

      <UXForMediumPanel
        uxState={uxState}
        stuckEvent={stuckEvent}
        onAction={(action) => {
          if (action.toLowerCase().includes('stop')) {
            setStuckEvent(null);
          }
        }}
      />

      {/* RW-P0-04: Queue UI (queueTick forces re-render on subscribe) */}
      <QueueUI
        key={queueTick}
        messages={msgQueue.state.messages}
        isProcessing={msgQueue.state.isProcessing}
        onApplyNow={handleQueueApplyNow}
        onCancel={handleQueueCancel}
      />

      {showDesignMode && (
        <DesignModePanel onClose={() => setShowDesignMode(false)} />
      )}

      {showReview && (
        <div style={{ padding: 8, borderBottom: '1px solid var(--vscode-panel-border, #444)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong>Code Review</strong>
            <button type="button" onClick={() => setShowReview(false)}>Close</button>
          </div>
          <FindingList
            findings={reviewFindings}
            onAccept={handleAcceptFinding}
            onDismiss={(id) => setReviewFindings((prev) => prev.filter((f) => f.id !== id))}
            onAcceptAll={() => {
              reviewFindings.forEach((f) => void handleAcceptFinding(f.id));
            }}
          />
        </div>
      )}

      {showArtifacts && (
        <ArtifactGallery
          artifacts={artifacts}
          onClose={() => setShowArtifacts(false)}
        />
      )}

      {/* ── Plan Mode Header ────────────────────────────── */}
      {mode === 'plan' && (
        <PlanModeHeader
          currentStage={planStage}
          stages={['research', 'questions', 'planning', 'review', 'build']}
          onStageClick={handleStageClick}
        />
      )}

      {/* ── Debug Mode UI + Timeline (RW-C6-01 / RW-C6-03-R2) ── */}
      {mode === 'debug' && (
        <>
          <DebugTimeline
            currentStage={debugController.getStage()}
            hypothesisCount={debugController.getHypotheses().length}
            logsCollected={debugController.getState().logs.length}
            markersRemaining={debugController.remainingMarkers}
            verified={debugController.getState().verified}
            evidenceCount={debugController.getState().browserEvidenceCount}
          />
          <DebugModeUI
            currentStage={debugController.getStage()}
            hypotheses={debugController.getHypotheses()}
            activeHypothesisId={debugController.getState().activeHypothesisId}
            onSelectHypothesis={handleSelectHypothesis}
          />
        </>
      )}

      {/* ── Reproduce UI (RW-C6-05-R2) ── */}
      {showReproduce && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 12,
          padding: '8px 12px',
          background: 'var(--vscode-sideBar-background, #252526)',
          borderBottom: '1px solid rgba(239,68,68,0.35)'
        }}>
          <ReproduceUI
            hypothesisId={reproduceHypothesisId}
            hypothesisTitle={reproduceHypothesisId}
            steps={reproduceSteps}
            onReproduced={handleReproduced}
            onCancel={handleReproduceCancel}
          />
        </div>
      )}

      {/* ── Clarifying Questions Modal (RW-C5-02) ──────── */}
      {showClarifying && pendingQuestions.length > 0 && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          padding: '8px 12px',
          background: 'var(--vscode-sideBar-background, #252526)',
          borderBottom: '1px solid rgba(250,204,21,0.2)',
          maxHeight: '40vh', overflow: 'auto'
        }}>
          <ClarifyingQuestions
            questions={pendingQuestions.map(q => ({
              id: q.id,
              type: q.options ? 'single' as const : 'text' as const,
              question: q.question,
              options: q.options,
              required: q.required,
              answer: q.answer
            }))}
            onAnswer={handlePlanAnswer}
            onComplete={handleQuestionsComplete}
            onCancel={handleQuestionsCancel}
          />
        </div>
      )}

      {/* ── Plan Editor Overlay (RW-C57-02-R2 / RW-C5-03-R2: Mermaid via PlanEditor) ── */}
      {(showPlanEditor || (mode === 'plan' && (planStage === 'planning' || planStage === 'review'))) && (
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: '50%',
          minWidth: 320, zIndex: 15,
          background: 'var(--vscode-editor-background, #1e1e1e)',
          borderLeft: '1px solid var(--vscode-panel-border, #333)',
          overflow: 'auto',
          boxShadow: '-4px 0 12px rgba(0,0,0,0.3)'
        }}>
          <PlanEditor
            document={planController.getState().planDocument || { slug: 'plan', title: 'Plan', content: '```mermaid\nflowchart TD\n  A[Start] --> B[Plan]\n```\n', sections: [], todoCount: 0, createdAt: Date.now() }}
            onSave={handlePlanSave}
            onCancel={handlePlanCancel}
          />
        </div>
      )}

      {/* ── Settings Panel ──────────────────────────────── */}
      {showSettings && (
        <div className="settings-overlay" role="dialog" aria-label="Settings">
          <SettingsPanel
            key={settingsTab}
            initialTab={settingsTab}
            onClose={handleCloseSettings}
          />
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/*
        Simple scrollable list (not VirtualList): fixed itemHeight virtualization
        overlaps variable-height markdown/mermaid bubbles in the sidebar webview.
        사이드바 웹뷰에서는 가변 높이 메시지에 고정-높이 VirtualList가 겹침을 유발하므로
        일반 스크롤 리스트로 안정적으로 표시한다.
      */}
      <div className="message-list" role="log" aria-live="polite" aria-relevant="additions">
        {messages.map((item) => (
          <MessageBubble
            key={item.id}
            message={item}
            isStreaming={streaming && messages[messages.length - 1]?.id === item.id}
            onEdit={handleEditMessage}
            onRetry={handleRetry}
            onDelete={handleDelete}
            onCopy={(content) => navigator.clipboard.writeText(content)}
          />
        ))}
      </div>

      <footer className="chat-footer">
        <Composer
          onSend={handleSend}
          disabled={streaming}
          onStop={handleStop}
          onRegenerate={() => {
            stepStartRef.current = {};
            regenerate(
              messages,
              mode,
              (delta: StreamDelta) => {
                if (delta.timeline) {
                  const tl = delta.timeline;
          // Cursor-quiet: drop Planning/Done; keep thinking done so turns collapse
          if (tl.kind === 'planning' || tl.kind === 'done') {
            return;
          }
          const id =
            tl.id ||
            `step_${tl.kind}_${tl.turn}_${tl.toolName || 'x'}_${Date.now()}`;
          const now = Date.now();
          if (!stepStartRef.current[id]) stepStartRef.current[id] = now;
          const durationMs =
            tl.itemStatus === 'done' || tl.itemStatus === 'error'
              ? now - stepStartRef.current[id]
              : undefined;
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (
              lastIdx < 0 ||
              prev[lastIdx].role !== 'assistant' ||
              prev[lastIdx].status !== 'streaming'
            ) {
              return prev;
            }
            const msg = prev[lastIdx];
            const steps = [...(msg.steps || [])];
            const idx = steps.findIndex((s) => s.id === id);
            const nextStep = {
              id,
              kind: tl.kind,
              label: tl.label,
              // Preserve Thought text when host closes thinking without re-sending detail
              detail: tl.detail !== undefined ? tl.detail : steps[idx]?.detail,
              toolName: tl.toolName,
              turn: tl.turn,
              itemStatus: tl.itemStatus,
              durationMs: durationMs ?? steps[idx]?.durationMs
            };
            if (idx >= 0) steps[idx] = { ...steps[idx], ...nextStep };
            else steps.push(nextStep);
            const copy = [...prev];
            copy[lastIdx] = { ...msg, steps };
            return copy;
          });
          return;
        }
        if (delta.reasoning) {
          const id = `tl_thinking_${turnNumberRef.current || 1}`;
          const now = Date.now();
          if (!stepStartRef.current[id]) stepStartRef.current[id] = now;
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (
              lastIdx < 0 ||
              prev[lastIdx].role !== 'assistant' ||
              prev[lastIdx].status !== 'streaming'
            ) {
              return prev;
            }
            const msg = prev[lastIdx];
            const steps = [...(msg.steps || [])];
            const idx = steps.findIndex((s) => s.id === id);
            const prevDetail = idx >= 0 ? steps[idx].detail || '' : '';
            const nextStep = {
              id,
              kind: 'thinking',
              label: 'Thought',
              detail: prevDetail + delta.reasoning,
              turn: turnNumberRef.current || 1,
              itemStatus: 'running' as const
            };
            if (idx >= 0) steps[idx] = { ...steps[idx], ...nextStep };
            else steps.push(nextStep);
            const copy = [...prev];
            copy[lastIdx] = { ...msg, steps };
            return copy;
          });
          return;
        }
        if (delta.status !== undefined) {
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
              const newMsgs = [...prev];
              newMsgs[lastIdx] = {
                ...newMsgs[lastIdx],
                toolStatus: undefined
              };
              return newMsgs;
            }
            return prev;
          });
          return;
        }
        if (delta.content) {
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
              const newMsgs = [...prev];
              newMsgs[lastIdx] = {
                ...newMsgs[lastIdx],
                toolStatus: undefined,
                content: (newMsgs[lastIdx].content || '') + delta.content!
              };
              return newMsgs;
            }
            return prev;
          });
        }
              },
              () => {
                setMessages((prev) => {
                  const lastIdx = prev.length - 1;
                  if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
                    const newMsgs = [...prev];
                    const prevSteps = newMsgs[lastIdx].steps || [];
                    const steps = prevSteps.map((s) =>
                      s.itemStatus === 'running' ? { ...s, itemStatus: 'done' as const } : s
                    );
                    newMsgs[lastIdx] = {
                      ...newMsgs[lastIdx],
                      status: 'complete',
                      toolStatus: undefined,
                      content: stripFakeToolMarkup(newMsgs[lastIdx].content),
                      steps
                    };
                    return newMsgs;
                  }
                  return prev;
                });
              },
              (err: string) => {
                setError(err);
                setMessages((prev) => {
                  const lastIdx = prev.length - 1;
                  if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
                    const newMsgs = [...prev];
                    const prevSteps = newMsgs[lastIdx].steps || [];
                    const steps = prevSteps.map((s) =>
                      s.itemStatus === 'running' ? { ...s, itemStatus: 'error' as const } : s
                    );
                    newMsgs[lastIdx] = {
                      ...newMsgs[lastIdx],
                      status: 'error',
                      toolStatus: undefined,
                      steps,
                      content: err
                    };
                    return newMsgs;
                  }
                  return prev;
                });
              }
            );
          }}
          onQueueMessage={handleQueueMessage}
          onResynthesize={handleResynthesize}
          isStreaming={streaming}
          isAwaitingUser={awaitingUser}
        />
      </footer>
    </div>
  );
}

const vscode = {
  commands: {
    executeCommand: (cmd: string, ...args: any[]) => {
      window.parent.postMessage({ type: 'vscode.command', command: cmd, args }, '*');
    }
  }
};

(window as any).vscode = vscode;
