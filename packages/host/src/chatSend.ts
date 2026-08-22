/**
 * HOST-002 — Chat send bridge.
 * Wires chat.send → AgentLoopController with LiteLLMProvider + builtin tools.
 * Ported from v2.1-PRODUCTION-MODE host/chatSend.ts (Feature-ID transplant, not file copy).
 */

import {
  AgentLoopController,
  modeRegistry,
  type AgentLoopEvent,
  type AgentMessage,
  type ModelTurnResult,
} from '@agent-k/core';
import { LiteLLMProvider } from '@agent-k/providers';
import { PermissionGate } from '@agent-k/safety';
import type {
  AgentMode,
  ChatSendPayload,
  ChatStopPayload,
  RequestId,
} from '@agent-k/shared';
import {
  executeTool,
  registerBuiltinTools,
  ToolRegistry,
  type ToolContext,
} from '@agent-k/tools';
import * as vscode from 'vscode';

/** In-flight loop runtime keyed by requestId. */
export type HostLoopRuntime = {
  loop: AgentLoopController;
  abort: AbortController;
};

/** Context bound by ChatViewProvider for HOST-002 send/stop. */
export type ChatSendContext = {
  webview: vscode.Webview | undefined;
  hostLoops: Map<string, HostLoopRuntime>;
  getHostLoopRequestId: () => string | undefined;
  setHostLoopRequestId: (id: string | undefined) => void;
};

/** Accumulate OpenAI-style streamed tool_call deltas into final tool calls. */
function mergeToolCallDeltas(
  acc: Map<number, { id?: string; name?: string; arguments: string }>,
  deltas: unknown[],
): void {
  for (const raw of deltas) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as {
      index?: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    };
    const idx = typeof d.index === 'number' ? d.index : 0;
    const cur = acc.get(idx) ?? { arguments: '' };
    if (d.id) cur.id = d.id;
    if (d.function?.name) cur.name = (cur.name || '') + d.function.name;
    if (d.function?.arguments) cur.arguments += d.function.arguments;
    acc.set(idx, cur);
  }
}

function workspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? process.cwd();
}

/**
 * Accept chat.send, run AgentLoopController, and stream events to the webview.
 */
export async function runHostChatSend(
  ctx: ChatSendContext,
  payload: ChatSendPayload,
): Promise<void> {
  const webview = ctx.webview;
  if (!webview) return;

  const requestId = String(payload.requestId) as RequestId;
  const abort = new AbortController();
  ctx.setHostLoopRequestId(requestId);

  const isActive = () => ctx.hostLoops.has(requestId);

  const postStream = (event: Record<string, unknown>) => {
    if (!isActive()) return;
    void webview.postMessage({
      type: 'chat.stream',
      payload: { requestId, ...event },
    });
  };

  const mode = (payload.mode || 'agent') as AgentMode;
  const cfg = vscode.workspace.getConfiguration('agent-k');
  const baseUrl = String(
    payload.baseUrl || cfg.get('provider.baseUrl') || '',
  ).replace(/\/$/, '');
  const model = String(payload.model || cfg.get('provider.model') || '');
  if (!baseUrl || !model) {
    void webview.postMessage({
      type: 'chat.stream',
      payload: {
        requestId,
        event: 'error',
        error:
          'No provider configured. Open Settings → AI Providers and add a connection.',
      },
    });
    ctx.setHostLoopRequestId(undefined);
    return;
  }
  const apiKey =
    payload.apiKey != null
      ? String(payload.apiKey)
      : cfg.get<string>('provider.apiKey') || undefined;

  const modeConfig = modeRegistry.getModeConfig(mode);
  const maxTurns = Math.min(
    100,
    Math.max(5, Number(cfg.get('agent.maxTurns')) || modeConfig.maxTurns),
  );

  const provider = new LiteLLMProvider({
    id: 'agent-k-chat',
    name: 'Agent K Chat',
    type: 'litellm',
    baseUrl,
    apiKey,
    model,
  });

  const registry = new ToolRegistry();
  registerBuiltinTools(registry);
  const toolSchemas = registry.getSchemas(mode);
  const root = workspaceRoot();
  const toolCtxBase: ToolContext = {
    workspaceRoot: root,
    mode,
    debugLogs: [],
  };

  // Auto-approve for first E2E wire; interactive approval lands with SAFE host prompts.
  const gate = new PermissionGate('auto');

  const loop = new AgentLoopController(
    {
      runModel: async ({ messages, signal, turn }) => {
        void turn;
        const providerMessages = messages.map((m) => {
          if (m.role === 'tool') {
            return {
              role: 'tool',
              content: m.content,
              tool_call_id: m.toolCallId,
              name: m.name,
            };
          }
          if (m.role === 'assistant' && m.toolCalls?.length) {
            return {
              role: 'assistant',
              content: m.content || null,
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments ?? {}),
                },
              })),
            };
          }
          return { role: m.role, content: m.content };
        });

        let content = '';
        let reasoning = '';
        const toolAcc = new Map<
          number,
          { id?: string; name?: string; arguments: string }
        >();

        for await (const chunk of provider.streamChat({
          messages: providerMessages,
          model,
          signal,
          tools: toolSchemas,
        })) {
          if (chunk.error) {
            throw new Error(chunk.error);
          }
          if (chunk.content) {
            content += chunk.content;
            postStream({ event: 'delta', content: chunk.content });
          }
          if (chunk.reasoning_content) {
            reasoning += chunk.reasoning_content;
            postStream({ event: 'delta', reasoning: chunk.reasoning_content });
          }
          if (chunk.toolCalls?.length) {
            mergeToolCallDeltas(toolAcc, chunk.toolCalls);
          }
        }

        const toolCalls: NonNullable<ModelTurnResult['toolCalls']> = [];
        for (const [, tc] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
          if (!tc.name) continue;
          let args: Record<string, unknown> = {};
          try {
            args = tc.arguments
              ? (JSON.parse(tc.arguments) as Record<string, unknown>)
              : {};
          } catch {
            args = { raw: tc.arguments };
          }
          toolCalls.push({
            id: tc.id || `call_${toolCalls.length + 1}`,
            name: tc.name,
            arguments: args,
          });
        }

        const result: ModelTurnResult = {
          content: content || undefined,
          reasoning: reasoning || undefined,
          toolCalls: toolCalls.length ? toolCalls : undefined,
        };
        return result;
      },

      executeTool: async ({ name, args, callId, signal }) => {
        void callId;
        const toolCtx: ToolContext = {
          ...toolCtxBase,
          signal,
        };
        const result = await executeTool(registry, name, args, toolCtx);
        return {
          success: result.success,
          data: result.data,
          error: result.error,
          metadata: {
            durationMs: result.metadata?.durationMs,
            truncated: result.metadata?.truncated,
            cancelled: result.metadata?.cancelled,
            denied: result.metadata?.denied,
          },
        };
      },

      checkPermission: async ({ toolName, args }) => {
        const path =
          typeof args.path === 'string'
            ? args.path
            : typeof args.file_path === 'string'
              ? args.file_path
              : undefined;
        const decision = await gate.requestPermission({
          toolName,
          args,
          path,
        });
        return decision === 'reject' ? 'deny' : 'allow';
      },

      onEvent: (event: AgentLoopEvent) => {
        mapLoopEventToStream(event, postStream);
      },
    },
    {
      mode,
      maxTurns,
      systemPrompt: modeConfig.systemPrompt,
      contextBudgetTokens: modeConfig.contextBudget,
      parallelTools: true,
    },
  );

  ctx.hostLoops.set(requestId, { loop, abort });

  const prior: AgentMessage[] = (payload.messages || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, -1)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: String(m.content || ''),
    }));

  const lastUser =
    [...(payload.messages || [])]
      .reverse()
      .find((m) => m.role === 'user')?.content || '';

  try {
    postStream({ event: 'status', status: 'running' });
    const result = await loop.run({
      prompt: String(lastUser),
      signal: abort.signal,
      messages: prior.length ? prior : undefined,
    });

    if (result.reason === 'doom_loop' && result.content) {
      postStream({ event: 'delta', content: `\n\n${result.content}` });
    }
    if (result.reason === 'fatal_error') {
      postStream({
        event: 'error',
        error: result.content || 'Fatal agent error',
      });
    } else if (result.reason === 'aborted' || result.reason === 'timeout') {
      postStream({ event: 'stopped' });
    } else {
      postStream({ event: 'complete' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postStream({ event: 'error', error: message });
  } finally {
    ctx.hostLoops.delete(requestId);
    if (ctx.getHostLoopRequestId() === requestId) {
      ctx.setHostLoopRequestId(undefined);
    }
  }
}

/** Map AgentLoopController events → chat.stream envelope events. */
function mapLoopEventToStream(
  event: AgentLoopEvent,
  post: (e: Record<string, unknown>) => void,
): void {
  switch (event.type) {
    case 'status':
      post({ event: 'status', status: event.status });
      break;
    case 'assistant_delta':
      // runModel already posts token deltas; avoid double-posting full turn text.
      break;
    case 'tool_start':
      post({
        event: 'tool.start',
        toolName: event.call.name,
        toolArgs: JSON.stringify(event.call.arguments ?? {}),
      });
      break;
    case 'tool_end':
      post({
        event: 'tool.end',
        toolName: event.call.name,
        error: event.error,
      });
      break;
    case 'error':
      post({ event: 'error', error: event.error });
      break;
    case 'done':
      // complete/stopped posted by runHostChatSend after run() returns
      break;
    default:
      break;
  }
}

/** Abort in-flight chat.send for a request (or the current host loop). */
export function stopHostChatSend(
  ctx: ChatSendContext,
  payload?: ChatStopPayload,
): void {
  const target =
    (payload?.requestId != null ? String(payload.requestId) : undefined) ||
    ctx.getHostLoopRequestId();
  if (!target) return;
  const runtime = ctx.hostLoops.get(target);
  if (!runtime) return;
  runtime.abort.abort();
  ctx.hostLoops.delete(target);
  if (ctx.getHostLoopRequestId() === target) {
    ctx.setHostLoopRequestId(undefined);
  }
  if (ctx.webview) {
    void ctx.webview.postMessage({
      type: 'chat.stream',
      payload: { requestId: target, event: 'stopped' },
    });
  }
}
