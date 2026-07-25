/**
 * SideChatSession - 병렬 읽기 전용 세션 (C4-T22)
 * 
 * 메인 Agent 병렬 읽기 전용 세션
 * grep/read/search만, 쓰기/터미널/Review 금지
 * `@side-결과`로 메인 컨텍스트 합류
 */
import { modeRegistry } from '../agent/modeRegistry';
import type { Mode } from '../agent/types';

export interface SideChatResult {
  sessionId: string;
  query: string;
  summary: string;
  findings: string[];
  sources: string[];
  timestamp: number;
}

export class SideChatSession {
  private readonly sessionId: string;
  private mode: Mode = 'ask'; // Side chat is always read-only (ask mode)
  private results: SideChatResult[] = [];

  constructor() {
    this.sessionId = `side-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  get id(): string {
    return this.sessionId;
  }

  async executeQuery(query: string): Promise<SideChatResult> {
    // Side chat uses ask mode — read-only tools only
    const allowedTools = modeRegistry.getModeConfig('ask').allowedTools;

    // Stub: in real implementation, runs a lightweight agent loop
    const result: SideChatResult = {
      sessionId: this.sessionId,
      query,
      summary: `Side exploration for: ${query}`,
      findings: [],
      sources: [],
      timestamp: Date.now()
    };

    this.results.push(result);
    return result;
  }

  getLatestResult(): SideChatResult | null {
    return this.results.length > 0 ? this.results[this.results.length - 1] : null;
  }

  /**
   * 결과를 메인 채팅에 인용할 수 있는 텍스트로 변환
   */
  getMergeBlock(sessionId?: string): string {
    const target = sessionId
      ? this.results.find(r => r.sessionId === sessionId)
      : this.getLatestResult();

    if (!target) return '';

    return [
      `<side-chat session="${target.sessionId}">`,
      `Query: ${target.query}`,
      `Summary: ${target.summary}`,
      target.findings.length > 0 ? `Findings:\n${target.findings.map(f => `  • ${f}`).join('\n')}` : '',
      target.sources.length > 0 ? `Sources:\n${target.sources.map(s => `  • ${s}`).join('\n')}` : '',
      `</side-chat>`
    ].filter(Boolean).join('\n');
  }

  clear(): void {
    this.results = [];
  }
}
