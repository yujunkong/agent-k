/**
 * ComplexityHeuristic - Plan 모드 강제 제안 휴리스틱 (C5-T10)
 * 
 * 조건:
 * - 파일 ≥ 3 (기본값, 설정 가능)
 * - 키워드: "리팩터/refactor", "마이그레이션/migration", "아키텍처/architecture"
 * 
 * Plan 모드 제안 UI
 * 사용자가 무시 가능
 */
export interface HeuristicResult {
  shouldSuggestPlan: boolean;
  reasons: string[];
  fileCount: number;
  matchedKeywords: string[];
}

const PLAN_KEYWORDS = [
  { ko: '리팩터', en: 'refactor' },
  { ko: '마이그레이션', en: 'migration' },
  { ko: '아키텍처', en: 'architecture' },
  { ko: '재설계', en: 'redesign' },
  { ko: '구조 변경', en: 'restructure' },
  { ko: '모듈 분리', en: 'modularize' },
  { ko: '확장', en: 'extend' },
  { ko: '통합', en: 'integrate' },
];

export class ComplexityHeuristic {
  private fileThreshold: number;

  constructor(fileThreshold = 3) {
    this.fileThreshold = fileThreshold;
  }

  /**
   * Analyze user input for complexity signals
   */
  analyze(userInput: string, fileCount: number): HeuristicResult {
    const reasons: string[] = [];
    const matchedKeywords: string[] = [];

    // Check file count threshold
    if (fileCount >= this.fileThreshold) {
      reasons.push(`Operation involves ${fileCount} files (threshold: ${this.fileThreshold})`);
    }

    // Check keywords
    const lowerInput = userInput.toLowerCase();
    for (const kw of PLAN_KEYWORDS) {
      if (lowerInput.includes(kw.ko) || lowerInput.includes(kw.en)) {
        matchedKeywords.push(kw.ko);
        reasons.push(`Request contains keyword "${kw.ko}" suggesting structural change`);
      }
    }

    return {
      shouldSuggestPlan: reasons.length > 0,
      reasons,
      fileCount,
      matchedKeywords
    };
  }

  /**
   * Build a suggestion message to show to the user
   */
  buildSuggestion(result: HeuristicResult): string {
    if (!result.shouldSuggestPlan) return '';

    return [
      '## 💡 Plan Mode Recommended',
      '',
      'This request appears complex. Consider using Plan mode to:',
      ...result.reasons.map(r => `- ${r}`),
      '',
      'Plan mode will help you:',
      '- Ask clarifying questions',
      '- Research the codebase',
      '- Create a step-by-step plan with architecture diagrams',
      '- Review and approve before any code changes',
      '',
      'Run `/plan` to start, or continue in current mode.'
    ].join('\n');
  }

  /**
   * Check if a tool call should trigger Plan mode suggestion
   */
  shouldInterceptTool(toolName: string, args: any): boolean {
    // Intercept large edit_file calls
    if (toolName === 'edit_file' && args?.hunks?.length >= 5) return true;
    if (toolName === 'write_file' && args?.path) return true;
    return false;
  }
}
