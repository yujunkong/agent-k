/**
 * EXT-002 — top-level Chat UI shell (entry surface for agent-k.chat).
 * Posts ui.ready on mount; shows Connected from host.hello.
 * Composer / timeline land in later CHAT-* / CONV-* Features.
 */

import { useEffect, useState, type JSX } from 'react';
import { PROTOCOL_VERSION } from '@agent-k/shared';
import { getVsCodeApi } from './vscodeApi';
import './shell.css';

type ShellPhase = 'pending' | 'ok' | 'error';

/** Loose host.hello shape so protocol mismatch can surface in the UI. */
function readHostHello(
  raw: unknown,
): { protocolVersion: number; extensionVersion: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const msg = raw as Record<string, unknown>;
  if (msg.type !== 'host.hello') return undefined;
  if (typeof msg.protocolVersion !== 'number') return undefined;
  if (typeof msg.extensionVersion !== 'string') return undefined;
  return {
    protocolVersion: msg.protocolVersion,
    extensionVersion: msg.extensionVersion,
  };
}

export function Shell(): JSX.Element {
  const [phase, setPhase] = useState<ShellPhase>('pending');
  const [detail, setDetail] = useState('Waiting for host.hello…');

  useEffect(() => {
    const api = getVsCodeApi();

    const onMessage = (event: MessageEvent): void => {
      const hello = readHostHello(event.data);
      if (!hello) return;
      if (hello.protocolVersion !== PROTOCOL_VERSION) {
        setPhase('error');
        setDetail(`Protocol mismatch (got v${hello.protocolVersion})`);
        return;
      }
      setPhase('ok');
      setDetail(
        `Connected — extension ${hello.extensionVersion} (protocol v${hello.protocolVersion})`,
      );
    };

    window.addEventListener('message', onMessage);
    // SHARED-001 handshake — required before any chat feature work.
    api.postMessage({ type: 'ui.ready', protocolVersion: PROTOCOL_VERSION });

    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return (
    <main className="ak-shell" data-testid="chat-shell">
      <header className="ak-shell__brand">
        <h1 className="ak-shell__title">Agent K</h1>
        <p className="ak-shell__subtitle">Chat view shell (EXT-002)</p>
      </header>
      <div
        className="ak-shell__status"
        data-state={phase}
        data-testid="chat-shell-status"
        role="status"
      >
        {detail}
      </div>
    </main>
  );
}
