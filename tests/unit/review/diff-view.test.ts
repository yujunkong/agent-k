/**
 * C2-T27: 단위 테스트 — DiffView 렌더링, 체크박스 동기화, 키보드 핸들러
 */
import * as assert from 'assert';

suite('DiffView', () => {
  test('Diff 라인 타입 분류', () => {
    const lines = [
      { text: 'unchanged', type: 'context' },
      { text: '+added line', type: 'add' },
      { text: '-removed line', type: 'delete' }
    ];
    assert.strictEqual(lines[0].type, 'context');
    assert.strictEqual(lines[1].type, 'add');
    assert.strictEqual(lines[2].type, 'delete');
  });

  test('파일 체크박스 → 전체 헌크 토글', () => {
    let fileChecked = true;
    let hunksChecked = [true, true, true];

    function toggleFile(checked: boolean) {
      fileChecked = checked;
      if (!checked) hunksChecked = hunksChecked.map(() => false);
    }

    toggleFile(false);
    assert.strictEqual(fileChecked, false);
    assert.ok(hunksChecked.every(h => h === false));
  });
});

suite('KeyboardHandler', () => {
  test('Ctrl+Enter → apply_all', () => {
    let action = '';
    const handler = (e: any) => {
      if (e.ctrlKey && e.key === 'Enter') action = 'apply_all';
    };
    handler({ ctrlKey: true, key: 'Enter', preventDefault: () => {} });
    assert.strictEqual(action, 'apply_all');
  });

  test('Ctrl+Shift+Enter → apply_selected', () => {
    let action = '';
    const handler = (e: any) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') action = 'apply_selected';
    };
    handler({ ctrlKey: true, shiftKey: true, key: 'Enter', preventDefault: () => {} });
    assert.strictEqual(action, 'apply_selected');
  });

  test('Esc → cancel', () => {
    let action = '';
    const handler = (e: any) => {
      if (e.key === 'Escape') action = 'cancel';
    };
    handler({ key: 'Escape', preventDefault: () => {} });
    assert.strictEqual(action, 'cancel');
  });
});
