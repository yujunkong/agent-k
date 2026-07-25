/**
 * CollectRuntimeLogsTool - 로그 수집 + 포맷팅 (C6-T06)
 */
import { DebugLogServer, LogEntry } from '../../debug/DebugLogServer';

export interface LogCollectionRequest {
  source?: string;
  level?: string;
  since?: number;
  maxLines?: number;
  hypothesisId?: string;
}

export class CollectRuntimeLogsTool {
  constructor(private server: DebugLogServer) {}

  /**
   * Collect logs from the DebugLogServer
   */
  collect(request: LogCollectionRequest): { logs: LogEntry[]; summary: string } {
    const logs = this.server.query({
      level: request.level,
      source: request.source,
      since: request.since,
      maxLines: request.maxLines || 1000
    });

    // Filter by hypothesis ID (from log message content)
    const filtered = request.hypothesisId
      ? logs.filter(l => l.message.includes(request.hypothesisId!))
      : logs;

    const errorCount = filtered.filter(l => l.level === 'error').length;
    const warnCount = filtered.filter(l => l.level === 'warn').length;

    return {
      logs: filtered,
      summary: [
        `Collected ${filtered.length} log(s)`,
        errorCount > 0 ? `  Errors: ${errorCount}` : '',
        warnCount > 0 ? `  Warnings: ${warnCount}` : '',
        `  Time range: ${filtered.length > 0 ? new Date(filtered[0].timestamp).toISOString() : 'N/A'}`
      ].filter(Boolean).join('\n')
    };
  }

  /**
   * Format logs for tool result display
   */
  formatToolResult(collection: { logs: LogEntry[]; summary: string }): string {
    const recent = collection.logs.slice(-50);
    
    const lines: string[] = [
      collection.summary,
      '',
      '### Recent Logs',
      ...recent.map(l => {
        const time = new Date(l.timestamp).toISOString().slice(11, 23);
        return `[${time}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`;
      }),
      ...(collection.logs.length > 50 ? ['', `... and ${collection.logs.length - 50} more entries`] : [])
    ];

    return lines.join('\n');
  }
}
