/**
 * HARB-T04: Memories (Minimal) — 메모리 최소 구현
 *
 * 세션을 넘어 사용자 선호·프로젝트 사실을 영구 기억하고,
 * 매 턴 예산 1~2%만 써서 컨텍스트에 주입한다.
 * 자동 장기 기억은 환각 위험 → 명시 저장 + 사용자 편집만 허용.
 *
 * PRD: PRD-Harness-04_Memories_Minimal.md
 */

/**
 * 메모리 엔트리 스키마.
 */
export interface MemoryEntry {
  key: string;
  value: string;
  scope: 'user' | 'workspace' | 'team';
  source: 'explicit' | 'detected' | 'model_proposed';
  tags: string[];
  confidence?: number;
  createdAt: number;
  updatedAt: number;
  version: number;
}

/**
 * 메모리 저장소 인터페이스.
 */
export interface MemoryStore {
  get(key: string): Promise<MemoryEntry | undefined>;
  set(entry: MemoryEntry): Promise<void>;
  delete(key: string): Promise<void>;
  list(scope?: string): Promise<MemoryEntry[]>;
  search(query: string): Promise<MemoryEntry[]>;
}

/**
 * 메모리 주입 정책 설정.
 */
export interface MemoryInjectionConfig {
  /** 컨텍스트 예산 비율 (1~2%) */
  budgetPercent: number;
  /** 최대 메모리 개수 */
  maxEntries: number;
  /** 정렬 기준 */
  sortBy: 'updatedAt' | 'createdAt' | 'priority';
  /** 포함할 범위 (우선순위 순) */
  scopePriority: Array<'team' | 'workspace' | 'user'>;
}

export const DEFAULT_MEMORY_CONFIG: MemoryInjectionConfig = {
  budgetPercent: 2,
  maxEntries: 60,
  sortBy: 'updatedAt',
  scopePriority: ['team', 'workspace', 'user'],
};

/**
 * 메모리 주입 프롬프트 블록.
 */
export const MEMORIES_PROMPT = `
## Active Memories

The following facts are remembered from previous sessions.
They are stored explicitly (not auto-inferred) to prevent hallucinations.

- [user] framework: This project uses NestJS v10 #framework #backend
- [workspace] naming: React hooks use 'use' prefix #naming #react
- [team] logging: Use structured logging with winston #logging #backend

(Actual memories are injected dynamically based on context budget.)
`;

/**
 * 메모리를 프롬프트 형식으로 포맷팅한다.
 */
export function formatMemories(entries: MemoryEntry[]): string {
  if (entries.length === 0) return '';

  const lines = entries.map((e) => {
    const tags = e.tags.map((t) => `#${t}`).join(' ');
    return `- [${e.scope}] ${e.key}: ${e.value} ${tags}`;
  });

  return `## Active Memories\n${lines.join('\n')}`;
}

/**
 * 메모리를 예산 내로 필터링한다.
 */
export function filterMemoriesByBudget(
  entries: MemoryEntry[],
  config: MemoryInjectionConfig = DEFAULT_MEMORY_CONFIG,
): MemoryEntry[] {
  // Sort by updatedAt descending
  const sorted = [...entries].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  // Apply scope priority
  const prioritized = sorted.sort((a, b) => {
    const aIdx = config.scopePriority.indexOf(a.scope as any);
    const bIdx = config.scopePriority.indexOf(b.scope as any);
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  return prioritized.slice(0, config.maxEntries);
}
