import * as assert from 'assert';
import {
  buildPlanChatSummary,
  looksLikePlanDocument,
  looksLikeVisibleTurnProse
} from '../../../src/chat/planPromote';
import { sealBodyBeforeTools } from '../../../src/chat/sealTurnProse';
import type { ChatMessage } from '../../../src/chat/types';

suite('buildPlanChatSummary', () => {
  test('전체 문서 대신 요약 + TODO 순서를 만든다', () => {
    const plan = [
      '# Rust Migration Plan',
      '',
      '## Context',
      'Python API 백엔드를 Rust로 점진 이전한다. 호환 레이어를 유지하며 라우터부터 옮긴다.',
      '성공 기준은 기존 통합 테스트 통과와 p95 지연 유지이다.',
      '',
      '## Architecture',
      'Before: Python FastAPI. After: Rust axum + shared DB.',
      '',
      '## TODOs',
      '- [ ] 스키마 정의',
      '- [ ] 라우터 이식',
      '- [ ] 통합 테스트',
      '',
      '## Risks',
      '- 일정 지연 가능'
    ].join('\n');
    assert.ok(looksLikePlanDocument(plan));
    const summary = buildPlanChatSummary(plan);
    assert.ok(/승인/.test(summary));
    assert.ok(/진행 순서/.test(summary));
    assert.ok(/1\. 스키마 정의/.test(summary));
    assert.ok(/2\. 라우터 이식/.test(summary));
    assert.ok(!/## Risks/.test(summary));
  });
});

suite('looksLikeVisibleTurnProse', () => {
  test('plan documents stay visible', () => {
    const plan = [
      '# Rust 경량 IDE 개발 계획 (재수립)',
      '',
      '## Context',
      '기존 구조를 확인했습니다. 에디터 코어와 LSP 브리지를 분리합니다.',
      '',
      '## Architecture',
      'gpui + tree-sitter.',
      '',
      '## TODOs',
      '- [ ] 코어 스캐폴드',
      '- [ ] LSP 연동'
    ].join('\n');
    assert.ok(looksLikeVisibleTurnProse(plan));
  });

  test('short chatter is not forced visible', () => {
    assert.strictEqual(looksLikeVisibleTurnProse('파일 몇 개만 더 읽겠습니다.'), false);
  });
});

suite('sealBodyBeforeTools', () => {
  test('plan prose is sealed to turnProse even if explore tools already ran', () => {
    const plan = [
      '# Rust 경량 IDE 개발 계획 (재수립)',
      '',
      '## Context',
      '기존 구조를 확인했습니다. 에디터 코어와 LSP 브리지를 분리하고 검색 도구로 근거를 보강합니다.',
      '성공 기준은 기존 통합 테스트 통과와 p95 지연 유지이다.',
      '',
      '## Architecture',
      'Before: 단일 프로세스. After: gpui + tree-sitter + LSP.',
      '',
      '## TODOs',
      '- [ ] 코어 스캐폴드',
      '- [ ] LSP 연동',
      '',
      '## Risks',
      '- 일정 지연 가능'
    ].join('\n');
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: plan,
      status: 'streaming',
      timestamp: 1,
      steps: [
        {
          id: 's1',
          kind: 'searching',
          label: 'Searching',
          toolName: 'codebase_search',
          turn: 18,
          itemStatus: 'running'
        }
      ]
    };
    const sealed = sealBodyBeforeTools(msg, 18);
    assert.strictEqual(sealed.content, '');
    assert.ok((sealed.turnProse || []).some((p) => p.content.includes('재수립')));
  });
});
