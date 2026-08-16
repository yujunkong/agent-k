/**
 * Phase 2 — TurnState derivation unit tests.
 */
import * as assert from 'assert';
import { deriveTurnStatus, type TurnStateStep } from '../../../src/chat/turnState';

function step(partial: Partial<TurnStateStep> & { kind: string; itemStatus: TurnStateStep['itemStatus'] }): TurnStateStep {
  return { ...partial };
}

suite('deriveTurnStatus — terminal states', () => {
  test('status=error → error, regardless of steps', () => {
    const status = deriveTurnStatus(
      { status: 'error', steps: [step({ kind: 'editing', itemStatus: 'done' })] },
      false
    );
    assert.strictEqual(status, 'error');
  });

  test('status=pending → understanding', () => {
    const status = deriveTurnStatus({ status: 'pending' }, false);
    assert.strictEqual(status, 'understanding');
  });

  test('status=complete and not streaming → completed, even if last step was exploring', () => {
    const status = deriveTurnStatus(
      {
        status: 'complete',
        steps: [step({ kind: 'searching', itemStatus: 'done' })]
      },
      false
    );
    assert.strictEqual(status, 'completed');
  });
});

suite('deriveTurnStatus — mid-stream, no steps yet', () => {
  test('streaming, no steps at all → understanding (composing opening read)', () => {
    const status = deriveTurnStatus({ status: 'streaming', steps: [] }, true);
    assert.strictEqual(status, 'understanding');
  });

  test('not streaming, no steps, no terminal status → completed (settled empty turn)', () => {
    const status = deriveTurnStatus({ steps: [] }, false);
    assert.strictEqual(status, 'completed');
  });
});

suite('deriveTurnStatus — running step takes precedence', () => {
  test('running "thinking" only → understanding', () => {
    const status = deriveTurnStatus(
      { status: 'streaming', steps: [step({ kind: 'thinking', itemStatus: 'running' })] },
      true
    );
    assert.strictEqual(status, 'understanding');
  });

  test('running "planning" → planning', () => {
    const status = deriveTurnStatus(
      { status: 'streaming', steps: [step({ kind: 'planning', itemStatus: 'running' })] },
      true
    );
    assert.strictEqual(status, 'planning');
  });

  test('running "searching" → exploring', () => {
    const status = deriveTurnStatus(
      { status: 'streaming', steps: [step({ kind: 'searching', itemStatus: 'running' })] },
      true
    );
    assert.strictEqual(status, 'exploring');
  });

  test('running "reading" after a DONE "editing" step → exploring (most recent running wins)', () => {
    const status = deriveTurnStatus(
      {
        status: 'streaming',
        steps: [
          step({ kind: 'editing', itemStatus: 'done' }),
          step({ kind: 'reading', itemStatus: 'running' })
        ]
      },
      true
    );
    assert.strictEqual(status, 'exploring');
  });

  test('running "editing" → executing', () => {
    const status = deriveTurnStatus(
      { status: 'streaming', steps: [step({ kind: 'editing', itemStatus: 'running' })] },
      true
    );
    assert.strictEqual(status, 'executing');
  });

  test('running "asking" (clarifying question) → understanding', () => {
    const status = deriveTurnStatus(
      { status: 'streaming', steps: [step({ kind: 'asking', itemStatus: 'running' })] },
      true
    );
    assert.strictEqual(status, 'understanding');
  });
});

suite('deriveTurnStatus — no running step, falls back to last step', () => {
  test('all done, last step was "editing" → executing', () => {
    const status = deriveTurnStatus(
      {
        status: 'streaming',
        steps: [
          step({ kind: 'searching', itemStatus: 'done' }),
          step({ kind: 'editing', itemStatus: 'done' })
        ]
      },
      true
    );
    assert.strictEqual(status, 'executing');
  });
});

suite('deriveTurnStatus — testing heuristic (no host "testing" kind exists yet)', () => {
  test('running terminal command "npm test" → testing', () => {
    const status = deriveTurnStatus(
      {
        status: 'streaming',
        steps: [
          step({
            kind: 'running',
            itemStatus: 'running',
            toolName: 'run_terminal_cmd',
            detail: 'npm test'
          })
        ]
      },
      true
    );
    assert.strictEqual(status, 'testing');
  });

  test('running terminal command "pytest -k auth" → testing', () => {
    const status = deriveTurnStatus(
      {
        status: 'streaming',
        steps: [
          step({
            kind: 'running',
            itemStatus: 'running',
            toolName: 'run_terminal_cmd',
            detail: 'pytest -k auth'
          })
        ]
      },
      true
    );
    assert.strictEqual(status, 'testing');
  });

  test('running terminal command "npm run build" → executing, NOT testing', () => {
    const status = deriveTurnStatus(
      {
        status: 'streaming',
        steps: [
          step({
            kind: 'running',
            itemStatus: 'running',
            toolName: 'run_terminal_cmd',
            detail: 'npm run build'
          })
        ]
      },
      true
    );
    assert.strictEqual(status, 'executing');
  });

  test('a file literally named "testing-utils.ts" being edited does NOT trigger testing (kind must be "running")', () => {
    const status = deriveTurnStatus(
      {
        status: 'streaming',
        steps: [
          step({
            kind: 'editing',
            itemStatus: 'running',
            detail: 'src/utils/testing-utils.ts'
          })
        ]
      },
      true
    );
    assert.strictEqual(status, 'executing');
  });
});
