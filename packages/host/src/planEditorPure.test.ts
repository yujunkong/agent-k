/**
 * EXT-003 — plan editor pure helpers (v2.1 PlanStorage parity).
 */
import { describe, it, expect } from 'vitest';
import {
  isPlanDocumentPath,
  slugFromPlanPath,
  stripPlanFrontmatter,
  titleFromPlanContent,
} from './planEditorPure';

describe('EXT-003 plan editor helpers', () => {
  it('accepts plan_*.md and PLAN-*.md under .agentk/plans', () => {
    expect(isPlanDocumentPath('/w/.agentk/plans/tmp/plan_ab12cd34ef.md')).toBe(true);
    expect(isPlanDocumentPath('/w/.agentk/plans/PLAN-feature.md')).toBe(true);
    expect(isPlanDocumentPath('/w/src/plan_ab12cd34ef.md')).toBe(false);
    expect(isPlanDocumentPath('/w/.agentk/plans/notes.md')).toBe(false);
  });

  it('derives slug from filename', () => {
    expect(slugFromPlanPath('/w/.agentk/plans/tmp/plan_ab12cd34ef.md')).toBe(
      'plan_ab12cd34ef',
    );
    expect(slugFromPlanPath('/w/.agentk/plans/PLAN-feature.md')).toBe('feature');
  });

  it('strips YAML frontmatter', () => {
    const raw =
      '---\ntitle: "Plan"\nslug: plan_ab12cd34ef\n---\n\n# My Plan\n\n- [ ] task';
    expect(stripPlanFrontmatter(raw)).toBe('# My Plan\n\n- [ ] task');
    expect(stripPlanFrontmatter('# No frontmatter')).toBe('# No frontmatter');
  });

  it('extracts the first H1 title', () => {
    expect(titleFromPlanContent('# My Plan\n\nbody')).toBe('My Plan');
    expect(titleFromPlanContent('no heading')).toBe('Untitled Plan');
  });
});
