/**
 * DebugLogServer - 로컬 로그 수집 엔드포인트 (C6-T05)
 */
import * as http from 'http';
import * as url from 'url';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  metadata?: Record<string, any>;
}

interface LogFilter {
  level?: string;
  source?: string;
  since?: number;
  maxLines?: number;
}

export class DebugLogServer {
  private logs: LogEntry[] = [];
  private server: http.Server | null = null;
  private maxLogs = 10000;
  private port: number;

  constructor(port = 18999) {
    this.port = port;
  }

  /**
   * Start the HTTP server
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        const parsed = url.parse(req.url || '', true);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (req.method === 'POST' && parsed.pathname === '/logs') {
          this.handleLogIngest(req, res);
        } else if (req.method === 'GET' && parsed.pathname === '/logs') {
          this.handleLogQuery(req, res, parsed.query as any);
        } else if (req.method === 'DELETE' && parsed.pathname === '/logs') {
          this.logs = [];
          res.end(JSON.stringify({ ok: true, cleared: true }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      this.server.listen(this.port, () => {
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Ingest a log entry
   */
  ingest(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
    const log: LogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now()
    };
    this.logs.push(log);

    // Truncate if over max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    return log;
  }

  /**
   * Query logs with filters
   */
  query(filter: LogFilter = {}): LogEntry[] {
    let result = [...this.logs];

    if (filter.level) {
      const levels = filter.level.split(',');
      result = result.filter(l => levels.includes(l.level));
    }
    if (filter.source) {
      result = result.filter(l => l.source.includes(filter.source!));
    }
    if (filter.since) {
      result = result.filter(l => l.timestamp >= filter.since!);
    }
    if (filter.maxLines && result.length > filter.maxLines) {
      result = result.slice(-filter.maxLines);
    }

    return result;
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
  }

  get isRunning(): boolean {
    return this.server !== null;
  }

  get logCount(): number {
    return this.logs.length;
  }

  private handleLogIngest(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const entry = JSON.parse(body);
        const log = this.ingest(entry);
        res.end(JSON.stringify({ ok: true, id: log.id }));
      } catch (e: any) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }

  private handleLogQuery(req: http.IncomingMessage, res: http.ServerResponse, query: Record<string, string>): void {
    const filter: LogFilter = {};
    if (query.level) filter.level = query.level;
    if (query.source) filter.source = query.source;
    if (query.since) filter.since = parseInt(query.since);
    if (query.maxLines) filter.maxLines = parseInt(query.maxLines);

    const results = this.query(filter);
    res.end(JSON.stringify({ ok: true, count: results.length, logs: results }));
  }
}
