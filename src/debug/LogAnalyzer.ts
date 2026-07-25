/**
 * LogAnalyzer - 로그 분석 → 원인 특정 (C6-T09)
 */
import type { LogEntry } from './DebugLogServer';

export interface AnalysisResult {
  hypothesisId: string;
  status: 'confirmed' | 'rejected' | 'inconclusive';
  confidence: number; // 0-1
  evidence: string[];
  matchedPatterns: string[];
  stackTraces: string[];
}

export class LogAnalyzer {
  private readonly CONFIRM_THRESHOLD = 0.66; // 2/3 evidence types

  /**
   * Analyze logs against a hypothesis
   */
  analyze(hypothesisId: string, hypothesisTitle: string, logs: LogEntry[], stackTraces: string[]): AnalysisResult {
    const evidence: string[] = [];
    const matchedPatterns: string[] = [];

    // Evidence type 1: Error logs mentioning the hypothesis
    const errorLogs = logs.filter(l => l.level === 'error' || l.level === 'warn');
    if (errorLogs.length > 0) {
      evidence.push(`${errorLogs.length} error/warning log(s) found`);
    }

    // Evidence type 2: Stack traces matching
    const relevantTraces = this.matchStackTraces(stackTraces, hypothesisTitle);
    if (relevantTraces.length > 0) {
      evidence.push(`${relevantTraces.length} stack trace(s) match hypothesis`);
      matchedPatterns.push(...relevantTraces);
    }

    // Evidence type 3: Log message patterns matching hypothesis
    const logPatterns = this.matchLogPatterns(logs, hypothesisTitle);
    if (logPatterns.length > 0) {
      evidence.push(`${logPatterns.length} log pattern(s) match ${hypothesisTitle}`);
      matchedPatterns.push(...logPatterns);
    }

    // Evidence type 4: Timing/correlation patterns
    const timingEvidence = this.detectTimingPatterns(logs);
    if (timingEvidence) {
      evidence.push(timingEvidence);
    }

    // Calculate confidence
    const evidenceTypes = [errorLogs.length > 0, relevantTraces.length > 0, logPatterns.length > 0, !!timingEvidence];
    const confirmedCount = evidenceTypes.filter(Boolean).length;
    const confidence = confirmedCount / evidenceTypes.length;

    let status: AnalysisResult['status'];
    if (confidence >= this.CONFIRM_THRESHOLD && evidence.length >= 2) {
      status = 'confirmed';
    } else if (evidence.length === 0) {
      status = 'rejected';
    } else {
      status = 'inconclusive';
    }

    return {
      hypothesisId,
      status,
      confidence: Math.round(confidence * 100) / 100,
      evidence,
      matchedPatterns,
      stackTraces: relevantTraces
    };
  }

  /**
   * Compare two analyses and select the best hypothesis
   */
  selectBestHypothesis(results: AnalysisResult[]): AnalysisResult | null {
    if (results.length === 0) return null;
    const confirmed = results.filter(r => r.status === 'confirmed');
    if (confirmed.length > 0) {
      return confirmed.sort((a, b) => b.confidence - a.confidence)[0];
    }
    return results.sort((a, b) => b.confidence - a.confidence)[0];
  }

  private matchStackTraces(traces: string[], hypothesisTitle: string): string[] {
    const lower = hypothesisTitle.toLowerCase();
    return traces.filter(t => {
      const tl = t.toLowerCase();
      // Match related terms
      return tl.includes(lower) || 
        lower.split(' ').some(word => word.length > 3 && tl.includes(word));
    });
  }

  private matchLogPatterns(logs: LogEntry[], hypothesisTitle: string): string[] {
    const patterns = [
      'error', 'exception', 'fail', 'timeout', 'crash',
      'undefined', 'null', 'race', 'deadlock', 'leak'
    ];
    const lower = hypothesisTitle.toLowerCase();
    const relevantPatterns = patterns.filter(p => lower.includes(p) || lower.includes(p.replace('_', '')));
    
    return logs
      .filter(l => relevantPatterns.some(p => l.message.toLowerCase().includes(p)))
      .map(l => `[${l.level}] ${l.message.slice(0, 100)}`);
  }

  private detectTimingPatterns(logs: LogEntry[]): string | null {
    if (logs.length < 2) return null;
    
    // Check for rapid error bursts
    const errors = logs.filter(l => l.level === 'error');
    if (errors.length >= 3) {
      const sorted = errors.sort((a, b) => a.timestamp - b.timestamp);
      const burstWindow = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
      if (burstWindow < 5000) { // 5 seconds
        return `${errors.length} errors in ${burstWindow}ms burst`;
      }
    }
    return null;
  }
}
