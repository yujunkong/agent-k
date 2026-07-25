/**
 * Stdio MCP session — JSON-RPC 2.0 over stdio.
 *
 * Supports both:
 * - NDJSON (newline-delimited JSON) — custom servers e.g. searxng_mcp_server.py
 * - Content-Length framing — official @modelcontextprotocol servers
 */
import { spawn, type ChildProcess } from 'child_process';

export type McpFraming = 'ndjson' | 'content-length' | 'auto';

export interface StdioMcpSpawnOptions {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** Framing mode; auto picks ndjson for python scripts, else content-length */
  framing?: McpFraming;
  connectTimeoutMs?: number;
  callTimeoutMs?: number;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function detectFraming(command: string, args: string[], framing?: McpFraming): 'ndjson' | 'content-length' {
  if (framing === 'ndjson' || framing === 'content-length') return framing;
  // Default NDJSON: works with custom Python MCP (SearXNG) and many npx MCP servers
  // (e.g. @modelcontextprotocol/server-sequential-thinking). Use framing:"content-length" for SDK-strict servers.
  void command;
  void args;
  return 'ndjson';
}

export class StdioMcpSession {
  readonly name: string;
  private child: ChildProcess;
  private framing: 'ndjson' | 'content-length';
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buffer = '';
  private stderrTail = '';
  private closed = false;
  private callTimeoutMs: number;

  private constructor(
    name: string,
    child: ChildProcess,
    framing: 'ndjson' | 'content-length',
    callTimeoutMs: number
  ) {
    this.name = name;
    this.child = child;
    this.framing = framing;
    this.callTimeoutMs = callTimeoutMs;

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.onStdout(chunk));
    child.stderr?.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-2000);
    });
    child.on('exit', (code, signal) => {
      this.closed = true;
      const err = new Error(
        `MCP server "${name}" exited (code=${code}, signal=${signal}). stderr: ${this.stderrTail.slice(0, 400)}`
      );
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      this.pending.clear();
    });
    child.on('error', (err) => {
      this.closed = true;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      this.pending.clear();
    });
  }

  static async connect(opts: StdioMcpSpawnOptions): Promise<StdioMcpSession> {
    const args = opts.args || [];
    const framing = detectFraming(opts.command, args, opts.framing);
    const child = spawn(opts.command, args, {
      env: { ...process.env, ...opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const session = new StdioMcpSession(
      opts.name,
      child,
      framing,
      opts.callTimeoutMs ?? 60_000
    );

    const connectTimeout = opts.connectTimeoutMs ?? 15_000;
    try {
      // MCP initialize handshake
      const initResult = await session.request(
        'initialize',
        {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'agent-k', version: '0.0.2' },
        },
        connectTimeout
      );

      // Required by MCP after successful initialize
      session.notify('notifications/initialized', {});

      void initResult;
      return session;
    } catch (err) {
      session.close();
      throw err;
    }
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>> {
    const result = (await this.request('tools/list', {})) as { tools?: unknown[] };
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    return tools.map((t: any) => ({
      name: String(t.name),
      description: typeof t.description === 'string' ? t.description : '',
      inputSchema: (t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : {}) as Record<string, unknown>,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args }, this.callTimeoutMs);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.child.stdin?.end();
    } catch {
      /* ignore */
    }
    this.child.kill();
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(`MCP server "${this.name}" closed`));
    }
    this.pending.clear();
  }

  isAlive(): boolean {
    return !this.closed && this.child.exitCode === null;
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.writeMessage({ jsonrpc: '2.0', method, params });
  }

  private request(method: string, params: Record<string, unknown>, timeoutMs = 30_000): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error(`MCP server "${this.name}" is not connected`));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `MCP "${this.name}" ${method} timed out after ${timeoutMs}ms. stderr: ${this.stderrTail.slice(0, 300)}`
          )
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.writeMessage({ jsonrpc: '2.0', id, method, params });
    });
  }

  private writeMessage(msg: Record<string, unknown>): void {
    const body = JSON.stringify(msg);
    if (this.framing === 'ndjson') {
      this.child.stdin?.write(body + '\n');
      return;
    }
    const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
    this.child.stdin?.write(frame);
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    // Prefer Content-Length when headers appear; otherwise NDJSON lines
    while (this.buffer.length > 0) {
      const headerMatch = /^(?:Content-Length:\s*(\d+)\r?\n(?:[^\r\n]*\r?\n)*\r?\n)/i.exec(this.buffer);
      if (headerMatch) {
        const len = Number(headerMatch[1]);
        const headerLen = headerMatch[0].length;
        if (this.buffer.length < headerLen + len) return;
        const raw = this.buffer.slice(headerLen, headerLen + len);
        this.buffer = this.buffer.slice(headerLen + len);
        this.handleMessageRaw(raw);
        continue;
      }

      // If buffer looks like Content-Length but incomplete header, wait
      if (/^Content-Length:/i.test(this.buffer) || /^content-length:/i.test(this.buffer.trimStart())) {
        return;
      }

      const nl = this.buffer.indexOf('\n');
      if (nl < 0) return;
      const line = this.buffer.slice(0, nl).replace(/\r$/, '').trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      this.handleMessageRaw(line);
    }
  }

  private handleMessageRaw(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // ignore non-JSON noise on stdout
    }

    // Server → client notification (no id)
    if (msg.id === undefined || msg.id === null) {
      return;
    }

    const pending = this.pending.get(Number(msg.id));
    if (!pending) return;
    this.pending.delete(Number(msg.id));
    clearTimeout(pending.timer);

    if (msg.error) {
      const m = msg.error.message || JSON.stringify(msg.error);
      pending.reject(new Error(String(m)));
      return;
    }
    pending.resolve(msg.result);
  }
}
