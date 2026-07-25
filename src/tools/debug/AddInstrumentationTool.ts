/**
 * AddInstrumentationTool - DEBUG_INSTRUMENT 마커를 실파일에 삽입 (C6-T03 / RW-C6-02-R2)
 *
 * 착각 금지: 코드 문자열 생성만으로는 미완료. 워크스페이스 디스크에 마커를 기록해야 AC 충족.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface InstrumentationRequest {
  filePath: string;
  hypothesisId: string;
  type: 'entry' | 'exit' | 'conditional' | 'dump';
  lineNumber?: number;
  variableName?: string;
  condition?: string;
}

export interface InstrumentationMarker {
  id: string;
  request: InstrumentationRequest;
  insertedAt: number;
  originalContent: string;
  insertedLine: number;
}

export class AddInstrumentationTool {
  private markers: InstrumentationMarker[] = [];

  /**
   * Generate instrumentation code based on type
   */
  generateInstrumentation(request: InstrumentationRequest): string {
    const hypId = request.hypothesisId;
    // RW-C6-02-R2: canonical marker comment for VerifyCleanup / remove scan
    const marker = `// DEBUG_INSTRUMENT: ${hypId}`;

    switch (request.type) {
      case 'entry':
        return `${marker}\nconsole.log('[DEBUG:${hypId}] ENTER: ${request.filePath}'${request.variableName ? ` + ' | ${request.variableName}=' + JSON.stringify(${request.variableName})` : ''});`;

      case 'exit':
        return `${marker}\nconsole.log('[DEBUG:${hypId}] EXIT: ${request.filePath}');`;

      case 'conditional':
        return `${marker}\nif (${request.condition || 'true'}) { console.log('[DEBUG:${hypId}] COND: ${request.condition}', { ${request.variableName || ''} }); }`;

      case 'dump':
        return `${marker}\nconsole.log('[DEBUG:${hypId}] DUMP:', JSON.stringify(${request.variableName || 'this'}, null, 2));`;

      default:
        return `${marker}\nconsole.log('[DEBUG:${hypId}]');`;
    }
  }

  /**
   * Resolve path relative to workspace root when available
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) return filePath;
    try {
      // Lazy vscode import — available in extension host
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const vscode = require('vscode') as typeof import('vscode');
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        return path.join(folders[0].uri.fsPath, filePath);
      }
    } catch {
      // Outside extension host (unit tests) — resolve from cwd
    }
    return path.resolve(filePath);
  }

  /**
   * RW-C6-02-R2: Write DEBUG_INSTRUMENT markers onto a real workspace file
   */
  async applyToFile(request: InstrumentationRequest): Promise<{
    marker: InstrumentationMarker;
    absPath: string;
    code: string;
  }> {
    const absPath = this.resolvePath(request.filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found for instrumentation: ${absPath}`);
    }

    const originalContent = fs.readFileSync(absPath, 'utf-8');
    const code = this.generateInstrumentation(request);
    const lines = originalContent.split('\n');
    // lineNumber is 1-based; default append near end of file
    const insertAt =
      request.lineNumber != null
        ? Math.max(0, Math.min(request.lineNumber - 1, lines.length))
        : Math.max(0, lines.length - 1);

    lines.splice(insertAt, 0, ...code.split('\n'));
    const newContent = lines.join('\n');

    // Prefer vscode.workspace.fs when in extension host; fall back to Node fs
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const vscode = require('vscode') as typeof import('vscode');
      const uri = vscode.Uri.file(absPath);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(newContent, 'utf-8'));
    } catch {
      fs.writeFileSync(absPath, newContent, 'utf-8');
    }

    const marker = this.recordMarker(request, originalContent, insertAt);
    return { marker, absPath, code };
  }

  /**
   * Record a marker for later cleanup
   */
  recordMarker(request: InstrumentationRequest, originalContent: string, insertedLine: number): InstrumentationMarker {
    const marker: InstrumentationMarker = {
      id: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      request,
      insertedAt: Date.now(),
      originalContent,
      insertedLine
    };
    this.markers.push(marker);
    return marker;
  }

  getMarkers(hypothesisId?: string): InstrumentationMarker[] {
    if (hypothesisId) return this.markers.filter(m => m.request.hypothesisId === hypothesisId);
    return [...this.markers];
  }

  getFileMarkers(filePath: string): InstrumentationMarker[] {
    return this.markers.filter(m => m.request.filePath === filePath);
  }

  clearHypothesisMarkers(hypothesisId: string): void {
    this.markers = this.markers.filter(m => m.request.hypothesisId !== hypothesisId);
  }

  clearAll(): void {
    this.markers = [];
  }
}
