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
import { resolveVerificationHookOptions } from '../verification/config';
import { configManager } from '../core/ConfigManager';
import { RunTimeoutGuard, resolveTurnTimeoutMs } from './turnTimeout';
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

/** After tools finish — require a real user-visible wrap-up message */
const WRAP_UP_NUDGE = `Tools for this request are finished. Write the user-visible final reply now in the user's language (Korean if they wrote Korean). Do NOT call tools.

Required:
1. What you changed (key files / edits) — brief bullets
2. Why / root cause (if fixing or debugging) — one short section
3. Result and what's left (if anything)

Use clean Markdown (## headings, - bullets). No "Proceeding to…", no "이제 작성하겠습니다" status lines — this is the closing message the user reads under Worked for.`;

/** Plan research/planning — wrap-up is findings, not "what I edited" */
const WRAP_UP_NUDGE_PLAN = `Tools for this PLAN turn are finished. Write the user-visible reply now in Korean (if the user wrote Korean). Do NOT call tools.

If you are drafting the plan (planning stage): output the FULL plan markdown with Context, Architecture, TODOs (\`- [ ]\`), Risks — then stop. Do NOT ask more questions.
If you are still researching: short findings only. If a real decision remains and ask_question is available, you may ask once — otherwise stop and wait.
No raw file dumps. If the user only said a greeting, a short hello is enough.`;

/** Second chance for tiny models that ignore the long nudge */
const WRAP_UP_NUDGE_SIMPLE = `Stop. Reply to the user now in Korean with a short useful summary of the tool results. No tools. No raw dumps. At least 3 sentences.`;

/** Empty/weak stop after tools — force the model to keep working (Agent/build only) */
const MISSION_CONTINUE_AGENT = `STOP — the user's task is NOT finished. You ran tools but returned no real completion.

Continue NOW with the next tool_calls (read more, edit/write, or run commands as needed). Do not end empty. Do not dump raw tool logs. Prefer tool_calls over status prose.`;

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
  /**
   * ADDON-T02: whole-run wall-clock limit for the whole run (ms).
   * 0 disables. Default from agent-k.turnTimeoutMs (900000 idle).
   * Timer resets on LLM/tool activity (idle semantics).
   */
  turnTimeoutMs?: number;
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
  /**
   * Host chat: re-bind ask_question → webview right before wait.
   * Avoids RuntimeServices notifier races (interrupt / new tab / concurrent send).
   */
  onAskQuestion?: (q: {
    id: string;
    question: string;
    options?: string[];
    required?: boolean;
    allowMultiple?: boolean;
  }) => void;
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
  /**
   * PHASE-1A diagnostics: observe the natural-language classifiers
   * (isWeakFinalAnswer / looksLikeClosingSummary / claimsContinueWork /
   * looksLikeBrokenToolPayload) that decide whether prose is a real
   * final answer, a continuation, or a broken tool payload.
   * Never changes control flow — purely an observation hook, default no-op.
   * Wire to an OutputChannel/console in dev builds to find misclassification
   * before touching the classifiers themselves.
   */
  onClassifyEvent?: (event: {
    fn:
      | 'isWeakFinalAnswer'
      | 'looksLikeClosingSummary'
      | 'claimsContinueWork'
      | 'looksLikeBrokenToolPayload';
    result: boolean;
    /** First 160 chars only — diagnostics, not a transcript */
    sample: string;
    turn?: number;
  }) => void;
  /**
   * PHASE-1A diagnostics (cont'd): fires exactly when
   * synthesizeFromToolResults() is about to hand the user "모델이 도구만
   * 실행하고 임무를 끝내지 않은 채 중단했습니다" — i.e. after
   * MAX_MISSION_CONTINUES nudges AND both wrap-up passes all came back
   * empty/weak. Reports enough to tell "model hit context limits" from
   * "model just won't stop calling tools" apart without guessing: total
   * message count, the rough token estimate already computed for
   * compaction (see estimateTotalTokens/contextBudget), and the tool
   * names that ran right before the loop gave up. Never changes control
   * flow — observation only, default no-op, same as onClassifyEvent.
   */
  onMissionExhausted?: (event: {
    turn?: number;
    messageCount: number;
    estimatedTokens: number;
    contextBudget: number;
    missionContinueNudges: number;
    lastTools: string[];
  }) => void;
  /**
   * PHASE-1A diagnostics (cont'd): fires every time the HARB-T26 compaction
   * pass runs (every 5 turns, or when estimateTotalTokens() crosses 90% of
   * contextBudget). Reports which level fired (truncate/drop/micro_summary/
   * full) and how many messages went in vs came out, so a run that goes
   * quiet or ends early can be checked against "was compaction eating the
   * transcript" without re-instrumenting the loop each time. Never changes
   * control flow — observation only, default no-op, same as onClassifyEvent.
   */
  onCompaction?: (event: {
    turn: number;
    level: 'truncate' | 'drop' | 'micro_summary' | 'full';
    messagesBefore: number;
    messagesAfter: number;
    droppedSections: string[];
  }) => void;
  /**
   * PHASE-1A diagnostics (cont'd): fires each time the loop forces another
   * tool round because the model stopped empty/weak while missionStillOpen()
   * is true (see requestMissionContinue). High counts close to
   * MAX_MISSION_CONTINUES (8) mean the model kept stopping without a real
   * answer and the loop kept re-prompting it — a different symptom from
   * onMissionExhausted (that one fires once, at the very end, after this
   * has already maxed out). Never changes control flow — observation only.
   */
  onMissionContinue?: (event: {
    turn: number;
    nudgeCount: number;
    maxNudges: number;
  }) => void;
  /**
   * HARB-T27: fires when the run hits maxTurns while still actively
   * tool-calling and the loop auto-extends the turn budget instead of
   * stopping and asking the user to type "계속" (Cursor-style continuation).
   * Not fired for a genuine max-turns give-up — that still ends the run and
   * shows the "Max turns reached" message, now after MAX_AUTO_CONTINUE_ROUNDS
   * extensions instead of just one round.
   */
  onAutoContinue?: (event: {
    round: number;
    maxRounds: number;
    previousTotalTurns: number;
    newTotalTurns: number;
  }) => void;
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
  /** ADDON-T11: provider-reported token usage per stream pass (status bar cost tracker) */
  onUsage?: (usage: { promptTokens?: number; completionTokens?: number }) => void;
}

export type LoopStatus = 'idle' | 'streaming' | 'tool_executing' | 'stopped' | 'completed' | 'error' | 'doom_loop' | 'timeout';

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
  /**
   * HARB-T26-FIX2: the loop turn this message was produced in. Needed so
   * compaction's "protect last N turns" window looks at each message's own
   * turn instead of assuming every message belongs to the current turn.
   * system/user seed messages may omit this — they're always protected by role.
   */
  turn?: number;
}

export class AgentLoopController {
  private config: LoopConfig;
  private _state: LoopState;
  private abortController: AbortController | null = null;
  /** ADDON-T02: whole-run wall-clock timer */
  private runTimeoutGuard = new RunTimeoutGuard();
  private timedOut = false;
  private messages: AgentMessage[] = [];

  /**
   * HARB-T26-FIX2: single choke point for appending to `this.messages` so
   * every message is stamped with the turn it was actually produced in.
   * Do not call `this.messages.push(...)` directly — use this instead.
   */
  private pushMessage(msg: AgentMessage): void {
    this.messages.push({ ...msg, turn: msg.turn ?? this._state.currentTurn });
  }
  /** HARB-T26-FIX3: wall-clock start of the current loop turn, for accurate onTurnEnd elapsed time */
  private turnStartedAt = Date.now();

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
  /** After tools: forced user-facing wrap-up message — once per run */
  private wrapUpRetried = false;
  /** Second short wrap-up for models that ignore the first nudge */
  private wrapUpSimpleRetried = false;
  /** Reasoning said "I'll read…" but emitted no tool_calls — nudge once */
  private toolIntentNudged = false;
  /** Said "writing files…" without write_file — nudge once more */
  private writeIntentNudged = false;
  /** Agent returned "I'll continue…" prose after tools — keep nudging (capped) */
  private continueIntentNudges = 0;
  private static readonly MAX_CONTINUE_NUDGES = 2;
  /** Empty/weak stop after tools — force mission continuation (capped) */
  private missionContinueNudges = 0;
  private static readonly MAX_MISSION_CONTINUES = 8;
  /**
   * HARB-T27: Cursor-style auto-continue. When the run hits maxTurns while
   * still actively tool-calling (never reached a real final answer), extend
   * the turn budget and keep going instead of stopping and asking the user
   * to type "계속". Capped so a genuinely stuck task can't run forever.
   */
  private autoContinueRounds = 0;
  private static readonly MAX_AUTO_CONTINUE_ROUNDS = 3;
  /** edit_file / write_file / delete_file succeeded this run */
  private writeToolsUsedThisRun = false;
  /** Any tool ran this run — subsequent LLM passes use short mid-explore thinking */
  private toolsRanThisRun = false;
  /** Plan research ended in prose without ask_question — nudge once */
  private planAskQuestionNudged = false;
  /** ask_question ran at least once this loop */
  private askedQuestionThisRun = false;
  /** Latest real user request for this run (not internal nudges) */
  private runUserMessage = '';
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

    // HARB: 하네스 컴포넌트 초기화 (ADDON-T01: tier + settings → test verification)
    this.prefetchEngine = new PrefetchEngine();
    const testOverride = configManager.get('agent-k.verification.testEnabled');
    const verOpts = resolveVerificationHookOptions(this.currentTier, {
      testEnabled:
        typeof testOverride === 'boolean' ? testOverride : undefined,
    });
    this.autoVerificationHook = createAutoVerificationHook(verOpts);
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
    this._state.error = undefined;
    this.emptyFinalRetried = false;
    this.wrapUpRetried = false;
    this.wrapUpSimpleRetried = false;
    this.toolIntentNudged = false;
    this.writeIntentNudged = false;
    this.continueIntentNudges = 0;
    this.missionContinueNudges = 0;
    this.autoContinueRounds = 0;
    this.writeToolsUsedThisRun = false;
    this.toolsRanThisRun = false;
    this.planAskQuestionNudged = false;
    this.askedQuestionThisRun = false;
    this.runUserMessage = userMessage;

    this.messages = [
      { role: 'system', content: this.config.systemPrompt || modeRegistry.getSystemPrompt(this.config.mode) },
      { role: 'user', content: userMessage }
    ];

    this.armRunTimeout();
    try {
      await this.runLoop();
    } finally {
      this.clearRunTimeout();
    }
  }

  async continue(messages: AgentMessage[]): Promise<void> {
    this.abortController = new AbortController();
    this._state.status = 'streaming';
    this._state.error = undefined;
    this.messages = messages;
    this.emptyFinalRetried = false;
    this.wrapUpRetried = false;
    this.wrapUpSimpleRetried = false;
    this.toolIntentNudged = false;
    this.writeIntentNudged = false;
    this.continueIntentNudges = 0;
    this.missionContinueNudges = 0;
    this.autoContinueRounds = 0;
    this.writeToolsUsedThisRun = false;
    this.toolsRanThisRun = false;
    this.planAskQuestionNudged = false;
    this.askedQuestionThisRun = false;
    this.runUserMessage = this.extractLatestUserRequest(messages);
    this.doomDetector.reset();
    this.armRunTimeout();
    try {
      await this.runLoop();
    } finally {
      this.clearRunTimeout();
    }
  }

  /** ADDON-T02: resolve wall-clock ms (0 = disabled). */
  resolveTurnTimeoutMs(): number {
    return resolveTurnTimeoutMs(
      this.config.turnTimeoutMs,
      configManager.get('agent-k.turnTimeoutMs')
    );
  }

  private clearRunTimeout(): void {
    this.runTimeoutGuard.clear();
  }

  /** Keep long plan/agent runs alive while tools / streams are still progressing. */
  private bumpRunTimeout(): void {
    this.runTimeoutGuard.bump();
  }

  private armRunTimeout(): void {
    this.timedOut = false;
    const ms = this.resolveTurnTimeoutMs();
    this.runTimeoutGuard.arm(ms, {
      onTimeout: (limitMs) => {
        this.timedOut = true;
        this._state.status = 'timeout';
        this._state.error = `Run idle timeout after ${limitMs}ms with no activity (agent-k.turnTimeoutMs)`;
        this.abortController?.abort();
        this.config.onStatus?.('timeout');
        this.config.onError?.(new Error(this._state.error));
        void import('../core/RuntimeServices')
          .then(({ RuntimeServices }) => {
            RuntimeServices.cancelReproduce();
            RuntimeServices.cancelQuestion('agent loop timed out');
          })
          .catch(() => {
            /* ignore */
          });
      },
    });
  }

  private async runLoop(): Promise<void> {
    while (this._state.currentTurn < this._state.totalTurns) {
      if (this.abortController?.signal.aborted) {
        this._state.status = this.timedOut ? 'timeout' : 'stopped';
        this.config.onStatus?.(this._state.status);
        return;
      }

      this._state.currentTurn++;
      this.turnStartedAt = Date.now();
      this.bumpRunTimeout();
      this._state.status = 'streaming';
      this.config.onStatus?.(this._state.status);
      this.config.onTurnStart?.(this._state.currentTurn);

      // ─── HARB: Prefetch at turn start ─────────────────────
      const lastUserMsg = [...this.messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        try {
          const prefetchResult = await this.prefetchEngine.prefetch(
            lastUserMsg.content,
            this.config.mode
          );
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

      // --- Phase 2: Process tool calls (PromptTurnStructure: ≤12 tools, ≤6 writes) ---
      if (response.toolCalls && response.toolCalls.length > 0) {
        this._state.status = 'tool_executing';
        this.config.onStatus?.(this._state.status);

        // ─── HARB: Turn Structure Validation ────────────────
        const turnValidation = validateTurnStructure(
          response.toolCalls.map(tc => ({ name: tc.name })),
        );
        const { DEFAULT_TURN_STRUCTURE } = await import('../harness/PromptTurnStructure');
        let toolCalls = response.toolCalls;
        /** Write/tool calls over the limit — still returned as errors so the model knows they did not run */
        const deferredOverLimit: typeof response.toolCalls = [];
        if (!turnValidation.valid) {
          // Was: silent drop of extra writes → model thought files were created.
          // Now: keep up to limits for execution; excess get explicit failure results.
          const maxN = DEFAULT_TURN_STRUCTURE.maxToolCallsPerTurn;
          const maxW = DEFAULT_TURN_STRUCTURE.maxWriteToolsPerTurn;
          const writeTools = new Set([
            'edit_file', 'write_file', 'delete_file', 'run_terminal_cmd'
          ]);
          let writes = 0;
          const kept: typeof response.toolCalls = [];
          for (const tc of response.toolCalls) {
            const isWrite = writeTools.has(tc.name);
            if (isWrite && writes >= maxW) {
              deferredOverLimit.push(tc);
              continue;
            }
            if (kept.length >= maxN) {
              deferredOverLimit.push(tc);
              continue;
            }
            if (isWrite) writes++;
            kept.push(tc);
          }
          toolCalls = kept;
          if (toolCalls.length === 0 && deferredOverLimit.length === 0) {
            this.pushMessage({
              role: 'assistant',
              content:
                `Turn structure error: ${turnValidation.errors.join('; ')}. Please use ≤${maxN} tools per turn.`
            });
            this.consecutiveFailures++;
            continue;
          }
        }

        // Ask / Plan (non-build): strip write tools before timeline — never show "Edit attempted"
        const { isWriteToolName } = await import('../plan/writeGate');
        const planBuild =
          this.config.mode === 'plan' && this.config.planStage === 'build';
        const modeBlocksWrites =
          this.config.mode === 'ask' ||
          (this.config.mode === 'plan' && !planBuild);
        const blockedModeWrites: typeof toolCalls = [];
        if (modeBlocksWrites) {
          const keptMode: typeof toolCalls = [];
          for (const tc of toolCalls) {
            if (isWriteToolName(tc.name)) blockedModeWrites.push(tc);
            else keptMode.push(tc);
          }
          toolCalls = keptMode;
        }

        // Keep assistant tool_calls in history (OpenAI-style multi-turn)
        this.pushMessage({
          role: 'assistant',
          content: response.content || '',
          toolCalls: [...toolCalls, ...deferredOverLimit, ...blockedModeWrites]
        });

        // Soft deny for Ask/Plan write attempts — model learns tools are unavailable, UI stays quiet
        for (const tc of blockedModeWrites) {
          const soft = {
            success: false as const,
            error:
              this.config.mode === 'ask'
                ? `[Ask Mode] "${tc.name}" is unavailable. Answer in Markdown or ask the user to switch to Agent mode. Do not retry write tools.`
                : `[Plan Mode] "${tc.name}" is unavailable until Approve & Execute. Continue with research/ask_question/plan prose only.`
          };
          this.pushMessage({
            role: 'tool',
            toolCallId: tc.id,
            name: tc.name,
            content: JSON.stringify({ error: soft.error })
          });
          // Intentionally skip onToolCall — no Edit attempted row in the timeline
        }

        // Explicit failures for truncated calls (must not look like success)
        for (const tc of deferredOverLimit) {
          const err = {
            success: false as const,
            error:
              `Skipped: turn allows at most ${DEFAULT_TURN_STRUCTURE.maxWriteToolsPerTurn} write/terminal tools ` +
              `and ${DEFAULT_TURN_STRUCTURE.maxToolCallsPerTurn} total tools. ` +
              `Re-call "${tc.name}" next turn — this invocation did NOT run.`
          };
          this.pushMessage({
            role: 'tool',
            toolCallId: tc.id,
            name: tc.name,
            content: JSON.stringify({ error: err.error })
          });
          await this.config.onToolResult?.(tc.name, err, tc.id);
        }

        if (toolCalls.length === 0) {
          // Soft-denied Ask/Plan writes already answered — next model turn continues cleanly
          if (blockedModeWrites.length === 0) {
            this.consecutiveFailures++;
          }
          continue;
        }

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
                this.pushMessage({
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

          this.pushMessage({
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
            if (
              toolCall.name === 'edit_file' ||
              toolCall.name === 'write_file' ||
              toolCall.name === 'delete_file'
            ) {
              this.writeToolsUsedThisRun = true;
            }
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
                this.pushMessage({
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
            this.pushMessage({
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
        this.toolsRanThisRun = true;
        // Next LLM turn may plan again — allow fresh nudges after tools ran
        this.toolIntentNudged = false;
        this.emptyFinalRetried = false;
        this.wrapUpRetried = false;
        this.wrapUpSimpleRetried = false;
      } else {
        // No tool calls → assistant response only (end of turn chain for this request)
        const finalContent = response.content || '';
        this.pushMessage({
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
            // HARB-T26-FIX: carry tool_call linkage through compaction so
            // buildProviderMessages() can still pair assistant.tool_calls
            // with tool.tool_call_id after this pass.
            toolCalls: m.toolCalls,
            toolCallId: m.toolCallId,
            metadata: {
              // HARB-T26-FIX2: use each message's own turn, not the current
              // one. Stamping every message with currentTurn made the
              // "protect last 6 turns" window see the whole transcript as
              // "recent", so truncate/drop/summary never actually fired.
              // system/user messages have no turn — markProtected() already
              // protects them by role, so a fallback here is harmless.
              turn: m.turn ?? this._state.currentTurn,
              type: m.role === 'tool' ? 'tool_result' : undefined,
              toolName: m.name
            },
          }));
          const compacted = this.compactionEngine.compact(ctxMessages);
          const messagesBefore = this.messages.length;
          this.messages = compacted.messages.map((m): AgentMessage => ({
            role: m.role as AgentMessage['role'],
            content: m.content,
            name: m.metadata?.toolName,
            // HARB-T26-FIX: without these, every assistant tool-call turn and
            // every tool result loses its pairing after compaction, which
            // corrupts the next provider request and can silently end the run.
            // ContextMessage uses arguments: unknown; these were ToolInput going in.
            toolCalls: m.toolCalls as AgentMessage['toolCalls'],
            toolCallId: m.toolCallId,
            // HARB-T26-FIX2: carry the real turn forward so a later
            // compaction pass (turn 10, 15, ...) still protects correctly.
            turn: m.metadata?.turn,
          }));
          this.config.onCompaction?.({
            turn: this._state.currentTurn,
            level: compacted.level,
            messagesBefore,
            messagesAfter: this.messages.length,
            droppedSections: compacted.droppedSections,
          });
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
        // HARB-T26-FIX3: was Date.now() here — that stamps the END of the
        // turn, not the start, making any elapsed-time diagnostic always
        // read ~0ms. Use the timestamp captured when the turn began instead.
        startTime: this.turnStartedAt
      });
    }

    if (this._state.currentTurn >= this._state.totalTurns) {
      // HARB-T27: reaching here only happens when the last several turns
      // were still actively tool-calling (the "no tool_calls" branch above
      // always `return`s early with a real final answer). That means the
      // model was still working, not stuck empty — so extend the budget and
      // keep going instead of stopping and making the user type "계속".
      if (this.autoContinueRounds < AgentLoopController.MAX_AUTO_CONTINUE_ROUNDS) {
        this.autoContinueRounds++;
        const modeConfig = modeRegistry.getModeConfig(this.config.mode);
        const extension = Math.max(modeConfig.maxTurns, 10);
        const previousTotalTurns = this._state.totalTurns;
        this._state.totalTurns = previousTotalTurns + extension;
        this.config.onAutoContinue?.({
          round: this.autoContinueRounds,
          maxRounds: AgentLoopController.MAX_AUTO_CONTINUE_ROUNDS,
          previousTotalTurns,
          newTotalTurns: this._state.totalTurns,
        });
        return this.runLoop();
      }

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
          `Max turns (${this._state.totalTurns}) reached after ${this.autoContinueRounds} automatic ` +
          `continue${this.autoContinueRounds === 1 ? '' : 's'}. Type "계속" to resume, or narrow the task.`
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
        const schemas = toolRegistry
          .getSchemas(this.config.mode, this.currentTier, {
            planStage: this.config.planStage
          })
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

        // Reasoning plans "I'll read/write…" but no tool_calls — nudge with tools still on
        const said = `${result.reasoning || ''}\n${result.content || ''}`;
        const intendsTools = this.reasoningIntendsTools(said);
        const pendingWrites =
          !this.writeToolsUsedThisRun &&
          this.hasWriteToolSchemas(schemas) &&
          this.claimsPendingFileWrites(said);
        if (
          (intendsTools || pendingWrites) &&
          schemas.length > 0 &&
          !this.toolIntentNudged
        ) {
          this.toolIntentNudged = true;
          if ((result.reasoning || '').trim()) {
            void this.config.onReasoning?.(result.reasoning);
          }
          this.pushMessage({
            role: 'user',
            content: pendingWrites
              ? 'You claimed you would write/create files but emitted no write_file/edit_file. Call those tools now for the files you named. No planning prose — tool_calls only.'
              : 'Your previous turn only contained reasoning/plans, not tool_calls. Call the needed tools now (≤12 per turn; prefer read_files for many paths). No prose — emit tool_calls only.'
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

        // Still promising writes after nudge — one more forced write pass (agent/build)
        const said2 = `${result.reasoning || ''}\n${result.content || ''}`;
        if (
          !this.writeToolsUsedThisRun &&
          !this.writeIntentNudged &&
          this.hasWriteToolSchemas(schemas) &&
          this.claimsPendingFileWrites(said2) &&
          (this.config.mode === 'agent' || this.config.planStage === 'build')
        ) {
          this.writeIntentNudged = true;
          this.pushMessage({
            role: 'user',
            content:
              'STOP summarizing. Emit write_file and/or edit_file tool_calls for the next plan files now. Do not say "Proceeding to write" — call the tools.'
          });
          result = await this.streamOnce(this.buildProviderMessages(), schemas);
          if (result === null) return null;
          if (result.toolCalls && result.toolCalls.length > 0) {
            return { toolCalls: this.normalizeToolCalls(result.toolCalls, result.content || '') };
          }
          const recoveredW = this.recoverToolCallsFromContent(
            result.content || result.reasoning || ''
          );
          if (recoveredW.length > 0) {
            return { toolCalls: recoveredW };
          }
        }

        // Plan mode: never force ask_question / more research — model may stop after tools
        const prose = (result.content || '').trim();
        const hadToolsAlready = this.messages.some((m) => m.role === 'tool');
        // After commands/reads: model often narrates "이제 생성하겠습니다" and stops — force tools
        if (
          prose &&
          prose !== '...' &&
          hadToolsAlready &&
          schemas.length > 0 &&
          (this.config.mode === 'agent' || this.config.planStage === 'build') &&
          this.claimsContinueWork(prose) &&
          !this.looksLikeClosingSummary(prose) &&
          this.continueIntentNudges < AgentLoopController.MAX_CONTINUE_NUDGES
        ) {
          this.continueIntentNudges++;
          if ((result.reasoning || '').trim()) {
            void this.config.onReasoning?.(result.reasoning);
          }
          // Keep narration in the provider transcript (UI already streamed deltas)
          const last = this.messages[this.messages.length - 1];
          if (
            !(
              last?.role === 'assistant' &&
              (last.content || '').trim() === prose
            )
          ) {
            this.pushMessage({ role: 'assistant', content: prose });
          }
          this.pushMessage({
            role: 'user',
            content:
              'Do not stop after explaining. Call the next tools now (write_file/edit_file/read_file/run_terminal_cmd as needed). No more status prose — tool_calls only.'
          });
          result = await this.streamOnce(this.buildProviderMessages(), schemas);
          if (result === null) return null;
          if (result.toolCalls && result.toolCalls.length > 0) {
            return { toolCalls: this.normalizeToolCalls(result.toolCalls, result.content || '') };
          }
          const recoveredC = this.recoverToolCallsFromContent(
            result.content || result.reasoning || ''
          );
          if (recoveredC.length > 0) {
            return { toolCalls: recoveredC };
          }
          const prose2 = (result.content || '').trim();
          if (
            prose2 &&
            prose2 !== '...' &&
            !this.isWeakFinalAnswer(prose2) &&
            !this.missionStillOpen()
          ) {
            if ((result.reasoning || '').trim()) {
              void this.config.onReasoning?.(result.reasoning);
            }
            return { content: prose2, toolCalls: [] };
          }
          // Fall through — force wrap-up / mission continue below
        }

        const candidateProse = (result.content || '').trim() || prose;
        let lastReasoning = (result.reasoning || '').trim();
        if (candidateProse && candidateProse !== '...') {
          const canFinish =
            !hadToolsAlready ||
            this.looksLikeClosingSummary(candidateProse) ||
            (!this.isWeakFinalAnswer(candidateProse) && !this.missionStillOpen());
          if (canFinish) {
            if (lastReasoning) {
              void this.config.onReasoning?.(result.reasoning);
            }
            return { content: candidateProse, toolCalls: [] };
          }
          // Mission still open — keep prose in transcript, then force tools
          const last = this.messages[this.messages.length - 1];
          if (
            !(
              last?.role === 'assistant' &&
              (last.content || '').trim() === candidateProse
            )
          ) {
            this.pushMessage({ role: 'assistant', content: candidateProse });
          }
        }

        if (lastReasoning) {
          void this.config.onReasoning?.(result.reasoning);
        }

        const hadTools = hadToolsAlready;
        if (hadTools && !this.emptyFinalRetried) {
          this.emptyFinalRetried = true;
          if (
            !this.writeToolsUsedThisRun &&
            this.hasWriteToolSchemas(schemas) &&
            (this.config.mode === 'agent' || this.config.planStage === 'build')
          ) {
            // After research tools: force implementation instead of "final analysis, no tools"
            this.pushMessage({
              role: 'user',
              content:
                'Tool results are above. Apply the approved plan now: call write_file/edit_file for the next files. Do not write a summary — emit tool_calls only.'
            });
            const retry = await this.streamOnce(this.buildProviderMessages(), schemas);
            if (retry === null) return null;
            if (retry.toolCalls && retry.toolCalls.length > 0) {
              return { toolCalls: this.normalizeToolCalls(retry.toolCalls, retry.content || '') };
            }
            const recoveredWrite = this.recoverToolCallsFromContent(
              retry.content || retry.reasoning || ''
            );
            if (recoveredWrite.length > 0) {
              return { toolCalls: recoveredWrite };
            }
            if ((retry.reasoning || '').trim()) {
              void this.config.onReasoning?.(retry.reasoning);
            }
            const retryProse = (retry.content || '').trim();
            if (retryProse && retryProse !== '...' && !this.isWeakFinalAnswer(retryProse)) {
              return { content: retryProse, toolCalls: [] };
            }
            // Write force failed — fall through to mission continue
          }
        }

        // Empty/weak OR incomplete mission after tools → keep forcing tool_calls
        if (hadTools && schemas.length > 0 && this.missionStillOpen()) {
          while (
            this.missionContinueNudges < AgentLoopController.MAX_MISSION_CONTINUES
          ) {
            const cont = await this.requestMissionContinue(schemas, lastReasoning);
            if (cont === null) return null;
            if (cont && 'toolCalls' in cont && cont.toolCalls.length > 0) {
              return cont;
            }
            // Prose without tools while mission open = not done; stash & nudge again
            if (
              cont &&
              'content' in cont &&
              cont.content &&
              (!('toolCalls' in cont) || !cont.toolCalls?.length)
            ) {
              const last = this.messages[this.messages.length - 1];
              if (
                !(
                  last?.role === 'assistant' &&
                  (last.content || '').trim() === cont.content
                )
              ) {
                this.pushMessage({ role: 'assistant', content: cont.content });
              }
            }
            lastReasoning = '';
          }
        }

        // Continue budget exhausted: only finish if mission is actually closed
        if (hadTools) {
          if (
            !this.missionStillOpen() &&
            lastReasoning.length >= 120 &&
            this.looksLikeClosingSummary(lastReasoning)
          ) {
            return { content: lastReasoning, toolCalls: [] };
          }
          if (!this.missionStillOpen()) {
            const wrapped = await this.requestWrapUpPass();
            if (wrapped === null) return null;
            if (wrapped) return wrapped;
            const wrapped2 = await this.requestWrapUpPassSimple();
            if (wrapped2 === null) return null;
            if (wrapped2) return wrapped2;
          }
          return {
            content: this.synthesizeFromToolResults(),
            toolCalls: []
          };
        }

        // Intended tools but never called them — stop with clear message (don't spin)
        if ((intendsTools || this.claimsPendingFileWrites(said)) && !hadTools) {
          return {
            content:
              '모델이 파일을 읽거나 작성하겠다고만 하고 도구를 호출하지 않았습니다. Regenerate로 다시 시도하거나, 대상 파일 경로를 구체적으로 지정해 주세요.',
            toolCalls: []
          };
        }

        if (!hadTools && (result.reasoning || '').trim()) {
          return { content: result.reasoning.trim(), toolCalls: [] };
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
    opts?: {
      enableThinking?: boolean;
      /** Override composer effort for this pass */
      thinkingEffort?: import('../agent/thinkingEffort').ThinkingEffort;
    }
  ): Promise<{
    content: string;
    reasoning: string;
    toolCalls: Array<{ id: string; name: string; arguments: ToolInput }>;
  } | null> {
    if (!this.config.provider) return null;

    const userEffort = this.config.thinkingEffort || 'medium';
    // After tools: force low thinking so Exploring mid-Thoughts stay short
    const effort =
      opts?.thinkingEffort ??
      (this.toolsRanThisRun && userEffort !== 'off' ? 'low' : userEffort);
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

    this.bumpRunTimeout();
    const streamHeartbeat = setInterval(() => this.bumpRunTimeout(), 30_000);
    try {
      for await (const chunk of stream) {
        this.bumpRunTimeout();
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
        if (chunk.usage) {
          this.config.onUsage?.(chunk.usage);
        }
        // Check error BEFORE done — LiteLLMProvider's catch block yields
        // { error, done: true } in the SAME chunk on a network failure
        // (timeout / ECONNRESET / proxy reset — more common on Windows
        // behind VPN/AV/corporate proxies holding a long-lived SSE
        // connection open). `done` used to be checked first and `break`
        // out of the loop before `error` was ever read, so the real
        // network error was silently discarded and execution fell through
        // to the generic "응답이 비어 있습니다" message below — indistinguishable
        // from the model genuinely returning nothing.
        if (chunk.error) {
          this.config.onError?.(new Error(chunk.error));
          return null;
        }
        if (chunk.done) break;
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
    } finally {
      clearInterval(streamHeartbeat);
    }
  }

  /** Fallback prose when the model returns empty after successful tools */
  private synthesizeFromToolResults(): string {
    const tools = this.messages.filter((m) => m.role === 'tool').slice(-8);
    this.config.onMissionExhausted?.({
      turn: this._state.currentTurn,
      messageCount: this.messages.length,
      estimatedTokens: this.estimateTotalTokens(),
      contextBudget: this.contextBudget,
      missionContinueNudges: this.missionContinueNudges,
      lastTools: tools.map((m) => m.name || 'tool')
    });
    if (!tools.length) {
      return '도구는 실행됐지만 모델 최종 응답이 비었습니다. Regenerate로 다시 시도하세요.';
    }
    const names = tools.map((m) => m.name || 'tool');
    const uniq: string[] = [];
    for (const n of names) {
      if (!uniq.includes(n)) uniq.push(n);
    }
    const counts = uniq
      .map((n) => {
        const c = names.filter((x) => x === n).length;
        return c > 1 ? `${n}×${c}` : n;
      })
      .join(', ');
    return [
      '모델이 도구만 실행하고 임무를 끝내지 않은 채 중단했습니다.',
      '',
      `마지막 도구: ${counts}`,
      '',
      '아래 메시지 하단의 **다시 실행**을 눌러 이어서 진행해 주세요.'
    ].join('\n');
  }

  /**
   * After tools, empty/status-only prose is not enough — user needs a closing message
   * under Worked for (what changed, why, outcome).
   */
  private isWeakFinalAnswer(prose: string): boolean {
    const result = this.isWeakFinalAnswerImpl(prose);
    this.emitClassifyEvent('isWeakFinalAnswer', prose, result);
    return result;
  }

  private isWeakFinalAnswerImpl(prose: string): boolean {
    const t = (prose || '').trim();
    if (!t || t === '...') return true;
    if (this.looksLikeClosingSummary(t)) return false;
    if (t.length < 60) return true;
    if (this.claimsContinueWork(t) && t.length < 280) return true;
    if (
      /^(완료|끝|done|finished|ok\.?|완료했습니다\.?|수정했습니다\.?|적용했습니다\.?|진행했습니다\.?)$/i.test(
        t
      )
    ) {
      return true;
    }
    // Single short status sentence, no structure
    if (t.length < 120 && !/[#*\-\n]/.test(t) && this.claimsContinueWork(t)) {
      return true;
    }
    return false;
  }

  /** Real wrap-up (not "이제 작성하겠습니다" mid-work narration) */
  private looksLikeClosingSummary(prose: string): boolean {
    const result = this.looksLikeClosingSummaryImpl(prose);
    this.emitClassifyEvent('looksLikeClosingSummary', prose, result);
    return result;
  }

  private looksLikeClosingSummaryImpl(prose: string): boolean {
    const t = (prose || '').trim();
    if (this.looksLikeTaskHandoff(t)) return true;
    if (t.length < 80) return false;
    const hasStructure =
      /^#{1,3}\s/m.test(t) ||
      /^[-*]\s/m.test(t) ||
      t.split('\n').filter((l) => l.trim()).length >= 3;
    const hasOutcome =
      /수정|변경|원인|결과|완료|추가|생성|fixed|changed|because|root cause|summary|요약/i.test(
        t
      );
    // Still mid-work promises without outcome → not a closing summary
    if (
      /이제\s*(작성|생성|구현)|proceeding to write|will (now )?write/i.test(t) &&
      !hasOutcome
    ) {
      return false;
    }
    return hasStructure && hasOutcome;
  }

  /**
   * One dedicated no-tools LLM pass for the user-visible closing message.
   * @returns content result, undefined if already tried / skipped, null if aborted
   */
  private async requestWrapUpPass(): Promise<
    { content: string; toolCalls: [] } | null | undefined
  > {
    if (this.wrapUpRetried) return undefined;
    this.wrapUpRetried = true;
    const nudge =
      this.config.mode === 'plan' && this.config.planStage !== 'build'
        ? WRAP_UP_NUDGE_PLAN
        : WRAP_UP_NUDGE;
    this.pushMessage({ role: 'user', content: nudge });
    const retry = await this.streamOnce(this.buildProviderMessages(), [], {
      enableThinking: true,
      thinkingEffort: this.config.thinkingEffort || 'medium'
    });
    if (retry === null) return null;
    if ((retry.reasoning || '').trim()) {
      void this.config.onReasoning?.(retry.reasoning);
    }
    const retryProse = (retry.content || '').trim();
    if (retryProse && retryProse !== '...') {
      return { content: retryProse, toolCalls: [] };
    }
    if ((retry.reasoning || '').trim()) {
      return { content: retry.reasoning.trim(), toolCalls: [] };
    }
    return undefined;
  }

  /** Shorter wrap-up nudge when the long one is ignored by small models */
  private async requestWrapUpPassSimple(): Promise<
    { content: string; toolCalls: [] } | null | undefined
  > {
    if (this.wrapUpSimpleRetried) return undefined;
    this.wrapUpSimpleRetried = true;
    this.pushMessage({ role: 'user', content: WRAP_UP_NUDGE_SIMPLE });
    const retry = await this.streamOnce(this.buildProviderMessages(), [], {
      enableThinking: false
    });
    if (retry === null) return null;
    const retryProse = (retry.content || '').trim();
    if (retryProse && retryProse !== '...') {
      return { content: retryProse, toolCalls: [] };
    }
    if ((retry.reasoning || '').trim()) {
      return { content: retry.reasoning.trim(), toolCalls: [] };
    }
    return undefined;
  }

  /** Whether the run should keep tool-calling instead of ending */
  private missionStillOpen(): boolean {
    // Plan (pre-build): never force more tools/questions — stop when the model stops.
    // Forcing ask_question / write caused solo infinite research↔question loops.
    if (this.config.mode === 'plan' && this.config.planStage !== 'build') {
      return false;
    }
    if (this.isCasualUserTurn()) return false;
    // Agent / debug / plan-build: empty stop after tools means unfinished work
    return true;
  }

  /** Latest non-nudge user text for this run */
  private extractLatestUserRequest(messages: AgentMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role !== 'user') continue;
      const c = (m.content || '').trim();
      if (!c) continue;
      if (this.isInternalNudgeMessage(c)) continue;
      return c;
    }
    return '';
  }

  private isInternalNudgeMessage(content: string): boolean {
    return (
      content.startsWith('STOP —') ||
      content.startsWith('Tools for this') ||
      content.startsWith('Tool results are above') ||
      content.startsWith('Stop. Reply to the user')
    );
  }

  /** Short greeting / ack — do not force Plan workflow */
  private isCasualUserTurn(): boolean {
    const t = this.runUserMessage.trim();
    if (!t || t.length > 48) return false;
    return /^(하이|안녕(?:하세요)?|헬로|hello|hi+|hey|ㅎㅇ|감사(?:합니다)?|고마워(?:요)?|thanks|thank you|ㅇㅋ|ok(?:ay)?|네|응|ㅇㅇ)[!?.,~\s]*$/i.test(
      t
    );
  }

  private missionContinueNudge(): string {
    return MISSION_CONTINUE_AGENT;
  }

  /**
   * Force another tool round when the model stops empty/weak mid-mission.
   */
  private async requestMissionContinue(
    schemas: Array<{ function?: { name?: string } }>,
    lastReasoning: string
  ): Promise<
    | { content?: string; toolCalls: Array<{ id: string; name: string; arguments: ToolInput }> }
    | { content: string; toolCalls: [] }
    | null
    | undefined
  > {
    this.missionContinueNudges++;
    this.config.onMissionContinue?.({
      turn: this._state.currentTurn,
      nudgeCount: this.missionContinueNudges,
      maxNudges: AgentLoopController.MAX_MISSION_CONTINUES,
    });
    if (lastReasoning) {
      // Keep internal notes in transcript so the next call has context
      const last = this.messages[this.messages.length - 1];
      if (
        !(
          last?.role === 'assistant' &&
          (last.content || '').trim() === lastReasoning
        )
      ) {
        this.pushMessage({ role: 'assistant', content: lastReasoning });
      }
    }
    this.pushMessage({ role: 'user', content: this.missionContinueNudge() });
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
    if ((retry.reasoning || '').trim()) {
      void this.config.onReasoning?.(retry.reasoning);
    }
    const prose = (retry.content || '').trim();
    if (prose && prose !== '...' && !this.isWeakFinalAnswer(prose)) {
      if (this.missionStillOpen()) {
        this.pushMessage({ role: 'assistant', content: prose });
        return undefined;
      }
      return { content: prose, toolCalls: [] };
    }
    return undefined;
  }

  /**
   * @deprecated Plan no longer force-nudges ask_question (caused solo loops).
   */
  private async nudgePlanAskQuestionIfNeeded(
    _result: { content?: string; reasoning?: string; toolCalls?: unknown[] },
    _schemas: Array<{ function?: { name?: string } }>
  ): Promise<undefined> {
    return undefined;
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
      normalized.push({
        ...tc,
        arguments: this.aliasToolArgs(tc.name, args as ToolInput)
      });
    }
    return normalized;
  }

  /** cmd→command, prompt→question 등 LLM 별칭 정규화 */
  private aliasToolArgs(name: string, args: ToolInput): ToolInput {
    const out = { ...args };
    if (name === 'run_terminal_cmd') {
      if (out.command == null && out.cmd != null) out.command = out.cmd;
      if (out.command == null && out.shell != null) out.command = out.shell;
    }
    if (name === 'ask_question') {
      if (out.question == null || !String(out.question).trim()) {
        out.question =
          out.prompt || out.text || out.query || out.message || out.question;
      }
      // Nested: { questions: [{ question, options }] } → first item
      if (
        (!out.question || !String(out.question).trim()) &&
        Array.isArray(out.questions) &&
        out.questions[0]
      ) {
        const first = out.questions[0] as Record<string, unknown>;
        if (first && typeof first === 'object') {
          out.question = first.question || first.prompt || first.text;
          if (out.options == null && Array.isArray(first.options)) {
            out.options = first.options;
          }
        }
      }
    }
    if (
      (name === 'read_file' ||
        name === 'write_file' ||
        name === 'edit_file' ||
        name === 'delete_file') &&
      out.path == null
    ) {
      out.path =
        out.file_path || out.target_file || out.filepath || out.file || out.path;
    }
    if (name === 'write_file' && out.content == null && out.contents != null) {
      out.content = out.contents;
    }
    if (name === 'read_files') {
      const paths = this.coerceReadFilesPaths(out);
      if (paths.length) out.paths = paths;
    }
    return out;
  }

  /** read_files: accept paths/files/path aliases from sloppy tool args */
  private coerceReadFilesPaths(args: ToolInput): string[] {
    const asList = (raw: unknown): string[] => {
      if (Array.isArray(raw)) {
        return raw.map((p) => String(p ?? '').trim()).filter(Boolean);
      }
      if (typeof raw === 'string') {
        const t = raw.trim();
        if (!t) return [];
        if (t.startsWith('[')) {
          try {
            const parsed = JSON.parse(t);
            if (Array.isArray(parsed)) {
              return parsed.map((p) => String(p ?? '').trim()).filter(Boolean);
            }
          } catch {
            /* ignore */
          }
        }
        if (t.includes('\n') || (t.includes(',') && t.includes('/'))) {
          return t
            .split(/[\n,]/)
            .map((p) => p.trim().replace(/^["']|["']$/g, ''))
            .filter(Boolean);
        }
        return [t];
      }
      return [];
    };
    for (const key of [
      'paths',
      'files',
      'file_paths',
      'filePaths',
      'targets',
      'path',
      'file',
      'target_file',
      'file_path',
      'filepath'
    ]) {
      const list = asList(args[key]);
      if (list.length) return list;
    }
    return [];
  }

  /** Detect plan-only reasoning/prose that should have emitted tools */
  private reasoningIntendsTools(text: string): boolean {
    const t = (text || '').replace(/진행\s*가능(?:합니다)?/g, '');
    return /read_file|list_dir|codebase_search|\bgrep\b|\bglob\b|edit_file|write_file|todo_write|ask_question|in parallel|let me (read|search|open|check|fix|proceed|write|create|update|start|implement)|i('ll| will) (read|search|open|fix|check|proceed|write|create|update|implement|add|start)|proceed(ing)? to (write|create|edit|implement)|writing (the )?files?|create(ing)? .{0,80}\.(rs|ts|tsx|js|py|toml|md)\b|읽어|살펴|확인하|수정하|고치|분석하|파악하|진행하|진행합|작성하|작성을|작성할|생성하|생성을|생성할|구현하|구현을|구현할|시작하|시작합니다|파일을 읽|파일을\s*(작성|생성|저장|만들)|병렬로 읽|먼저 .{0,80}(읽|확인|파악|수정|진행|작성|생성)|이어서|다음으로|이제 .{0,40}(읽|확인|작성|생성|구현|시작)/i.test(
      t
    );
  }

  /** Prose claims disk writes are happening / next — without actual write tools */
  private claimsPendingFileWrites(text: string): boolean {
    return /proceed(ing)? to write|writing (the )?files?|now (i('ll| will) )?write|will (now )?(write|create|update) .{0,60}files?|create(ing)? [`'"]?src\/|update [`'"]?src\/|write_file|edit_file|파일을\s*(작성|생성|저장)|코드를\s*작성|작성하(겠|고|는|겠습)|작성을\s*(시작|진행)|생성하(겠|고|는|겠습)|생성을\s*(시작|진행)|구현을\s*시작|구현하(겠|고)|시작하(겠|고|겠습)|시작합니다|바로\s*진행/i.test(
      text
    );
  }

  /**
   * Current slice is done — "다음 작업으로 X 진행 가능합니다" is a handoff,
   * not "I will keep implementing now". Must not force another tool round.
   */
  private looksLikeTaskHandoff(text: string): boolean {
    const t = (text || '').trim();
    if (!t) return false;
    if (
      /(이제|바로)\s*(작성|생성|구현|수정)|will now (write|implement|create)|proceeding to (write|implement)/i.test(
        t
      )
    ) {
      return false;
    }
    return /진행\s*가능(?:합니다)?|다음\s*작업으로.{0,60}가능|이어서\s*(?:진행|작업)\s*가능|다음으로\s*(?:넘어가|진행)\s*가능|ready to (?:proceed|continue) (?:to|with)|can proceed to/i.test(
      t
    );
  }

  /** After tools: model narrates next work instead of calling tools */
  private claimsContinueWork(text: string): boolean {
    if (this.looksLikeTaskHandoff(text)) {
      this.emitClassifyEvent('claimsContinueWork', text, false);
      return false;
    }
    const result =
      this.claimsPendingFileWrites(text) ||
      this.reasoningIntendsTools(text) ||
      /다음\s*(단계|으로|은)|이어서\s*(진행|작업)|계속\s*(진행|하)|let me (continue|proceed|next)|next[,:]?\s*(i('ll| will)|step)|moving on to|now (that|i('ll| will))/i.test(
        text
      );
    this.emitClassifyEvent('claimsContinueWork', text, result);
    return result;
  }

  /** PHASE-1A: no-op unless config.onClassifyEvent is wired — see LoopConfig */
  private emitClassifyEvent(
    fn:
      | 'isWeakFinalAnswer'
      | 'looksLikeClosingSummary'
      | 'claimsContinueWork'
      | 'looksLikeBrokenToolPayload',
    text: string,
    result: boolean
  ): void {
    if (!this.config.onClassifyEvent) return;
    try {
      this.config.onClassifyEvent({
        fn,
        result,
        sample: (text || '').slice(0, 160),
        turn: this._state.currentTurn
      });
    } catch {
      // Diagnostics must never break the loop
    }
  }

  private hasWriteToolSchemas(
    schemas: Array<{ function?: { name?: string } }>
  ): boolean {
    return schemas.some((s) => {
      const n = s?.function?.name;
      return n === 'write_file' || n === 'edit_file' || n === 'delete_file';
    });
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
    // Was `/```(?:json)?|.../ ` -- "json" is optional in that group, so
    // ANY three-backtick fence matched: ```bash, ```python, even a bare
    // ```. Every normal coding answer that includes a code block got
    // flagged as a broken tool payload and counted into jsonParseFailures,
    // which is exactly what Kong's classify log showed (turn=1/turn=2
    // both flagged true on plain markdown roadmap/table answers with a
    // ```bash fence -- neither is a broken tool call). Tightened to only
    // match what actually looks like a model dumping raw tool-call JSON
    // as prose instead of using tool_calls properly: a fenced json block,
    // or literal tool-call-shaped tokens (tool_calls, <tool , tool_code,
    // function_call, or a `"name": "..."` key -- kept narrow with a lookahead
    // for `"arguments"` nearby so a normal `"name": "..."` in unrelated
    // JSON content the model is discussing doesn't false-positive either).
    const result =
      /```json\b|tool_calls|<tool\s|tool_code|function_call|"name"\s*:\s*"[^"]*"\s*,\s*"arguments"\s*:/i.test(
        content
      );
    this.emitClassifyEvent('looksLikeBrokenToolPayload', content, result);
    return result;
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

    // Mode check (C1-T18 이중 가드) — Plan build stage may use write tools (ADDON-T03)
    const { isWriteToolName } = await import('../plan/writeGate');
    const planBuildWrite =
      this.config.mode === 'plan' &&
      this.config.planStage === 'build' &&
      isWriteToolName(name);
    if (tool && !planBuildWrite && !modeRegistry.isToolAllowed(this.config.mode, name)) {
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
    // Plan 모드: research/questions/planning/review — 쓰기 차단; build만 허용 (ADDON-T03)
    if (this.config.mode === 'plan') {
      const toolDef = toolRegistry.getTool(name);
      const { planWriteGate } = await import('../plan/writeGate');
      const gate = planWriteGate(this.config.mode, this.config.planStage, name);
      if (!gate.allowed) {
        return { success: false, error: gate.error };
      }
      // Non-write web/browser still blocked during planning (not build)
      if (
        (this.config.planStage || 'research') !== 'build' &&
        toolDef &&
        toolDef.category === 'web'
      ) {
        return {
          success: false,
          error: `[Plan Mode] Browser/web tools are disabled during planning. "${name}" is not allowed until build.`,
        };
      }
    }

    // Agent soft gate: complex task → suggest Plan (ADDON-T03)
    if (this.config.mode === 'agent') {
      const force =
        configManager.get('agent-k.plan.forceOnComplex') === true;
      if (force) {
        const { PlanEnforcement } = await import('../plan/PlanEnforcement');
        const { agentComplexWriteGate } = await import('../plan/writeGate');
        const enforcement = new PlanEnforcement();
        const lastUser = [...this.messages].reverse().find((m) => m.role === 'user');
        const suggest = lastUser
          ? enforcement.shouldSuggestPlan(lastUser.content)
          : false;
        const soft = agentComplexWriteGate({
          mode: 'agent',
          forceOnComplex: true,
          shouldSuggestPlan: suggest,
          toolName: name,
          alreadyWarned: false,
        });
        if (!soft.allowed) {
          return { success: false, error: soft.error };
        }
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
    this.bumpRunTimeout();
    const toolHeartbeat = setInterval(() => this.bumpRunTimeout(), 30_000);
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
        // Re-bind UI bridge for this loop — survives interrupt→new-tab races
        if (this.config.onAskQuestion) {
          const { RuntimeServices } = await import('../core/RuntimeServices');
          RuntimeServices.setAskQuestionNotifier(this.config.onAskQuestion);
        }
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

      // ─── task / task_run (RW-C7-04-R2 / ADDON-T09) ────────────────
      if (name === 'task' || name === 'task_run') {
        const { getTaskTool, formatTaskToolResult, taskResultToSummary } = await import('../tools/orchestration/TaskTool');
        const taskTool = getTaskTool();
        const result = await taskTool.execute({
          description: (args.description as string) || 'sub-task',
          prompt: (args.prompt as string) || (args.task as string) || (args.description as string) || '',
          type: (args.type as any) ||
            ((args.mode as string) === 'ask' ? 'search' : (args.mode as string) === 'debug' ? 'debug' : 'general'),
          timeout: (args.timeout as number) || 120_000,
          maxTurns: (args.maxTurns as number) || 5,
          modelId: (args.modelId as string) || undefined
        });
        // Parent receives summary only (AC) — child ran in its own AgentLoopController
        // instance with a fresh message history, never the parent's transcript.
        return {
          success: result.status === 'completed',
          data: {
            taskId: result.taskId,
            summary: result.summary,
            status: result.status,
            duration: result.duration,
            formatted: formatTaskToolResult(taskResultToSummary(result))
          },
          error: result.status !== 'completed' ? result.summary : undefined
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
    } finally {
      clearInterval(toolHeartbeat);
    }
  }

  stop(): void {
    this.clearRunTimeout();
    this.abortController?.abort();
    if (this._state.status !== 'timeout') {
      this._state.status = 'stopped';
      this.config.onStatus?.('stopped');
    }
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