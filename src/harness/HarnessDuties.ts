/**
 * HARB-T08: Harness Duties (하네스가 대신 하는 일)
 *
 * 중급 모델(Flash, 7B~30B)이 "잘 도는" 환경을 만들기 위해,
 * 모델이 해야 할 일을 하네스가 대신 수행한다.
 * 모델은 "판단"만 하고, 나머지는 하네스가 책임진다.
 *
 * PRD: PRD-Harness-08_Harness_Duties.md
 */

/**
 * 하네스 의무 식별자.
 */
export type HarnessDutyId =
  | 'search_execution'
  | 'file_read_write'
  | 'command_execution'
  | 'verification_recovery'
  | 'context_budget'
  | 'prefetch'
  | 'tool_schema_permission'
  | 'context_assembly'
  | 'checkpoint_rollback'
  | 'doom_loop_detection'
  | 'memory_rules_injection'
  | 'session_turn_management'
  | 'logging_observability'
  | 'security_secrets';

/**
 * 하네스 의무 정의.
 */
export interface HarnessDuty {
  id: HarnessDutyId;
  title: string;
  description: string;
  modelDoes: string;
  harnessDoes: string;
  implementation: string;
  enabled: boolean;
}

/**
 * 14가지 하네스 의무 목록.
 */
export const HARNESS_DUTIES: HarnessDuty[] = [
  {
    id: 'search_execution',
    title: '탐색 실행',
    description: 'grep/glob/read_file/lsp 등 탐색 도구의 병렬 실행과 결과 캡',
    modelDoes: '"어디 볼지" 지시 (grep, read_file 인자)',
    harnessDoes: 'grep 16병렬, read_file 250줄 캡, staleness 체크, 프리페치',
    implementation: 'ParallelExecutor, PrefetchEngine',
    enabled: true,
  },
  {
    id: 'file_read_write',
    title: '파일 읽기/쓰기',
    description: 'edit_file/write_file의 유일 매칭 검증, Diff UI, 승인 게이트, 원자적 적용',
    modelDoes: 'edit_file 인자 (search/replace)',
    harnessDoes: '유일 매칭 검증, staleness 체크, Diff UI, 승인 게이트, 원자적 적용, 롤백',
    implementation: 'PatchApplier, DiffPreview, PermissionGate',
    enabled: true,
  },
  {
    id: 'command_execution',
    title: '명령 실행',
    description: 'run_terminal_cmd의 Allowlist 검증, 타임아웃, 출력 캡',
    modelDoes: 'run_terminal_cmd 인자 (cmd, cwd)',
    harnessDoes: 'Allowlist 검증, 타임아웃/시그널, 출력 32KB 캡, ANSI 파싱',
    implementation: 'TerminalExecutor, TerminalPTY',
    enabled: true,
  },
  {
    id: 'verification_recovery',
    title: '검증·복구',
    description: 'edit_file 후 자동 read_lints, 에러 주입, 2회 재시도, 에스컬레이션',
    modelDoes: '"실패했네, 다시 해볼게"',
    harnessDoes: 'read_lints 자동 실행, 에러 주입, 2회 재시도, ask_question 에스컬레이션',
    implementation: 'AutoLintHook, RecoveryExecutor',
    enabled: true,
  },
  {
    id: 'context_budget',
    title: '컨텍스트 예산',
    description: '토큰 카운팅, 4단계 컴팩션, 보호구간 보장',
    modelDoes: '"중요한 것만 말해줘"',
    harnessDoes: '토큰 카운팅, 4단계 컴팩션(Truncate→Drop→Micro-summary→Full), 보호구간 보장',
    implementation: 'CompactionEngine',
    enabled: true,
  },
  {
    id: 'prefetch',
    title: '프리페치/프리실행',
    description: '사용자 메시지 분석 → @mention/스택트레이스/import → 모델 호출 전 선읽기',
    modelDoes: '"이 파일 봐줘"',
    harnessDoes: '사용자 메시지 분석 → @mention/스택트레이스/import → 모델 호출 전 선읽기',
    implementation: 'PrefetchEngine, StreamingExecutor',
    enabled: true,
  },
  {
    id: 'tool_schema_permission',
    title: '도구 스키마/권한',
    description: '티어별 화이트리스트, 권한 게이트, MCP 지연 로드',
    modelDoes: '"이 도구 써"',
    harnessDoes: '티어별 화이트리스트, 권한 게이트, MCP 지연 로드, 스키마 토큰 예산',
    implementation: 'ToolRegistry, PermissionGate, MCPRegistry',
    enabled: true,
  },
  {
    id: 'context_assembly',
    title: '컨텍스트 조립/압축',
    description: '슬롯별 예산, 4단계 컴팩션, 보호구간 보장',
    modelDoes: '"중요한 것만 말해"',
    harnessDoes: '슬롯별 예산, 4단계 컴팩션, 보호구간 보장',
    implementation: 'ContextAssembler, CompactionEngine',
    enabled: true,
  },
  {
    id: 'checkpoint_rollback',
    title: '체크포인트/롤백',
    description: '첫 쓰기 전/5파일마다/수동 스냅샷, 타임라인 UI, 원클릭 롤백',
    modelDoes: '"되돌려줘"',
    harnessDoes: '첫 쓰기 전/5파일마다/수동 → 스냅샷, 타임라인 UI, 원클릭 롤백',
    implementation: 'CheckpointManager',
    enabled: true,
  },
  {
    id: 'doom_loop_detection',
    title: '둠 루프 감지',
    description: '동일 도구·동일 인자 3회 → 사용자 힌트 요청 / 강제 중단',
    modelDoes: '(자동)',
    harnessDoes: '동일 도구·동일 인자 3회 → 사용자 힌트 요청 / 강제 중단',
    implementation: 'DoomLoopDetector',
    enabled: true,
  },
  {
    id: 'memory_rules_injection',
    title: '메모리/규칙 주입',
    description: 'save_memory 도구, 반복 감지→자동 제안, 3계층 저장소',
    modelDoes: '"기억해줘"',
    harnessDoes: 'save_memory 도구, 반복 감지→자동 제안, 3계층 저장소, 예산 내 주입',
    implementation: 'MemoryManager, RulesEngine',
    enabled: true,
  },
  {
    id: 'session_turn_management',
    title: '세션/턴 관리',
    description: '턴 카운터, maxTurns, 타임아웃, Stop 버튼, 체크포인트 자동 생성',
    modelDoes: '(자동)',
    harnessDoes: '턴 카운터, maxTurns, 타임아웃, Stop 버튼, 체크포인트 자동 생성',
    implementation: 'AgentLoop, AbortController',
    enabled: true,
  },
  {
    id: 'logging_observability',
    title: '로깅/관측',
    description: '턴/도구/토큰/지연시간 JSONL 로그, 대시보드용 메트릭',
    modelDoes: '(자동)',
    harnessDoes: '턴/도구/토큰/지연시간 JSONL 로그, 대시보드용 메트릭',
    implementation: 'TelemetryLogger',
    enabled: true,
  },
  {
    id: 'security_secrets',
    title: '보안/시크릿',
    description: 'PreToolUse 훅에서 시크릿 스캔, 마스킹, 차단',
    modelDoes: '(자동)',
    harnessDoes: 'PreToolUse 훅에서 시크릿 스캔, 마스킹, 차단',
    implementation: 'SecretScanHook',
    enabled: true,
  },
];

/**
 * 활성화된 하네스 의무 목록을 반환한다.
 */
export function getActiveDuties(): HarnessDuty[] {
  return HARNESS_DUTIES.filter((d) => d.enabled);
}

/**
 * 특정 의무를 찾는다.
 */
export function getDuty(id: HarnessDutyId): HarnessDuty | undefined {
  return HARNESS_DUTIES.find((d) => d.id === id);
}
