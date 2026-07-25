/**
 * ResearchPhase - Plan 모드 읽기 전용 리서치 (C5-T03)
 * 
 * Ask 모드 ParallelExecutor 재활용 — 읽기 도구만 실행
 * edit_file 호출 시 deny + 디스크 unchanged
 * 탐색 요약이 PlanGenerator 입력으로 전달
 */
import type { ToolInput, ToolOutput } from '../tools/types';

export interface ResearchResult {
  summary: string;
  filesRead: string[];
  grepResults: string[];
  duration: number;
}

export class ResearchPhase {
  private allowedTools = [
    'grep', 'glob', 'file_search', 'list_dir', 'read_file',
    'codebase_search', 'lsp_definition', 'lsp_references'
  ];

  /**
   * Plan 모드의 리서치 단계에서 읽기 도구만 실행
   */
  async execute(tools: Array<{ name: string; args: ToolInput }>): Promise<ResearchResult> {
    const startTime = Date.now();
    const filesRead: string[] = [];
    const grepResults: string[] = [];

    for (const tool of tools) {
      if (!this.allowedTools.includes(tool.name)) {
        throw new Error(`[Plan Mode] "${tool.name}" is not allowed during research. Only read tools are permitted.`);
      }

      const result = await this.executeReadTool(tool.name, tool.args);
      
      if (tool.name === 'read_file' && result.success && result.data) {
        filesRead.push(tool.args.path as string || '');
      }
      if (tool.name === 'grep' && result.success && result.data) {
        grepResults.push(JSON.stringify(result.data));
      }
    }

    return {
      summary: `Research completed: read ${filesRead.length} files, ${grepResults.length} grep queries`,
      filesRead,
      grepResults,
      duration: Date.now() - startTime
    };
  }

  /**
   * PlanGenerator용 리서치 요약 컨텍스트 블록 생성
   */
  buildContextBlock(result: ResearchResult): string {
    const lines: string[] = [
      '## Codebase Research Results',
      '',
      `### Files Read (${result.filesRead.length})`,
      ...result.filesRead.map(f => `- ${f}`),
      '',
      `### Grep Queries (${result.grepResults.length})`,
      ...result.grepResults.slice(0, 20).map(g => `- ${g.slice(0, 200)}`),
      '',
      `_Research took ${result.duration}ms_`
    ];
    return lines.join('\n');
  }

  private async executeReadTool(name: string, args: ToolInput): Promise<ToolOutput> {
    // Delegate to existing executors
    try {
      const { executeGrep, executeGlob, executeReadFile, executeListDir, executeCodebaseSearch, executeLspDefinition, executeLspReferences } = await import('../tools/executors');
      
      const executors: Record<string, (input: ToolInput) => Promise<ToolOutput>> = {
        grep: executeGrep,
        glob: executeGlob,
        read_file: executeReadFile,
        list_dir: executeListDir,
        codebase_search: executeCodebaseSearch,
        lsp_definition: executeLspDefinition,
        lsp_references: executeLspReferences
      };

      const executor = executors[name];
      if (executor) return await executor(args);
      return { success: true, data: { message: `Stub: ${name}`, args } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
