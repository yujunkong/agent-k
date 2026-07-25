/**
 * ToolCallParser - 파싱 전략 순차 적용
 *
 * 1) Native tool_calls (OpenAI/Anthropic 네이티브) + plain [{name,arguments}]
 * 2) XML 태그: <tool name="grep">{"pattern":"foo"}</tool>
 * 3) JSON 펜스: ```json\n{"name":"grep","arguments":{...}}\n```
 * 4) Bare JSON array/object: [{"name":"glob","arguments":{...}}]  (chat dump 형식)
 * 5) 이중 인코딩: 이스케이프된 JSON 문자열 디코딩 후 파싱
 * 6) Content 스캔: 일반 텍스트 중 도구 호출 패턴 휴리스틱 추출
 */

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  raw: string;
  confidence: number; // 0-1
  strategy: 'native' | 'xml' | 'json-fence' | 'json-array' | 'double-encoded' | 'content-scan';
}

export class ToolCallParser {
  private toolCallIdCounter = 0;

  private nextId(): string {
    return `tool_${++this.toolCallIdCounter}_${Date.now()}`;
  }

  parse(content: any): ParsedToolCall[] {
    if (!content) return [];

    // Strategy 1: Native (OpenAI/Anthropic format) or plain tool-call arrays
    if (Array.isArray(content)) {
      const plain = this.parsePlainToolItems(content, 'native');
      if (plain.length > 0) return plain;
      const native = this.parseNative(content);
      if (native.length > 0) return native;
    }

    if (typeof content !== 'string') return [];

    const results: ParsedToolCall[] = [];

    // Strategy 2: XML tags
    const xml = this.parseXmlTags(content);
    results.push(...xml);

    // Strategy 3: JSON fence
    if (results.length === 0) {
      const jsonFence = this.parseJsonFence(content);
      results.push(...jsonFence);
    }

    // Strategy 4: Bare JSON array/object (model dumps this as the whole reply)
    if (results.length === 0) {
      const jsonArray = this.parseBareJsonToolCalls(content);
      results.push(...jsonArray);
    }

    // Strategy 5: Double-encoded
    if (results.length === 0) {
      const doubleEncoded = this.parseDoubleEncoded(content);
      results.push(...doubleEncoded);
    }

    // Strategy 6 (content-scan) DISABLED — it matched prose identifiers like
    // LLM(...), GPT(...), autodetectTemplateType(...) from file analysis text
    // and invented fake tool calls. Only structured formats above are trusted.

    return results;
  }

  /** [{name, arguments}] / {name, arguments} items — chat UI dump format */
  private parsePlainToolItems(
    items: any[],
    strategy: ParsedToolCall['strategy']
  ): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const name = item.name || item.tool;
      if (!name || typeof name !== 'string') continue;
      // Skip OpenAI native wrappers (handled by parseNative)
      if (item.type === 'function' || item.function) continue;
      let args = item.arguments ?? item.args ?? {};
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          args = { raw: args };
        }
      }
      results.push({
        id: item.id || this.nextId(),
        name,
        arguments: args && typeof args === 'object' ? args : {},
        raw: JSON.stringify(item),
        confidence: strategy === 'native' ? 1.0 : 0.92,
        strategy
      });
    }
    return results;
  }

  /**
   * Extract [{"name":"glob","arguments":{...}}] or single object from free text.
   * Matches the exact dump Chat UI was showing as the "answer".
   */
  private parseBareJsonToolCalls(content: string): ParsedToolCall[] {
    const trimmed = content.trim();
    // Prefer a top-level array / object that dominates the reply
    const candidates: string[] = [];
    const arrayStart = trimmed.indexOf('[');
    const objStart = trimmed.indexOf('{');
    if (arrayStart >= 0 && (objStart < 0 || arrayStart <= objStart)) {
      const extracted = this.extractBalancedJsonArray(trimmed, arrayStart);
      if (extracted) candidates.push(extracted);
    }
    if (objStart >= 0) {
      const extracted = this.extractBalancedJsonObject(trimmed, objStart);
      if (extracted) candidates.push(extracted);
    }
    // Also scan fenced-less mid-content arrays
    const mid = trimmed.match(/\[[\s\S]*?"name"\s*:\s*"[a-z_]+"[\s\S]*?\]/);
    if (mid?.[0] && !candidates.includes(mid[0])) {
      candidates.push(mid[0]);
    }

    for (const cand of candidates) {
      try {
        const parsed = JSON.parse(cand);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        const calls = this.parsePlainToolItems(items, 'json-array');
        if (calls.length > 0) return calls;
      } catch {
        // try next candidate
      }
    }
    return [];
  }

  /** Balanced [...] extractor (nested braces/brackets) */
  private extractBalancedJsonArray(content: string, start: number): string | null {
    if (content[start] !== '[') return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < content.length; i++) {
      const ch = content[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '[') depth += 1;
      else if (ch === ']') {
        depth -= 1;
        if (depth === 0) return content.slice(start, i + 1);
      }
    }
    return null;
  }

  private parseNative(content: any[]): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    for (const item of content) {
      if (item.type === 'function' || item.function) {
        const fn = item.function || item;
        try {
          results.push({
            id: item.id || this.nextId(),
            name: fn.name || '',
            arguments: typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments || {},
            raw: JSON.stringify(fn),
            confidence: 1.0,
            strategy: 'native'
          });
        } catch {
          // Parse error for native format
        }
      }
    }
    return results;
  }

  private parseXmlTags(content: string): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    const tagRegex = /<tool\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/tool>/gi;
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
      try {
        const name = match[1].trim();
        const argsStr = match[2].trim();
        const args = JSON.parse(argsStr);
        results.push({
          id: this.nextId(),
          name,
          arguments: args,
          raw: match[0],
          confidence: 0.95,
          strategy: 'xml'
        });
      } catch {
        // Try to parse as key=value pairs
        const name = match[1].trim();
        const argsStr = match[2].trim();
        results.push({
          id: this.nextId(),
          name,
          arguments: { content: argsStr },
          raw: match[0],
          confidence: 0.7,
          strategy: 'xml'
        });
      }
    }
    return results;
  }

  private parseJsonFence(content: string): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    const fenceStart = /```(?:json)?\s*/gi;
    let match: RegExpExecArray | null;

    while ((match = fenceStart.exec(content)) !== null) {
      const jsonStart = match.index + match[0].length;
      const jsonStr = this.extractBalancedJsonObject(content, jsonStart);
      if (!jsonStr) {
        continue;
      }
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.name || parsed.tool) {
          results.push({
            id: this.nextId(),
            name: parsed.name || parsed.tool || 'unknown',
            arguments: parsed.arguments || parsed.args || parsed,
            raw: match[0] + jsonStr,
            confidence: 0.9,
            strategy: 'json-fence'
          });
        }
      } catch {
        // Continue — 다른 전략에 위임
      }
    }
    return results;
  }

  /** 중첩 braces가 있는 깨진 펜스 JSON 추출 (HARB AC-4) */
  private extractBalancedJsonObject(content: string, start: number): string | null {
    const open = content.indexOf('{', start);
    if (open < 0) {
      return null;
    }
    let depth = 0;
    for (let i = open; i < content.length; i++) {
      const ch = content[i];
      if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          return content.slice(open, i + 1);
        }
      }
    }
    return null;
  }

  private parseDoubleEncoded(content: string): ParsedToolCall[] {
    // Try to unescape and parse
    try {
      const unescaped = content
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
      
      if (unescaped !== content) {
        const result = this.parseJsonFence(unescaped);
        if (result.length > 0) {
          result.forEach(r => {
            r.strategy = 'double-encoded';
            r.confidence = 0.8;
          });
          return result;
        }
      }
    } catch {
      // Ignore
    }
    return [];
  }

  private contentScan(content: string): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];

    // Pattern: tool_name(key=value, key=value)
    const toolCallRegex = /(\w+)\s*\(([^)]*)\)/g;
    let match;

    while ((match = toolCallRegex.exec(content)) !== null) {
      const name = match[1].trim();
      const argsStr = match[2].trim();

      // Skip common non-tool function calls
      if (['console', 'require', 'import', 'export', 'function', 'if', 'for', 'while'].includes(name)) {
        continue;
      }

      const args: Record<string, string> = {};
      const argPairs = argsStr.match(/(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*'([^']*)'|(\w+)\s*=\s*(\S+)/g);
      if (argPairs) {
        for (const pair of argPairs) {
          const eqIdx = pair.indexOf('=');
          if (eqIdx > 0) {
            const key = pair.slice(0, eqIdx).trim();
            const value = pair.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            args[key] = value;
          }
        }
      }

      // Only include if we extracted useful arguments
      if (Object.keys(args).length > 0 || argsStr.length > 0) {
        results.push({
          id: this.nextId(),
          name,
          arguments: args,
          raw: match[0],
          confidence: 0.5,
          strategy: 'content-scan'
        });
      }
    }

    return results;
  }
}

export const toolCallParser = new ToolCallParser();
