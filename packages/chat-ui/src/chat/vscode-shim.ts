/**
 * Webview-side shim — real `vscode` API is only available in the extension host.
 * Chat UI talks to the host via postMessage; modules that import vscode get no-ops here.
 */
const noop = () => undefined;
const asyncNoop = async () => undefined;

const uri = {
  file: (p: string) => ({ fsPath: p, scheme: 'file', path: p }),
  joinPath: (...parts: any[]) => parts[parts.length - 1],
  parse: (s: string) => ({ fsPath: s, scheme: 'file', path: s })
};

export const workspace = {
  workspaceFolders: [] as any[],
  fs: {
    readFile: asyncNoop,
    writeFile: asyncNoop,
    createDirectory: asyncNoop,
    readDirectory: async () => [],
    stat: asyncNoop,
    delete: asyncNoop
  },
  getConfiguration: () => ({
    get: (_k: string, d?: unknown) => d,
    update: asyncNoop
  }),
  onDidChangeConfiguration: () => ({ dispose: noop }),
  findFiles: async () => []
};

export const window = {
  showInformationMessage: asyncNoop,
  showErrorMessage: asyncNoop,
  showWarningMessage: asyncNoop,
  createOutputChannel: () => ({ appendLine: noop, show: noop, dispose: noop }),
  registerWebviewViewProvider: noop
};

export const Uri = uri;
export const FileType = { File: 1, Directory: 2, SymbolicLink: 64 };
export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
export const commands = { executeCommand: asyncNoop };

export default { workspace, window, Uri, FileType, ConfigurationTarget, commands };
