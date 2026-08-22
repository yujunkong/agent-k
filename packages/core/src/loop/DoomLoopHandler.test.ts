/**
 * AGENT-010 — DoomLoopHandler unit tests.
 */
import { describe, expect, it } from 'vitest';
import { DoomLoopDetector } from './DoomLoopDetector';
import { DoomLoopHandler } from './DoomLoopHandler';

describe('DoomLoopHandler (AGENT-010)', () => {
  it('builds suggestions and formats a stop message', () => {
    const detector = new DoomLoopDetector(3);
    const handler = new DoomLoopHandler();

    for (let i = 0; i < 3; i++) {
      detector.recordCall('read_file', { path: 'src/a.ts' }, 'ok');
    }
    expect(detector.isDoomLoop()).toBe(true);

    const alert = handler.handleDoomLoop(detector);
    expect(alert).not.toBeNull();
    expect(alert!.toolName).toBe('read_file');
    expect(alert!.attemptCount).toBe(3);
    expect(alert!.suggestions.length).toBeGreaterThan(0);
    expect(detector.isDoomLoop()).toBe(false);

    const msg = handler.formatAlertMessage(alert!);
    expect(msg).toContain('Stopped');
    expect(msg).toContain('read_file');
    expect(msg).toContain('Next steps');
  });

  it('suggests workspace fixes for escape errors', () => {
    const detector = new DoomLoopDetector(2);
    const handler = new DoomLoopHandler();
    detector.recordCall('read_file', { path: '../x' }, 'Path escapes workspace');
    detector.recordCall('read_file', { path: '../x' }, 'Path escapes workspace');
    const alert = handler.handleDoomLoop(detector)!;
    expect(alert.suggestions.some((s) => /workspace/i.test(s))).toBe(true);
  });
});
