/**
 * AGENT-001…004, 008 — AgentLoopController.
 * Injected runModel + executeTool (no hard providers/safety deps).
 */

import type { AgentMode } from '@agent-k/shared';
import { ContextAssembler } from '../context/ContextAssembler';
import { CompactionEngine } from '../context/CompactionEngine';
import type {
  AgentMessage,
  ExecuteToolFn,
  ModelTurnResult,
  PermissionCheckFn,
  RunModelFn,
  ToolCallRequest,
} from '../types';
import { ClassifierDiagnostics } from './ClassifierDiagnostics';
import { DoomLoopDetector } from './DoomLoopDetector';
import { DoomLoopHandler } from './DoomLoopHandler';
import { classifyError, ErrorRecovery } from './ErrorRecovery';
import { isParallelSafeTool, ParallelExecutor } from './ParallelExecutor';
import {
  batchHasBlindRead,
  isSearchTool,
  SEARCH_BEFORE_READ_NUDGE,
} from './searchBeforeRead';
import { StreamingToolExecutor } from './StreamingToolExecutor';
import { resolveTurnTimeoutMs, RunTimeoutGuard } from './turnTimeout';
import {
  createVerifyExitState,
  evaluateVerifyExit,
  extractEditedFilePath,
  formatPostEditVerificationFailure,
  markPathEdited,
  markPathVerified,
  parseLintErrorsFromToolResult,
  PostEditVerificationTracker,
  type VerifyExitState,
} from '../harness';

export type AgentLoopEvent =
  | { type: 'turn_start'; turn: number }
  | { type: 'turn_end'; turn: number }
  | { type: 'assistant_delta'; content: string }
  | { type: 'tool_start'; call: ToolCallRequest }
  | { type: 'tool_end'; call: ToolCallRequest; ok: boolean; error?: string }
  /** CTX-004 / AGENT-006 — wire transcript compacted before runModel */
  | {
      type: 'compaction';
      level: 'truncate' | 'drop' | 'micro_summary' | 'full';
      turn: number;
    }
  | { type: 'status'; status: AgentLoopStatus }
  | { type: 'error'; error: string; fatal: boolean }
  | { type: 'done'; reason: StopReason; content: string };

export type AgentLoopStatus =
  | 'idle'
  | 'running'
  | 'awaiting_tools'
  | 'stopped'
  | 'error';

export type StopReason =
  | 'completed'
  | 'max_turns'
  | 'aborted'
  | 'timeout'
  | 'doom_loop'
  | 'fatal_error'
  | 'permission_denied';

export interface AgentLoopConfig {
  mode?: AgentMode;
  maxTurns?: number;
  turnTimeoutMs?: number;
  systemPrompt?: string;
  contextBudgetTokens?: number;
  doomLoopThreshold?: number;
  parallelTools?: boolean;
  /**
   * HARNESS-005 — workspace root for AGENTS.md / `.agentk/rules` inject.
   * Rules re-enter the protected system slot every turn (survive compaction).
   */
  workspaceRoot?: string;
  /** Explicit project rules text (skips fs when set). */
  projectRules?: string;
  /** Extra sticky context merged after rules. */
  stickyContext?: string;
  /**
   * PLAN-009 — approved plan block (formatter output from @agent-k/plan).
   * Re-injected each turn into protected system slot.
   */
  approvedPlanBlock?: string;
  /** HARNESS-002 — verification-first prompt + exit checks (default on). */
  verificationFirst?: boolean;
  /** HARNESS-004 — post edit/write read_lints micro-loop (default on). */
  verificationMicroLoop?: boolean;
  /** HARNESS-001 — master harness flag (tier tools + prompt inject). */
  harnessEnabled?: boolean;
  /** HARNESS-001/006 — model tier for tool whitelist. */
  modelTier?: 'A' | 'B' | 'C';
}

export interface AgentLoopDeps {
  runModel: RunModelFn;
  executeTool: ExecuteToolFn;
  checkPermission?: PermissionCheckFn;
  onEvent?: (event: AgentLoopEvent) => void;
}

export interface AgentLoopRunInput {
  prompt: string;
  signal?: AbortSignal;
  messages?: AgentMessage[];
}

export interface AgentLoopRunResult {
  status: AgentLoopStatus;
  reason: StopReason;
  content: string;
  messages: AgentMessage[];
  turns: number;
}

/** Core agent turn loop: model → tools → model until stop. */
export class AgentLoopController {
  private readonly deps: AgentLoopDeps;
  private readonly config: Required<
    Pick<AgentLoopConfig, 'maxTurns' | 'turnTimeoutMs' | 'parallelTools'>
  > &
    AgentLoopConfig;

  private messages: AgentMessage[] = [];
  private status: AgentLoopStatus = 'idle';
  private readonly doom: DoomLoopDetector;
  /** AGENT-010 — formats doom-loop stop messages + suggestions. */
  private readonly doomHandler = new DoomLoopHandler();
  private readonly diagnostics = new ClassifierDiagnostics();
  private readonly recovery = new ErrorRecovery({ maxRetries: 2 });
  private readonly assembler: ContextAssembler;
  private readonly compaction: CompactionEngine;
  private readonly parallel: ParallelExecutor;
  private readonly timeout = new RunTimeoutGuard();
  private abortFromTimeout = false;
  /** HARNESS-007 — set after any locate tool runs this `run()`. */
  private searchSatisfied = false;
  /** One-shot nudge after blind reads — never fails the read itself. */
  private searchNudgeSent = false;
  /** Latest user prompt for path-hint skip. */
  private lastUserPrompt = '';
  /** HARNESS-002 — tracks unverified edits for /goal-like exit gate. */
  private verifyExitState: VerifyExitState = createVerifyExitState();
  /** HARNESS-004 — per-file lint retry counter. */
  private postEditVerify = new PostEditVerificationTracker();

  constructor(deps: AgentLoopDeps, config: AgentLoopConfig = {}) {
    this.deps = deps;
    this.config = {
      mode: config.mode ?? 'agent',
      maxTurns: config.maxTurns ?? 25,
      turnTimeoutMs: resolveTurnTimeoutMs(config.turnTimeoutMs, undefined),
      systemPrompt:
        config.systemPrompt ??
        'You are Agent-K. Use tools when needed, then give a clear final answer.',
      contextBudgetTokens: config.contextBudgetTokens ?? 100_000,
      doomLoopThreshold: config.doomLoopThreshold ?? 3,
      parallelTools: config.parallelTools ?? true,
      workspaceRoot: config.workspaceRoot,
      projectRules: config.projectRules,
      stickyContext: config.stickyContext,
      approvedPlanBlock: config.approvedPlanBlock,
      verificationFirst: config.verificationFirst,
      verificationMicroLoop: config.verificationMicroLoop,
      harnessEnabled: config.harnessEnabled,
      modelTier: config.modelTier,
    };
    this.doom = new DoomLoopDetector(this.config.doomLoopThreshold);
    this.assembler = new ContextAssembler(this.config.contextBudgetTokens);
    this.compaction = new CompactionEngine(this.config.contextBudgetTokens);
    this.parallel = new ParallelExecutor(8);
  }

  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  getDiagnostics(): ClassifierDiagnostics {
    return this.diagnostics;
  }

  getStatus(): AgentLoopStatus {
    return this.status;
  }

  /** AGENT-001 — Drive turns until model stops calling tools or a guard fires. */
  async run(input: AgentLoopRunInput): Promise<AgentLoopRunResult> {
    this.abortFromTimeout = false;
    this.searchSatisfied = false;
    this.searchNudgeSent = false;
    this.lastUserPrompt = String(input.prompt || '');
    // Comment: HARNESS-002/004 — fresh verify state per run
    this.verifyExitState = createVerifyExitState();
    this.postEditVerify = new PostEditVerificationTracker();
    this.status = 'running';
    this.doom.reset();
    this.emit({ type: 'status', status: 'running' });

    if (input.messages?.length) {
      this.messages = [...input.messages];
      // Prior turn in same session already searched — skip nudge noise.
      this.searchSatisfied = input.messages.some(
        (m) => m.role === 'tool' && isSearchTool(String(m.name || ''))
      );
    }
    this.messages.push({ role: 'user', content: input.prompt });

    const runAbort = new AbortController();
    const onOuterAbort = () => runAbort.abort();
    input.signal?.addEventListener('abort', onOuterAbort, { once: true });

    this.timeout.arm(this.config.turnTimeoutMs, {
      onTimeout: () => {
        this.abortFromTimeout = true;
        runAbort.abort();
      },
    });

    let turns = 0;
    let finalContent = '';
    let reason: StopReason = 'completed';

    try {
      while (turns < this.config.maxTurns) {
        if (runAbort.signal.aborted) {
          reason = this.abortFromTimeout ? 'timeout' : 'aborted';
          break;
        }

        turns++;
        this.emit({ type: 'turn_start', turn: turns });
        this.timeout.bump();

        const assembled = this.assembler.assemble({
          mode: this.config.mode ?? 'agent',
          systemPrompt: this.config.systemPrompt!,
          messages: this.messages,
          budget: this.compaction.contextBudget,
          compactIfNeeded: true,
          // Comment: HARNESS-005 — rules outside compaction (re-inject each turn)
          workspaceRoot: this.config.workspaceRoot,
          projectRules: this.config.projectRules,
          stickyContext: this.config.stickyContext,
          approvedPlanBlock: this.config.approvedPlanBlock,
          verificationFirst: this.config.verificationFirst,
          harnessEnabled: this.config.harnessEnabled,
        });
        if (assembled.compacted) {
          this.messages = assembled.messages.filter((m) => m.role !== 'system');
          // Comment: AGENT-006 — surface Summarizing chat context... in chat UI (API wire only)
          this.emit({
            type: 'compaction',
            level: assembled.compactionLevel ?? 'micro_summary',
            turn: turns,
          });
        }

        let modelResult: ModelTurnResult;
        try {
          modelResult = await this.recovery.run(
            () =>
              this.deps.runModel({
                messages: assembled.messages,
                signal: runAbort.signal,
                turn: turns,
                // Comment: AGENT-009 — long local LLM turns (vision/reasoning) must bump idle
                onActivity: () => this.timeout.bump(),
              }),
            runAbort.signal
          );
        } catch (err) {
          const c = classifyError(err);
          if (c.kind === 'cancelled') {
            reason = this.abortFromTimeout ? 'timeout' : 'aborted';
            break;
          }
          reason = 'fatal_error';
          this.emit({ type: 'error', error: c.message, fatal: true });
          break;
        }

        this.timeout.bump();
        const content = (modelResult.content || '').trim();
        const toolCalls = modelResult.toolCalls ?? [];

        if (content) {
          this.emit({ type: 'assistant_delta', content });
          this.diagnostics.run('isWeakFinalAnswer', content, turns);
          this.diagnostics.run('looksLikeClosingSummary', content, turns);
          this.diagnostics.run('claimsContinueWork', content, turns);
          this.diagnostics.run('looksLikeBrokenToolPayload', content, turns);
        }

        if (toolCalls.length === 0) {
          // Comment: HARNESS-002 — /goal-like exit gate before completing
          const exitCheck = evaluateVerifyExit({
            verificationFirst: this.config.verificationFirst !== false,
            content,
            state: this.verifyExitState,
            turn: turns,
            maxTurns: this.config.maxTurns,
          });
          if (exitCheck.block && exitCheck.nudge) {
            this.messages.push({
              role: 'assistant',
              content,
              metadata: { turn: turns },
            });
            this.messages.push({
              role: 'user',
              content: exitCheck.nudge,
              metadata: { turn: turns, type: 'verify_exit_nudge' },
            });
            this.emit({ type: 'turn_end', turn: turns });
            continue;
          }

          finalContent = content;
          this.messages.push({
            role: 'assistant',
            content: finalContent,
            metadata: { turn: turns },
          });
          reason = 'completed';
          this.emit({ type: 'turn_end', turn: turns });
          break;
        }

        this.messages.push({
          role: 'assistant',
          content,
          toolCalls,
          metadata: { turn: turns },
        });

        this.status = 'awaiting_tools';
        this.emit({ type: 'status', status: 'awaiting_tools' });

        const toolOutcome = await this.executeToolCalls(
          toolCalls,
          runAbort.signal,
          turns
        );
        if (toolOutcome === 'doom_loop') {
          reason = 'doom_loop';
          // Prefer handler message (suggestions) over generic stop text.
          const loopInfo = this.doom.getLoopInfo();
          if (loopInfo) {
            const alert = this.doomHandler.handleLoopInfo(loopInfo, this.doom);
            finalContent = this.doomHandler.formatAlertMessage(alert);
          } else {
            finalContent =
              content || 'Stopped: repeated identical tool calls detected.';
          }
          this.emit({ type: 'turn_end', turn: turns });
          break;
        }
        if (toolOutcome === 'aborted') {
          reason = this.abortFromTimeout ? 'timeout' : 'aborted';
          this.emit({ type: 'turn_end', turn: turns });
          break;
        }
        if (toolOutcome === 'permission_denied') {
          reason = 'permission_denied';
          finalContent = 'Stopped: permission denied for a tool call.';
          this.emit({ type: 'turn_end', turn: turns });
          break;
        }

        this.status = 'running';
        this.emit({ type: 'turn_end', turn: turns });
      }

      if (
        turns >= this.config.maxTurns &&
        reason === 'completed' &&
        !finalContent
      ) {
        reason = 'max_turns';
        finalContent =
          this.messages.filter((m) => m.role === 'assistant').at(-1)?.content ||
          'Stopped: max turns reached.';
      }
    } finally {
      this.timeout.clear();
      input.signal?.removeEventListener('abort', onOuterAbort);
    }

    this.status = reason === 'fatal_error' ? 'error' : 'stopped';
    this.emit({ type: 'status', status: this.status });
    this.emit({ type: 'done', reason, content: finalContent });

    return {
      status: this.status,
      reason,
      content: finalContent,
      messages: [...this.messages],
      turns,
    };
  }

  private async executeToolCalls(
    toolCalls: ToolCallRequest[],
    signal: AbortSignal,
    turn: number
  ): Promise<'ok' | 'doom_loop' | 'aborted' | 'permission_denied'> {
    const streaming = new StreamingToolExecutor(this.deps.executeTool);
    // Comment: detect blind reads up front — still execute; nudge once after batch
    const blindBatch =
      !this.searchNudgeSent &&
      batchHasBlindRead({
        batch: toolCalls,
        searchSatisfied: this.searchSatisfied,
        userText: this.lastUserPrompt,
      });

    const runOne = async (
      call: ToolCallRequest
    ): Promise<'ok' | 'doom_loop' | 'permission_denied'> => {
      this.emit({ type: 'tool_start', call });

      if (this.deps.checkPermission) {
        const decision = await this.deps.checkPermission({
          toolName: call.name,
          args: call.arguments,
        });
        if (decision === 'deny') {
          this.messages.push({
            role: 'tool',
            content: `Permission denied for tool "${call.name}".`,
            toolCallId: call.id,
            name: call.name,
            metadata: { turn, toolName: call.name },
          });
          this.emit({
            type: 'tool_end',
            call,
            ok: false,
            error: 'permission denied',
          });
          return 'permission_denied';
        }
      }

      const result = await streaming.execute({
        callId: call.id,
        name: call.name,
        args: call.arguments,
        signal,
      });

      const editedPath = extractEditedFilePath(call.name, call.arguments);
      if (result.success && editedPath) {
        markPathEdited(this.verifyExitState, editedPath);
      }

      if (isSearchTool(call.name)) {
        this.searchSatisfied = true;
      }

      const outcome = result.success ? 'ok' : result.error || 'error';
      this.doom.recordCall(call.name, call.arguments, outcome);

      let body = result.success
        ? typeof result.data === 'string'
          ? result.data
          : JSON.stringify(result.data ?? null)
        : `Error: ${result.error ?? 'tool failed'}`;

      // Comment: HARNESS-004 — post edit/write lint micro-loop (fail → continue work)
      if (
        result.success &&
        editedPath &&
        this.config.verificationMicroLoop !== false
      ) {
        try {
          const lintResult = await this.deps.executeTool({
            name: 'read_lints',
            args: { paths: [editedPath] },
            callId: `${call.id}_verify`,
            signal,
          });
          const lintErrors = parseLintErrorsFromToolResult(lintResult);
          if (lintErrors.length > 0) {
            const attempt = this.postEditVerify.nextAttempt(editedPath);
            body =
              `${body}\n\n` +
              formatPostEditVerificationFailure(
                lintErrors,
                attempt - 1,
                this.postEditVerify.maxAttempts,
              );
          } else {
            markPathVerified(this.verifyExitState, editedPath);
          }
        } catch {
          /* verification must not break tool batch */
        }
      }

      this.messages.push({
        role: 'tool',
        content: body,
        toolCallId: call.id,
        name: call.name,
        metadata: { turn, toolName: call.name, type: 'tool_result' },
      });

      this.emit({
        type: 'tool_end',
        call,
        ok: result.success,
        error: result.error,
      });

      if (this.doom.isDoomLoop()) return 'doom_loop';
      return 'ok';
    };

    const canParallel =
      this.config.parallelTools &&
      toolCalls.length > 1 &&
      toolCalls.every((c) => isParallelSafeTool(c.name));

    let batchOutcome: 'ok' | 'doom_loop' | 'aborted' | 'permission_denied' =
      'ok';

    if (canParallel) {
      const map = await this.parallel.map(
        toolCalls.map((call) => ({
          id: call.id,
          run: async () => {
            if (signal.aborted) {
              throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
            }
            return runOne(call);
          },
        }))
      );
      for (const v of map.values()) {
        if (typeof v === 'object' && v && 'error' in v) {
          if (/abort/i.test(v.error)) {
            batchOutcome = 'aborted';
            break;
          }
          continue;
        }
        if (v === 'doom_loop') {
          batchOutcome = 'doom_loop';
          break;
        }
        if (v === 'permission_denied') {
          batchOutcome = 'permission_denied';
          break;
        }
      }
      if (signal.aborted) batchOutcome = 'aborted';
    } else {
      for (const call of toolCalls) {
        if (signal.aborted) {
          batchOutcome = 'aborted';
          break;
        }
        this.timeout.bump();
        const r = await runOne(call);
        if (r !== 'ok') {
          batchOutcome = r;
          break;
        }
      }
    }

    // Soft semi-force: reads already succeeded; remind once for the next round.
    if (blindBatch && batchOutcome === 'ok' && !this.searchNudgeSent) {
      this.searchNudgeSent = true;
      this.messages.push({
        role: 'system',
        content: SEARCH_BEFORE_READ_NUDGE,
        metadata: { type: 'search_before_read_nudge', turn },
      });
    }

    return batchOutcome;
  }

  private emit(event: AgentLoopEvent): void {
    try {
      this.deps.onEvent?.(event);
    } catch {
      /* host listeners must not break the loop */
    }
  }
}
