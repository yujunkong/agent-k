/**
 * InlineCompletionProvider — 인라인 완성 (C7-T27)
 *
 * InlineCompletionItemProvider로 등록, 동일 엔드포인트 사용
 */
import * as vscode from 'vscode';

export class AgentKInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private providerId: string;

  constructor(providerId: string = 'agent-k') {
    this.providerId = providerId;
  }

  /**
   * Provide inline completion items
   */
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
    const line = document.lineAt(position.line);
    const prefix = line.text.slice(0, position.character);
    const indent = line.text.match(/^\s*/)?.[0] ?? '';

    // Get context: previous few lines and current prefix
    const contextLines: string[] = [];
    const startLine = Math.max(0, position.line - 5);
    for (let i = startLine; i < position.line; i++) {
      contextLines.push(document.lineAt(i).text);
    }

    const suggestions = this.generateSuggestions(prefix, contextLines, indent, document.languageId);

    return suggestions.map(s => {
      const item = new vscode.InlineCompletionItem(s.text, s.range ?? new vscode.Range(position, position));
      item.filterText = s.filterText;
      return item;
    });
  }

  /**
   * Register with VS Code
   */
  register(context: vscode.ExtensionContext): vscode.Disposable {
    const disposable = vscode.languages.registerInlineCompletionItemProvider(
      { scheme: 'file', language: '*' },
      this
    );
    context.subscriptions.push(disposable);
    return disposable;
  }

  private generateSuggestions(
    prefix: string,
    contextLines: string[],
    indent: string,
    languageId: string
  ): Array<{ text: string; range?: vscode.Range; filterText?: string }> {
    const suggestions: Array<{ text: string; range?: vscode.Range; filterText?: string }> = [];

    // 1. Close brackets
    const bracketPairs: Record<string, string> = {
      '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`'
    };
    const lastChar = prefix.trimEnd().slice(-1);
    if (bracketPairs[lastChar]) {
      suggestions.push({ text: bracketPairs[lastChar] });
    }

    // 2. Close JSX tags
    if (languageId === 'typescriptreact' || languageId === 'javascriptreact') {
      const jsxMatch = prefix.match(/<(\w+)\b[^>]*$/);
      if (jsxMatch) {
        suggestions.push({ text: `</${jsxMatch[1]}>` });
      }
    }

    // 3. Continue common patterns
    if (prefix.trimEnd().endsWith('=>')) {
      suggestions.push({ text: ' {' });
    }
    if (prefix.trimEnd().endsWith('try')) {
      suggestions.push({ text: ' {\n' + indent + '  \n' + indent + '} catch (err) {\n' + indent + '  \n' + indent + '}' });
    }
    if (prefix.trimEnd().match(/^(if|while|for|switch)\s*\(/)) {
      suggestions.push({ text: ' {\n' + indent + '  \n' + indent + '}' });
    }
    if (prefix.trimEnd().endsWith('import ')) {
      suggestions.push({ text: '{  } from "' });
    }
    if (prefix.trimEnd().endsWith('from "')) {
      suggestions.push({ text: './' });
    }
    if (prefix.trimEnd().endsWith('function ')) {
      suggestions.push({ text: 'name() {\n' + indent + '  \n' + indent + '}' });
    }

    // 4. Common language constructs
    if (languageId === 'typescript' || languageId === 'javascript') {
      if (prefix.trimEnd().endsWith('const ')) {
        suggestions.push({ text: 'name = ' });
      }
      if (prefix.trimEnd().endsWith('console.')) {
        suggestions.push({ text: 'log(' });
        suggestions.push({ text: 'error(' });
        suggestions.push({ text: 'warn(' });
      }
    }

    if (languageId === 'python') {
      if (prefix.trimEnd().endsWith('def ')) {
        suggestions.push({ text: 'name():' });
      }
      if (prefix.trimEnd().endsWith('print')) {
        suggestions.push({ text: '(' });
      }
      if (prefix.trimEnd().endsWith('import ')) {
        suggestions.push({ text: 'os\nimport sys' });
      }
    }

    if (languageId === 'go') {
      if (prefix.trimEnd().endsWith('func ')) {
        suggestions.push({ text: 'name() {\n' + indent + '  \n' + indent + '}' });
      }
      if (prefix.trimEnd().endsWith('if err != nil')) {
        suggestions.push({ text: ' {\n' + indent + '  return err\n' + indent + '}' });
      }
    }

    return suggestions;
  }
}
