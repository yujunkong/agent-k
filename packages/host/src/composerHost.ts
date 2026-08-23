/**
 * HOST-003 — Composer host helpers (vscode-only; no ModelRouter).
 */

import * as vscode from 'vscode';
import { hostLog } from './hostLog';

/** Open a workspace-relative or absolute path in the editor (optional line reveal). */
export async function openWorkspaceFile(
  filePath: string,
  opts?: { startLine?: number; endLine?: number },
): Promise<void> {
  try {
    // Dynamic fs import keeps unit tests from requiring node types at compile of callers.
    const fs = await import('node:fs');
    const pathMod = await import('node:path');
    let uri = toOpenUri(filePath);
    if (!fs.existsSync(uri.fsPath)) {
      const folders = vscode.workspace.workspaceFolders;
      if (folders?.[0] && !filePath.includes('://') && !pathMod.isAbsolute(filePath)) {
        uri = vscode.Uri.joinPath(folders[0].uri, filePath);
      }
    }

    // Comment: CHAT-012 — image/binary chips must not use showTextDocument
    if (isBinaryOpenPath(uri.fsPath)) {
      await vscode.commands.executeCommand('vscode.open', uri);
      return;
    }

    const editor = await vscode.window.showTextDocument(uri, { preview: true });
    // Comment: selection chips / paste stash carry 1-based line range
    if (opts?.startLine != null && opts.startLine >= 1) {
      const startLine = opts.startLine - 1;
      const endLine = Math.max(startLine, (opts.endLine ?? opts.startLine) - 1);
      const start = new vscode.Position(startLine, 0);
      const end = editor.document.lineAt(endLine).range.end;
      const range = new vscode.Range(start, end);
      editor.selection = new vscode.Selection(start, end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Agent K: could not open file — ${msg}`);
  }
}

/** Accept absolute path or file:// URI from Composer chips. */
function toOpenUri(filePath: string): vscode.Uri {
  const raw = String(filePath || '').trim();
  if (!raw) return vscode.Uri.file(raw);
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return vscode.Uri.parse(raw);
  }
  return vscode.Uri.file(raw);
}

function isBinaryOpenPath(fsPath: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|ico|svg|pdf|zip|gz|tgz|wasm|dylib|so|dll|exe|bin)$/i.test(
    fsPath,
  );
}

/**
 * Open dialog to pick files/folders (works without Shift+drop into webview).
 */
export async function pickAttachmentUris(
  webview: vscode.Webview | undefined,
  requestId: string,
): Promise<void> {
  if (!webview) return;

  const uris = await vscode.window.showOpenDialog({
    canSelectMany: true,
    canSelectFiles: true,
    canSelectFolders: true,
    openLabel: 'Attach',
    title: 'Attach files or folders to Agent K',
  });

  if (!uris?.length) {
    void webview.postMessage({
      type: 'attachments.resolve.result',
      requestId,
      results: [],
    });
    return;
  }

  await resolveAttachmentUris(
    webview,
    requestId,
    uris.map((u) => u.toString()),
  );
}

/**
 * Composer `@` file/folder picker — workspace search (built-in).
 */
export async function handleComposerSearch(
  webview: vscode.Webview | undefined,
  requestId: string,
  query: string,
  kind: 'file' | 'folder',
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
        if (!q || baseLower.includes(q) || relLower.includes(q)) {
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
            score,
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
        if (q && !folderLower.includes(q) && !folderBaseLower.includes(q)) {
          continue;
        }
        folderSeen.add(folderRel);
        if (kind === 'file' && q && !folderBaseLower.includes(q)) {
          if (!folderLower.endsWith('/' + q) && folderBaseLower !== q) continue;
        }
        let score = 0;
        if (folderBaseLower === q) score = 95;
        else if (folderBaseLower.startsWith(q)) score = 75;
        else if (folderBaseLower.includes(q)) score = 55;
        else score = 20;
        const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
        const root = wsFolder?.uri || vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!root) continue;
        const folderUri = vscode.Uri.joinPath(root, ...folderRel.split('/'));
        hits.push({
          kind: 'folder',
          path: folderUri.fsPath,
          label: folderBase,
          description: folderRel,
          score,
        });
      }
    }

    hits.sort(
      (a, b) => b.score - a.score || a.description.localeCompare(b.description),
    );
    const results = hits
      .slice(0, 40)
      .map(({ kind: k, path, label, description }) => ({
        kind: k,
        path,
        label,
        description,
      }));

    void webview.postMessage({
      type: 'composer.search.result',
      requestId,
      query,
      results,
    });
  } catch (err) {
    void webview.postMessage({
      type: 'composer.search.result',
      requestId,
      query,
      results: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Webview drag/drop: turn file:// (or absolute) URIs into workspace paths + type.
 */
export async function resolveAttachmentUris(
  webview: vscode.Webview | undefined,
  requestId: string,
  uris: string[],
): Promise<void> {
  if (!webview) return;

  const fs = await import('node:fs');
  const results: Array<{ path: string; type: 'file' | 'folder'; uri?: string }> =
    [];

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
    results,
  });
}

/**
 * CHAT-005 — multi-line paste → file chip using copy-time path stash.
 * Path is captured on Cmd/Ctrl+C in the editor, not from the active file at paste.
 */
export async function matchPasteAttachment(
  webview: vscode.Webview | undefined,
  requestId: string,
  content: string,
): Promise<void> {
  if (!webview) return;

  const { matchPasteToCopyStash } = await import('./editorCopyStash');
  const hit = matchPasteToCopyStash(content);
  void webview.postMessage({
    type: 'attachments.matchPaste.result',
    requestId,
    item: hit
      ? {
          id: `sel_${Date.now().toString(36)}`,
          type: 'file',
          path: hit.path,
          label: hit.label,
          content: hit.content,
          startLine: hit.startLine,
          endLine: hit.endLine,
        }
      : undefined,
  });
}

const MAX_CAPTURE_BYTES = 20 * 1024 * 1024;

function mimeToExt(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'png';
}

/**
 * CHAT-012 — persist clipboard/drop image bytes under OS temp for Composer chip + vision send.
 */
export async function saveClipboardImage(
  webview: vscode.Webview | undefined,
  requestId: string,
  mimeType: string,
  dataBase64: string,
  fileName?: string,
): Promise<void> {
  if (!webview) return;

  try {
    const raw = String(dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!raw) {
      hostLog('composer.attach', `saveImage empty requestId=${requestId}`);
      void webview.postMessage({
        type: 'attachments.saveImage.result',
        requestId,
        error: 'empty image data',
      });
      return;
    }
    const buf = Buffer.from(raw, 'base64');
    hostLog(
      'composer.attach',
      `saveImage bytes=${buf.length} mime=${mimeType} requestId=${requestId}`,
    );
    await writeCaptureAndReply(webview, requestId, buf, mimeType, fileName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    hostLog('composer.attach', `saveImage FAIL requestId=${requestId} err=${msg}`);
    void webview.postMessage({
      type: 'attachments.saveImage.result',
      requestId,
      error: msg,
    });
  }
}

/**
 * CHAT-012 — read image from OS clipboard.
 * VS Code extension host cannot `require('electron')` — use platform scripts
 * (vscode-paste-image pattern: osascript PNGf / powershell / xclip).
 */
export async function readClipboardImage(
  webview: vscode.Webview | undefined,
  requestId: string,
): Promise<void> {
  if (!webview) return;
  const purpose = 'composer.attach';
  try {
    const path = await import('node:path');
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const dest = path.join(
      os.tmpdir(),
      'agent-k-captures',
      `capture_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`,
    );
    await fs.mkdir(path.dirname(dest), { recursive: true });

    hostLog(
      purpose,
      `clipboard.read start requestId=${requestId} platform=${process.platform} dest=${dest}`,
    );

    const result = await saveOsClipboardPngToFile(dest);
    hostLog(
      purpose,
      `clipboard.read result requestId=${requestId} status=${result}`,
    );

    if (result !== 'ok') {
      void webview.postMessage({
        type: 'attachments.saveImage.result',
        requestId,
        error: result === 'no image' ? 'no image on clipboard' : result,
      });
      return;
    }

    const st = await fs.stat(dest);
    if (!st.size) {
      void webview.postMessage({
        type: 'attachments.saveImage.result',
        requestId,
        error: 'clipboard png empty',
      });
      return;
    }

    void webview.postMessage({
      type: 'attachments.saveImage.result',
      requestId,
      item: {
        path: dest,
        mimeType: 'image/png',
        type: 'image',
        label: path.basename(dest),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    hostLog(purpose, `clipboard.read FAIL requestId=${requestId} err=${msg}`);
    void webview.postMessage({
      type: 'attachments.saveImage.result',
      requestId,
      error: msg,
    });
  }
}

/** AppleScript: argv[1] = dest PNG path. stdout: ok | no image | error */
const MAC_CLIPBOARD_PNG_SCRIPT = [
  'on run argv',
  '  if (count of argv) is 0 then',
  '    return "no path"',
  '  end if',
  '  set imagePath to (item 1 of argv) as string',
  '  try',
  '    set pngData to the clipboard as «class PNGf»',
  '  on error',
  '    return "no image"',
  '  end try',
  '  try',
  '    set outFile to POSIX file imagePath',
  '    set fileRef to open for access outFile with write permission',
  '    set eof of fileRef to 0',
  '    write pngData to fileRef',
  '    close access fileRef',
  '    return "ok"',
  '  on error errMsg',
  '    try',
  '      close access fileRef',
  '    end try',
  '    return errMsg as string',
  '  end try',
  'end run',
  '',
].join('\n');

/** @returns ok | no image | error text */
async function saveOsClipboardPngToFile(destPath: string): Promise<string> {
  const { spawn } = await import('node:child_process');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const os = await import('node:os');
  const platform = process.platform;

  if (platform === 'darwin') {
    // Comment: write temp .applescript — multiline -e is fragile; no electron in EH
    const scriptPath = path.join(
      os.tmpdir(),
      `agent-k-clip-${Date.now()}_${Math.random().toString(36).slice(2, 6)}.applescript`,
    );
    await fs.writeFile(scriptPath, MAC_CLIPBOARD_PNG_SCRIPT, 'utf8');
    return await new Promise((resolve) => {
      const child = spawn('osascript', [scriptPath, destPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        err += d.toString();
      });
      child.on('error', (e) => resolve(`osascript spawn: ${e.message}`));
      child.on('close', (code) => {
        void fs.unlink(scriptPath).catch(() => undefined);
        const text = out.trim() || err.trim();
        if (code !== 0 && !text) resolve(`osascript exit ${code}`);
        else resolve(text || 'no image');
      });
    });
  }

  if (platform === 'win32') {
    // PowerShell: clipboard image → PNG file
    const ps = [
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      '$img = [System.Windows.Forms.Clipboard]::GetImage()',
      'if ($img -eq $null) { Write-Output "no image"; exit 0 }',
      `$img.Save(${JSON.stringify(destPath)}, [System.Drawing.Imaging.ImageFormat]::Png)`,
      'Write-Output "ok"',
    ].join('; ');
    return await new Promise((resolve) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', ps],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let out = '';
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString();
      });
      child.on('error', (e) => resolve(`powershell: ${e.message}`));
      child.on('close', () => resolve(out.trim() || 'no image'));
    });
  }

  // Linux: xclip
  return await new Promise((resolve) => {
    const child = spawn(
      'sh',
      [
        '-c',
        `xclip -selection clipboard -t image/png -o > ${JSON.stringify(destPath)} 2>/dev/null && echo ok || echo "no image"`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.on('error', () => resolve('no xclip'));
    child.on('close', () => resolve(out.trim() || 'no image'));
  });
}

async function writeCaptureAndReply(
  webview: vscode.Webview,
  requestId: string,
  buf: Buffer,
  mimeType: string,
  fileName?: string,
): Promise<void> {
  if (buf.length > MAX_CAPTURE_BYTES) {
    void webview.postMessage({
      type: 'attachments.saveImage.result',
      requestId,
      error: `image too large (>${MAX_CAPTURE_BYTES} bytes)`,
    });
    return;
  }
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const os = await import('node:os');
  const ext = mimeToExt(mimeType || 'image/png');
  const dir = path.join(os.tmpdir(), 'agent-k-captures');
  await fs.mkdir(dir, { recursive: true });
  const safeName =
    fileName && /\.(png|jpe?g|gif|webp)$/i.test(fileName)
      ? fileName.replace(/[^\w.\-]+/g, '_')
      : `capture_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = path.join(dir, safeName);
  await fs.writeFile(filePath, buf);
  void webview.postMessage({
    type: 'attachments.saveImage.result',
    requestId,
    item: {
      path: filePath,
      mimeType: mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      type: 'image',
      label: safeName,
    },
  });
}
