/**
 * AC-2: 테스트 실패 → 수정 → 재실행 루프 헬퍼 (모의 러너)
 */
export interface TestRunOutcome {
  passed: boolean;
  log: string;
  attempt: number;
}

export class TestLoopHarness {
  private attempts = 0;
  private fixed = false;

  constructor(private readonly failLog: string, private readonly passLog = 'OK 1 passed') {}

  /** edit_file 성공 후 호출 — 두 번째 시도부터 통과 */
  markFixApplied(): void {
    this.fixed = true;
  }

  runTests(): TestRunOutcome {
    this.attempts += 1;
    if (this.fixed || this.attempts >= 2) {
      return { passed: true, log: this.passLog, attempt: this.attempts };
    }
    return { passed: false, log: this.failLog, attempt: this.attempts };
  }

  get attemptCount(): number {
    return this.attempts;
  }
}
