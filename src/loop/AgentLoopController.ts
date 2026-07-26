/**
 * AgentLoopController - 코어 루프 (C3-T01 / HARB)
 * 
 * 메시지 → 모델 → 도구 → 결과 → 반복
 * maxTurns 가드, Stop 신호 처리, DoomLoop 감지, 에러 복구
 * 
 * HARB 배선:
 * - 턴 시작: PrefetchEngine.prefetch
 * - edit_file/write_file 후: createAutoVerificationHook
 * - PromptTurnStructure / DontDoMedium 가드
 * - RoutingHeuristics 카운터
 * - callModel: LiteLLMProvider (mock provider 주입 슬롯)
 */
import type { Mode, TurnContext } from '../agent/types';
import { modeRegistry } from '../agent/modeRegistry';
import { toolRegistry } from '../tools/registry';
import type { ToolInput, ToolOutput } from '../tools/types';
import type { ModelTier } from '../harness/ModelTiers';
import { PrefetchEngine } from '../prefetch/PrefetchEngine';
import { createAutoVerificationHook } from '../hooks/autoVerificationHook';
import { validateTurnStructure } from '../harness/PromptTurnStructure';
import { isDontDoViolation } from '../harness/DontDoMedium';
import { routeByHeuristics, shouldForcePlan } from '../harness/RoutingHeuristics';
import type { RoutingSignal } from '../harness/RoutingHeuristics';
import { LiteLLMProvider } from '../providers/LiteLLMProvider';
import type { LLMProviderConfig } from '../providers/types';
import { ContextCompactionEngine } from '../compaction/CompactionEngine';
import type { ContextMessage } from '../compaction/CompactionEngine';
import { toolCallParser } from '../providers/ToolCallParser';
import { DoomLoopDetector } from './DoomLoopDetector';
import { DoomLoopHandler } from './DoomLoopHandler';
import {
  isDebugToolAllowedForStage,
  type DebugStage
} from '../debug/DebugModeController';

const PLAN_ASK_QUESTION_NUDGE = `STOP — PLAN mode Research/Questions must end with the ask_question tool, not a final conclusion in chat.

Call ask_question now (one or more times) with 2–4 multiple-choice options about requirements still needed for the plan, for example:
- NLP 제외 범위 / Python 공존 전략
- 마이그레이션 우선순위 (API 먼저 vs 전체)
- 성공 기준 / 일정

Do NOT write more "최종 결론" prose. Emit ask_question tool_calls only.`;

export interface LoopConfig {
  mode: Mode;
  maxTurns: number;
  modelId: string;
  tier?: ModelTier;
  systemPrompt?: string;
  provider?: LiteLLMProvider; // HARB: mock provider 주입 슬롯
  /**
   * Model context window (max input tokens) from provider model info.
   * Compaction triggers near ~90% of this budget.
   */
  contextBudget?: number;
  /** Debug FSM stage — gates tools mid-loop (mutable via setDebugStage) */
  debugStage?: import('../debug/DebugModeController').DebugStage;
  /** Plan FSM stage — research must end with ask_question */
  planStage?: import('../plan/PlanModeController').PlanStage;
  /** Notify webview when debug stage advances */
  onDebugStage?: (stage: import('../debug/DebugModeController').DebugStage) => void;
  /** Thinking / reasoning effort (off|low|medium|high) */
  thinkingEffort?: import('../agent/thinkingEffort').ThinkingEffort;
  /** Provider 없을 때 단위/AC 테스트용 고정 응답 */
  mockResponse?: {
    content?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: ToolInput }>;
  };
  onToolCall?: (
    name: string,
    args: ToolInput,
    callId?: string
  ) => Promise<void>;
  onToolResult?: (
    name: string,
    result: ToolOutput,
    callId?: string
  ) => Promise<void>;
  onTurnStart?: (turn: number) => Promise<void>;
  onTurnEnd?: (turn: number, context: TurnContext) => Promise<void>;
  onStatus?: (status: LoopStatus) => void;
  onError?: (error: Error) => void;
  /** Final prose answer for this user request (no more tool_calls) — chat UI stream */
  onAssistantContent?: (content: string) => void | Promise<void>;
  /** Incremental answer tokens (same cadence as reasoning) — chat UI stream */
  onAssistantDelta?: (delta: string) => void | Promise<void>;
  /** Streaming / final model reasoning (Thought UI) — not mixed into answer */
  onReasoning?: (fullText: string) => void | Promise<void>;
  /** Live terminal output for Cursor-style terminal cards in chat */
  onTerminalEvent?: (ev: {
    id: string;
    phase: 'start' | 'chunk' | 'end';
    command?: string;
    description?: string;
    cwd?: string;
    chunk?: string;
    stream?: 'stdout' | 'stderr';
    exitCode?: number | null;
    error?: string;
    durationMs?: number;
    turn?: number;
    status?: 'running' | 'done' | 'error';
  }) => void | Promise<void>;
}

export type LoopStatus = 'idle' | 'streaming' | 'tool_executing' | 'stopped' | 'completed' | 'error' | 'doom_loop';

export interface LoopState {
  status: LoopStatus;
  currentTurn: number;
  totalTurns: number;
  mode: Mode;
  startTime: number;
  error?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: ToolInput;
  }>;
  toolCallId?: string;
  name?: string;
}

export class AgentLoopController {
  private config: LoopConfig;
  private _state: LoopState;
  private abortController: AbortController | null = null;
  private messages: AgentMessage[] = [];

  // HARB: 하네스 컴포넌트
  private prefetchEngine: PrefetchEngine;
  private autoVerificationHook: ReturnType<typeof createAutoVerificationHook>;
  private compactionEngine: ContextCompactionEngine;
  private consecutiveFailures = 0;
  private jsonParseFailures = 0;
  private currentTier: ModelTier;
  /** Resolved model context window (max input tokens) */
  private contextBudget: number;
  /** 마지막 prefetch 블록 (테스트/디버그용) */
  private lastPrefetch = '';
  /** Identical tool+args doom detection (success or fail) */
  private doomDetector = new DoomLoopDetector(3);
  private doomHandler = new DoomLoopHandler();
  /** Local models sometimes return empty final after tools — retry once */
  private emptyFinalRetried = false;
  /** Reasoning said "I'll read…" but emitted no tool_calls — nudge once */
  private toolIntentNudged = false;
  /** Plan research ended in prose without ask_question — nudge once */
  private planAskQuestionNudged = false;
  /** ask_question ran at least once this loop */
  private askedQuestionThisRun = false;
  /** Mutable debug FSM stage for mid-loop tool gating */
  private debugStage: DebugStage;

  constructor(config: LoopConfig) {
    this.config = config;
    this.debugStage = config.debugStage || 'hypothesis';
    const modeConfig = modeRegistry.getModeConfig(config.mode);
    this.currentTier = config.tier || 'A';
    this.contextBudget = Math.max(
      4096,
      config.contextBudget || modeConfig.contextBudget || 100000
    );
    this._state = {
      status: 'idle',
      currentTurn: 0,
      totalTurns: config.maxTurns || modeConfig.maxTurns,
      mode: config.mode,
      startTime: Date.now()
    };

    // HARB: 하네스 컴포넌트 초기화
    this.prefetchEngine = new PrefetchEngine();
    this.autoVerificationHook = createAutoVerificationHook();
    this.compactionEngine = new ContextCompactionEngine(this.contextBudget);
  }

  get state(): LoopState {
    return { ...this._state };
  }

  get isRunning(): boolean {
    return this._state.status === 'streaming' || this._state.status === 'tool_executing';
  }

  /** 현재 루프 메시지 스냅샷 (HARB prefetch/AC 테스트) */
  getMessages(): AgentMessage[] {
    return this.messages.map(m => ({ ...m }));
  }

  getLastPrefetch(): string {
    return this.lastPrefetch;
  }

  getDebugStage(): DebugStage {
    return this.debugStage;
  }

  private advanceDebugStage(stage: DebugStage): void {
    if (this.config.mode !== 'debug') return;
    this.debugStage = stage;
    this.config.debugStage = stage;
    this.config.onDebugStage?.(stage);
  }

  getJsonParseFailures(): number {
    return this.jsonParseFailures;
  }

  /** AC-4: JSON 복구 실패 카운터 기록 (테스트/관측용) */
  recordJsonParseFailure(count = 1): void {
    this.jsonParseFailures += count;
  }

  /**
   * Prefetch 결과를 system 메시지로 주입 (system 직후 sticky 슬롯)
   */
  private injectPrefetchBlock(prefetchResult: string): void {
    this.lastPrefetch = prefetchResult;
    const wrapped = `<prefetch>\n${prefetchResult}\n</prefetch>`;
    const existingIdx = this.messages.findIndex(
      m => m.role === 'system' && m.content.startsWith('<prefetch>')
    );
    if (existingIdx >= 0) {
      this.messages[existingIdx] = { role: 'system', content: wrapped };
      return;
    }
    const sysIdx = this.messages.findIndex(m => m.role === 'system');
    if (sysIdx >= 0) {
      this.messages.splice(sysIdx + 1, 0, { role: 'system', content: wrapped });
    } else {
      this.messages.unshift({ role: 'system', content: wrapped });
    }
  }

  async start(userMessage: string): Promise<void> {
    this.abortController = new AbortController();
    this._state.status = 'streaming';
    this._state.startTime = Date.now();
    this._state.currentTurn = 0;

    this.messages = [
      { role: 'system', content: this.config.systemPrompt || modeRegistry.getSystemPrompt(this.config.mode) },
      { role: 'user', content: userMessage }
    ];

    await this.runLoop();
  }

  async continue(messages: AgentMessage[]): Promise<void> {
    this.abortController = new AbortController();
    this._state.status = 'streaming';
    this.messages = messages;
    this.emptyFinalRetried = false;
    this.toolIntentNudged = false;
    this.planAskQuestionNudged = false;
    this.askedQuestionThisRun = false;
    this.doomDetector.reset();
    await this.runLoop();
  }

  private async runLoop(): Promise<void> {
    while (this._state.currentTurn < this._state.totalTurns) {
      if (this.abortController?.signal.aborted) {
        this._state.status = 'stopped';
        return;
      }

      this._state.currentTurn++;
      this._state.status = 'streaming';
      this.config.onStatus?.(this._state.status);
      this.config.onTurnStart?.(this._state.currentTurn);

      // ─── HARB: Prefetch at turn start ─────────────────────
      const lastUserMsg = [...this.messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        try {
          const prefetchResult = await this.prefetchEngine.prefetch(lastUserMsg.content);
          if (prefetchResult) {
            this.injectPrefetchBlock(prefetchResult);
          }
        } catch {
          // Prefetch 실패는 치명적이지 않음
        }
      }

      // ─── HARB: Routing Heuristics ─────────────────────────
      const routingSignal: RoutingSignal = {
        currentTier: this.currentTier,
        consecutiveFailures: this.consecutiveFailures,
        jsonParseFailures: this.jsonParseFailures,
        userMessage: lastUserMsg?.content,
        mode: this.config.mode,
      };
      const routingDecision = routeByHeuristics(routingSignal);
      if (routingDecision.tier !== this.currentTier) {
        this.currentTier = routingDecision.tier;
        // Tier A (smaller/local): more turns — they burn steps on exploration.
        // Tier B (strong): also allow a long run for complex tasks.
        if (routingDecision.tier === 'A') {
          this._state.totalTurns = Math.max(this._state.totalTurns, 25);
        } else if (routingDecision.tier === 'B') {
          this._state.totalTurns = Math.max(this._state.totalTurns, 25);
        }
      }

      // --- Phase 1: Call model ---
      const response = await this.callModel();
      if (!response) break;

      // --- Phase 2: Process tool calls (PromptTurnStructure: ≤12 tools, ≤1 write) ---
      if (response.toolCalls && response.toolCalls.length > 0) {
        this._state.status = 'tool_executing';
        this.config.onStatus?.(this._state.status);

        // ─── HARB: Turn Structure Validation ────────────────
        const turnValidation = validateTurnStructure(
          response.toolCalls.map(tc => ({ name: tc.name })),
        );
        let toolCalls = response.toolCalls;
        if (!turnValidation.valid) {
          // Was: inject error + continue → Thought loop with no progress.
          // Now: truncate to limit and proceed (e.g. 13 parallel reads → keep 12).
          const { DEFAULT_TURN_STRUCTURE } = await import('../harness/PromptTurnStructure');
          const maxN = DEFAULT_TURN_STRUCTURE.maxToolCallsPerTurn;
          const writeTools = new Set([
            'edit_file', 'write_file', 'delete_file', 'run_terminal_cmd'
          ]);
          let writes = 0;
          toolCalls = [];
          for (const tc of response.toolCalls) {
            if (toolCalls.length >= maxN) break;
            if (writeTools.has(tc.name)) {
              if (writes >= DEFAULT_TURN_STRUCTURE.maxWriteToolsPerTurn) continue;
              writes++;
            }
            toolCalls.push(tc);
          }
          if (toolCalls.length === 0) {
            this.messages.push({
              role: 'assistant',
              content:
                `Turn structure error: ${turnValidation.errors.join('; ')}. Please use ≤${maxN} tools per turn.`
            });
            this.consecutiveFailures++;
            continue;
          }
        }

        // Keep assistant tool_calls in history (OpenAI-style multi-turn)
        this.messages.push({
          role: 'assistant',
          content: response.content || '',
          toolCalls
        });

        const { isParallelReadTool, mapPool } = await import('./parallelRead');

        const handleToolOutcome = async (
          toolCall: (typeof toolCalls)[0],
          result: ToolOutput
        ): Promise<boolean> => {
          // returns false if doom-loop should stop the run
          if (
            (toolCall.name === 'edit_file' || toolCall.name === 'write_file') &&
            result.success
          ) {
            try {
              const hookResult = await this.autoVerificationHook({
                toolName: toolCall.name,
                args: toolCall.arguments as ToolInput,
                result: { success: true, data: result.data },
                mode: this.config.mode,
                turnNumber: this._state.currentTurn,
                duration: 0
              });
              if (hookResult.action === 'modify' && hookResult.modifiedResult) {
                this.messages.push({
                  role: 'tool',
                  toolCallId: toolCall.id,
                  name: toolCall.name,
                  content: JSON.stringify(hookResult.modifiedResult)
                });
                this.consecutiveFailures++;
                await this.config.onToolResult?.(
                  toolCall.name,
                  hookResult.modifiedResult,
                  toolCall.id
                );
                return true;
              }
            } catch {
              /* non-fatal */
            }
          }

          this.messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: result.success
              ? result.data
                ? JSON.stringify(result.data)
                : ''
              : JSON.stringify({
                  error: result.error || 'failed',
                  ...(result.data && typeof result.data === 'object'
                    ? (result.data as object)
                    : {})
                })
          });

          if (!result.success) {
            this.consecutiveFailures++;
          } else {
            this.consecutiveFailures = 0;
          }

          await this.config.onToolResult?.(toolCall.name, result, toolCall.id);

          this.doomDetector.recordCall(
            toolCall.name,
            toolCall.arguments as Record<string, any>,
            result.success ? 'ok' : String(result.error || 'error')
          );
          if (this.doomDetector.isDoomLoop()) {
            this._state.status = 'doom_loop';
            this.config.onStatus?.('doom_loop');
            const alert = this.doomHandler.handleDoomLoop(this.doomDetector);
            const prose = alert
              ? this.doomHandler.formatAlertMessage(alert)
              : 'Stopped: repeated the same tool call with no progress.';
            await this.config.onAssistantContent?.(prose);
            return false;
          }
          return true;
        };

        let i = 0;
        let stopRun = false;
        while (i < toolCalls.length && !stopRun) {
          if (this.abortController?.signal.aborted) break;

          // Batch consecutive read-only tools and run in parallel
          if (isParallelReadTool(toolCalls[i].name)) {
            const batch: typeof toolCalls = [];
            while (
              i < toolCalls.length &&
              isParallelReadTool(toolCalls[i].name) &&
              batch.length < 16
            ) {
              batch.push(toolCalls[i++]);
            }

            for (const toolCall of batch) {
              const violation = isDontDoViolation(toolCall.name, this.currentTier);
              if (violation.violation) {
                const denied: ToolOutput = {
                  success: false,
                  error: violation.reason || `Tool "${toolCall.name}" prohibited`
                };
                this.messages.push({
                  role: 'tool',
                  toolCallId: toolCall.id,
                  name: toolCall.name,
                  content: JSON.stringify({ error: denied.error })
                });
                this.consecutiveFailures++;
                await this.config.onToolResult?.(
                  toolCall.name,
                  denied,
                  toolCall.id
                );
              } else {
                await this.config.onToolCall?.(
                  toolCall.name,
                  toolCall.arguments,
                  toolCall.id
                );
              }
            }

            const runnable = batch.filter((tc) => {
              const v = isDontDoViolation(tc.name, this.currentTier);
              return !v.violation;
            });

            const outcomes = await mapPool(runnable, 8, async (toolCall) => {
              const result = await this.executeTool(
                toolCall.name,
                toolCall.arguments
              );
              return { toolCall, result };
            });

            for (const { toolCall, result } of outcomes) {
              const ok = await handleToolOutcome(toolCall, result);
              if (!ok) {
                stopRun = true;
                break;
              }
            }
            continue;
          }

          // Write / terminal / other — serial
          const toolCall = toolCalls[i++];
          const violation = isDontDoViolation(toolCall.name, this.currentTier);
          if (violation.violation) {
            const denied: ToolOutput = {
              success: false,
              error: violation.reason || `Tool "${toolCall.name}" prohibited`
            };
            this.messages.push({
              role: 'tool',
              toolCallId: toolCall.id,
              name: toolCall.name,
              content: JSON.stringify({ error: denied.error })
            });
            this.consecutiveFailures++;
            await this.config.onToolResult?.(
              toolCall.name,
              denied,
              toolCall.id
            );
            continue;
          }

          await this.config.onToolCall?.(
            toolCall.name,
            toolCall.arguments,
            toolCall.id
          );
          const result = await this.executeTool(
            toolCall.name,
            toolCall.arguments
          );
          const ok = await handleToolOutcome(toolCall, result);
          if (!ok) {
            stopRun = true;
            break;
          }
        }
        if (stopRun) return;
        // Next LLM turn may plan again in prose — allow another tool nudge
        this.toolIntentNudged = false;
      } else {
        // No tool calls → assistant response only (end of turn chain for this request)
        const finalContent = response.content || '';
        this.messages.push({
          role: 'assistant',
          content: finalContent
        });
        this._state.status = 'completed';
        this.config.onStatus?.(this._state.status);
        await this.config.onAssistantContent?.(finalContent);
        return;
      }

      // ─── HARB-T26: Compaction check (provider model context window) ───
      const compactAt = Math.floor(this.contextBudget * 0.9);
      if (this._state.currentTurn % 5 === 0 || this.estimateTotalTokens() > compactAt) {
        try {
          const ctxMessages: ContextMessage[] = this.messages.map(m => ({
            role: m.role,
            content: m.content,
            metadata: {
              turn: this._state.currentTurn,
              type: m.role === 'tool' ? 'tool_result' : undefined,
              toolName: m.name
            },
          }));
          const compacted = this.compactionEngine.compact(ctxMessages);
          this.messages = compacted.messages.map(m => ({
            role: m.role as AgentMessage['role'],
            content: m.content,
            name: m.metadata?.toolName,
          }));
        } catch {
          // Compaction failure is non-fatal
        }
      }

      this.config.onTurnEnd?.(this._state.currentTurn, {
        turnNumber: this._state.currentTurn,
        toolCalls: response.toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
          status: 'completed'
        })),
        messages: this.messages,
        mode: this.config.mode,
        startTime: Date.now()
      });
    }

    if (this._state.currentTurn >= this._state.totalTurns) {
      this._state.status = 'completed';
      this.config.onStatus?.(this._state.status);
      // maxTurns: emit best-effort note if no final prose was sent
      const lastAssistant = [...this.messages].reverse().find(
        (m) => m.role === 'assistant' && m.content && !m.toolCalls?.length
      );
      if (lastAssistant?.content) {
        await this.config.onAssistantContent?.(lastAssistant.content);
      } else {
        await this.config.onAssistantContent?.(
          `Max turns (${this._state.totalTurns}) reached. Type "계속" to resume, or narrow the task.`
        );
      }
    }
  }

  /**
   * HARB: callModel — LiteLLMProvider 또는 mock provider 호출
   * config.provider가 설정되어 있으면 실제 LLM 호출, 없으면 stub 반환
   */
  private async callModel(): Promise<{ content?: string; toolCalls?: Array<{ id: string; name: string; arguments: ToolInput }> } | null> {
    this.config.onStatus?.('streaming');

    // HARB: provider가 설정되어 있으면 실제 LLM 호출
    if (this.config.provider) {
      try {
        const schemas = toolRegistry.getSchemas(this.config.mode, this.currentTier)
          .filter((s) => {
            if (this.config.mode !== 'debug') return true;
            const name = s?.function?.name as string | undefined;
            if (!name) return true;
            return isDebugToolAllowedForStage(this.debugStage, name);
          });
        const providerMessages = this.buildProviderMessages();

        let result = await this.streamOnce(providerMessages, schemas);

        if (result === null) return null;

        if (result.toolCalls && result.toolCalls.length > 0) {
          return { toolCalls: this.normalizeToolCalls(result.toolCalls, result.content || '') };
        }

        const recovered = this.recoverToolCallsFromContent(
          result.content || result.reasoning || ''
        );
        if (recovered.length > 0) {
          return { toolCalls: recovered };
        }

        // Reasoning plans "I'll read…" but no tool_calls — one nudge with tools still on
        const intendsTools = this.reasoningIntendsTools(result.reasoning || result.content || '');
        if (
          intendsTools &&
          schemas.length > 0 &&
          !this.toolIntentNudged
        ) {
          this.toolIntentNudged = true;
          if ((result.reasoning || '').trim()) {
            void this.config.onReasoning?.(result.reasoning);
          }
          this.messages.push({
            role: 'user',
            content:
              'Your previous turn only contained reasoning/plans, not tool_calls. Call the needed tools now (≤12 per turn; prefer read_files for many paths). No prose — emit tool_calls only.'
          });
          result = await this.streamOnce(this.buildProviderMessages(), schemas);
          if (result === null) return null;
          if (result.toolCalls && result.toolCalls.length > 0) {
            return { toolCalls: this.normalizeToolCalls(result.toolCalls, result.content || '') };
          }
          const recovered2 = this.recoverToolCallsFromContent(
            result.content || result.reasoning || ''
          );
          if (recovered2.length > 0) {
            return { toolCalls: recovered2 };
          }
        }

        // Plan research/questions: prose conclusion without ask_question → force MCQ tools
        const planAsk = await this.nudgePlanAskQuestionIfNeeded(result, schemas);
        if (planAsk === null) return null;
        if (planAsk) return planAsk;

        const prose = (result.content || '').trim();
        if (prose && prose !== '...') {
          if ((result.reasoning || '').trim()) {
            void this.config.onReasoning?.(result.reasoning);
          }
          return { content: prose, toolCalls: [] };
        }

        if ((result.reasoning || '').trim()) {
          void this.config.onReasoning?.(result.reasoning);
        }

        const hadTools = this.messages.some((m) => m.role === 'tool');
        if (hadTools && !this.emptyFinalRetried) {
          this.emptyFinalRetried = true;
          const planStage = this.config.planStage || 'research';
          const needsPlanAsk =
            this.config.mode === 'plan' &&
            (planStage === 'research' || planStage === 'questions') &&
            !this.askedQuestionThisRun &&
            schemas.some((s) => s?.function?.name === 'ask_question');

          if (needsPlanAsk) {
            this.planAskQuestionNudged = true;
            this.messages.push({
              role: 'user',
              content: PLAN_ASK_QUESTION_NUDGE
            });
            const retry = await this.streamOnce(this.buildProviderMessages(), schemas);
            if (retry === null) return null;
            if (retry.toolCalls && retry.toolCalls.length > 0) {
              return { toolCalls: this.normalizeToolCalls(retry.toolCalls, retry.content || '') };
            }
            const recoveredAsk = this.recoverToolCallsFromContent(
              retry.content || retry.reasoning || ''
            );
            if (recoveredAsk.length > 0) {
              return { toolCalls: recoveredAsk };
            }
            if ((retry.reasoning || '').trim()) {
              void this.config.onReasoning?.(retry.reasoning);
            }
            const retryProse = (retry.content || '').trim();
            if (retryProse && retryProse !== '...') {
              return { content: retryProse, toolCalls: [] };
            }
          } else {
            this.messages.push({
              role: 'user',
              content:
                'Tool results are above. Write a concise final analysis in Korean (or the user language). Do NOT call tools. Use clean Markdown: ## headings, - bullets, and GFM | tables | — never space-padded columns.'
            });
            // Final answer pass: allow thinking for Thought UI
            const retry = await this.streamOnce(this.buildProviderMessages(), [], {
              enableThinking: true
            });
            if (retry === null) return null;
            if ((retry.reasoning || '').trim()) {
              void this.config.onReasoning?.(retry.reasoning);
            }
            const retryProse = (retry.content || '').trim();
            if (retryProse && retryProse !== '...') {
              return { content: retryProse, toolCalls: [] };
            }
            if ((retry.reasoning || result.reasoning || '').trim()) {
              return {
                content: (retry.content || retry.reasoning || result.reasoning || '').trim(),
                toolCalls: []
              };
            }
          }
        }

        // Intended tools but never called them — stop with clear message (don't spin)
        if (intendsTools && !hadTools) {
          return {
            content:
              '모델이 파일을 읽겠다고만 반복하고 도구를 호출하지 않았습니다. Regenerate로 다시 시도하거나, 읽을 파일 경로를 구체적으로 지정해 주세요.',
            toolCalls: []
          };
        }

        if (!hadTools && (result.reasoning || '').trim()) {
          return { content: result.reasoning.trim(), toolCalls: [] };
        }

        if (hadTools) {
          return {
            content: this.synthesizeFromToolResults(),
            toolCalls: []
          };
        }

        return {
          content:
            '응답이 비어 있습니다. 로컬 모델이 본문 없이 종료했습니다. Regenerate를 누르거나 Base URL/모델 ID를 확인하세요.',
          toolCalls: []
        };
      } catch (error: any) {
        this.config.onError?.(error);
        return null;
      }
    }

    // Stub / mock fallback (no provider configured)
    if (this.config.mockResponse) {
      const mock = this.config.mockResponse;
      if (mock.toolCalls && mock.toolCalls.length > 0) {
        return { toolCalls: mock.toolCalls };
      }
      const content = mock.content || '';
      const recovered = this.recoverToolCallsFromContent(content);
      if (recovered.length > 0) {
        return { toolCalls: recovered };
      }
      if (content && this.looksLikeBrokenToolPayload(content)) {
        this.jsonParseFailures++;
      }
      return {
        content:
          content?.trim() ||
          'Mock/stub provider returned empty content (no LLM provider configured).',
        toolCalls: []
      };
    }

    return {
      content: 'No LLM provider configured for AgentLoop. Check agent-k.provider.baseUrl / model.',
      toolCalls: []
    };
  }

  /** OpenAI-format messages for the provider */
  private buildProviderMessages(): Array<Record<string, unknown>> {
    return this.messages.map((m) => {
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant' as const,
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments:
                typeof tc.arguments === 'string'
                  ? tc.arguments
                  : JSON.stringify(tc.arguments ?? {})
            }
          }))
        };
      }
      if (m.role === 'tool') {
        return {
          role: 'tool' as const,
          content: m.content || '',
          tool_call_id: m.toolCallId || m.name || 'tool',
          ...(m.name ? { name: m.name } : {})
        };
      }
      return {
        role: m.role,
        content: m.content ?? ''
      };
    });
  }

  /**
   * One provider stream pass. Returns null on hard error/abort.
   */
  private async streamOnce(
    providerMessages: Array<Record<string, unknown>>,
    schemas: Record<string, unknown>[],
    opts?: { enableThinking?: boolean }
  ): Promise<{
    content: string;
    reasoning: string;
    toolCalls: Array<{ id: string; name: string; arguments: ToolInput }>;
  } | null> {
    if (!this.config.provider) return null;

    const effort = this.config.thinkingEffort || 'medium';
    const enableThinking =
      opts?.enableThinking !== undefined
        ? opts.enableThinking
        : effort !== 'off';

    const stream = this.config.provider.streamChat({
      messages: providerMessages as any,
      model: this.config.modelId,
      tools: schemas.length > 0 ? schemas : undefined,
      signal: this.abortController?.signal,
      enableThinking,
      thinkingEffort: effort,
      maxTokens: 16384
    });

    let fullContent = '';
    let reasoningContent = '';
    let hitLengthLimit = false;
    const toolCallAcc = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const chunk of stream) {
      if (chunk.content) {
        fullContent += chunk.content;
        // Mirror onReasoning: push answer tokens live (Thought already streams)
        void this.config.onAssistantDelta?.(chunk.content);
      }
      if (chunk.finishReason === 'length') {
        hitLengthLimit = true;
      }
      const anyChunk = chunk as {
        reasoning?: string;
        reasoning_content?: string;
      };
      if (anyChunk.reasoning_content) {
        reasoningContent += anyChunk.reasoning_content;
        void this.config.onReasoning?.(reasoningContent);
      }
      if (anyChunk.reasoning) {
        reasoningContent += anyChunk.reasoning;
        void this.config.onReasoning?.(reasoningContent);
      }
      if (chunk.toolCalls) {
        for (const tc of chunk.toolCalls as any[]) {
          const idx = typeof tc.index === 'number' ? tc.index : 0;
          const prev = toolCallAcc.get(idx) || {
            id: tc.id || `call_${Date.now()}_${idx}`,
            name: '',
            arguments: ''
          };
          if (tc.id) prev.id = tc.id;
          const fn = tc.function || {};
          if (fn.name) prev.name = fn.name;
          if (typeof fn.arguments === 'string') {
            prev.arguments += fn.arguments;
          } else if (fn.arguments && typeof fn.arguments === 'object') {
            prev.arguments = JSON.stringify(fn.arguments);
          }
          if (tc.name && !prev.name) prev.name = tc.name;
          toolCallAcc.set(idx, prev);
        }
      }
      if (chunk.done) break;
      if (chunk.error) {
        this.config.onError?.(new Error(chunk.error));
        return null;
      }
    }

    if (hitLengthLimit && fullContent.trim()) {
      const note =
        '\n\n*(응답이 길이 제한으로 잘렸을 수 있습니다. Regenerate로 이어서 요청하세요.)*';
      fullContent += note;
      void this.config.onAssistantDelta?.(note);
    }

    let toolCalls: Array<{ id: string; name: string; arguments: ToolInput }> = [
      ...toolCallAcc.values()
    ]
      .filter((t) => t.name && toolRegistry.getTool(t.name))
      .map((t) => {
        let args: ToolInput = {};
        try {
          args = t.arguments ? JSON.parse(t.arguments) : {};
        } catch {
          args = { raw: t.arguments } as ToolInput;
        }
        return { id: t.id, name: t.name, arguments: args };
      });

    // Unknown native tool names only — keep prose path if we have content
    if (toolCallAcc.size > 0 && toolCalls.length === 0 && !fullContent.trim()) {
      return {
        content:
          '모델이 등록되지 않은 도구 이름을 호출했습니다. 분석을 본문으로 이어갑니다.',
        reasoning: reasoningContent,
        toolCalls: []
      };
    }

    return {
      content: fullContent,
      reasoning: reasoningContent,
      toolCalls
    };
  }

  /** Fallback prose when the model returns empty after successful tools */
  private synthesizeFromToolResults(): string {
    const tools = this.messages.filter((m) => m.role === 'tool').slice(-6);
    if (!tools.length) {
      return '도구는 실행됐지만 모델 최종 응답이 비었습니다. Regenerate로 다시 시도하세요.';
    }
    const bits = tools.map((m) => {
      const body = String(m.content || '').slice(0, 600);
      return `### ${m.name || 'tool'}\n\`\`\`\n${body}\n\`\`\``;
    });
    return [
      '로컬 모델이 최종 답변을 비운 채 종료했습니다. 아래는 수집된 도구 결과 요약입니다 (자동 복구).',
      '',
      ...bits,
      '',
      '_Regenerate를 누르면 모델이 다시 분석 문장을 쓸 수 있습니다._'
    ].join('\n');
  }

  /**
   * Plan research/questions ended with a prose "결론" and no ask_question —
   * keep the research text in history and force MCQ tool calls once.
   */
  private async nudgePlanAskQuestionIfNeeded(
    result: { content?: string; reasoning?: string; toolCalls?: unknown[] },
    schemas: Array<{ function?: { name?: string } }>
  ): Promise<
    | { content?: string; toolCalls: Array<{ id: string; name: string; arguments: ToolInput }> }
    | null
    | undefined
  > {
    const prose = (result.content || '').trim();
    if (!prose || prose === '...') return undefined;

    const planStage = this.config.planStage || 'research';
    const needsAsk =
      this.config.mode === 'plan' &&
      (planStage === 'research' || planStage === 'questions') &&
      !this.askedQuestionThisRun &&
      !this.planAskQuestionNudged &&
      schemas.some((s) => s?.function?.name === 'ask_question');

    if (!needsAsk) return undefined;

    this.planAskQuestionNudged = true;
    if ((result.reasoning || '').trim()) {
      void this.config.onReasoning?.(String(result.reasoning));
    }
    this.messages.push({ role: 'assistant', content: prose });
    this.messages.push({ role: 'user', content: PLAN_ASK_QUESTION_NUDGE });

    const retry = await this.streamOnce(this.buildProviderMessages(), schemas as any);
    if (retry === null) return null;
    if (retry.toolCalls && retry.toolCalls.length > 0) {
      return {
        toolCalls: this.normalizeToolCalls(retry.toolCalls, retry.content || '')
      };
    }
    const recovered = this.recoverToolCallsFromContent(
      retry.content || retry.reasoning || ''
    );
    if (recovered.length > 0) {
      return { toolCalls: recovered };
    }
    // Still no ask_question — surface original research prose
    return { content: prose, toolCalls: [] };
  }

  /** Provider/native toolCalls 정규화 + 깨진 arguments JSON 복구 */
  private normalizeToolCalls(
    toolCalls: Array<{ id: string; name: string; arguments: ToolInput }>,
    fullContent: string
  ): Array<{ id: string; name: string; arguments: ToolInput }> {
    const normalized: Array<{ id: string; name: string; arguments: ToolInput }> = [];
    for (const tc of toolCalls) {
      let args = tc.arguments;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args as unknown as string);
        } catch {
          const parsed = toolCallParser.parse(fullContent || (args as unknown as string));
          if (parsed.length > 0) {
            normalized.push({
              id: tc.id,
              name: parsed[0].name || tc.name,
              arguments: parsed[0].arguments as ToolInput
            });
            continue;
          }
          this.jsonParseFailures++;
          continue;
        }
      }
      normalized.push({ ...tc, arguments: args });
    }
    return normalized;
  }

  /** Detect plan-only reasoning/prose that should have emitted tools */
  private reasoningIntendsTools(text: string): boolean {
    return /read_file|list_dir|codebase_search|\bgrep\b|\bglob\b|edit_file|todo_write|in parallel|let me (read|search|open|check|fix)|i('ll| will) (read|search|open|fix|check)|읽어|살펴|확인하|수정하|고치|분석하|파일을 읽|병렬로 읽|먼저 .{0,40}(읽|확인|파악|수정)|이어서|진행하/i.test(
      text
    );
  }

  /** 모델 텍스트에서 ToolCallParser로 도구 호출 복구 — 등록된 도구명만 허용 */
  private recoverToolCallsFromContent(content: string): Array<{ id: string; name: string; arguments: ToolInput }> {
    if (!content?.trim()) {
      return [];
    }
    const parsed = toolCallParser.parse(content);
    // Reject hallucinated names (LLM, GPT, Llama, autodetectTemplateType, …)
    const allowed = parsed.filter((p) => p.name && toolRegistry.getTool(p.name));
    if (allowed.length === 0) {
      if (parsed.length > 0) {
        // Had fake tools only — treat as prose, not tool round
        return [];
      }
      if (this.looksLikeBrokenToolPayload(content)) {
        this.jsonParseFailures++;
      }
      return [];
    }
    return allowed.map((p) => ({
      id: p.id,
      name: p.name,
      arguments: p.arguments as ToolInput
    }));
  }

  private looksLikeBrokenToolPayload(content: string): boolean {
    return /```(?:json)?|"name"\s*:\s*"|tool_calls|<tool\s|function_call/i.test(content);
  }

  /**
   * 쓰기·터미널·체크포인트 복구 — PermissionGate (RuntimeServices + ConfigManager)
   */
  private async guardWritePermission(name: string, args: ToolInput): Promise<ToolOutput | null> {
    const gated = new Set([
      'edit_file', 'write_file', 'delete_file', 'run_terminal_cmd', 'checkpoint_restore'
    ]);
    if (!gated.has(name)) {
      return null;
    }

    const { RuntimeServices } = await import('../core/RuntimeServices');
    const gate = RuntimeServices.getPermissionGate();
    if (!gate) {
      return null;
    }

    const { configManager } = await import('../core/ConfigManager');
    const level = configManager.get('agent-k.permission.level') || 'accept_edits';
    gate.setLevel(level);

    const filePath = (args.path || args.filePath) as string | undefined;
    const decision = await gate.requestPermission({
      toolName: name,
      args: args as Record<string, unknown>,
      description: `${name}${filePath ? `: ${filePath}` : ''}`,
      destructive: name === 'delete_file' || name === 'checkpoint_restore',
      path: filePath
    });

    if (decision === 'reject') {
      return { success: false, error: `Permission denied for tool "${name}".` };
    }
    return null;
  }

  /**
   * HARB-T26: Estimate total tokens in messages (rough approximation).
   */
  private estimateTotalTokens(): number {
    return this.messages.reduce((sum, m) => sum + Math.ceil((m.content?.length || 0) / 4), 0);
  }

  /**
   * Public entry for E2E/unit tests (RW-C5-05-R2).
   * Same deny + I/O path as the live agent loop.
   */
  async dispatchTool(name: string, args: ToolInput): Promise<ToolOutput> {
    return this.executeTool(name, args);
  }

  private async executeTool(name: string, args: ToolInput): Promise<ToolOutput> {
    const isDynamicMcp = name.startsWith('mcp_') && name !== 'mcp_call_tool' && name !== 'mcp_list_tools';
    const tool = toolRegistry.getTool(name);
    if (!tool && !isDynamicMcp) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    // Mode check (C1-T18 이중 가드)
    if (tool && !modeRegistry.isToolAllowed(this.config.mode, name)) {
      return {
        success: false,
        error: `Tool "${name}" is not allowed in ${this.config.mode} mode. Allowed tools: ${modeRegistry.getModeConfig(this.config.mode).allowedTools.join(', ')}`
      };
    }
    if (isDynamicMcp && this.config.mode !== 'agent' && this.config.mode !== 'debug') {
      return { success: false, error: `MCP tool "${name}" is only allowed in agent/debug modes.` };
    }
    // Ask 모드: category 기반 추가 차단
    if (this.config.mode === 'ask') {
      const toolDef = toolRegistry.getTool(name);
      if (toolDef && (toolDef.category === 'edit' || toolDef.category === 'terminal' || toolDef.category === 'debug')) {
        return {
          success: false,
          error: `[Ask Mode] Writing/terminal/debug tools are disabled. "${name}" requires Agent mode.`
        };
      }
    }
    // Plan 모드: 쓰기/터미널/browser 이중 가드 (RW-C5-05-R2) — never claim success
    if (this.config.mode === 'plan') {
      const toolDef = toolRegistry.getTool(name);
      const writeNames = new Set(['edit_file', 'write_file', 'run_terminal_cmd', 'delete_file']);
      if (writeNames.has(name) || (toolDef && (toolDef.category === 'edit' || toolDef.category === 'terminal' || toolDef.category === 'web'))) {
        return {
          success: false,
          error: `[Plan Mode] Writing/terminal/browser tools are disabled during planning. "${name}" is not allowed until the plan is approved and mode switches to Agent.`
        };
      }
    }

    // Debug 모드: 스테이지별 도구 게이트 (Hypothesis에서 Fix로 점프 금지)
    if (this.config.mode === 'debug' && !isDebugToolAllowedForStage(this.debugStage, name)) {
      return {
        success: false,
        error:
          `[Debug Mode] Tool "${name}" is not allowed in the "${this.debugStage}" stage. ` +
          `Follow Hypothesis → Instrument → Reproduce → Analyze → (user Confirm & Fix) → Fix → Cleanup.`
      };
    }

    // C4-T01: 쓰기·복구·셸 도구 — PermissionGate (ConfigManager 레벨 동기화)
    const permissionDenied = await this.guardWritePermission(name, args);
    if (permissionDenied) {
      return permissionDenied;
    }

    // Dispatch to executor
    try {
      const { executeGrep, executeGlob, executeFileSearch, executeReadFile, executeReadFiles, executeListDir, executeCodebaseSearch, executeLspDefinition, executeLspReferences, executeReadLints } = await import('../tools/executors');
      
      const executors: Record<string, (input: ToolInput) => Promise<ToolOutput>> = {
        grep: executeGrep,
        glob: executeGlob,
        file_search: executeFileSearch,
        read_file: executeReadFile,
        read_files: executeReadFiles,
        list_dir: executeListDir,
        codebase_search: executeCodebaseSearch,
        lsp_definition: executeLspDefinition,
        lsp_references: executeLspReferences,
        read_lints: executeReadLints
      };

      const executor = executors[name];
      if (executor) {
        return await executor(args);
      }

      // ─── C5-C7 tool dispatch ───────────────────────────────
      // switch_mode: change the active mode for subsequent turns
      if (name === 'switch_mode') {
        // Plan mode: Build is UI-gated (Approve & Execute). Model cannot self-escalate.
        if (this.config.mode === 'plan') {
          return {
            success: false,
            error:
              'In PLAN mode, switch_mode is disabled. Write/revise the plan only; the user must click Approve & Execute to build.'
          };
        }
        if (this.config.mode === 'debug') {
          return {
            success: false,
            error:
              'In DEBUG mode, switch_mode is disabled. Stay in the debug FSM through Cleanup.'
          };
        }
        const targetMode = args.mode as string;
        if (!['ask', 'agent', 'plan', 'debug'].includes(targetMode)) {
          return { success: false, error: `Invalid mode: "${targetMode}". Valid modes: ask, agent, plan, debug` };
        }
        const prevMode = this.config.mode;
        this.config.mode = targetMode as Mode;
        const modeConfig = modeRegistry.getModeConfig(targetMode as Mode);
        this._state.totalTurns = modeConfig.maxTurns;
        return {
          success: true,
          data: {
            message: `Switched mode from "${prevMode}" to "${targetMode}". ${modeConfig.description}`,
            previousMode: prevMode,
            currentMode: targetMode
          }
        };
      }

      // ─── ask_question (C5-T02 / RW-C5-02) ───────────────
      if (name === 'ask_question') {
        const { askQuestionTool } = await import('../tools/session/AskQuestionTool');
        const result = await askQuestionTool.execute(args);
        if (result.success) {
          this.askedQuestionThisRun = true;
        }
        // Hypothesis stage: MCQ (≥2 options) = user picked a hypothesis → Instrument
        if (
          result.success &&
          this.config.mode === 'debug' &&
          this.debugStage === 'hypothesis'
        ) {
          const opts = args.options;
          if (Array.isArray(opts) && opts.length >= 2) {
            this.advanceDebugStage('instrument');
          }
        }
        return result;
      }

      // ─── todo_write (C5-T23) ─────────────────────────────
      if (name === 'todo_write') {
        const { todoWriteTool } = await import('../tools/session/TodoWriteTool');
        return todoWriteTool.execute(args);
      }

      // ─── add_instrumentation (RW-C6-02-R2: 실파일 마커 삽입) ──────
      if (name === 'add_instrumentation') {
        const { AddInstrumentationTool } = await import('../tools/debug/AddInstrumentationTool');
        const addTool = new AddInstrumentationTool();
        try {
          const { marker, absPath, code } = await addTool.applyToFile({
            filePath: args.filePath as string,
            hypothesisId: args.hypothesisId as string,
            type: ((args.type as string) || 'entry') as 'entry' | 'exit' | 'conditional' | 'dump',
            lineNumber: args.lineNumber as number | undefined,
            variableName: args.variableName as string | undefined,
            condition: args.condition as string | undefined
          });
          return {
            success: true,
            data: {
              message: `Inserted DEBUG_INSTRUMENT for "${args.hypothesisId}" into ${absPath}`,
              markerId: marker.id,
              insertedLine: marker.insertedLine + 1,
              code,
              filePath: absPath,
              hypothesisId: args.hypothesisId
            }
          };
        } catch (e: any) {
          return { success: false, error: e.message || String(e) };
        }
      }

      // ─── remove_instrumentation (RW-C6-02-R2: 워크스페이스 실제거) ────
      if (name === 'remove_instrumentation') {
        const { RemoveInstrumentationTool } = await import('../tools/debug/RemoveInstrumentationTool');
        const removeTool = new RemoveInstrumentationTool();
        const hypothesisId = args.hypothesisId as string | undefined;
        const result = await removeTool.removeFromWorkspace(hypothesisId);
        if (
          this.config.mode === 'debug' &&
          result.remaining === 0 &&
          (this.debugStage === 'fix' || this.debugStage === 'cleanup')
        ) {
          this.advanceDebugStage('cleanup');
        }
        return {
          success: result.remaining === 0,
          data: {
            message: removeTool.buildCleanupReport(
              hypothesisId || 'all',
              result.filesChecked,
              result.filesModified.map(f => ({ file: f, remaining: 0 }))
            ),
            filesModified: result.filesModified,
            remaining: result.remaining,
            filesChecked: result.filesChecked.length
          },
          error: result.remaining > 0 ? `${result.remaining} DEBUG_INSTRUMENT marker(s) remain` : undefined
        };
      }

      // ─── collect_runtime_logs (RW-C6-04-R2: DebugLogServer 실호출) ─────
      if (name === 'collect_runtime_logs') {
        const { RuntimeServices } = await import('../core/RuntimeServices');
        const { CollectRuntimeLogsTool } = await import('../tools/debug/CollectRuntimeLogsTool');
        const server = RuntimeServices.getDebugLogServer();
        if (!server) {
          return { success: false, error: 'DebugLogServer not started (extension activate missing)' };
        }
        const collector = new CollectRuntimeLogsTool(server);
        const collection = collector.collect({
          source: args.source as string | undefined,
          level: args.level as string | undefined,
          since: args.since as number | undefined,
          maxLines: (args.maxLines as number) || 1000,
          hypothesisId: args.hypothesisId as string | undefined
        });
        return {
          success: true,
          data: {
            summary: collection.summary,
            logs: collection.logs,
            formatted: collector.formatToolResult(collection)
          }
        };
      }

      // ─── request_reproduce (RW-C6-05-R2: UI 대기 / timeout) ────────
      if (name === 'request_reproduce') {
        const { requestReproduceTool } = await import('../tools/debug/RequestReproduceTool');
        const result = await requestReproduceTool.execute(args);
        if (
          result.success &&
          this.config.mode === 'debug' &&
          (this.debugStage === 'reproduce' || this.debugStage === 'instrument')
        ) {
          this.advanceDebugStage('analyze');
        }
        return result;
      }

      // ─── task / task_run (RW-C7-04-R2) ────────────────
      if (name === 'task' || name === 'task_run') {
        const { getTaskTool } = await import('../tools/orchestration/TaskTool');
        const taskTool = getTaskTool();
        const result = await taskTool.execute({
          description: (args.description as string) || 'sub-task',
          prompt: (args.prompt as string) || (args.task as string) || (args.description as string) || '',
          type: (args.type as any) ||
            ((args.mode as string) === 'ask' ? 'search' : (args.mode as string) === 'debug' ? 'debug' : 'general'),
          timeout: (args.timeout as number) || 120_000
        });
        // Parent receives summary only (AC)
        return {
          success: result.status === 'completed',
          data: {
            taskId: result.taskId,
            summary: result.summary,
            status: result.status,
            duration: result.duration
          },
          error: result.status === 'error' ? result.summary : undefined
        };
      }

      // ─── Browser tools (C7-T01 / RW-C7-01) ────────────
      const BROWSER_TOOLS = new Set([
        'browser_navigate', 'browser_click', 'browser_screenshot', 'browser_evaluate',
        'browser_console', 'browser_network', 'browser_scroll', 'browser_wait'
      ]);
      if (BROWSER_TOOLS.has(name)) {
        const { BrowserSessionManager } = await import('../browser/BrowserSession');
        const { BrowserToolHandlers } = await import('../tools/browser/BrowserToolGroup');
        const sessionManager = new BrowserSessionManager();
        const handlers = new BrowserToolHandlers(sessionManager);
        try {
          await sessionManager.init();
        } catch {
          return { success: false, error: 'Browser tools require Playwright. Install with: npm install playwright' };
        }

        const handlerMap: Record<string, (p: any) => Promise<any>> = {
          browser_navigate: handlers.handleNavigate.bind(handlers),
          browser_click: handlers.handleClick.bind(handlers),
          browser_screenshot: handlers.handleScreenshot.bind(handlers),
          browser_evaluate: handlers.handleEvaluate.bind(handlers),
          browser_console: handlers.handleConsole.bind(handlers),
          browser_network: handlers.handleNetwork.bind(handlers),
          browser_scroll: handlers.handleScroll.bind(handlers),
          browser_wait: handlers.handleWait.bind(handlers)
        };
        const handler = handlerMap[name];
        if (handler) {
          const result = await handler(args);
          return { success: result.success, data: result.data, error: result.error };
        }
        return { success: false, error: `Unknown browser tool: ${name}` };
      }

      // ─── MCP tools (RW-C7-03-R2: 실 호출) ────────────────
      // Harness alias: web_search → mcp_searxng_web_search when SearXNG MCP is connected
      if (name === 'web_search') {
        const { RuntimeServices } = await import('../core/RuntimeServices');
        const client = RuntimeServices.getMcpClient();
        const mcpName = 'mcp_searxng_web_search';
        if (!client?.getTool(mcpName)) {
          return {
            success: false,
            error: 'web_search requires SearXNG MCP (mcp_searxng_web_search). Check agent-k.mcp.servers and run MCP Reload.',
          };
        }
        try {
          const result = await client.callTool(mcpName, args as Record<string, unknown>);
          return { success: true, data: result };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      }
      if (name === 'web_fetch') {
        const url = String(args.url || args.href || '').trim();
        if (!url) {
          return { success: false, error: 'web_fetch requires url' };
        }
        try {
          const u = new URL(url);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return { success: false, error: 'web_fetch only supports http/https' };
          }
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), Number(args.timeout) || 20000);
          const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Agent-K/1.0', Accept: 'text/*,application/json,*/*' }
          });
          clearTimeout(timer);
          const text = await res.text();
          const max = Math.min(Number(args.maxLength) || 80_000, 200_000);
          return {
            success: res.ok,
            data: {
              url,
              status: res.status,
              contentType: res.headers.get('content-type'),
              body: text.slice(0, max),
              truncated: text.length > max
            },
            error: res.ok ? undefined : `HTTP ${res.status}`
          };
        } catch (err: any) {
          return { success: false, error: err?.message || 'web_fetch failed' };
        }
      }
      if (name === 'mcp_list_tools') {
        const { RuntimeServices } = await import('../core/RuntimeServices');
        const client = RuntimeServices.getMcpClient();
        const tools = client?.getAllTools() || [];
        return {
          success: true,
          data: { tools: tools.map(t => ({ name: t.name, description: t.description })), count: tools.length }
        };
      }
      if (name === 'mcp_call_tool') {
        const { RuntimeServices } = await import('../core/RuntimeServices');
        const client = RuntimeServices.getMcpClient();
        if (!client) {
          return { success: false, error: 'MCPClient not initialized' };
        }
        const serverName = (args.serverName as string) || '';
        let toolName = (args.name || args.toolName || args.tool) as string;
        if (!toolName) {
          return { success: false, error: 'mcp_call_tool requires name/toolName' };
        }
        // Normalize to mcp_<server>_<tool> if caller passed bare tool + serverName
        if (serverName && !toolName.startsWith('mcp_')) {
          toolName = `mcp_${serverName}_${toolName}`;
        }
        try {
          const result = await client.callTool(toolName, (args.arguments || args.args || {}) as Record<string, unknown>);
          return { success: true, data: result };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      }
      // Prefixed mcp_<server>_<tool> direct dispatch
      if (name.startsWith('mcp_') && name !== 'mcp_call_tool' && name !== 'mcp_list_tools') {
        const { RuntimeServices } = await import('../core/RuntimeServices');
        const client = RuntimeServices.getMcpClient();
        if (!client) {
          return { success: false, error: 'MCPClient not initialized' };
        }
        try {
          const result = await client.callTool(name, args as Record<string, unknown>);
          return { success: true, data: result };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      }

      // ─── checkpoint_create / checkpoint_restore (C4-T03) ─────
      if (name === 'checkpoint_create' || name === 'checkpoint_restore') {
        const { RuntimeServices } = await import('../core/RuntimeServices');
        const { CheckpointManager } = await import('../checkpoint/CheckpointManager');
        const { getWorkspaceRoot, resolveWorkspacePath } = await import('../tools/writeExecutors');
        const mgr = RuntimeServices.getCheckpointManager() ?? new CheckpointManager();

        if (name === 'checkpoint_create') {
          const filePaths: string[] = [];
          if (Array.isArray(args.files)) {
            for (const f of args.files as string[]) {
              const resolved = resolveWorkspacePath(String(f));
              if ('abs' in resolved) filePaths.push(resolved.abs);
            }
          } else {
            try {
              const vscode = await import('vscode');
              for (const doc of vscode.workspace.textDocuments) {
                if (doc.uri.scheme === 'file') {
                  filePaths.push(doc.uri.fsPath);
                }
              }
            } catch {
              /* non-VS Code test host */
            }
          }
          const label = (args.label as string) || 'User checkpoint';
          const cp = await mgr.createCheckpoint(filePaths, label, {
            turnNumber: this._state.currentTurn,
            mode: this.config.mode,
            trigger: 'user_request'
          });
          return {
            success: true,
            data: {
              checkpointId: cp.id,
              label: cp.label,
              fileCount: cp.fileSnapshots.length,
              workspaceRoot: getWorkspaceRoot()
            }
          };
        }

        const checkpointId = args.id as string | undefined;
        if (!checkpointId) {
          return {
            success: true,
            data: {
              checkpoints: mgr.getCheckpoints().map(c => ({
                id: c.id,
                label: c.label,
                timestamp: c.timestamp,
                fileCount: c.fileSnapshots.length
              }))
            }
          };
        }
        const restoreResult = await mgr.restore(checkpointId);
        return {
          success: restoreResult.failed.length === 0,
          data: restoreResult,
          error: restoreResult.failed.length > 0 ? `Failed to restore: ${restoreResult.failed.join(', ')}` : undefined
        };
      }

      // ─── skill_run (C7-T20) ───────────────────────────
      if (name === 'skill_run') {
        const { getSkillTool } = await import('../tools/orchestration/SkillTool');
        const skillTool = getSkillTool();
        const result = skillTool.handleRun({
          skill: (args.skill as string) || (args.name as string) || '',
          input: args.input as string | undefined
        });
        return {
          success: result.success,
          data: result.data,
          error: result.error
        };
      }

      // ─── edit / write / delete / terminal (C2 write executors) ───
      const {
        executeEditFile,
        executeWriteFile,
        executeDeleteFile,
        executeRunTerminalCmd
      } = await import('../tools/writeExecutors');

      if (name === 'run_terminal_cmd') {
        const command = String(
          (args.command as string) ||
            (args.cmd as string) ||
            (args.shell as string) ||
            ''
        ).trim();
        const id = `term_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const turn = this._state.currentTurn || 1;
        const t0 = Date.now();
        await this.config.onTerminalEvent?.({
          id,
          phase: 'start',
          command,
          description:
            typeof args.description === 'string' ? args.description : undefined,
          turn,
          status: 'running'
        });
        const result = await executeRunTerminalCmd(args, {
          onChunk: (chunk, stream) => {
            void this.config.onTerminalEvent?.({
              id,
              phase: 'chunk',
              chunk,
              stream,
              turn
            });
          }
        });
        const data =
          result.data && typeof result.data === 'object'
            ? (result.data as Record<string, unknown>)
            : {};
        await this.config.onTerminalEvent?.({
          id,
          phase: 'end',
          command: String(data.command || command),
          cwd: data.cwd != null ? String(data.cwd) : undefined,
          exitCode:
            data.exitCode === null || data.exitCode === undefined
              ? null
              : Number(data.exitCode),
          error: result.error,
          durationMs: Date.now() - t0,
          turn,
          status: result.success ? 'done' : 'error',
          // Full buffers for clients that missed chunks
          chunk: [
            data.stdout != null ? String(data.stdout) : '',
            data.stderr
              ? `\n${String(data.stderr)}`
              : ''
          ].join('').slice(0, 80_000) || undefined
        });
        return result;
      }
      if (name === 'terminal_output' || name === 'process_list') {
        return {
          success: false,
          error:
            `${name} is not available yet — run_terminal_cmd captures stdout/stderr in the same turn. ` +
            'Background session polling is not implemented.'
        };
      }

      const writeExecutors: Record<string, (input: ToolInput) => Promise<ToolOutput>> = {
        edit_file: executeEditFile,
        write_file: executeWriteFile,
        delete_file: executeDeleteFile
      };
      const writeExec = writeExecutors[name];
      if (writeExec) {
        return await writeExec(args);
      }

      // Fallback: unknown-but-registered tool
      return {
        success: false,
        error: `Tool "${name}" is registered but no executor is available. Check the tool implementation.`
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  stop(): void {
    this.abortController?.abort();
    this._state.status = 'stopped';
    this.config.onStatus?.('stopped');
    // RW-C6-05-R2 / RW-C5-02: Stop cancels pending UI waits
    void import('../core/RuntimeServices').then(({ RuntimeServices }) => {
      RuntimeServices.cancelReproduce();
      RuntimeServices.cancelQuestion('agent loop stopped');
    }).catch(() => { /* ignore */ });
  }

  async reset(newMode?: Mode): Promise<void> {
    this.stop();
    this.messages = [];
    this._state.status = 'idle';
    this._state.currentTurn = 0;
    this._state.startTime = Date.now();
    if (newMode) {
      this.config.mode = newMode;
      const modeConfig = modeRegistry.getModeConfig(newMode);
      this._state.totalTurns = modeConfig.maxTurns;
    }
  }
}
