/**
 * EXT-001 — thin VSIX assembler entry.
 * Domain logic lives in @agent-k/host; this file only wires activate/deactivate.
 */

import type * as vscode from 'vscode';
import { activateAgentK, deactivateAgentK } from '@agent-k/host';

export function activate(context: vscode.ExtensionContext): void {
  activateAgentK(context);
}

export function deactivate(): void {
  deactivateAgentK();
}
