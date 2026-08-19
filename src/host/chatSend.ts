import * as vscode from 'vscode';
import { RuntimeServices } from '../core/RuntimeServices';
import { configManager } from '../core/ConfigManager';
import { sessionUsageTracker, updateUsageStatusBar } from './runtimeSingletons';
import { toolKind, kindVerb, shortDetail, resultDetail } from './timelineLabels';
import { parseInlineEditAgentRequest } from '../chat/inlineEdit';
import { createSubagentHost, modeForSubagentRole } from './subagentHost';
import { withInlineEditSource } from '../chat/inlineEditReview';

export type HostLoopRuntime = {
  loop: import('../loop/AgentLoopController').AgentLoopController;
  abort: AbortController;
};

export type ChatSendContext = {
  webview: vscode.Webview | undefined;
  hostLoops: Map<string, HostLoopRuntime>;
  getHostLoopRequestId: () => string | undefined;
  setHostLoopRequestId: (id: string | undefined) => void;
};

/**
 * Ask/Agent/Plan/Debug chat.send → AgentLoopController (정의된 턴 계약).
 * Ask uses the same host path with a read-only tool whitelist.
 * Tier A: ≤4 tools/turn, ≤1 write, read-first, maxTurns from modeRegistry.
 * NOT the ad-hoc HostToolLoop miniprotocol.
 *
 * PRD-C0 §5.3 / PRD-Harness-13: post turn-by-turn timeline events
 * (Thought / Searching / Reading / Planning next moves / Done).
 */
export async function runHostChatSend(ctx: ChatSendContext, message: any): Promise<void> {
  const webview = ctx.webview;
  if (!webview) return;

  const requestId = String(message.requestId);
  const abort = new AbortController();
  ctx.setHostLoopRequestId(requestId);
  const isActive = () => ctx.hostLoops.has(requestId);
  const getRuntime = () => ctx.hostLoops.get(requestId);

  const post = (event: string, extra: Record<string, unknown> = {}) => {
    if (!isActive()) return;
    void webview.postMessage({
      type: 'chat.stream',
      requestId,
      event,
      ...extra
    });
  };

  // Bridge ask_question → this request's post() (survives interrupt / new-tab races)
  RuntimeServices.setAskQuestionNotifier((q) => {
    if (!isActive()) {
      throw new Error(
        'ask_question: request superseded. Send a message again to continue.'
      );
    }
    post('ask_question', {
      qid: q.id,
      question: q.question,
      options: q.options,
      required: q.required,
      allowMultiple: Boolean(q.allowMultiple)
    });
    post('status', { status: 'asking' });
  });


  const inlineEdit = parseInlineEditAgentRequest(message.inlineEdit);
  let mode = (message.mode || 'agent') as 'ask' | 'agent' | 'plan' | 'debug';
  // Inline Edit needs write tools — Ask/Plan would refuse edit_file.
  if (inlineEdit && (mode === 'ask' || mode === 'plan')) {
    mode = 'agent';
  }
  const incoming = Array.isArray(message.messages) ? message.messages : [];
  const cfg = vscode.workspace.getConfiguration('agent-k');
  const baseUrl = String(
    message.baseUrl || cfg.get('provider.baseUrl') || 'http://127.0.0.1:52415'
  ).replace(/\/$/, '');
  const model = String(
    message.model ||
      cfg.get('provider.model') ||
      'mlx-community/Qwen3.6-35B-A3B-4bit'
  );
  const apiKey =
    message.apiKey != null
      ? String(message.apiKey)
      : cfg.get<string>('provider.apiKey') || undefined;
  const providerType = String(cfg.get('provider.type') || 'litellm') as
    | 'litellm'
    | 'openai'
    | 'anthropic'
    | 'ollama'
    | 'lmstudio'
    | 'opencode-zen'
    | 'opencode-go';
  const fallbackBudget = Number(cfg.get('context.budget')) || 100000;

  let deliveredFinal = false;
  /** Answer text already pushed via onAssistantDelta (this segment) */
  let streamedAnswer = '';
  /** Only seal chat body once per agent turn (avoid N tools → N clearContent flickers) */
  let sealedContentTurn = -1;
  // PRD-C0 §5.3: track turn for timeline headers
  let currentTurn = 0;
  let timelineSeq = 0;
  /** Active tool timeline item id keyed by tool name (last call wins per name) */
  const activeToolItems = new Map<string, string>();
  /** Timeline id of the in-flight terminal tool — attached to terminal.run cards */
  let lastTerminalTimelineId: string | undefined;
  /** Cursor-style row text from tool args — keep on result so Grepped/Read don't become "N matches" */
  const toolStartDetails = new Map<string, string>();
  /**
   * Plan V2: stash tool args by callId in onToolCall so onToolResult
   * (which only receives name/result/callId) can forward an
   * ObservedToolCall to the webview's Evidence Engine. Best-effort —
   * see src/plan/v2/toObservedToolCall.ts.
   */
  const toolArgsByCallId = new Map<string, Record<string, unknown>>();

  const postTimeline = (payload: {
    kind: string;
    label: string;
    detail?: string;
    toolName?: string;
    status: 'running' | 'done' | 'error';
    id?: string;
    turn?: number;
    /** opening = per-turn main Thought; mid = nested under Exploring */
    thoughtRole?: 'opening' | 'mid';
    subagentId?: string;
    parentTurnId?: string;
  }) => {
    const id = payload.id || `tl_${payload.kind}_${currentTurn}_${++timelineSeq}`;
    post('timeline', {
      kind: payload.kind,
      turn: payload.turn ?? currentTurn,
      label: payload.label,
      detail: payload.detail,
      toolName: payload.toolName,
      status: payload.status,
      id,
      thoughtRole: payload.thoughtRole,
      subagentId: payload.subagentId,
      parentTurnId: payload.parentTurnId
    });
    return id;
  };

  try {
    const { AgentLoopController } = await import('../loop/AgentLoopController');
    const { LiteLLMProvider } = await import('../providers/LiteLLMProvider');
    const { ContextAssembler } = await import('../agent/ContextAssembler');
    const { resolveModelContextInfo } = await import('../providers/modelContextInfo');

    const modelContext = await resolveModelContextInfo({
      providerType,
      baseUrl,
      apiKey,
      model,
      fallbackTokens: fallbackBudget
    });
    post('model.context', {
      model: modelContext.model,
      providerType: modelContext.providerType,
      maxInputTokens: modelContext.maxInputTokens,
      maxOutputTokens: modelContext.maxOutputTokens,
      source: modelContext.source
    });
    const { toolRegistry } = await import('../tools/registry');
    const { modeRegistry } = await import('../agent/modeRegistry');

    const modeConfig = modeRegistry.getModeConfig(mode);
    // Prefer VS Code setting; fall back to mode default. Small models need headroom.
    const configuredTurns = Number(configManager.get('agent-k.maxTurns'));
    const maxTurns =
      Number.isFinite(configuredTurns) && configuredTurns >= 5
        ? Math.min(100, Math.floor(configuredTurns))
        : modeConfig.maxTurns;
    const configuredTimeout = Number(configManager.get('agent-k.turnTimeoutMs'));
    const turnTimeoutMs = Number.isFinite(configuredTimeout)
      ? Math.max(0, Math.floor(configuredTimeout))
      : undefined;

    // Plan/Debug: append FSM stage prompt
    let customSystemPrompt: string | undefined;
    if (mode === 'plan') {
      const { PLAN_STAGE_PROMPTS } = await import('../plan/PlanModeController');
      const stage = (message.planStage || 'research') as keyof typeof PLAN_STAGE_PROMPTS;
      const stagePrompt = PLAN_STAGE_PROMPTS[stage] || PLAN_STAGE_PROMPTS.research;
      customSystemPrompt = `${modeConfig.systemPrompt}\n\n${stagePrompt}`;
    } else if (mode === 'debug') {
      const { DEBUG_STAGE_PROMPTS } = await import('../debug/DebugModeController');
      const stage = (message.debugStage || 'hypothesis') as keyof typeof DEBUG_STAGE_PROMPTS;
      const stagePrompt =
        DEBUG_STAGE_PROMPTS[stage] || DEBUG_STAGE_PROMPTS.hypothesis;
      customSystemPrompt = `${modeConfig.systemPrompt}\n\n${stagePrompt}`;
    }

    // ContextAssembler injects VerificationFirst + Slogans + TurnStructure + DontDo
    const assembler = new ContextAssembler();
    const assembly = assembler.assemble(
      mode,
      incoming.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: String(m.content || '')
      })),
      {
        tier: 'A',
        toolSchemas: toolRegistry.getSchemas(mode, 'A', {
          planStage:
            mode === 'plan'
              ? String(message.planStage || 'research')
              : undefined
        }),
        customSystemPrompt,
        ...(inlineEdit ? { inlineEdit } : {})
      }
    );
    const systemPrompt =
      assembly.slots.find((s) => s.name === 'system')?.content ||
      modeRegistry.getSystemPrompt(mode);

    const provider = new LiteLLMProvider({
      id: 'agent-k-chat',
      name: 'Agent K Chat',
      type: providerType,
      baseUrl,
      apiKey,
      model
    });

    const thinkingEffort =
      (message.thinkingEffort as
        | 'off'
        | 'low'
        | 'medium'
        | 'high'
        | 'max') ||
      (configManager.get('agent-k.thinking.effort') as
        | 'off'
        | 'low'
        | 'medium'
        | 'high'
        | 'max') ||
      'medium';

    const childToolStartDetails = new Map<string, string>();
    const subagentHost = createSubagentHost({
      systemPrompt,
      createLoop: (context, hooks) => {
        const childMode = modeForSubagentRole(context.task.role);
        return new AgentLoopController({
          mode: childMode,
          maxTurns,
          turnTimeoutMs,
          modelId: model,
          tier: 'A',
          contextBudget: modelContext.maxInputTokens,
          systemPrompt: modeRegistry.getSystemPrompt(childMode),
          provider,
          thinkingEffort,
          onAssistantDelta: hooks.onAssistantDelta,
          onReasoning: hooks.onReasoning,
          onToolCall: async (name, args, callId) => {
            await hooks.onToolCall?.(name, args, callId);
          },
          onToolResult: async (name, result, callId) => {
            await hooks.onToolResult?.(name, result, callId);
          },
          onAskQuestion: (q) => {
            if (!isActive()) {
              throw new Error(
                'ask_question: request superseded. Send a message again to continue.'
              );
            }
            post('ask_question', {
              qid: q.id,
              question: q.question,
              options: q.options,
              required: q.required,
              allowMultiple: Boolean(q.allowMultiple)
            });
            post('status', { status: 'asking' });
          },
          onUsage: (usage) => {
            try {
              const tracker =
                RuntimeServices.getSessionUsageTracker() || sessionUsageTracker;
              tracker.recordUsage(
                usage.promptTokens || 0,
                usage.completionTokens || 0
              );
              updateUsageStatusBar();
            } catch {
              /* usage tracking is best-effort */
            }
          },
          runSubagent: async () => ({
            success: false,
            error: 'Nested subagents are not allowed'
          })
        });
      },
      buildMessages: (context) => [
        {
          role: 'system',
          content: modeRegistry.getSystemPrompt(
            modeForSubagentRole(context.task.role)
          )
        },
        { role: 'user', content: context.task.prompt }
      ],
      onLifecycle: (event) => {
        const task = event.task;
        const turn = currentTurn || 1;
        post('subagent.event', {
          type: event.type,
          taskId: task.id,
          parentTurnId: task.parentTurnId,
          role: task.role,
          status: task.status,
          turn
        });
        const status =
          event.type === 'subagent.completed'
            ? 'done'
            : event.type === 'subagent.failed' ||
                event.type === 'subagent.cancelled'
              ? 'error'
              : 'running';
        postTimeline({
          kind: 'task',
          label: `${kindVerb('task')} · task_run`,
          detail: task.prompt.slice(0, 80),
          toolName: 'task_run',
          status,
          id: `tl_subagent_${task.id}`,
          turn,
          subagentId: task.id,
          parentTurnId: task.parentTurnId
        });
      },
      onReasoning: (context) => {
        postTimeline({
          kind: 'thinking',
          label: 'Thought',
          status: 'running',
          id: `tl_sub_${context.task.id}_thought`,
          turn: currentTurn || 1,
          thoughtRole: 'mid',
          subagentId: context.task.id,
          parentTurnId: context.task.parentTurnId
        });
      },
      onToolCall: (context, name, args, callId) => {
        const kind = toolKind(name);
        const detail = shortDetail(name, args as Record<string, unknown>);
        const id = `tl_sub_${context.task.id}_${
          callId && String(callId).trim() ? String(callId) : name
        }`;
        if (detail) childToolStartDetails.set(id, detail);
        postTimeline({
          kind,
          label: `${kindVerb(kind)} · ${name}`,
          detail,
          toolName: name,
          status: 'running',
          id,
          turn: currentTurn || 1,
          subagentId: context.task.id,
          parentTurnId: context.task.parentTurnId
        });
      },
      onToolResult: (context, name, result, callId) => {
        const kind = toolKind(name);
        const id = `tl_sub_${context.task.id}_${
          callId && String(callId).trim() ? String(callId) : name
        }`;
        const startDetail = childToolStartDetails.get(id);
        childToolStartDetails.delete(id);
        const output =
          result && typeof result === 'object'
            ? (result as {
                success?: boolean;
                data?: unknown;
                error?: string;
              })
            : {};
        const success = output.success !== false;
        const endDetail = resultDetail(
          kind,
          { success, data: output.data, error: output.error },
          name
        );
        const exploreKeepStart =
          kind === 'searching' ||
          kind === 'reading' ||
          kind === 'browsing' ||
          name === 'grep' ||
          name === 'read_file' ||
          name === 'read_files' ||
          name === 'glob' ||
          name === 'file_search' ||
          name === 'codebase_search' ||
          name === 'list_dir';
        const detail = !success
          ? endDetail || startDetail
          : exploreKeepStart && startDetail
            ? startDetail
            : endDetail || startDetail;
        postTimeline({
          kind,
          label: success
            ? `${kindVerb(kind)} · ${name}`
            : `Failed · ${name}`,
          detail,
          toolName: name,
          status: success ? 'done' : 'error',
          id,
          turn: currentTurn || 1,
          subagentId: context.task.id,
          parentTurnId: context.task.parentTurnId
        });
        if (
          success &&
          (name === 'edit_file' || name === 'write_file') &&
          output.data &&
          typeof output.data === 'object'
        ) {
          const data = output.data as Record<string, unknown>;
          const diff = data.diff as
            | {
                additions?: number;
                deletions?: number;
                lines?: Array<{
                  type: string;
                  lineNumber: number;
                  text: string;
                }>;
              }
            | undefined;
          if (diff && Array.isArray(diff.lines)) {
            post('file.edit', {
              path: String(data.relPath || data.path || name),
              absPath: data.path != null ? String(data.path) : undefined,
              checkpointId:
                data.checkpointId != null
                  ? String(data.checkpointId)
                  : undefined,
              turn: currentTurn || 1,
              toolId: id,
              subagentId: context.task.id,
              parentTurnId: context.task.parentTurnId,
              additions: Number(diff.additions) || 0,
              deletions: Number(diff.deletions) || 0,
              lines: diff.lines.slice(0, 80).map((l) => ({
                type:
                  l.type === 'add' || l.type === 'delete' ? l.type : 'context',
                lineNumber: Number(l.lineNumber) || 0,
                text: String(l.text ?? '').slice(0, 400)
              }))
            });
          }
        }
      }
    });

    const loop = new AgentLoopController({
      mode,
      maxTurns,
      turnTimeoutMs,
      modelId: model,
      tier: 'A',
      contextBudget: modelContext.maxInputTokens,
      systemPrompt,
      provider,
      debugStage:
        mode === 'debug'
          ? ((message.debugStage as
              | 'hypothesis'
              | 'instrument'
              | 'reproduce'
              | 'analyze'
              | 'fix'
              | 'cleanup') || 'hypothesis')
          : undefined,
      planStage:
        mode === 'plan'
          ? ((message.planStage as
              | 'research'
              | 'questions'
              | 'planning'
              | 'review'
              | 'build') || 'research')
          : undefined,
      onDebugStage: (stage) => {
        post('debug.stage', { stage });
      },
      // PHASE-1A diagnostics: off by default. Enable with
      // agent-k.debugClassifiers = true (user/workspace settings.json).
      // Prefer VS Code configuration directly — ConfigManager only hydrates
      // keys listed in AGENT_K_VSCODE_CONFIG_KEYS; missing keys used to make
      // this always undefined even when settings.json was true.
      onClassifyEvent: (() => {
        const enabled =
          Boolean(configManager.get('agent-k.debugClassifiers')) ||
          Boolean(
            vscode.workspace.getConfiguration('agent-k').get('debugClassifiers')
          );
        if (!enabled) return undefined;
        console.log(
          '[agent-k:classify] enabled — logging isWeakFinalAnswer / looksLikeClosingSummary / claimsContinueWork / looksLikeBrokenToolPayload'
        );
        return (event: {
          fn: string;
          result: boolean;
          sample: string;
          turn?: number;
        }) => {
          console.log(
            `[agent-k:classify] turn=${event.turn ?? '?'} ${event.fn}=${event.result} :: "${event.sample}"`
          );
        };
      })(),
      // Same debugClassifiers flag: logs why the loop gave up and showed
      // "모델이 도구만 실행하고 임무를 끝내지 않은 채 중단했습니다" instead of a
      // real answer -- was the model near its context budget (compaction
      // not keeping up / budget too small for this session) or did it
      // just never produce a wrap-up despite having room left? Distinct
      // symptom from the classify hook above (that's about individual
      // prose being *mis*classified; this is about MAX_MISSION_CONTINUES
      // + both wrap-up passes all coming back empty).
      onMissionExhausted: (() => {
        const enabled =
          Boolean(configManager.get('agent-k.debugClassifiers')) ||
          Boolean(
            vscode.workspace.getConfiguration('agent-k').get('debugClassifiers')
          );
        if (!enabled) return undefined;
        return (event: {
          turn?: number;
          messageCount: number;
          estimatedTokens: number;
          contextBudget: number;
          missionContinueNudges: number;
          lastTools: string[];
        }) => {
          const pct = event.contextBudget > 0
            ? Math.round((event.estimatedTokens / event.contextBudget) * 100)
            : 0;
          console.log(
            `[agent-k:mission-exhausted] turn=${event.turn ?? '?'} nudges=${event.missionContinueNudges} ` +
            `tokens=${event.estimatedTokens}/${event.contextBudget} (${pct}%) ` +
            `messages=${event.messageCount} lastTools=[${event.lastTools.join(', ')}]`
          );
        };
      })(),
      // HARB-T26 diagnostics: fires every compaction pass (every 5 turns, or
      // >90% context budget). Answers "did compaction eat the transcript
      // right before this run went quiet" without re-instrumenting later.
      onCompaction: (() => {
        const enabled =
          Boolean(configManager.get('agent-k.debugClassifiers')) ||
          Boolean(
            vscode.workspace.getConfiguration('agent-k').get('debugClassifiers')
          );
        if (!enabled) return undefined;
        return (event: {
          turn: number;
          level: 'truncate' | 'drop' | 'micro_summary' | 'full';
          messagesBefore: number;
          messagesAfter: number;
          droppedSections: string[];
        }) => {
          console.log(
            `[agent-k:compaction] turn=${event.turn} level=${event.level} ` +
            `messages=${event.messagesBefore}→${event.messagesAfter} ` +
            `dropped=${event.droppedSections.length}` +
            (event.droppedSections.length > 0
              ? ` :: ${event.droppedSections.slice(0, 5).join(' | ')}${event.droppedSections.length > 5 ? ' …' : ''}`
              : '')
          );
        };
      })(),
      // Fires each time the loop force-continues after an empty/weak stop
      // mid-mission. Counts climbing toward MAX_MISSION_CONTINUES (8) mean
      // the model kept stopping without a real answer and got re-prompted —
      // this is the run-up to onMissionExhausted, turn by turn.
      onMissionContinue: (() => {
        const enabled =
          Boolean(configManager.get('agent-k.debugClassifiers')) ||
          Boolean(
            vscode.workspace.getConfiguration('agent-k').get('debugClassifiers')
          );
        if (!enabled) return undefined;
        return (event: { turn: number; nudgeCount: number; maxNudges: number }) => {
          console.log(
            `[agent-k:mission-continue] turn=${event.turn} nudge=${event.nudgeCount}/${event.maxNudges}`
          );
        };
      })(),
      // HARB-T27: Cursor-style auto-continue past maxTurns. Always on
      // (not gated by debugClassifiers) — this is user-facing progress,
      // not a diagnostic: without it the chat just goes quiet for another
      // full round of turns and looks stuck.
      onAutoContinue: (event: {
        round: number;
        maxRounds: number;
        previousTotalTurns: number;
        newTotalTurns: number;
      }) => {
        postTimeline({
          kind: 'planning',
          label: `Still working (auto-continue ${event.round}/${event.maxRounds}) — turn budget ${event.previousTotalTurns} → ${event.newTotalTurns}`,
          status: 'running',
          id: `tl_autocontinue_${event.round}`,
          turn: currentTurn
        });
        if (
          Boolean(configManager.get('agent-k.debugClassifiers')) ||
          Boolean(vscode.workspace.getConfiguration('agent-k').get('debugClassifiers'))
        ) {
          console.log(
            `[agent-k:auto-continue] round=${event.round}/${event.maxRounds} ` +
            `totalTurns=${event.previousTotalTurns}→${event.newTotalTurns}`
          );
        }
      },
      // Per-turn summary: which tools ran and how long the turn took.
      // Answers "was the model actually making progress or repeating
      // itself" across a long run without re-reading the whole transcript.
      onTurnEnd: (() => {
        const enabled =
          Boolean(configManager.get('agent-k.debugClassifiers')) ||
          Boolean(
            vscode.workspace.getConfiguration('agent-k').get('debugClassifiers')
          );
        if (!enabled) return undefined;
        return async (turn: number, context: { toolCalls: Array<{ name: string }>; startTime: number }) => {
          const elapsedMs = Date.now() - context.startTime;
          const toolNames = context.toolCalls.map((tc) => tc.name);
          console.log(
            `[agent-k:turn] turn=${turn} tools=[${toolNames.join(', ')}] elapsedMs=${elapsedMs}`
          );
        };
      })(),
      // Re-bind ask_question UI on every tool call (new tab / interrupt safe)
      onAskQuestion: (q) => {
        if (!isActive()) {
          throw new Error(
            'ask_question: request superseded. Send a message again to continue.'
          );
        }
        post('ask_question', {
          qid: q.id,
          question: q.question,
          options: q.options,
          required: q.required,
          allowMultiple: Boolean(q.allowMultiple)
        });
        post('status', { status: 'asking' });
      },
      thinkingEffort,
      runSubagent: (args) =>
        subagentHost.runFromToolArgs(args, String(currentTurn || 1)),
      // Per-turn Thought / Exploring / Planning next moves (Cursor-style)
      onTurnStart: async (turn) => {
        // Freeze previous turn's Thought + Planning so UI stays sequential
        if (currentTurn > 0 && currentTurn !== turn) {
          postTimeline({
            kind: 'thinking',
            label: 'Thought',
            status: 'done',
            id: `tl_thinking_${currentTurn}`,
            turn: currentTurn,
            thoughtRole: 'opening'
          });
          postTimeline({
            kind: 'planning',
            label: 'Planning next moves',
            status: 'done',
            id: `tl_planning_${currentTurn}`,
            turn: currentTurn
          });
        }
        currentTurn = turn;
        activeToolItems.clear();
        toolStartDetails.clear();
        toolArgsByCallId.clear();
        // Only "Planning next moves" while waiting for the LLM —
        // Thinking appears later when reasoning tokens arrive (not both live).
        postTimeline({
          kind: 'planning',
          label: 'Planning next moves',
          status: 'running',
          id: `tl_planning_${turn}`,
          turn
        });
      },
      onStatus: (status) => {
        if (status === 'doom_loop') {
          postTimeline({
            kind: 'error',
            label: 'Doom loop — stopped',
            status: 'error',
            id: `tl_doom_${currentTurn}`
          });
        }
        if (status === 'timeout') {
          postTimeline({
            kind: 'error',
            label: 'Run timed out',
            status: 'error',
            id: `tl_timeout_${currentTurn}`
          });
          post('status', { status: 'timeout' });
          // Use `error` field — webview reads data.error (not data.message).
          // onError also fires from the loop; prefer a single clear payload here
          // and skip duplicate empty-message fallbacks in the webview.
          post('error', {
            error:
              'Agent run idle-timed out (agent-k.turnTimeoutMs) — no LLM/tool activity. Increase the setting or set 0 to disable.',
          });
        }
      },
      onReasoning: async (fullText) => {
        const clipped = String(fullText || '').trim().slice(0, 20000);
        if (!clipped) return;
        const turn = currentTurn || 1;
        // Reasoning replaces Planning next moves
        postTimeline({
          kind: 'planning',
          label: 'Planning next moves',
          status: 'done',
          id: `tl_planning_${turn}`,
          turn
        });
        postTimeline({
          kind: 'thinking',
          label: 'Thought',
          detail: clipped,
          status: 'running',
          id: `tl_thinking_${turn}`,
          turn,
          thoughtRole: 'opening'
        });
      },
      onAssistantDelta: async (piece) => {
        const text = String(piece || '');
        if (!text) return;
        const firstAnswerToken = streamedAnswer.length === 0;
        streamedAnswer += text;
        deliveredFinal = true;
        if (firstAnswerToken) {
          // Close Thought chrome once answer tokens start (Cursor-like)
          const turn = currentTurn || 1;
          postTimeline({
            kind: 'thinking',
            label: 'Thought',
            status: 'done',
            id: `tl_thinking_${turn}`,
            turn,
            thoughtRole: 'opening'
          });
          postTimeline({
            kind: 'planning',
            label: 'Planning next moves',
            status: 'done',
            id: `tl_planning_${turn}`,
            turn
          });
        }
        post('delta', { content: text });
      },
      onInterimAssistantContent: async (content) => {
        const full = String(content || '');
        if (!full.trim()) return;
        // Tools still running — do not mark the run as having a final answer
        if (streamedAnswer.length === 0) {
          post('delta', { content: full });
          streamedAnswer = full;
          return;
        }
        if (full.startsWith(streamedAnswer) && full.length > streamedAnswer.length) {
          const rest = full.slice(streamedAnswer.length);
          post('delta', { content: rest });
          streamedAnswer = full;
        }
      },
      onToolCall: async (name, args, callId) => {
        const kind = toolKind(name);
        const detail = shortDetail(name, args as Record<string, unknown>);
        const turn = currentTurn || 1;
        const id =
          callId && String(callId).trim()
            ? `tl_${String(callId)}`
            : `tl_tool_${turn}_${name}_${++timelineSeq}`;
        activeToolItems.set(callId || name, id);
        if (name === 'run_terminal_cmd' || name === 'terminal_output') {
          lastTerminalTimelineId = id;
        }
        toolArgsByCallId.set(callId || name, (args || {}) as Record<string, unknown>);
        // Keep Cursor-style start detail across tool result (don't replace with "N matches")
        if (detail) {
          toolStartDetails.set(id, detail);
        }
        // Tool turn may have streamed draft prose — reset so final answer can stream cleanly
        streamedAnswer = '';
        // Mid-turn deltas must not count as the closing message
        deliveredFinal = false;
        // Close Thought + Planning before Exploring tools slide in
        postTimeline({
          kind: 'thinking',
          label: 'Thought',
          status: 'done',
          id: `tl_thinking_${turn}`,
          turn,
          thoughtRole: 'opening'
        });
        postTimeline({
          kind: 'planning',
          label: 'Planning next moves',
          status: 'done',
          id: `tl_planning_${turn}`,
          turn
        });
        // Seal body BEFORE the explore row is added — otherwise the plan
        // markdown is folded into collapsed Thought.
        if (sealedContentTurn !== turn) {
          sealedContentTurn = turn;
          post('tool.start', { toolName: name, turn, id, kind, detail });
        }
        postTimeline({
          kind,
          label: `${kindVerb(kind)} · ${name}`,
          detail,
          toolName: name,
          status: 'running',
          id,
          turn
        });
      },
      onTerminalEvent: async (ev) => {
        post('terminal.run', {
          id: ev.id,
          phase: ev.phase,
          command: ev.command,
          description: ev.description,
          cwd: ev.cwd,
          chunk: ev.chunk,
          stream: ev.stream,
          exitCode: ev.exitCode,
          error: ev.error,
          durationMs: ev.durationMs,
          turn: ev.turn != null ? Number(ev.turn) : currentTurn || 1,
          status: ev.status,
          toolId: lastTerminalTimelineId
        });
      },
      onUsage: (usage) => {
        try {
          const tracker = RuntimeServices.getSessionUsageTracker() || sessionUsageTracker;
          tracker.recordUsage(usage.promptTokens || 0, usage.completionTokens || 0);
          updateUsageStatusBar();
        } catch {
          /* usage tracking is best-effort */
        }
      },
      onToolResult: async (name, result, callId) => {
        const kind = toolKind(name);
        const turn = currentTurn || 1;
        const id =
          activeToolItems.get(callId || name) ||
          (callId ? `tl_${String(callId)}` : `tl_tool_${turn}_${name}`);
        const startDetail = toolStartDetails.get(id);
        const endDetail = resultDetail(kind, result, name);
        // Explore rows keep Grepped/Read args text; failures still show error
        const exploreKeepStart =
          kind === 'searching' ||
          kind === 'reading' ||
          kind === 'browsing' ||
          name === 'grep' ||
          name === 'read_file' ||
          name === 'read_files' ||
          name === 'glob' ||
          name === 'file_search' ||
          name === 'codebase_search' ||
          name === 'list_dir';
        const detail = !result.success
          ? endDetail || startDetail
          : exploreKeepStart && startDetail
            ? startDetail
            : endDetail || startDetail;
        toolStartDetails.delete(id);
        postTimeline({
          // Keep explore/action kind so UI groups correctly; status carries failure
          kind,
          label: result.success
            ? `${kindVerb(kind)} · ${name}`
            : `Failed · ${name}`,
          detail,
          toolName: name,
          status: result.success ? 'done' : 'error',
          id,
          turn
        });
        post('tool.end', {
          toolName: name,
          id,
          kind,
          detail,
          toolResult: result.success
            ? JSON.stringify(result.data ?? {}).slice(0, 4000)
            : undefined,
          error: result.success ? undefined : result.error
        });
        // Plan V2: forward tool evidence to the webview's Evidence Engine
        // (best-effort — the webview no-ops this when there's no active
        // structured PlanSession yet). See src/plan/v2/EvidenceEngine.ts.
        if (mode === 'plan') {
          const toolArgs = toolArgsByCallId.get(callId || name);
          toolArgsByCallId.delete(callId || name);
          post('plan.toolEvidence', {
            name,
            args: toolArgs || {},
            success: result.success
          });
        }
        // Cursor-style file edit cards in the chat transcript
        if (
          result.success &&
          (name === 'edit_file' || name === 'write_file') &&
          result.data &&
          typeof result.data === 'object'
        ) {
          const data = result.data as Record<string, unknown>;
          const diff = data.diff as
            | {
                additions?: number;
                deletions?: number;
                lines?: Array<{
                  type: string;
                  lineNumber: number;
                  text: string;
                }>;
              }
            | undefined;
          if (diff && Array.isArray(diff.lines)) {
            post('file.edit', withInlineEditSource({
              path: String(data.relPath || data.path || name),
              absPath: data.path != null ? String(data.path) : undefined,
              checkpointId:
                data.checkpointId != null ? String(data.checkpointId) : undefined,
              turn: currentTurn || 1,
              toolId: id,
              additions: Number(diff.additions) || 0,
              deletions: Number(diff.deletions) || 0,
              lines: diff.lines.slice(0, 80).map((l) => ({
                type: l.type === 'add' || l.type === 'delete' ? l.type : 'context',
                lineNumber: Number(l.lineNumber) || 0,
                text: String(l.text ?? '').slice(0, 400)
              }))
            }, inlineEdit));
          }
        }
      },
      onAssistantContent: async (content) => {
        deliveredFinal = true;
        const turn = currentTurn || 1;
        postTimeline({
          kind: 'thinking',
          label: 'Thought',
          status: 'done',
          id: `tl_thinking_${turn}`,
          turn,
          thoughtRole: 'opening'
        });
        postTimeline({
          kind: 'planning',
          label: 'Planning next moves',
          status: 'done',
          id: `tl_planning_${turn}`,
          turn
        });
        post('status', { status: '' });
        const full = String(content || '');
        if (!full.trim()) return;
        // Never re-dump the whole answer after deltas already streamed it
        if (streamedAnswer.length > 0) {
          if (full.startsWith(streamedAnswer)) {
            const rest = full.slice(streamedAnswer.length);
            if (rest) {
              streamedAnswer += rest;
              post('delta', { content: rest });
            }
          }
          // else: different/duplicate blob — ignore to avoid "same message twice"
          return;
        }
        streamedAnswer = full;
        post('delta', { content: full });
      },
      onError: (err) => {
        // Timeout already posted a user-facing error from onStatus — avoid
        // a second event that the webview would ignore (finished=true) or
        // that could race with the wrong field name.
        if (/timed out/i.test(err.message || '')) {
          return;
        }
        postTimeline({
          kind: 'error',
          label: 'Error',
          detail: (err.message || String(err)).slice(0, 80),
          status: 'error',
          id: `tl_error_${currentTurn || 0}`
        });
        post('error', { error: err.message || String(err) || 'Agent loop failed' });
      }
    });

    ctx.hostLoops.set(requestId, { loop, abort });

    // Keepalive so webview idle watchdog does not fire during slow LLM TTFT / ask_question
    const heartbeat = setInterval(() => {
      if (!isActive()) return;
      const asking = RuntimeServices.isAskQuestionPending();
      if (getRuntime()?.loop.isRunning || asking) {
        post('heartbeat', {});
      }
      // Re-broadcast pending MCQ — recovers if first ask_question event was missed
      const pendingAll = RuntimeServices.getPendingQuestions();
      for (const pending of pendingAll) {
        post('ask_question', {
          qid: pending.id,
          question: pending.question,
          options: pending.options,
          required: pending.required,
          allowMultiple: Boolean(pending.allowMultiple)
        });
      }
      if (pendingAll.length) {
        post('status', { status: 'asking' });
      }
    }, 8_000);

    // History without harness dumps; last user turn drives the loop
    const history = incoming
      .filter((m: { role: string }) => m.role !== 'system')
      .map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant' | 'tool' | 'system',
        content: String(m.content || '')
      }));

    abort.signal.addEventListener(
      'abort',
      () => {
        loop.stop();
        subagentHost.cancelAll();
      },
      { once: true }
    );

    try {
      await loop.continue([
        { role: 'system', content: systemPrompt },
        ...history
      ]);

      if (!deliveredFinal && streamedAnswer.length === 0 && isActive()) {
        post('status', { status: '' });
        const snap = loop.getMessages();
        const last = [...snap].reverse().find(
          (m) => m.role === 'assistant' && m.content && !m.toolCalls?.length
        );
        if (last?.content) {
          post('delta', { content: last.content });
          deliveredFinal = true;
          streamedAnswer = String(last.content);
        }
      }

      // Tools ran but body still empty (sealed mid-prose, empty final) — surface last assistant text
      if (
        streamedAnswer.length === 0 &&
        sealedContentTurn >= 0 &&
        isActive()
      ) {
        const snap = loop.getMessages();
        const last = [...snap].reverse().find(
          (m) =>
            m.role === 'assistant' &&
            String(m.content || '').trim() &&
            !m.toolCalls?.length
        );
        if (last?.content?.trim()) {
          post('delta', { content: last.content });
          streamedAnswer = String(last.content);
        }
      }

      if (isActive()) {
        // Don't send complete after a timeout/error already ended the stream
        const st = loop.state?.status;
        if (st !== 'timeout' && st !== 'error') {
          post('complete');
        }
      }
    } finally {
      clearInterval(heartbeat);
      // Do NOT clear ask_question notifier here — a newer request may already
      // own the bridge. Cleared only on webview dispose / ensure overwrite.
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    post('error', { error: msg || 'Agent loop failed' });
  } finally {
    ctx.hostLoops.delete(requestId);
    if (ctx.getHostLoopRequestId() === requestId) ctx.setHostLoopRequestId(undefined);
  }
}
