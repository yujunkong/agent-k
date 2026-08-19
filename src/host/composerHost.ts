import * as vscode from 'vscode';

export async function openWorkspaceFile(filePath: string): Promise<void> {
  try {
    const fs = await import('fs');
    let uri = vscode.Uri.file(filePath);
    if (!fs.existsSync(filePath)) {
      const folders = vscode.workspace.workspaceFolders;
      if (folders?.[0]) {
        uri = vscode.Uri.joinPath(folders[0].uri, filePath);
      }
    }
    await vscode.window.showTextDocument(uri, { preview: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Agent K: could not open file — ${msg}`);
  }
}

/**
 * Open dialog to pick files/folders (works without Shift+drop into webview).
 */
export async function pickAttachmentUris(webview: vscode.Webview | undefined, requestId: string): Promise<void> {
  if (!webview) return;

  const uris = await vscode.window.showOpenDialog({
    canSelectMany: true,
    canSelectFiles: true,
    canSelectFolders: true,
    openLabel: 'Attach',
    title: 'Attach files or folders to Agent K'
  });

  if (!uris?.length) {
    void webview.postMessage({
      type: 'attachments.resolve.result',
      requestId,
      results: []
    });
    return;
  }

  await resolveAttachmentUris(
    webview,
    requestId,
    uris.map((u) => u.toString())
  );
}

/**
 * Composer `@` file/folder picker — workspace search (built-in).
 */
export async function handleComposerSearch(
  webview: vscode.Webview | undefined,
  requestId: string,
  query: string,
  kind: 'file' | 'folder'
): Promise<void> {
  if (!webview) return;

  const q = query.trim().toLowerCase().replace(/\\/g, '/');
  const exclude =
    '**/{node_modules,.git,dist,out,build,.next,coverage,.agentk,venv,.venv}/**';

  type Hit = {
    kind: 'file' | 'folder';
    path: string;
    label: string;
    description: string;
    score: number;
  };
  const hits: Hit[] = [];
  const folderSeen = new Set<string>();

  try {
    const uris = await vscode.workspace.findFiles('**/*', exclude, 1200);
    for (const uri of uris) {
      const abs = uri.fsPath;
      const rel = vscode.workspace.asRelativePath(uri).replace(/\\/g, '/');
      const base = rel.split('/').pop() || rel;
      const relLower = rel.toLowerCase();
      const baseLower = base.toLowerCase();

      if (kind !== 'folder') {
        if (
          !q ||
          baseLower.includes(q) ||
          relLower.includes(q)
        ) {
          let score = 0;
          if (baseLower === q) score = 100;
          else if (baseLower.startsWith(q)) score = 80;
          else if (baseLower.includes(q)) score = 60;
          else if (relLower.includes(q)) score = 40;
          else score = 10;
          hits.push({
            kind: 'file',
            path: abs,
            label: base,
            description: rel,
            score
          });
        }
      }

      const parts = rel.split('/');
      for (let i = 1; i < parts.length; i++) {
        const folderRel = parts.slice(0, i).join('/');
        if (folderSeen.has(folderRel)) continue;
        const folderBase = parts[i - 1] || folderRel;
        const folderLower = folderRel.toLowerCase();
        const folderBaseLower = folderBase.toLowerCase();
        if (
          q &&
          !folderLower.includes(q) &&
          !folderBaseLower.includes(q)
        ) {
          continue;
        }
        folderSeen.add(folderRel);
        if (kind === 'file' && q && !folderBaseLower.includes(q)) {
          // When searching files, only surface strongly matching folders
          if (!folderLower.endsWith('/' + q) && folderBaseLower !== q) continue;
        }
        let score = 0;
        if (folderBaseLower === q) score = 95;
        else if (folderBaseLower.startsWith(q)) score = 75;
        else if (folderBaseLower.includes(q)) score = 55;
        else score = 20;
        const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
        const root =
          wsFolder?.uri || vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!root) continue;
        const folderUri = vscode.Uri.joinPath(root, ...folderRel.split('/'));
        hits.push({
          kind: 'folder',
          path: folderUri.fsPath,
          label: folderBase,
          description: folderRel,
          score
        });
      }
    }

    hits.sort((a, b) => b.score - a.score || a.description.localeCompare(b.description));
    const results = hits.slice(0, 40).map(({ kind: k, path, label, description }) => ({
      kind: k,
      path,
      label,
      description
    }));

    void webview.postMessage({
      type: 'composer.search.result',
      requestId,
      query,
      results
    });
  } catch (err) {
    void webview.postMessage({
      type: 'composer.search.result',
      requestId,
      query,
      results: [],
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * Webview drag/drop: turn file:// (or absolute) URIs into workspace paths + type.
 */
export async function resolveAttachmentUris(webview: vscode.Webview | undefined, requestId: string, uris: string[]): Promise<void> {
  if (!webview) return;

  const fs = await import('fs');
  const results: Array<{ path: string; type: 'file' | 'folder'; uri?: string }> = [];

  for (const raw of uris) {
    try {
      let fsPath = raw;
      if (raw.startsWith('file:') || raw.includes('://')) {
        fsPath = vscode.Uri.parse(raw).fsPath;
      }
      if (!fsPath) continue;
      let type: 'file' | 'folder' = 'file';
      try {
        const st = fs.statSync(fsPath);
        type = st.isDirectory() ? 'folder' : 'file';
      } catch {
        // Path may be outside workspace or missing — still attach as file chip
        if (/[\\/]$/.test(raw)) type = 'folder';
      }
      results.push({ path: fsPath, type, uri: raw });
    } catch {
      /* skip bad uri */
    }
  }

  void webview.postMessage({
    type: 'attachments.resolve.result',
    requestId,
    results
  });
}
