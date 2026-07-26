/**
 * StreamingToolExecutor - tool_call 도착 즉시 읽기 도구 선실행 (C3-T16)
 * 
 * 스트리밍 중 tool_call 파싱 → 즉시 실행 → 결과 캐시
 * 지연 시간 단축
 */
import type { ToolInput, ToolOutput } from '../tools/types';
import { toolRegistry } from '../tools/registry';
import { modeRegistry } from '../agent/modeRegistry';
import type { Mode } from '../agent/types';

interface CachedResult {
  output: ToolOutput;
  cachedAt: number;
}

export class StreamingToolExecutor {
  private cache: Map<string, CachedResult> = new Map();
  private readonly cacheTtl = 30000; // 30 seconds
  private mode: Mode;

  constructor(mode: Mode = 'agent') {
    this.mode = mode;
  }

  setMode(mode: Mode): void {
    this.mode = mode;
  }

  /**
   * tool_call이 도착하면 즉시 실행 (스트리밍 완료 대기 불필요)
   * 읽기 도구만 선실행, 쓰기/터미널은 직렬 실행
   */
  async executeEarly(toolName: string, args: ToolInput): Promise<ToolOutput | null> {
    const tool = toolRegistry.getTool(toolName);
    if (!tool) return null;

    // Only pre-execute read/search tools
    if (tool.category !== 'search') return null;

    // Mode check
    if (!modeRegistry.isToolAllowed(this.mode, toolName)) return null;

    // Check cache
    const cacheKey = this.makeCacheKey(toolName, args);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.cacheTtl) {
      return { ...cached.output, metadata: { ...cached.output.metadata, cached: true, duration: cached.output.metadata?.duration || 0 } };
    }

    // Execute
    try {
      const {
        executeGrep,
        executeGlob,
        executeFileSearch,
        executeReadFile,
        executeReadFiles,
        executeListDir,
        executeCodebaseSearch,
        executeLspDefinition,
        executeLspReferences
      } = await import('../tools/executors');

      const executors: Record<string, (input: ToolInput) => Promise<ToolOutput>> = {
        grep: executeGrep,
        glob: executeGlob,
        file_search: executeFileSearch,
        read_file: executeReadFile,
        read_files: executeReadFiles,
        list_dir: executeListDir,
        codebase_search: executeCodebaseSearch,
        lsp_definition: executeLspDefinition,
        lsp_references: executeLspReferences
      };

      const executor = executors[toolName];
      if (!executor) return null;

      const result = await executor(args);
      this.cache.set(cacheKey, { output: result, cachedAt: Date.now() });

      // Limit cache size
      if (this.cache.size > 100) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) this.cache.delete(oldestKey);
      }

      return result;
    } catch {
      return null;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  private makeCacheKey(toolName: string, args: ToolInput): string {
    return `${toolName}:${JSON.stringify(args)}`;
  }
}
