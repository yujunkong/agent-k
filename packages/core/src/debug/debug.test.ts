/**
 * DEBUG-001…010 — debug FSM domain tests (no UI).
 */
import { describe, expect, it } from 'vitest';
import {
  DebugModeController,
  countInstrumentationMarkers,
  isDebugToolAllowedForStage,
  pickMultiFileTemplate,
} from './index';

describe('debug domain (DEBUG-001…010)', () => {
  it('gates stage transitions and tools', () => {
    const dbg = new DebugModeController();
    expect(dbg.getStage()).toBe('hypothesis');
    expect(isDebugToolAllowedForStage('hypothesis', 'write_file')).toBe(false);

    const h = dbg.addHypothesis('null deref', 'maybe missing check', ['a.ts']);
    expect(dbg.selectHypothesis(h.id)).toBe(true);
    expect(dbg.goToStage('instrument').ok).toBe(true);
    expect(isDebugToolAllowedForStage('instrument', 'debug_add_instrumentation')).toBe(
      true
    );

    expect(dbg.goToStage('fix').ok).toBe(false); // skip ahead blocked
    dbg.goToStage('reproduce');
    dbg.recordReproduceSteps('1. open app\n2. click');
    dbg.goToStage('analyze');
    const analysis = dbg.analyzeLogs('Error: boom\nDEBUG_INSTRUMENT:x');
    expect(analysis.matches.length).toBeGreaterThan(0);

    dbg.setHypothesisStatus(h.id, 'confirmed');
    expect(dbg.goToStage('fix').ok).toBe(true);
    dbg.markFixApplied('patched null check');
    expect(dbg.goToStage('cleanup').ok).toBe(true);
    dbg.markCleanup(0);
    expect(dbg.getState().markersRemoved).toBe(true);
  });

  it('counts instrumentation markers and has multi-file templates', () => {
    expect(countInstrumentationMarkers('DEBUG_INSTRUMENT:a DEBUG_INSTRUMENT:b')).toBe(2);
    expect(pickMultiFileTemplate('api-handler')?.title).toMatch(/API/i);
  });
});
