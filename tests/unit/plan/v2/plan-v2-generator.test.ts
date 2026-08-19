import * as assert from 'assert';
import { PlanV2Generator, type PlanGenerationMessage, type PlanGenerationModel } from '../../../../src/plan/v2/PlanV2Generator';

const goodPlan = JSON.stringify({
  summary: 'Add JWT auth',
  tasks: [
    {
      id: 'task-1',
      title: 'AuthService',
      description: 'd',
      files: [{ path: 'src/auth/AuthService.ts', intent: 'create' }],
      dependencies: [],
      verification: ['npm test -- auth']
    }
  ],
  risks: []
});

const planWithMissingFile = JSON.stringify({
  summary: 'Add JWT auth',
  tasks: [
    {
      id: 'task-1',
      title: 'AuthService',
      description: 'd',
      files: [{ path: 'src/does/not/exist.ts', intent: 'modify' }],
      dependencies: [],
      verification: []
    }
  ],
  risks: []
});

class ScriptedModel implements PlanGenerationModel {
  private calls = 0;
  public receivedMessages: PlanGenerationMessage[][] = [];
  constructor(private readonly responses: string[]) {}
  async complete(messages: PlanGenerationMessage[]): Promise<string> {
    this.receivedMessages.push(messages);
    const response = this.responses[Math.min(this.calls, this.responses.length - 1)];
    this.calls++;
    return response;
  }
  get callCount() {
    return this.calls;
  }
}

const alwaysTrue = () => true;
const alwaysFalse = () => false;

suite('Plan V2 — PlanV2Generator', () => {
  test('succeeds on the first attempt when the plan is valid', async () => {
    const model = new ScriptedModel([goodPlan]);
    const generator = new PlanV2Generator(model, alwaysTrue);
    const result = await generator.generate({ goal: 'Add JWT auth', researchContext: 'found src/auth' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.attempts, 1);
    assert.strictEqual(model.callCount, 1);
  });

  test('accepts missing modify targets on first attempt and marks them unresolved', async () => {
    const model = new ScriptedModel([planWithMissingFile]);
    const generator = new PlanV2Generator(model, alwaysFalse);
    const result = await generator.generate({ goal: 'Add JWT auth', researchContext: '' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.attempts, 1);
    assert.strictEqual(model.callCount, 1);
    const file = result.plan?.tasks[0]?.files[0];
    assert.strictEqual(file?.path, 'src/does/not/exist.ts');
    assert.strictEqual(file?.intent, 'modify');
    assert.strictEqual(file?.resolution, 'unresolved');
    assert.strictEqual(file?.exists, false);
  });

  test('retries on semantic errors such as DEPENDENCY_MISSING, then succeeds', async () => {
    const badDeps = JSON.stringify({
      summary: 'Add JWT auth',
      tasks: [
        {
          id: 'task-1',
          title: 'AuthService',
          description: 'd',
          files: [],
          dependencies: ['task-99'],
          verification: []
        }
      ],
      risks: []
    });
    const model = new ScriptedModel([badDeps, goodPlan]);
    const generator = new PlanV2Generator(model, alwaysTrue);
    const result = await generator.generate({ goal: 'Add JWT auth', researchContext: '' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.attempts, 2);
    assert.strictEqual(result.failures.length, 1);
    const joined = model.receivedMessages[1].map((m) => m.content).join('\n');
    assert.ok(joined.includes('DEPENDENCY_MISSING'));
    assert.ok(joined.includes('ONLY these issues'));
  });

  test('stops after maxAttempts when semantic errors persist', async () => {
    const badDeps = JSON.stringify({
      summary: 'Add JWT auth',
      tasks: [
        {
          id: 'task-1',
          title: 'AuthService',
          description: 'd',
          files: [],
          dependencies: ['task-99'],
          verification: []
        }
      ],
      risks: []
    });
    const model = new ScriptedModel([badDeps]);
    const generator = new PlanV2Generator(model, alwaysFalse);
    const result = await generator.generate({ goal: 'x', researchContext: '', maxAttempts: 3 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.attempts, 3);
    assert.strictEqual(result.failures.length, 3);
    assert.strictEqual(model.callCount, 3);
  });

  test('a JSON parse failure is also retried via FailureContext', async () => {
    const model = new ScriptedModel(['not valid json', goodPlan]);
    const generator = new PlanV2Generator(model, alwaysTrue);
    const result = await generator.generate({ goal: 'x', researchContext: '' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.failures[0].type, 'schema_validation_failed');
    assert.ok(result.failures[0].errors.some((e) => e.code === 'JSON_PARSE_ERROR'));
  });

  test('retries after a planner transport error and exposes the failure reason', async () => {
    class FailingOnceModel extends ScriptedModel {
      private first = true;
      async complete(messages: PlanGenerationMessage[]): Promise<string> {
        if (this.first) {
          this.first = false;
          this.receivedMessages.push(messages);
          throw new Error('planner unavailable');
        }
        return super.complete(messages);
      }
    }
    const model = new FailingOnceModel([goodPlan]);
    const generator = new PlanV2Generator(model, alwaysTrue);
    const result = await generator.generate({ goal: 'x', researchContext: '' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.attempts, 2);
    assert.ok(result.failures[0].errors.some((e) => e.code === 'MODEL_REQUEST_FAILED'));
    assert.ok(model.receivedMessages[1].some((m) => m.content.includes('MODEL_REQUEST_FAILED')));
  });

  test('rejection feedback is included in the prompt', async () => {
    const model = new ScriptedModel([goodPlan]);
    const generator = new PlanV2Generator(model, alwaysTrue);
    await generator.generate({ goal: 'x', researchContext: '', rejectionFeedback: 'DB 구조는 변경하면 안 돼' });
    const joined = model.receivedMessages[0].map((m) => m.content).join('\n');
    assert.ok(joined.includes('DB 구조는 변경하면 안 돼'));
  });
});
