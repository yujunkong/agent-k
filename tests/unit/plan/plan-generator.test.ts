/**
 * C5-T12: 단위 테스트 — PlanGenerator (Mermaid/Todo 파싱)
 */
import * as assert from 'assert';
import { PlanGenerator } from '../../../src/plan/PlanGenerator';

const planGenerator = new PlanGenerator();

suite('PlanGenerator', () => {
  test('6섹션 계획 문서 생성', () => {
    const doc = planGenerator.generatePlan({
      title: 'Refactor Auth Module',
      researchContext: 'Found src/auth.ts with 200 lines',
      questions: [{ question: 'Test framework?', answer: 'Jest' }],
      architectureMermaid: planGenerator.generateMermaidFlowchart(['Read auth.ts', 'Create types', 'Update imports']),
      todos: ['Read and understand auth.ts', 'Create new type definitions', 'Update imports'],
      risks: [{ risk: 'Breaking changes', mitigation: 'Add migration guide' }]
    });

    assert.ok(doc.slug.includes('refactor'));
    assert.ok(doc.content.includes('## Context'));
    assert.ok(doc.content.includes('## Questions'));
    assert.ok(doc.content.includes('## Architecture'));
    assert.ok(doc.content.includes('## TODOs'));
    assert.ok(doc.content.includes('## Risks'));
    assert.ok(doc.content.includes('## Approval'));
    assert.strictEqual(doc.todoCount, 3);
    assert.ok(doc.sections.length >= 6);
  });

  test('Mermaid flowchart 생성', () => {
    const mermaid = planGenerator.generateMermaidFlowchart(['Step A', 'Step B', 'Step C']);
    assert.ok(mermaid.includes('```mermaid'));
    assert.ok(mermaid.includes('graph TD'));
    assert.ok(mermaid.includes('S1['));
    assert.ok(mermaid.includes('S2['));
    assert.ok(mermaid.includes('S3['));
    assert.ok(mermaid.includes('S1 --> S2'));
    assert.ok(mermaid.includes('S2 --> S3'));
  });

  test('Mermaid before/after sequence diagram', () => {
    const mermaid = planGenerator.generateMermaidBeforeAfter(
      ['Manual step 1', 'Manual step 2'],
      ['Automated step 1', 'Automated step 2']
    );
    assert.ok(mermaid.includes('```mermaid'));
    assert.ok(mermaid.includes('sequenceDiagram'));
    assert.ok(mermaid.includes('(before)'));
    assert.ok(mermaid.includes('(after)'));
    assert.ok(mermaid.includes('REFACTOR'));
  });

  test('TODO 추출', () => {
    const doc = planGenerator.generatePlan({
      title: 'Test',
      researchContext: '',
      questions: [],
      architectureMermaid: '',
      todos: ['Step one', 'Step two', 'Step three'],
      risks: []
    });

    const todos = planGenerator.extractTodos(doc.content);
    assert.strictEqual(todos.length, 3);
    assert.strictEqual(todos[0], 'Step one');
    assert.strictEqual(todos[1], 'Step two');
  });

  test('파싱된 섹션 재추출', () => {
    const doc = planGenerator.generatePlan({
      title: 'Parse Test',
      researchContext: 'Context data',
      questions: [],
      architectureMermaid: '',
      todos: ['Do thing'],
      risks: []
    });

    const parsed = planGenerator.parseDocument(doc.content);
    assert.ok(parsed.length >= 6);
    assert.ok(parsed.some(s => s.id === 'context'));
    assert.ok(parsed.some(s => s.id === 'todos'));
  });

  test('slug 안전 문자만 포함', () => {
    const slug = new PlanGenerator()['slugify']('Refactor Auth Module! @#$%');
    assert.ok(/^[a-z0-9-]+$/.test(slug));
  });
});
