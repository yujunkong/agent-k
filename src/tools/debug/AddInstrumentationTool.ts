/**
 * AddInstrumentationTool - edit_file 래퍼, DEBUG_INSTRUMENT 마커 삽입 (C6-T03)
 */
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
    const marker = `// DEBUG_INSTRUMENT: ${hypId}`;

    switch (request.type) {
      case 'entry':
        return `${marker}\nconsole.log('[DEBUG:${hypId}] ENTER: ${request.filePath}${request.variableName ? ` | ${request.variableName}=', JSON.stringify(${request.variableName})` : ''});`;
      
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

  /**
   * Get all markers for a hypothesis
   */
  getMarkers(hypothesisId?: string): InstrumentationMarker[] {
    if (hypothesisId) return this.markers.filter(m => m.request.hypothesisId === hypothesisId);
    return [...this.markers];
  }

  /**
   * Get all markers for a file
   */
  getFileMarkers(filePath: string): InstrumentationMarker[] {
    return this.markers.filter(m => m.request.filePath === filePath);
  }

  /**
   * Clear markers for a specific hypothesis
   */
  clearHypothesisMarkers(hypothesisId: string): void {
    this.markers = this.markers.filter(m => m.request.hypothesisId !== hypothesisId);
  }

  /**
   * Clear all markers
   */
  clearAll(): void {
    this.markers = [];
  }
}
