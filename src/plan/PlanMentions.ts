/**
 * PlanMentions - Plan 모드 @file/ @codebase 멘션 처리 (C5-T21)
 * 
 * Plan 모드에서 @file / @codebase 멘션 → PrefetchEngine으로 전달
 * 읽기 전용 리서치와 통합
 */
import { extractMentions } from '../prefetch/MentionExtractor';
import { PrefetchEngine } from '../prefetch/PrefetchEngine';

export class PlanMentions {
  private prefetchEngine = new PrefetchEngine();

  /**
   * Extract mentions from user message
   */
  getMentions(text: string): Array<{ type: string; target: string }> {
    return extractMentions(text).map(m => ({ type: m.type, target: m.query }));
  }

  /**
   * Prefetch content for all mentions (read-only)
   */
  async prefetchMentions(text: string): Promise<string> {
    const mentions = extractMentions(text);
    if (mentions.length === 0) return '';
    return await this.prefetchEngine.prefetch(text);
  }

  /**
   * Check if a message contains plan-relevant mentions
   */
  hasRelevantMentions(text: string): boolean {
    const mentions = extractMentions(text);
    return mentions.some(m => 
      m.type === 'file' || m.type === 'codebase' || m.type === 'folder' || m.type === 'symbol'
    );
  }
}
