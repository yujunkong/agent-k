/**
 * HypothesisGenerator - N개 가설 생성 + 상태 관리 (C6-T02)
 */
import type { Hypothesis, HypothesisStatus } from './DebugModeController';

export interface HypothesisOption {
  id: string;
  title: string;
  description: string;
  files: string[];
  confidence: number; // 0-1
}

export class HypothesisGenerator {
  /**
   * Generate hypotheses from bug description and context
   */
  generate(bugDescription: string, context: string, count: number = 3): HypothesisOption[] {
    const hypotheses: HypothesisOption[] = [];
    
    // Extract file mentions from context
    const files = this.extractFiles(context);
    
    // Generate based on bug type keywords
    const lower = bugDescription.toLowerCase();
    
    if (lower.includes('race') || lower.includes('concurrent') || lower.includes('동시')) {
      hypotheses.push({
        id: 'hyp-race',
        title: 'Race Condition',
        description: 'Concurrent access to shared state without proper synchronization',
        files,
        confidence: 0.7
      });
    }
    
    if (lower.includes('null') || lower.includes('undefined') || lower.includes('널')) {
      hypotheses.push({
        id: 'hyp-null',
        title: 'Null/Undefined Reference',
        description: 'Accessing a property or method on a null or undefined value',
        files,
        confidence: 0.8
      });
    }
    
    if (lower.includes('type') || lower.includes('타입')) {
      hypotheses.push({
        id: 'hyp-type',
        title: 'Type Mismatch',
        description: 'Incorrect type assumption or missing type guard',
        files,
        confidence: 0.6
      });
    }
    
    if (lower.includes('memory') || lower.includes('leak') || lower.includes('메모리')) {
      hypotheses.push({
        id: 'hyp-memory',
        title: 'Memory Leak',
        description: 'Unreleased references or event listeners causing memory growth',
        files,
        confidence: 0.5
      });
    }
    
    if (lower.includes('async') || lower.includes('await') || lower.includes('promise') || lower.includes('비동기')) {
      hypotheses.push({
        id: 'hyp-async',
        title: 'Async/Await Mismatch',
        description: 'Missing await, unhandled promise rejection, or incorrect async flow',
        files,
        confidence: 0.6
      });
    }

    if (lower.includes('state') || lower.includes('상태') || lower.includes('ui') || lower.includes('render')) {
      hypotheses.push({
        id: 'hyp-state',
        title: 'State Management Bug',
        description: 'Stale state, incorrect update, or missing re-render trigger',
        files,
        confidence: 0.6
      });
    }

    // Always add a generic hypothesis
    hypotheses.push({
      id: 'hyp-generic',
      title: 'Logical Error',
      description: 'Incorrect condition, wrong variable, or off-by-one error',
      files,
      confidence: 0.4
    });

    // Assign unique IDs and trim to count
    return hypotheses.slice(0, count).map((h, i) => ({
      ...h,
      id: `hyp-${i + 1}-${Date.now()}`
    }));
  }

  /**
   * Build hypothesis selection UI data
   */
  buildSelectionUI(hypotheses: HypothesisOption[]): string {
    return [
      '## 🔍 Select a Hypothesis',
      '',
      'Choose the most likely root cause to investigate:',
      '',
      ...hypotheses.map((h, i) => 
        `**${i + 1}. ${h.title}** (confidence: ${Math.round(h.confidence * 100)}%)\n   ${h.description}`
      ),
      '',
      'Enter the number of your choice, or describe your own hypothesis.'
    ].join('\n');
  }

  private extractFiles(context: string): string[] {
    const files: string[] = [];
    const fileRegex = /@file:([^\s,;\]]+)/g;
    let match;
    while ((match = fileRegex.exec(context)) !== null) {
      files.push(match[1]);
    }
    return files;
  }
}
