/**
 * Review types — UI-only surface (REVIEW-001/002).
 * Runtime review loop lives in @agent-k/core (`AgentReviewLoop`); the host
 * runs it and seeds the webview FindingList via `ui.review.open`.
 */

/** Minimal LM provider surface AgentReviewLoop needs — no LiteLLMProvider coupling */
export interface ReviewLMProvider {
  complete: (prompt: string) => Promise<string>;
}

export interface ReviewFinding {
  id: string;
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  rule?: string;
  accepted?: boolean;
}

export interface ReviewResult {
  findings: ReviewFinding[];
  diffSummary: string;
  totalFiles: number;
  totalInsertions: number;
  totalDeletions: number;
}
