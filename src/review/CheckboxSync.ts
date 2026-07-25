/**
 * CheckboxSync - 파일/헌크 체크박스 상태 동기화 (C2-T13)
 * 파일 선택 시 헌크 전체 토글
 */
export class CheckboxSync {
  private fileStates: Map<string, boolean> = new Map();
  private hunkStates: Map<string, Map<number, boolean>> = new Map();

  toggleFile(filePath: string, checked: boolean): void {
    this.fileStates.set(filePath, checked);
    // If file is unchecked, uncheck all hunks
    if (!checked) {
      const hunks = this.hunkStates.get(filePath);
      if (hunks) {
        for (const [idx] of hunks) {
          hunks.set(idx, false);
        }
      }
    }
  }

  toggleHunk(filePath: string, hunkIndex: number, checked: boolean): void {
    if (!this.hunkStates.has(filePath)) {
      this.hunkStates.set(filePath, new Map());
    }
    this.hunkStates.get(filePath)!.set(hunkIndex, checked);

    // If all hunks checked, auto-check file
    const hunks = this.hunkStates.get(filePath)!;
    const allChecked = Array.from(hunks.values()).every(v => v);
    if (allChecked && checked) {
      this.fileStates.set(filePath, true);
    }
    // If any hunk unchecked, uncheck file
    if (!checked) {
      this.fileStates.set(filePath, false);
    }
  }

  isFileChecked(filePath: string): boolean {
    return this.fileStates.get(filePath) ?? true;
  }

  isHunkChecked(filePath: string, hunkIndex: number): boolean {
    return this.hunkStates.get(filePath)?.get(hunkIndex) ?? true;
  }

  getSelectedFiles(): string[] {
    return Array.from(this.fileStates.entries())
      .filter(([_, checked]) => checked)
      .map(([file]) => file);
  }

  getSelectedHunks(filePath: string): number[] {
    const hunks = this.hunkStates.get(filePath);
    if (!hunks) return [];
    return Array.from(hunks.entries())
      .filter(([_, checked]) => checked)
      .map(([idx]) => idx);
  }

  reset(): void {
    this.fileStates.clear();
    this.hunkStates.clear();
  }
}
