/**
 * MemoryStore - SecretStorage 기반 영구 메모리 (C7-T14)
 *
 * - SecretStorage 연동으로 재시작 후에도 영구 유지
 * - UI 편집 가능 (vscode.SecretStorage API)
 * - 자동 주입 (매 턴 Rules 옆 1-2% 예산)
 * - 슬롯 기반 예산 관리
 *
 * 키 네이밍: agent-k.memory.<encoded-key>
 * 인덱스 키: agent-k.memory._index  →  JSON string[]
 */

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
  category: string;
}

export interface MemoryStoreOptions {
  /** 최대 슬롯 수 (기본 50) */
  maxSlots?: number;
  /** 메모리 키 Prefix (기본 'agent-k.memory.') */
  keyPrefix?: string;
}

// ---------------------------------------------------------------------------
// Internal metadata stored alongside each value
// ---------------------------------------------------------------------------

interface MemoryMetadata {
  value: string;
  createdAt: number;
  updatedAt: number;
  category: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SLOTS = 50;
const DEFAULT_KEY_PREFIX = 'agent-k.memory.';
const INDEX_KEY = 'agent-k.memory._index';
const MEMORIES_TAG_OPEN = '<memories>';
const MEMORIES_TAG_CLOSE = '</memories>';

// ---------------------------------------------------------------------------
// MemoryStore
// ---------------------------------------------------------------------------

export class MemoryStore {
  private readonly maxSlots: number;
  private readonly keyPrefix: string;

  /** In-memory cache: key → MemoryMetadata */
  private cache: Map<string, MemoryMetadata> = new Map();

  /** Index of all stored keys (lazy-hydrated from SecretStorage) */
  private index: string[] | null = null;

  /** True once the store has been hydrated from SecretStorage */
  private hydrated = false;

  /** Pending hydration promise (to avoid concurrent hydrations) */
  private hydrationPromise: Promise<void> | null = null;

  constructor(
    private readonly secretStorage: vscode.SecretStorage,
    private readonly context: vscode.ExtensionContext,
    private readonly options: MemoryStoreOptions = {},
  ) {
    this.maxSlots = options.maxSlots ?? DEFAULT_MAX_SLOTS;
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * 메모리 저장 (생성 또는 업데이트)
   * - 슬롯이 가득 찬 경우 가장 오래된 메모리를 교체
   */
  async set(key: string, value: string, category = 'general'): Promise<void> {
    await this.ensureHydrated();

    const now = Date.now();
    const existing = this.cache.get(key);

    const meta: MemoryMetadata = {
      value,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      category: existing?.category ?? category,
    };

    // --- 슬롯 예산 관리 ---
    if (!existing && this.index !== null && this.index.length >= this.maxSlots) {
      // 가장 오래된 updatedAt 항목 찾기
      let oldestKey = '';
      let oldestTime = Infinity;
      for (const k of this.index) {
        const m = this.cache.get(k);
        if (m && m.updatedAt < oldestTime) {
          oldestTime = m.updatedAt;
          oldestKey = k;
        }
      }
      // 오래된 항목 제거 (재귀 없이 직접)
      if (oldestKey && oldestKey !== key) {
        this.cache.delete(oldestKey);
        this.index = this.index.filter((k) => k !== oldestKey);
        await this.secretStorage.delete(this.storageKey(oldestKey));
      }
    }

    // 저장
    this.cache.set(key, meta);

    // 인덱스 갱신
    if (this.index === null) {
      this.index = [key];
    } else if (!this.index.includes(key)) {
      this.index.push(key);
    }

    // SecretStorage에 기록
    await this.secretStorage.store(this.storageKey(key), JSON.stringify(meta));
    await this.persistIndex();
  }

  /**
   * 메모리 조회 (캐시 → SecretStorage fallback)
   */
  async get(key: string): Promise<string | undefined> {
    await this.ensureHydrated();
    return this.cache.get(key)?.value;
  }

  /**
   * 전체 MemoryEntry 조회
   */
  async getAllMemories(): Promise<MemoryEntry[]> {
    await this.ensureHydrated();
    const entries: MemoryEntry[] = [];
    if (this.index === null) return entries;

    for (const key of this.index) {
      const meta = this.cache.get(key);
      if (meta) {
        entries.push({ key, ...meta });
      }
    }

    // 최신 업데이트 순 정렬
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return entries;
  }

  /**
   * 메모리 키 목록
   */
  async list(): Promise<string[]> {
    await this.ensureHydrated();
    return this.index ? [...this.index] : [];
  }

  /**
   * 메모리 삭제
   */
  async delete(key: string): Promise<void> {
    await this.ensureHydrated();
    this.cache.delete(key);
    if (this.index) {
      this.index = this.index.filter((k) => k !== key);
    }
    await this.secretStorage.delete(this.storageKey(key));
    await this.persistIndex();
  }

  /**
   * 모든 메모리 제거
   */
  async clear(): Promise<void> {
    await this.ensureHydrated();

    // 모든 키 삭제
    if (this.index) {
      const keys = [...this.index];
      await Promise.all(keys.map((k) => this.secretStorage.delete(this.storageKey(k))));
    }

    this.cache.clear();
    this.index = [];
    await this.secretStorage.delete(INDEX_KEY);
  }

  /**
   * 슬롯 기반 사용량 통계
   */
  getMemoryUsage(): { used: number; maxSlots: number; percentUsed: number } {
    const used = this.index?.length ?? 0;
    return {
      used,
      maxSlots: this.maxSlots,
      percentUsed: this.maxSlots > 0 ? Math.round((used / this.maxSlots) * 100) : 0,
    };
  }

  /**
   * 컨텍스트에 메모리 블록을 주입 (문자 예산 기반)
   *
   * - prompt 내 `<memories>...</memories>` 가 존재하면 그 사이를 치환
   * - 없으면 prompt 끝에 추가
   * - budgetChars (문자 수) 이하로 맞추기 위해 최신순으로 truncate
   */
  injectMemoriesIntoPrompt(prompt: string, budgetChars: number): string {
    if (budgetChars <= 0) return prompt;

    const memoryBlock = this.buildMemoryBlock(budgetChars);
    if (!memoryBlock) return prompt;

    const openIdx = prompt.indexOf(MEMORIES_TAG_OPEN);
    const closeIdx = prompt.indexOf(MEMORIES_TAG_CLOSE);

    if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
      // 기존 <memories> 블록 치환
      const before = prompt.slice(0, openIdx + MEMORIES_TAG_OPEN.length);
      const after = prompt.slice(closeIdx);
      return before + '\n' + memoryBlock + '\n' + after;
    }

    // 없으면 prompt 맨 뒤에 추가
    return prompt + '\n\n' + memoryBlock;
  }

  // -----------------------------------------------------------------------
  // Internal: 메모리 블록 빌드
  // -----------------------------------------------------------------------

  /**
   * budgetChars (문자 수) 예산에 맞춰 메모리 블록 문자열 생성
   */
  private buildMemoryBlock(budgetChars: number): string {
    if (!this.index || this.index.length === 0) return '';

    // 최신순 정렬
    const entries: { key: string; meta: MemoryMetadata }[] = [];
    for (const key of this.index) {
      const meta = this.cache.get(key);
      if (meta) entries.push({ key, meta });
    }
    entries.sort((a, b) => b.meta.updatedAt - a.meta.updatedAt);

    const overhead = MEMORIES_TAG_OPEN.length + MEMORIES_TAG_CLOSE.length + 4; // <memories>\n\n</memories>
    let available = budgetChars - overhead;

    const lines: string[] = [];
    let totalLen = 0;

    for (const { key, meta } of entries) {
      const line = `- ${key}: ${meta.value}`;
      const lineLen = line.length + 1; // +1 for newline

      if (totalLen + lineLen <= available) {
        lines.push(line);
        totalLen += lineLen;
      } else {
        // 예산 소진
        break;
      }
    }

    if (lines.length === 0) return '';

    return MEMORIES_TAG_OPEN + '\n' + lines.join('\n') + '\n' + MEMORIES_TAG_CLOSE;
  }

  // -----------------------------------------------------------------------
  // Internal: Hydration
  // -----------------------------------------------------------------------

  /**
   * SecretStorage에서 캐시로 데이터를 로드 (최초 1회)
   */
  private async ensureHydrated(): Promise<void> {
    if (this.hydrated) return;
    if (this.hydrationPromise) return this.hydrationPromise;

    this.hydrationPromise = this.hydrate();
    await this.hydrationPromise;
  }

  private async hydrate(): Promise<void> {
    try {
      // 1. 인덱스 로드
      const indexRaw = await this.secretStorage.get(INDEX_KEY);
      if (!indexRaw) {
        this.index = [];
        this.hydrated = true;
        return;
      }

      let keys: string[];
      try {
        keys = JSON.parse(indexRaw);
        if (!Array.isArray(keys)) {
          keys = [];
        }
      } catch {
        keys = [];
      }

      this.index = [];

      // 2. 각 메모리 로드 (병렬)
      const results = await Promise.all(
        keys.map(async (k: string) => {
          try {
            const raw = await this.secretStorage.get(this.storageKey(k));
            if (!raw) return null;
            const meta: MemoryMetadata = JSON.parse(raw);
            if (!meta || typeof meta.value !== 'string') return null;
            return { key: k, meta } as const;
          } catch {
            return null;
          }
        }),
      );

      // 3. 캐시 구축 (유효한 항목만)
      for (const result of results) {
        if (result) {
          this.cache.set(result.key, result.meta);
          this.index.push(result.key);
        }
      }

      // 4. 인덱스 정리 (SecretStorage에 없는 키 제거)
      await this.persistIndex();
    } catch (err) {
      console.error('[MemoryStore] Hydration failed:', err);
      this.index = [];
    } finally {
      this.hydrated = true;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: Index persistence
  // -----------------------------------------------------------------------

  /**
   * 현재 인덱스를 SecretStorage에 기록
   */
  private async persistIndex(): Promise<void> {
    if (!this.index) return;
    try {
      await this.secretStorage.store(INDEX_KEY, JSON.stringify(this.index));
    } catch (err) {
      console.error('[MemoryStore] Failed to persist index:', err);
    }
  }

  // -----------------------------------------------------------------------
  // Internal: Key helpers
  // -----------------------------------------------------------------------

  /**
   * 메모리 키 → SecretStorage 키 변환
   */
  private storageKey(key: string): string {
    return `${this.keyPrefix}${encodeURIComponent(key)}`;
  }

  /**
   * SecretStorage 키 → 메모리 키 변환 (디코드)
   */
  private decodeStorageKey(storageKey: string): string {
    const prefixLen = this.keyPrefix.length;
    const encoded = storageKey.slice(prefixLen);
    return decodeURIComponent(encoded);
  }
}
