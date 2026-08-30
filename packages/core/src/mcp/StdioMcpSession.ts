/**
 * MCP-006 — Stdio MCP session (JSON-RPC 2.0 over child_process stdin/stdout).
 * Supports Content-Length framing (default) and newline-delimited JSON.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { MCPServerConfig, McpFraming, McpToolDescriptor } from '@agent-k/shared';

type JsonRpcId = number | string;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

const PROTOCOL_VERSION = '2024-11-05';

export class StdioMcpSession {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, Pending>();
  private buffer = Buffer.alloc(0);
  private framing: McpFraming;
  private closed = false;
  private toolsCache: McpToolDescriptor[] | null = null;

  constructor(private readonly config: MCPServerConfig) {
    this.framing = config.framing || 'content-length';
  }

  get name(): string {
    return this.config.name;
  }

  get isConnected(): boolean {
    return !!this.child && !this.closed;
  }

  /** Spawn process + MCP initialize handshake. */
  async connect(signal?: AbortSignal): Promise<void> {
    if (this.child) return;
    if (this.config.transport === 'http') {
      throw new Error(
        `MCP server "${this.config.name}" is HTTP transport — stdio session cannot connect`,
      );
    }
    if (!this.config.command) {
      throw new Error(`MCP server "${this.config.name}" has empty command`);
    }

    const env = {
      ...process.env,
      ...(this.config.env || {}),
    };

    this.child = spawn(this.config.command, this.config.args || [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.closed = false;

    this.child.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk));
    this.child.stderr.on('data', (_chunk: Buffer) => {
      /* stderr is diagnostic — do not fail the session */
    });
    this.child.on('exit', () => {
      this.failAll(new Error(`MCP server "${this.config.name}" exited`));
      this.child = null;
      this.closed = true;
    });

    if (signal) {
      const onAbort = () => {
        void this.disconnect();
      };
      if (signal.aborted) {
        await this.disconnect();
        throw new Error('Aborted');
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'agent-k', version: '3.0.0' },
    });
    this.notify('notifications/initialized', {});
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    this.failAll(new Error('MCP session disconnected'));
    const child = this.child;
    this.child = null;
    if (!child) return;
    try {
      child.stdin.end();
    } catch {
      /* ignore */
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        resolve();
      }, 2000);
      child.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
      try {
        child.kill('SIGTERM');
      } catch {
        clearTimeout(t);
        resolve();
      }
    });
  }

  async listTools(force = false): Promise<McpToolDescriptor[]> {
    if (!force && this.toolsCache) return this.toolsCache;
    const result = (await this.request('tools/list', {})) as {
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }>;
    };
    const tools = (result?.tools || []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      server: this.config.name,
    }));
    this.toolsCache = tools;
    return tools;
  }

  async callTool(
    tool: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (signal?.aborted) throw new Error('Aborted');
    return this.request('tools/call', { name: tool, arguments: args || {} });
  }

  /** Rough schema token estimate for deferred loading (ADDON-T15). */
  estimateSchemaTokens(tools: McpToolDescriptor[]): number {
    try {
      return Math.ceil(JSON.stringify(tools).length / 4);
    } catch {
      return tools.length * 200;
    }
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    if (!this.child || this.closed) {
      throw new Error(`MCP server "${this.config.name}" is not connected`);
    }
    const id = this.nextId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.writeMessage(payload);
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private notify(method: string, params: unknown): void {
    if (!this.child || this.closed) return;
    this.writeMessage({ jsonrpc: '2.0', method, params });
  }

  private writeMessage(msg: unknown): void {
    if (!this.child) throw new Error('No MCP child process');
    const body = Buffer.from(JSON.stringify(msg), 'utf8');
    if (this.framing === 'newline') {
      this.child.stdin.write(body);
      this.child.stdin.write('\n');
      return;
    }
    const header = Buffer.from(
      `Content-Length: ${body.length}\r\n\r\n`,
      'utf8',
    );
    this.child.stdin.write(Buffer.concat([header, body]));
  }

  private onStdout(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.framing === 'newline') {
      this.drainNewline();
    } else {
      this.drainContentLength();
    }
  }

  private drainNewline(): void {
    while (true) {
      const idx = this.buffer.indexOf(0x0a);
      if (idx < 0) return;
      const line = this.buffer.subarray(0, idx).toString('utf8').trim();
      this.buffer = this.buffer.subarray(idx + 1);
      if (!line) continue;
      this.handleMessage(line);
    }
  }

  private drainContentLength(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString('utf8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        // Fallback: treat as newline JSON if no header
        this.framing = 'newline';
        this.drainNewline();
        return;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) return;
      const body = this.buffer.subarray(start, start + length).toString('utf8');
      this.buffer = this.buffer.subarray(start + length);
      this.handleMessage(body);
    }
  }

  private handleMessage(raw: string): void {
    let msg: {
      id?: JsonRpcId;
      result?: unknown;
      error?: { message?: string; code?: number };
      method?: string;
    };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }
    if (msg.id == null) return; // notification from server
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.error) {
      pending.reject(
        new Error(msg.error.message || `MCP error ${msg.error.code ?? ''}`),
      );
      return;
    }
    pending.resolve(msg.result);
  }

  private failAll(err: Error): void {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }
}
