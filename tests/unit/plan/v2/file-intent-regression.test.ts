import * as assert from 'assert';
import { PlanV2Generator, type PlanGenerationMessage, type PlanGenerationModel } from '../../../../src/plan/v2/PlanV2Generator';

const newRustProjectPlan = JSON.stringify({
  summary: 'Create a Rust project',
  tasks: [{
    id: 'task-1',
    title: 'Initialize Rust project',
    description: 'Create the initial project files.',
    files: [
      { path: 'Cargo.toml', intent: 'create' },
      { path: 'src/main.rs', intent: 'create' },
      { path: 'src/editor.rs', intent: 'create' }
    ],
    dependencies: [],
    verification: ['cargo check']
  }],
  risks: []
});

const invalidModifyPlan = JSON.stringify({
  summary: 'Create a Rust project',
  tasks: [{
    id: 'task-1',
    title: 'Initialize Rust project',
    description: 'Create the initial project files.',
    files: [{ path: 'src/main.rs', intent: 'modify' }],
    dependencies: [],
    verification: ['cargo check']
  }],
  risks: []
});

class ScriptedModel implements PlanGenerationModel {
  readonly receivedMessages: PlanGenerationMessage[][] = [];
  private index = 0;

  constructor(private readonly responses: string[]) {}

  async complete(messages: PlanGenerationMessage[]): Promise<string> {
    this.receivedMessages.push(messages);
    return this.responses[Math.min(this.index++, this.responses.length - 1)];
  }
}

suite('Plan V2 — file intent regression', () => {
  test('accepts new-project files as create even when they do not exist', async () => {
    const model = new ScriptedModel([newRustProjectPlan]);
    const generator = new PlanV2Generator(model, () => false);
    const result = await generator.generate({
      goal: 'Create a Rust project',
      researchContext: 'No Rust project files exist yet.'
    });

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(
      result.plan?.tasks[0].files.map((file) => file.intent),
      ['create', 'create', 'create']
    );
  });

  test('feeds missing-file intent guidance into a retry', async () => {
    const model = new ScriptedModel([invalidModifyPlan, newRustProjectPlan]);
    const generator = new PlanV2Generator(model, () => false);
    const result = await generator.generate({
      goal: 'Create a Rust project',
      researchContext: 'No Rust project files exist yet.'
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.attempts, 2);
    const retryPrompt = model.receivedMessages[1].map((message) => message.content).join('\n');
    assert.ok(retryPrompt.includes('FILE_NOT_FOUND'));
    assert.ok(retryPrompt.includes('intent "create"'));
  });
});
