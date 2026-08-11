import * as assert from 'assert';
import { validateSchema, parseModelJson } from '../../../../src/plan/v2/validators/SchemaValidator';

const validPlanJson = JSON.stringify({
  summary: 'Add JWT auth',
  tasks: [
    {
      id: 'task-1',
      title: 'Add AuthService',
      description: 'Implement JWT signing/verification',
      files: [{ path: 'src/auth/AuthService.ts', intent: 'create' }],
      dependencies: [],
      verification: ['npm test -- auth']
    }
  ],
  risks: [{ id: 'risk-1', risk: 'Breaks existing sessions', mitigation: 'Add migration' }]
});

suite('Plan V2 — SchemaValidator', () => {
  test('parseModelJson accepts raw JSON', () => {
    const r = parseModelJson('{"a":1}');
    assert.strictEqual(r.ok, true);
  });

  test('parseModelJson strips ```json fences', () => {
    const r = parseModelJson('```json\n{"a":1}\n```');
    assert.strictEqual(r.ok, true);
    if (r.ok) assert.deepStrictEqual(r.value, { a: 1 });
  });

  test('parseModelJson reports JSON_PARSE_ERROR on garbage', () => {
    const r = parseModelJson('not json at all');
    assert.strictEqual(r.ok, false);
    if (!r.ok) assert.strictEqual(r.issue.code, 'JSON_PARSE_ERROR');
  });

  test('valid plan passes', () => {
    const result = validateSchema(validPlanJson);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data?.tasks.length, 1);
    assert.strictEqual(result.issues.length, 0);
  });

  test('missing required field fails schema validation', () => {
    const bad = JSON.stringify({ summary: 'x', tasks: [] }); // tasks must be non-empty, risks missing
    const result = validateSchema(bad);
    assert.strictEqual(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === 'SCHEMA_VALIDATION_FAILED'));
  });

  test('duplicate task ids are flagged', () => {
    const dup = JSON.stringify({
      summary: 'x',
      tasks: [
        { id: 'task-1', title: 'a', description: 'a', files: [], dependencies: [], verification: [] },
        { id: 'task-1', title: 'b', description: 'b', files: [], dependencies: [], verification: [] }
      ],
      risks: []
    });
    const result = validateSchema(dup);
    assert.strictEqual(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === 'DUPLICATE_TASK_ID'));
  });

  test('invalid file intent enum fails schema validation', () => {
    const bad = JSON.stringify({
      summary: 'x',
      tasks: [
        {
          id: 'task-1',
          title: 'a',
          description: 'a',
          files: [{ path: 'src/x.ts', intent: 'delete' }],
          dependencies: [],
          verification: []
        }
      ],
      risks: []
    });
    const result = validateSchema(bad);
    assert.strictEqual(result.ok, false);
  });
});
