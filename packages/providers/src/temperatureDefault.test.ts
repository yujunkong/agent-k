/**
 * V31-MODEL-01 — LiteLLM default temperature is tier-B (0.2), not 0.7.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('V31-MODEL-01 LiteLLMProvider temperature default', () => {
  it('defaults to 0.2 (never 0.7)', () => {
    const src = readFileSync(
      join(__dirname, 'LiteLLMProvider.ts'),
      'utf8',
    );
    expect(src).toMatch(/temperature\s*=\s*0\.2/);
    expect(src).not.toMatch(/temperature\s*=\s*0\.7/);
  });
});
