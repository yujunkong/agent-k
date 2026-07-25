/**
 * C6-T14: 단위 테스트 — Instrumentation 패턴 (적용/제거 정확성)
 */
import * as assert from 'assert';
import { AddInstrumentationTool } from '../../../src/tools/debug/AddInstrumentationTool';
import { RemoveInstrumentationTool } from '../../../src/tools/debug/RemoveInstrumentationTool';

suite('Instrumentation (C6-T14)', () => {
  const addTool = new AddInstrumentationTool();
  const removeTool = new RemoveInstrumentationTool();

  test('entry 타입 계측 생성', () => {
    const code = addTool.generateInstrumentation({
      filePath: 'src/auth.ts',
      hypothesisId: 'hyp-null',
      type: 'entry',
      variableName: 'user'
    });
    assert.ok(code.includes('DEBUG_INSTRUMENT: hyp-null'));
    assert.ok(code.includes('ENTER'));
  });

  test('exit 타입 계측 생성', () => {
    const code = addTool.generateInstrumentation({
      filePath: 'src/auth.ts',
      hypothesisId: 'hyp-null',
      type: 'exit'
    });
    assert.ok(code.includes('EXIT'));
  });

  test('conditional 타입 계측 생성', () => {
    const code = addTool.generateInstrumentation({
      filePath: 'src/auth.ts',
      hypothesisId: 'hyp-race',
      type: 'conditional',
      condition: 'user === null',
      variableName: 'user'
    });
    assert.ok(code.includes('COND'));
    assert.ok(code.includes('user === null'));
  });

  test('dump 타입 계측 생성', () => {
    const code = addTool.generateInstrumentation({
      filePath: 'src/auth.ts',
      hypothesisId: 'hyp-memory',
      type: 'dump',
      variableName: 'this.cache'
    });
    assert.ok(code.includes('DUMP'));
    assert.ok(code.includes('JSON.stringify'));
  });

  test('마커 개수 카운트', () => {
    const content = `// DEBUG_INSTRUMENT: hyp-null\nconsole.log('test');\n// DEBUG_INSTRUMENT: hyp-race\nconsole.log('test2');`;
    assert.strictEqual(removeTool.countRemaining(content), 2);
  });

  test('제거 후 0개 확인', () => {
    const result = removeTool.verifyClean('clean code without markers', 'hyp-null');
    assert.strictEqual(result.clean, true);
    assert.strictEqual(result.remaining, 0);
  });

  test('마커 기록 및 조회', () => {
    addTool.recordMarker(
      { filePath: 'test.ts', hypothesisId: 'hyp-1', type: 'entry' },
      'original content',
      10
    );
    const markers = addTool.getMarkers('hyp-1');
    assert.ok(markers.length >= 1);
    assert.strictEqual(markers[0].request.filePath, 'test.ts');
  });
});
