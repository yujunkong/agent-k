/**
 * C6-T19: E2E 테스트 — Debug 사이클 전체 검증
 * 
 * 전체 사이클: Hypothesis → Instrument → Reproduce → Analyze → Fix → Cleanup
 */
import * as assert from 'assert';
import { DebugModeController, DebugState } from '../../../src/debug/DebugModeController';
import { AddInstrumentationTool } from '../../../src/tools/debug/AddInstrumentationTool';
import { RemoveInstrumentationTool } from '../../../src/tools/debug/RemoveInstrumentationTool';
import { DebugLogServer } from '../../../src/debug/DebugLogServer';
import { VerifyCleanup } from '../../../src/debug/VerifyCleanup';
import { LogAnalyzer } from '../../../src/debug/LogAnalyzer';

suite('C6-T19: E2E — Debug Full Cycle', () => {
  let controller: DebugModeController;
  let addTool: AddInstrumentationTool;
  let removeTool: RemoveInstrumentationTool;
  let logServer: DebugLogServer;
  let verifyCleanup: VerifyCleanup;

  setup(() => {
    controller = new DebugModeController();
    addTool = new AddInstrumentationTool();
    removeTool = new RemoveInstrumentationTool();
    logServer = new DebugLogServer();
    verifyCleanup = new VerifyCleanup();
  });

  test('[1] Hypothesis — 가설 생성 후 active 가설 선택', () => {
    const state = controller.enterDebugMode();
    assert.strictEqual(state.stage, 'hypothesis');

    // Generate hypotheses
    controller.setError('Cannot read properties of null (reading user)');
    const hypotheses = controller.getCurrentHypotheses();
    assert.ok(hypotheses.length > 0, 'Must generate at least one hypothesis');

    // Select first hypothesis
    const updated = controller.selectHypothesis(hypotheses[0].id);
    assert.strictEqual(updated.activeHypothesisId, hypotheses[0].id);
    assert.strictEqual(updated.stage, 'hypothesis');
  });

  test('[2] Instrument — 계측 마커 주입', () => {
    const instrumentState = controller.enterDebugMode();
    controller.selectHypothesis(instrumentState.hypotheses[0].id);

    const request = {
      filePath: 'src/auth.ts',
      hypothesisId: instrumentState.hypotheses[0].id,
      type: 'entry' as const,
      variableName: 'user'
    };

    const code = addTool.generateInstrumentation(request);
    assert.ok(code.includes('DEBUG_INSTRUMENT'));
    assert.ok(code.includes(instrumentState.hypotheses[0].id));
  });

  test('[3] Reproduce — 재현 액션 기록', () => {
    const reproduce = controller.enterDebugMode();
    controller.selectHypothesis(reproduce.hypotheses[0].id);
    const recordedId = controller.startRecording('Ref: Null at login');
    assert.ok(recordedId);
  });

  test('[4] Analyze — 로그 수집 및 분석', () => {
    // Ingest logs
    logServer.ingest({ level: 'error', source: 'src/auth.ts', message: 'Null: user is null' });
    logServer.ingest({ level: 'error', source: 'src/auth.ts', message: 'Null: user is null' });
    logServer.ingest({ level: 'warn', source: 'src/db.ts', message: 'Slow query' });

    const analyzer = new LogAnalyzer();
    const result = analyzer.analyze(logServer.query());
    assert.ok(result.totalLogs >= 3);
    assert.ok(result.anomalies.length > 0);
  });

  test('[5] Fix — 타겟 픽스 생성', () => {
    const controller = new DebugModeController();
    const fixed = controller.applyNullCheckFix('src/auth.ts', 'user', 'user?.name');
    assert.ok(fixed.patch.includes('user?.name'));
  });

  test('[6] Cleanup & Verify — 마커 제거 및 검증', () => {
    const content = `const x = 1;
// DEBUG_INSTRUMENT: hyp-null
console.log('instrumented');
const y = 2;`;

    const removed = removeTool.generateRemoval('// DEBUG_INSTRUMENT: hyp-null\nconsole.log(\'instrumented\');');
    
    const result = removeTool.verifyClean(content, 'hyp-null');
    assert.strictEqual(result.remaining, 1);

    // After removal
    const cleanedContent = content.replace(/\/\/ DEBUG_INSTRUMENT: hyp-null\nconsole\.log\('instrumented'\);\n?/, '');
    const cleanResult = removeTool.verifyClean(cleanedContent, 'hyp-null');
    assert.strictEqual(cleanResult.clean, true);
  });
});
