/**
 * C6-T17: E2E — DebugModeController 실 API로 재작성 (RW-C57-03)
 * C6-T19: E2E — Debug 사이클 hypothesis → instrument → reproduce → analyze → fix → cleanup
 */
import * as assert from 'assert';
import { DebugModeController } from '../../src/debug/DebugModeController';

suite('E2E: Debug Cycle — Controller API (C6-T17)', () => {
  test('DebugModeController 생성 및 초기 상태', () => {
    const ctrl = new DebugModeController();
    assert.strictEqual(ctrl.getStage(), 'hypothesis');
    assert.strictEqual(ctrl.getHypotheses().length, 0);
    assert.strictEqual(ctrl.getActiveHypothesis(), null);
  });

  test('[1] Hypothesis — 가설 생성', () => {
    const ctrl = new DebugModeController();
    ctrl.addHypothesis('Browser compat', 'Issue in login.js', ['src/login.js']);
    ctrl.addHypothesis('CSS overlap', 'Safari-specific CSS', ['src/styles.css']);

    const hypotheses = ctrl.getHypotheses();
    assert.strictEqual(hypotheses.length, 2);
    assert.strictEqual(hypotheses[0].title, 'Browser compat');
    assert.strictEqual(hypotheses[0].status, 'pending');
    assert.strictEqual(hypotheses[0].files[0], 'src/login.js');
  });

  test('[2] Instrument — 가설 선택 후 instrument stage', () => {
    const ctrl = new DebugModeController();
    const h = ctrl.addHypothesis('Bug', 'Login fails', ['login.js']);
    ctrl.selectHypothesis(h.id);

    // selectHypothesis sets stage to instrument
    assert.strictEqual(ctrl.getStage(), 'instrument');
    assert.strictEqual(ctrl.getActiveHypothesis()?.id, h.id);
    assert.strictEqual(ctrl.getActiveHypothesis()?.status, 'investigating');
  });

  test('[3] Reproduce — instrument → reproduce', () => {
    const ctrl = new DebugModeController();
    const h = ctrl.addHypothesis('Bug', 'Login fails', ['login.js']);
    ctrl.selectHypothesis(h.id); // → instrument
    ctrl.markInstrumented(); // → reproduce
    assert.strictEqual(ctrl.getStage(), 'reproduce');
  });

  test('[4] Analyze — 로그 추가 및 가설 확인', () => {
    const ctrl = new DebugModeController();
    const h = ctrl.addHypothesis('Bug', 'Login fails', ['login.js']);
    ctrl.selectHypothesis(h.id); // → instrument
    ctrl.markInstrumented();     // → reproduce
    ctrl.markReproduced();       // → analyze

    // Add logs
    ctrl.addLog('Login button not visible on Safari');
    ctrl.addLog('CSS -webkit-transform not applied');

    // Confirm hypothesis with evidence
    ctrl.confirmHypothesis(h.id, ['Login button missing -webkit prefix']);

    const confirmed = ctrl.getHypotheses().find(hy => hy.id === h.id);
    assert.ok(confirmed);
    assert.strictEqual(confirmed?.status, 'confirmed');
    assert.strictEqual(confirmed?.evidence.length, 1);
  });

  test('[5] Fix — fix 적용', () => {
    const ctrl = new DebugModeController();
    const h = ctrl.addHypothesis('Bug', 'Login fails', ['login.js']);
    ctrl.selectHypothesis(h.id);
    ctrl.markInstrumented();
    ctrl.markReproduced();
    ctrl.confirmHypothesis(h.id, ['evidence']);
    ctrl.moveToFix(); // → fix
    assert.strictEqual(ctrl.getStage(), 'fix');

    ctrl.markFixApplied(); // → cleanup
    assert.strictEqual(ctrl.getStage(), 'cleanup');
  });

  test('[6] Cleanup — 마커 제거 및 검증', () => {
    const ctrl = new DebugModeController();
    const h = ctrl.addHypothesis('Bug', 'Login fails', ['login.js']);
    ctrl.selectHypothesis(h.id);
    ctrl.markInstrumented();
    ctrl.markReproduced();
    ctrl.confirmHypothesis(h.id, ['evidence']);
    ctrl.moveToFix();
    ctrl.markFixApplied(); // → cleanup

    // markCleanupDone with 0 remaining markers
    ctrl.markCleanupDone(0);
    assert.strictEqual(ctrl.getStage(), 'hypothesis'); // reset after success

    // remainingMarkers should be 0 after cleanup
    assert.strictEqual(ctrl.remainingMarkers, 0);
  });

  test('전체 6단계 순서 보장', () => {
    const stages: string[] = [];
    const ctrl = new DebugModeController();
    ctrl.onStageChangeCallback((stage) => { stages.push(stage); });

    const h = ctrl.addHypothesis('Test', 'desc', ['file.ts']);
    ctrl.selectHypothesis(h.id);  // → instrument
    ctrl.markInstrumented();      // → reproduce
    ctrl.markReproduced();        // → analyze
    ctrl.confirmHypothesis(h.id, ['ev']);
    ctrl.moveToFix();             // → fix
    ctrl.markFixApplied();        // → cleanup
    ctrl.markCleanupDone(0);      // → hypothesis (reset)

    assert.deepStrictEqual(stages, [
      'instrument', 'reproduce', 'analyze', 'fix', 'cleanup', 'hypothesis'
    ]);
  });

  test('buildContextBlock() — 세션 요약 텍스트', () => {
    const ctrl = new DebugModeController();
    ctrl.addHypothesis('Test', 'desc', ['file.ts']);
    const block = ctrl.buildContextBlock();
    assert.ok(block.includes('Debug Session State'));
    assert.ok(block.includes('hypothesis'));
  });
});
