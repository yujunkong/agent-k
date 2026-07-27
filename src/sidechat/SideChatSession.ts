/**
 * SideChatSession - 병렬 읽기 전용 세션 (C4-T22)
 *
 * @deprecated ADDON-T16: unsupported in this build. `executeQuery` previously
 * faked a "Side exploration for: ..." summary without doing any real work
 * (no AgentLoop, no tool calls). Rather than keep that misleading stub, it
 * now returns a clearly-labeled unsupported result — callers must not treat
 * `findings`/`summary` as real exploration output. No command/UI in this
 * extension registers a `/side` entry point; this class is unused dead code
 * kept only for the merge-block/API shape until a real implementation lands.
 */
import type { Mode } from '../agent/types';

export interface SideChatResult {
  sessionId: string;
  query: string;
  summary: string;
  findings: string[];
  sources: string[];
  timestamp: number;
}

const UNSUPPORTED_MESSAGE = 'Side chat is unsupported in this build.';

/** @deprecated ADDON-T16 — see file header. */
export class SideChatSession {
  private readonly sessionId: string;
  private readonly mode: Mode = 'ask'; // Side chat is always read-only (ask mode)
  private results: SideChatResult[] = [];

  constructor() {
    this.sessionId = `side-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  get id(): string {
    return this.sessionId;
  }

  /**
   * @deprecated Does not run any real exploration (no AgentLoop, no tools).
   * Returns an explicit unsupported result instead of pretending to search.
   */
  async executeQuery(query: string): Promise<SideChatResult> {
    const result: SideChatResult = {
      sessionId: this.sessionId,
      query,
      summary: UNSUPPORTED_MESSAGE,
      findings: ['unsupported'],
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
