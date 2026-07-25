/**
 * KeyboardHandler - Diff 뷰어 키보드 단축키 (C2-T14)
 * 
 * Ctrl+Enter: 전체 적용
 * Ctrl+Shift+Enter: 선택 적용
 * Esc: 취소
 */
export type KeyboardAction = 'apply_all' | 'apply_selected' | 'cancel' | 'next_hunk' | 'prev_hunk' | 'toggle_hunk';

export class KeyboardHandler {
  private actionHandlers: Map<KeyboardAction, () => void> = new Map();

  registerAction(action: KeyboardAction, handler: () => void): void {
    this.actionHandlers.set(action, handler);
  }

  handleKeyEvent(event: KeyboardEvent): boolean {
    const ctrl = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;
    const key = event.key;

    let action: KeyboardAction | null = null;

    if (key === 'Enter' && ctrl && !shift) action = 'apply_all';
    else if (key === 'Enter' && ctrl && shift) action = 'apply_selected';
    else if (key === 'Escape' && !ctrl && !shift) action = 'cancel';
    else if (key === 'n' && !ctrl && !shift) action = 'next_hunk';
    else if (key === 'p' && !ctrl && !shift) action = 'prev_hunk';
    else if (key === ' ' && !ctrl && !shift) action = 'toggle_hunk';

    if (action && this.actionHandlers.has(action)) {
      event.preventDefault();
      event.stopPropagation();
      this.actionHandlers.get(action)!();
      return true;
    }

    return false;
  }

  registerDefaultShortcuts(
    onApplyAll: () => void,
    onApplySelected: () => void,
    onCancel: () => void,
    onNextHunk?: () => void,
    onPrevHunk?: () => void,
    onToggleHunk?: () => void
  ): void {
    this.registerAction('apply_all', onApplyAll);
    this.registerAction('apply_selected', onApplySelected);
    this.registerAction('cancel', onCancel);
    if (onNextHunk) this.registerAction('next_hunk', onNextHunk);
    if (onPrevHunk) this.registerAction('prev_hunk', onPrevHunk);
    if (onToggleHunk) this.registerAction('toggle_hunk', onToggleHunk);
  }

  clear(): void {
    this.actionHandlers.clear();
  }
}
