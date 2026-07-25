/**
 * MemoryStore - workspaceState 기반 메모리 (C4-T18)
 * 
 * 최소: workspaceState key-value + 매 턴 Rules 옆 주입 (1-2% 예산)
 * 사용자 명시적 저장 / 모델 "기억해" 감지 / 반복 선호 자동 감지
 */
export interface Memory {
  id: string;
  key: string;
  value: string;
  type: 'user_stored' | 'auto_detected' | 'preference';
  category: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryStoreState {
  memories: Memory[];
  totalEstimatedTokens: number;
}

export class MemoryStore {
  private memories: Map<string, Memory> = new Map();
  private readonly maxTokens = 2000; // 1-2% of 128k context
  private onChange: ((memories: Memory[]) => void) | null = null;

  setChangeListener(listener: (memories: Memory[]) => void): void {
    this.onChange = listener;
  }

  set(key: string, value: string, type: Memory['type'] = 'user_stored', category = 'general'): Memory {
    const existing = this.memories.get(key);
    const memory: Memory = {
      id: existing?.id || `mem-${Date.now()}`,
      key,
      value,
      type,
      category,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    this.memories.set(key, memory);
    this.onChange?.(Array.from(this.memories.values()));
    return memory;
  }

  get(key: string): Memory | undefined {
    return this.memories.get(key);
  }

  delete(key: string): boolean {
    const result = this.memories.delete(key);
    if (result) this.onChange?.(Array.from(this.memories.values()));
    return result;
  }

  search(query: string): Memory[] {
    const lower = query.toLowerCase();
    return Array.from(this.memories.values()).filter(m =>
      m.key.toLowerCase().includes(lower) ||
      m.value.toLowerCase().includes(lower)
    );
  }

  getAll(): Memory[] {
    return Array.from(this.memories.values());
  }

  getByCategory(category: string): Memory[] {
    return Array.from(this.memories.values()).filter(m => m.category === category);
  }

  /**
   * 컨텍스트 주입용 텍스트 생성 (예산 제한)
   */
  getContextBlock(maxTokens = this.maxTokens): string {
    const memories = this.getAll();
    if (memories.length === 0) return '';

    const lines = memories.map(m => `- ${m.key}: ${m.value}`);
    let result = '<memories>\n' + lines.join('\n') + '\n</memories>';

    // Truncate if over budget
    const estimatedTokens = Math.ceil(result.length / 4);
    if (estimatedTokens > maxTokens) {
      // Keep most recent
      const sorted = memories.sort((a, b) => b.updatedAt - a.updatedAt);
      const keptLines: string[] = [];
      let budget = 0;
      for (const mem of sorted) {
        const line = `- ${mem.key}: ${mem.value}`;
        const lineTokens = Math.ceil(line.length / 4);
        if (budget + lineTokens <= maxTokens) {
          keptLines.push(line);
          budget += lineTokens;
        } else {
          break;
        }
      }
      result = '<memories>\n' + keptLines.join('\n') + '\n</memories>';
    }

    return result;
  }

  /**
   * 자동 감지: "기억해" / "keep in mind" 패턴
   */
  detectAutoMemory(text: string): { key: string; value: string } | null {
    const patterns = [
      /(?:기억해|remember|keep in mind|note that|important:?)\s*(.+?)(?:[.!]|$)/i,
      /(?:prefer|I like|I use|always|never|don't)\s+(.+?)(?:[.!]|$)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // Generate a key from first few words
        const key = match[1].slice(0, 40).replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim();
        if (key.length > 5) {
          return { key, value: match[1].trim() };
        }
      }
    }

    return null;
  }

  clear(): void {
    this.memories.clear();
    this.onChange?.([]);
  }

  get state(): MemoryStoreState {
    const memories = this.getAll();
    const totalChars = memories.reduce((sum, m) => sum + m.key.length + m.value.length, 0);
    return {
      memories,
      totalEstimatedTokens: Math.ceil(totalChars / 4)
    };
  }
}
