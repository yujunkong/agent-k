/**
 * HostToolLoop — Extension Host 경유 최소 도구 루프
 *
 * Webview는 vscode.fs 등을 직접 쓸 수 없고, 기존 useChatStream은
 * plain /v1/chat/completions 만 호출해 모델이 도구 JSON을 "답변"으로 덤프함.
 *
 * Agent/Plan/Debug: Host가 completions → tool JSON 파싱 → glob/read_file 등 실행
 * → 결과를 다음 턴에 주입 → 사용자에게는 prose만 스트림.
 *
 * 전체 AgentLoopController 대체는 아님 (쓰기/터미널/승인 게이트는 후속).
 */
import * as path from 'path';
import { toolCallParser } from '../providers/ToolCallParser';
import { modeRegistry } from '../agent/modeRegistry';
import { getWorkspaceRoot, resolveWorkspacePath } from '../tools/writeExecutors';
import type { ToolInput, ToolOutput } from '../tools/types';
import type { Mode } from '../agent/types';

export interface HostLoopMessage {
  role: string;
  content: string;
}

export interface HostToolLoopConfig {
  messages: HostLoopMessage[];
  mode: Mode;
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Max model↔tool rounds (default 4) */
  maxTurns?: number;
  signal?: AbortSignal;
  onDelta: (content: string) => void;
  /** Brief UI status e.g. "🔧 Running glob…" — replaces raw tool JSON in bubble */
  onStatus: (status: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (name: string, result: string, error?: string) => void;
  onComplete: () => void;
  onError: (err: string) => void;
}

/** Read-only tools this minimal host loop can execute today */
const HOST_READ_TOOLS = new Set([
  'glob',
  'read_file',
  'read_files',
  'grep',
  'list_dir',
  'file_search',
  'read_lints',
  'codebase_search'
]);

const TOOL_PROTOCOL = `You are Agent K running with host-executed tools.
When you need workspace info, respond with ONLY a JSON array of tool calls (no markdown fences, no prose):
[{"name":"glob","arguments":{"pattern":"**/*","path":"."}}]
or [{"name":"codebase_search","arguments":{"query":"where is TipTapEditor"}}]
or [{"name":"read_files","arguments":{"paths":["src/a.ts","src/b.ts"],"limit":250}}]
or [{"name":"read_file","arguments":{"path":"src/foo.ts","offset":1,"limit":250}}]
Available read tools: glob, read_file, read_files, grep, codebase_search, list_dir, file_search, read_lints.
Batch exploration: prefer read_files (up to 12 paths) or many read_file calls in ONE turn — do not drip 2–4 files per round.
Prefer search then windowed reads (offset/limit). After tool results, answer in clear natural language. Do NOT dump tool JSON as the final answer.`;

export async function runHostToolLoop(config: HostToolLoopConfig): Promise<void> {
  const maxTurns = config.maxTurns ?? 4;
  const root = getWorkspaceRoot();
  const baseUrl = (config.baseUrl || 'http://127.0.0.1:4000').replace(/\/$/, '');

  const messages: HostLoopMessage[] = [
    {
      role: 'system',
      content:
        (config.mode ? modeRegistry.getSystemPrompt(config.mode) : '') +
        '\n\n' +
        TOOL_PROTOCOL +
        `\nWorkspace root: ${root}`
    },
    ...config.messages.filter((m) => m.role !== 'system')
  ];

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      if (config.signal?.aborted) {
        config.onComplete();
        return;
      }

      const assistantText = await streamCompletion({
        baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages,
        signal: config.signal,
        // Buffer first; only stream prose turns (tool JSON hidden)
        onChunk: undefined
      });

      if (config.signal?.aborted) {
        config.onComplete();
        return;
      }

      const toolCalls = toolCallParser.parse(assistantText);
      const mostlyTools =
        toolCalls.length > 0 && isMostlyToolPayload(assistantText, toolCalls.length);

      if (!mostlyTools) {
        // Final prose answer — stream to UI (already buffered; emit once)
        const clean = stripToolJsonForDisplay(assistantText);
        if (clean) config.onDelta(clean);
        config.onComplete();
        return;
      }

      // Hide raw JSON; show status while host runs tools
      messages.push({ role: 'assistant', content: assistantText });

      const resultBlocks: string[] = [];
      const { isParallelReadTool, mapPool } = await import('../loop/parallelRead');

      // Cap tool calls per turn (same as AgentLoop)
      const capped = toolCalls.slice(0, 12);
      let idx = 0;
      while (idx < capped.length) {
        if (config.signal?.aborted) break;
        const head = capped[idx];
        if (isParallelReadTool(head.name)) {
          const batch = [];
          while (
            idx < capped.length &&
            isParallelReadTool(capped[idx].name) &&
            batch.length < 16
          ) {
            batch.push(capped[idx++]);
          }
          for (const tc of batch) {
            config.onStatus(`🔧 Running ${tc.name}…`);
            config.onToolStart?.(tc.name, tc.arguments as Record<string, unknown>);
          }
          const outcomes = await mapPool(batch, 8, async (tc) => {
            const result = await executeHostTool(
              tc.name,
              tc.arguments as ToolInput,
              config.mode
            );
            return { tc, result };
          });
          for (const { tc, result } of outcomes) {
            let data = result.data;
            if (
              result.success &&
              data &&
              typeof data === 'object' &&
              Array.isArray((data as { files?: string[] }).files)
            ) {
              const filesField = (data as { files: unknown }).files;
              // read_files returns objects; glob returns string[]
              if (
                Array.isArray(filesField) &&
                filesField.every((f) => typeof f === 'string')
              ) {
                data = {
                  ...(data as object),
                  files: relativizePaths(filesField as string[])
                };
              }
            }
            const serialized = result.success
              ? JSON.stringify(data ?? { ok: true }, null, 0).slice(0, 120_000)
              : JSON.stringify({ error: result.error || 'tool failed' });
            config.onToolEnd?.(
              tc.name,
              serialized,
              result.success ? undefined : result.error
            );
            resultBlocks.push(`Tool ${tc.name} result:\n${serialized}`);
          }
          continue;
        }

        const tc = capped[idx++];
        const name = tc.name;
        config.onStatus(`🔧 Running ${name}…`);
        config.onToolStart?.(name, tc.arguments as Record<string, unknown>);

        const result = await executeHostTool(name, tc.arguments as ToolInput, config.mode);
        let data = result.data;
        if (
          result.success &&
          data &&
          typeof data === 'object' &&
          Array.isArray((data as { files?: string[] }).files)
        ) {
          const filesField = (data as { files: unknown }).files;
          if (
            Array.isArray(filesField) &&
            filesField.every((f) => typeof f === 'string')
          ) {
            data = {
              ...(data as object),
              files: relativizePaths(filesField as string[])
            };
          }
        }
        const serialized = result.success
          ? JSON.stringify(data ?? { ok: true }, null, 0).slice(0, 120_000)
          : JSON.stringify({ error: result.error || 'tool failed' });

        config.onToolEnd?.(name, serialized, result.success ? undefined : result.error);
        resultBlocks.push(`Tool ${name} result:\n${serialized}`);
      }

      messages.push({
        role: 'user',
        content:
          `<tool_results>\n${resultBlocks.join('\n\n')}\n</tool_results>\n\n` +
          'Using the tool results above, answer the user in natural language. ' +
          'Do not emit another tool JSON array unless you still need more files.'
      });
    }

    config.onStatus('⚠ Tool loop reached max turns — summarize with what you have.');
    // One last completion without tools expectation
    const last = await streamCompletion({
      baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      messages: [
        ...messages,
        {
          role: 'user',
          content: 'Stop calling tools. Give your best answer now based on tool results so far.'
        }
      ],
      signal: config.signal
    });
    const clean = stripToolJsonForDisplay(last);
    if (clean) config.onDelta(clean);
    config.onComplete();
  } catch (e) {
    if (config.signal?.aborted) {
      config.onComplete();
      return;
    }
    config.onError(e instanceof Error ? e.message : String(e));
  }
}

function isMostlyToolPayload(text: string, callCount: number): boolean {
  if (callCount <= 0) return false;
  const trimmed = text.trim();
  // Entire reply is JSON array/object of tools
  if (/^\s*[\[{]/.test(trimmed) && /"name"\s*:/.test(trimmed)) {
    const withoutJson = stripToolJsonForDisplay(trimmed);
    return withoutJson.length < 40;
  }
  // Tool tags dominate
  if (/^\s*\[?\s*\{?\s*"name"/.test(trimmed)) return true;
  return withoutProseRatio(trimmed) > 0.7;
}

function withoutProseRatio(text: string): number {
  const stripped = stripToolJsonForDisplay(text);
  if (!text.length) return 1;
  return 1 - stripped.length / text.length;
}

/** Remove tool-call JSON so bubbles never show the dump as the answer */
export function stripToolJsonForDisplay(content: string): string {
  if (!content) return content;
  let out = content;
  // Full-line / dominant JSON array of tool calls
  out = out.replace(
    /\[\s*\{\s*"name"\s*:\s*"[a-zA-Z0-9_]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}\s*(?:,\s*\{\s*"name"\s*:\s*"[a-zA-Z0-9_]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}\s*)*\]/g,
    ''
  );
  // Single tool object
  out = out.replace(
    /\{\s*"name"\s*:\s*"[a-zA-Z0-9_]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/g,
    ''
  );
  out = out.replace(/```(?:json)?\s*[\s\S]*?```/gi, (block) =>
    /"name"\s*:/.test(block) ? '' : block
  );
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

async function executeHostTool(
  name: string,
  args: ToolInput,
  mode: Mode
): Promise<ToolOutput> {
  if (!modeRegistry.isToolAllowed(mode, name)) {
    return {
      success: false,
      error: `Tool "${name}" is not allowed in ${mode} mode.`
    };
  }
  if (!HOST_READ_TOOLS.has(name)) {
    return {
      success: false,
      error:
        `Tool "${name}" is not wired in the chat host loop yet ` +
        `(read tools only: ${[...HOST_READ_TOOLS].join(', ')}).`
    };
  }

  const normalized = normalizeToolArgs(name, args);

  const {
    executeGrep,
    executeGlob,
    executeFileSearch,
    executeReadFile,
    executeReadFiles,
    executeListDir,
    executeReadLints,
    executeCodebaseSearch
  } = await import('../tools/executors');

  const map: Record<string, (input: ToolInput) => Promise<ToolOutput>> = {
    grep: executeGrep,
    glob: executeGlob,
    file_search: executeFileSearch,
    read_file: executeReadFile,
    read_files: executeReadFiles,
    list_dir: executeListDir,
    read_lints: executeReadLints,
    codebase_search: executeCodebaseSearch
  };

  const exec = map[name];
  if (!exec) {
    return { success: false, error: `No executor for ${name}` };
  }
  return exec(normalized);
}

/** Resolve relative paths against workspace root (webview often sends ".") */
function normalizeToolArgs(name: string, args: ToolInput): ToolInput {
  const next = { ...args };
  const root = getWorkspaceRoot();

  if (name === 'glob' || name === 'file_search') {
    const p = (next.path as string) || '.';
    if (!p || p === '.' || p === './') {
      next.path = root;
    } else {
      const resolved = resolveWorkspacePath(p);
      next.path = 'abs' in resolved ? resolved.abs : root;
    }
    if (!next.pattern && name === 'file_search' && next.query) {
      next.pattern = `**/*${next.query}*`;
    }
    if (!next.pattern) {
      next.pattern = '**/*';
    }
  }

  if (name === 'read_file' || name === 'list_dir' || name === 'grep') {
    const key = name === 'grep' ? 'path' : 'path';
    const p = next[key] as string | undefined;
    if (p) {
      const resolved = resolveWorkspacePath(p === '.' || p === './' ? root : p);
      if ('abs' in resolved) {
        next[key] = resolved.abs;
      }
    } else if (name === 'list_dir') {
      next.path = root;
    } else if (name === 'grep') {
      next.path = root;
    }
  }

  if (name === 'read_lints' && Array.isArray(next.paths)) {
    next.paths = (next.paths as string[]).map((p) => {
      const resolved = resolveWorkspacePath(p);
      return 'abs' in resolved ? resolved.abs : p;
    });
  }

  // Cap glob explosion for project overview
  if ((name === 'glob' || name === 'file_search') && !next.maxResults) {
    next.maxResults = 80;
  }

  return next;
}

interface StreamOpts {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: HostLoopMessage[];
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
}

async function streamCompletion(opts: StreamOpts): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream'
  };
  if (opts.apiKey) {
    headers.Authorization = `Bearer ${opts.apiKey}`;
  }

  const response = await fetch(`${opts.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
      stream: true,
      temperature: 0.4,
        max_tokens: 16384,
      enable_thinking: true
    }),
    signal: opts.signal
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error (${response.status}): ${errText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            full += delta.content;
            opts.onChunk?.(delta.content);
          }
        } catch {
          // ignore partial JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return full;
}

/** Relativize absolute paths in glob results for shorter model context (optional helper) */
export function relativizePaths(files: string[]): string[] {
  const root = getWorkspaceRoot();
  return files.map((f) => {
    try {
      return path.relative(root, f) || f;
    } catch {
      return f;
    }
  });
}
