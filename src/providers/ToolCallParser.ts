/**
 * ToolCallParser - 파싱 전략 순차 적용
 *
 * 1) Native tool_calls (OpenAI/Anthropic 네이티브) + plain [{name,arguments}]
 * 2) XML 태그: <tool name="grep">{"pattern":"foo"}</tool>
 * 2b) <tool_code> / tool_code blocks (Qwen/local models)
 * 2c) Bare: tool_name\\n{json args}
 * 3) JSON 펜스: ```json\n{"name":"grep","arguments":{...}}\n```
 * 4) Bare JSON array/object: [{"name":"glob","arguments":{...}}]
 * 5) 이중 인코딩
 */

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  raw: string;
  confidence: number; // 0-1
  strategy:
    | 'native'
    | 'xml'
    | 'tool-code'
    | 'name-json'
    | 'json-fence'
    | 'json-array'
    | 'double-encoded'
    | 'content-scan';
}

/** Tools we accept when recovering from free-text dumps (keep in sync with registry names) */
const RECOVERABLE_TOOL_NAMES = [
  'grep',
  'glob',
  'file_search',
  'list_dir',
  'read_file',
  'read_files',
  'codebase_search',
  'lsp_definition',
  'lsp_references',
  'read_lints',
  'edit_file',
  'write_file',
  'delete_file',
  'run_terminal_cmd',
  'terminal_output',
  'ask_question',
  'todo_write',
  'switch_mode',
  'web_search',
  'web_fetch'
];

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

    // Strategy 2: XML tags <tool name="...">
    const xml = this.parseXmlTags(content);
    results.push(...xml);

    // Strategy 2b: <tool_code>...</tool_code> / tool_code blocks
    if (results.length === 0) {
      results.push(...this.parseToolCodeBlocks(content));
    }

    // Strategy 2c: known_tool_name\n{...json...}
    if (results.length === 0) {
      results.push(...this.parseNameThenJson(content));
    }

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

  /**
   * Qwen / local models often emit:
   *   <tool_code>
   *   run_terminal_cmd
   *   {"cmd":"..."}
   *   </tool_code>
   * or the same without closing tags.
   */
  private parseToolCodeBlocks(content: string): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    const blocks: string[] = [];

    const paired =
      /<tool[_-]?code[^>]*>([\s\S]*?)<\/tool[_-]?code>/gi;
    let m: RegExpExecArray | null;
    while ((m = paired.exec(content)) !== null) {
      blocks.push(m[1]);
    }

    // Unclosed / label-only: tool_code\nNAME\n{...}
    const loose =
      /(?:^|\n)\s*(?:<\/?tool[_-]?code>?|tool_code)\s*\n([\s\S]*?)(?=\n\s*(?:<\/?tool[_-]?code>?|tool_code)\s*(?:\n|$)|$)/gi;
    while ((m = loose.exec(content)) !== null) {
      const body = m[1].trim();
      if (body && !blocks.some((b) => b.includes(body.slice(0, 40)))) {
        blocks.push(body);
      }
    }

    for (const body of blocks) {
      const call = this.parseToolNameAndJsonBody(body.trim());
      if (call) {
        results.push({
          ...call,
          id: this.nextId(),
          confidence: 0.93,
          strategy: 'tool-code'
        });
      }
    }
    return results;
  }

  /** known_tool\\n{json} anywhere in the assistant message */
  private parseNameThenJson(content: string): ParsedToolCall[] {
    const results: ParsedToolCall[] = [];
    const names = RECOVERABLE_TOOL_NAMES.join('|');
    const re = new RegExp(
      `(?:^|\\n)\\s*(${names})\\s*\\n\\s*(\\{[\\s\\S]*?\\})\\s*(?=\\n|$)`,
      'gi'
    );
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const name = match[1].trim();
      const jsonStr = this.extractBalancedJsonObject(match[2], 0) || match[2];
      try {
        const args = JSON.parse(jsonStr);
        if (args && typeof args === 'object') {
          results.push({
            id: this.nextId(),
            name,
            arguments: this.normalizeRecoveredArgs(name, args),
            raw: match[0],
            confidence: 0.9,
            strategy: 'name-json'
          });
        }
      } catch {
        /* skip */
      }
    }
    return results;
  }

  private parseToolNameAndJsonBody(
    body: string
  ): { name: string; arguments: Record<string, any>; raw: string } | null {
    const trimmed = body.trim();
    if (!trimmed) return null;

    // Optional leading "tool_code" / "invoke" noise
    const cleaned = trimmed
      .replace(/^(?:tool_code|invoke|function_call)\s*\n?/i, '')
      .trim();

    const lines = cleaned.split(/\n/);
    let name = '';
    let jsonStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (!name && RECOVERABLE_TOOL_NAMES.includes(line)) {
        name = line;
        continue;
      }
      if (line.startsWith('{')) {
        jsonStart = cleaned.indexOf(line);
        if (!name && i > 0) {
          const prev = lines[i - 1].trim();
          if (RECOVERABLE_TOOL_NAMES.includes(prev)) name = prev;
        }
        break;
      }
    }
    if (!name) {
      // First token then JSON on same/next lines: run_terminal_cmd {"cmd":...}
      const sameLine = cleaned.match(
        new RegExp(
          `^(${RECOVERABLE_TOOL_NAMES.join('|')})\\s+(\\{[\\s\\S]*\\})\\s*$`,
          'i'
        )
      );
      if (sameLine) {
        name = sameLine[1];
        try {
          const args = JSON.parse(sameLine[2]);
          return {
            name,
            arguments: this.normalizeRecoveredArgs(name, args),
            raw: cleaned
          };
        } catch {
          return null;
        }
      }
      return null;
    }
    if (jsonStart < 0) return null;
    const jsonStr = this.extractBalancedJsonObject(cleaned, jsonStart);
    if (!jsonStr) return null;
    try {
      const args = JSON.parse(jsonStr);
      return {
        name,
        arguments: this.normalizeRecoveredArgs(name, args),
        raw: cleaned
      };
    } catch {
      return null;
    }
  }

  /** Map common LLM arg aliases (cmd→command, etc.) */
  private normalizeRecoveredArgs(
    name: string,
    args: Record<string, any>
  ): Record<string, any> {
    const out = { ...args };
    if (name === 'run_terminal_cmd') {
      if (out.command == null && out.cmd != null) out.command = out.cmd;
      if (out.command == null && out.shell != null) out.command = out.shell;
    }
    if (
      (name === 'read_file' ||
        name === 'write_file' ||
        name === 'edit_file' ||
        name === 'delete_file') &&
      out.path == null
    ) {
      out.path =
        out.file_path || out.target_file || out.filepath || out.file || out.path;
    }
    if (name === 'write_file' && out.content == null && out.contents != null) {
      out.content = out.contents;
    }
    if (name === 'read_files') {
      const asList = (raw: unknown): string[] => {
        if (Array.isArray(raw)) {
          return raw.map((p) => String(p ?? '').trim()).filter(Boolean);
        }
        if (typeof raw === 'string' && raw.trim()) {
          const t = raw.trim();
          if (t.startsWith('[')) {
            try {
              const parsed = JSON.parse(t);
              if (Array.isArray(parsed)) {
                return parsed.map((p) => String(p ?? '').trim()).filter(Boolean);
              }
            } catch {
              /* ignore */
            }
          }
          return [t];
        }
        return [];
      };
      for (const key of ['paths', 'files', 'file_paths', 'filePaths', 'path', 'file']) {
        const list = asList(out[key]);
        if (list.length) {
          out.paths = list;
          break;
        }
      }
    }
    return out;
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
