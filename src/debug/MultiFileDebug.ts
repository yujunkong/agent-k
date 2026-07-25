/**
 * MultiFileDebug - 멀티파일 계측 → 통합 로그 분석 (C6-T26)
 */
import { AddInstrumentationTool, InstrumentationRequest } from '../tools/debug/AddInstrumentationTool';
import { DebugLogServer, LogEntry } from './DebugLogServer';

export interface MultiFileAnalysis {
  files: string[];
  hypothesisId: string;
  correlation: Array<{
    timestamp: number;
    files: string[];
    message: string;
  }>;
}

export class MultiFileDebug {
  private addTool = new AddInstrumentationTool();

  /**
   * Plan multi-file instrumentation
   */
  planInstrumentation(hypothesisId: string, filePaths: string[]): InstrumentationRequest[] {
    const requests: InstrumentationRequest[] = [];

    filePaths.forEach((path, i) => {
      requests.push({
        filePath: path,
        hypothesisId,
        type: 'entry',
        lineNumber: 1,
        variableName: 'args'
      });
      requests.push({
        filePath: path,
        hypothesisId,
        type: 'exit'
      });
    });

    return requests;
  }

  /**
   * Correlate logs across files by timestamp
   */
  correlate(entries: LogEntry[], windowMs: number = 100): MultiFileAnalysis {
    const files = [...new Set(entries.map(e => e.source))];
    const hypothesisId = entries[0]?.message.match(/DEBUG_INSTRUMENT:\s*(\S+)/)?.[1] || 'unknown';

    const correlation: MultiFileAnalysis['correlation'] = [];
    
    // Group entries by time proximity
    const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
    
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const nearby = sorted.filter((e, j) =>
        j !== i &&
        Math.abs(e.timestamp - current.timestamp) <= windowMs
      );

      if (nearby.length > 0) {
        correlation.push({
          timestamp: current.timestamp,
          files: [current.source, ...nearby.map(e => e.source)],
          message: current.message.slice(0, 100)
        });
      }
    }

    return { files, hypothesisId, correlation };
  }
}
