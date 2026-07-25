/**
 * Chat display sanitizers — strip model-emitted fake tool markup / JSON dumps
 * so bubbles never show tool-call payloads as the "answer".
 */

/** Known tool names the model may print as [name]...[/name] tags */
const FAKE_TOOL_NAMES = [
  'todo_write',
  'read_file',
  'edit_file',
  'write_file',
  'delete_file',
  'ask_question',
  'grep',
  'glob',
  'list_dir',
  'run_terminal_cmd',
  'read_lints',
  'codebase_search',
  'lsp_definition',
  'lsp_references',
  'switch_mode',
  'fetch_rules',
  'file_search',
] as const;

/**
 * Remove fake tool call tags and bare tool-call JSON the model dumps as plain text
 * (e.g. `[todo_write]...[/todo_write]` or `[{"name":"glob","arguments":{...}}]`).
 */
export function stripFakeToolMarkup(content: string): string {
  if (!content) return content;
  let out = content;

  for (const name of FAKE_TOOL_NAMES) {
    // Paired tags: [todo_write] ... [/todo_write]
    out = out.replace(
      new RegExp(`\\[${name}\\][\\s\\S]*?\\[\\/${name}\\]`, 'gi'),
      ''
    );
    // Orphan closing tags
    out = out.replace(new RegExp(`\\[\\/${name}\\]`, 'gi'), '');
    // Orphan opening + optional JSON/array payload on same stretch
    out = out.replace(
      new RegExp(
        `\\[${name}\\]\\s*(?:\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\})?`,
        'gi'
      ),
      ''
    );
  }

  // Bare JSON array of tool calls (the exact bug: shown as the whole answer)
  out = out.replace(
    /\[\s*\{\s*"name"\s*:\s*"[a-zA-Z0-9_]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}\s*(?:,\s*\{\s*"name"\s*:\s*"[a-zA-Z0-9_]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}\s*)*\]/g,
    ''
  );
  // Single tool object dump
  out = out.replace(
    /^\s*\{\s*"name"\s*:\s*"[a-zA-Z0-9_]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}\s*$/gm,
    ''
  );
  // Fenced tool JSON
  out = out.replace(/```(?:json)?\s*\n?\s*[\[{][\s\S]*?"name"\s*:[\s\S]*?```/gi, '');

  // Empty fenced blocks left after tag removal
  out = out.replace(/```[\w]*\r?\n\s*```/g, '');
  // Collapse excess blank lines
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}
