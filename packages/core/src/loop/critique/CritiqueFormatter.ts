/**
 * V31-LOOP-02 — Formats the inline <self_critique> instruction block.
 */
import type { CritiqueInput } from './CritiqueRunner';

export interface CritiqueFormatter {
  format(input: CritiqueInput): string;
}

export class DefaultCritiqueFormatter implements CritiqueFormatter {
  format(input: CritiqueInput): string {
    const paths = input.editedPaths.join(', ');
    return [
      '<self_critique>',
      `Review the change you just made to ${paths}: re-read the edited region, check for mistakes (unused imports, broken call sites, edge cases), and fix anything you find. If it is correct, state why in one sentence.`,
      '</self_critique>',
    ].join('\n');
  }
}
