/**
 * CHAT-001 / CHAT-002 — ChatApp unit tests (jsdom).
 *
 * Rewritten against the CURRENT product contract (v3.0 port):
 *   - Mount posts `model.context.refresh` + `host.sessions.ready` (no `ui.ready`,
 *     no `host.hello` handshake — composer is not handshake-gated).
 *   - `chat.send` uses the SHARED-001 nested payload `{ payload: { requestId, ... } }`.
 *   - `config.update` is the batch `{ values: {...} }` shape (SettingsUI.persistToHost).
 *   - No `data-testid` chrome — assertions use roles / text / stable classes.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatApp } from './ChatApp';
import { setVsCodeApiForTests, type VsCodeApi } from './vscodeApi';

function isPostedType(m: unknown, type: string): boolean {
  return typeof m === 'object' && m !== null && (m as { type?: string }).type === type;
}

function postedOfType<T = Record<string, unknown>>(posted: unknown[], type: string): T[] {
  return posted.filter((m) => isPostedType(m, type)) as T[];
}

/** Host → webview config hydration (same shape the extension host posts). */
function hydrateProviderConfig() {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        type: 'config.hydrate',
        values: {
          'agent-k.provider.model': 'local-qwen',
          'agent-k.provider.baseUrl': 'http://127.0.0.1:4000',
        },
      },
    }),
  );
}

/** Wait until the composer model picker reflects the hydrated model. */
async function waitForHydratedModel() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Model: local-qwen' })).toBeTruthy();
  });
}

type ChatSendMsg = {
  payload: {
    requestId: string;
    model: string;
    baseUrl: string;
    messages: Array<{ role: string; content: string }>;
  };
};

describe('CHAT-001 ChatApp shell', () => {
  let posted: unknown[];

  /** Type into the composer and submit; resolves once chat.send is posted. */
  async function sendViaComposer(text: string): Promise<ChatSendMsg> {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    let sent: ChatSendMsg | undefined;
    await waitFor(() => {
      sent = postedOfType(posted, 'chat.send')[0] as ChatSendMsg | undefined;
      expect(sent).toBeTruthy();
    });
    return sent!;
  }

  /** Hydrate provider credentials, then send through the composer. */
  async function hydrateAndSend(text: string) {
    hydrateProviderConfig();
    await waitForHydratedModel();
    return sendViaComposer(text);
  }

  beforeEach(() => {
    posted = [];
    localStorage.clear();
    const api: VsCodeApi = {
      postMessage: (message: unknown) => {
        posted.push(message);
      },
      getState: () => undefined,
      setState: () => undefined,
    };
    setVsCodeApiForTests(api);
    // SettingsUI.persistToHost posts via window.parent.postMessage (not the
    // acquireVsCodeApi singleton) — capture that channel too.
    vi.spyOn(window, 'postMessage').mockImplementation((m) => {
      posted.push(m);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setVsCodeApiForTests(undefined);
  });

  it('posts model.context.refresh + host.sessions.ready on mount and renders shell chrome', () => {
    render(<ChatApp />);

    // Mount contract (useChatProvider / useChatSessions) — no ui.ready, no handshake.
    expect(posted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'model.context.refresh',
          providerType: 'litellm',
          baseUrl: '',
          model: '',
        }),
        expect.objectContaining({ type: 'host.sessions.ready' }),
      ]),
    );

    // Shell chrome — stable classes (no data-testid in current product).
    expect(document.querySelector('.chat-container')).toBeTruthy();
    expect(document.querySelector('.chat-shell')).toBeTruthy();
    expect(document.querySelector('.chat-rail')).toBeTruthy();
    expect(document.querySelector('.message-list')).toBeTruthy();
    // Composer is present and enabled on mount (not handshake-gated).
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('enables composer on input and swaps Send for Stop while a stream is active', async () => {
    render(<ChatApp />);

    // Textarea is enabled on mount; Send is gated only by empty input (canSend),
    // not by any host handshake.
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    await hydrateAndSend('stream me');

    // Drive the stream through the real host contract: chat.stream keyed by the
    // requestId the webview just posted.
    const sent = postedOfType<{ payload: { requestId: string } }>(posted, 'chat.send')[0];
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'chat.stream',
          payload: { requestId: sent.payload.requestId, event: 'delta', content: 'partial answer' },
        },
      }),
    );

    // composerBusy → Send control is replaced by Stop chrome.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Stop' }).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('CHAT-002 sends chat.send (nested SHARED-001 payload) and shows user bubble', async () => {
    render(<ChatApp />);
    const sent = await hydrateAndSend('hello from test');

    // User bubble renders the raw input text (tab title shows it too).
    const bubble = document.querySelector('.user-turn__text');
    expect(bubble?.textContent).toBe('hello from test');

    // Nested payload shape — host reads msg.payload (flat send crashed → stuck stream).
    expect(sent.payload.requestId).toMatch(/^host_/);
    expect(sent.payload.model).toBe('local-qwen');
    expect(sent.payload.baseUrl).toBe('http://127.0.0.1:4000');
    const lastMsg = sent.payload.messages[sent.payload.messages.length - 1];
    expect(lastMsg.role).toBe('user');
    // Harness/context assembly may prefix the outbound payload — assert containment.
    expect(lastMsg.content).toContain('hello from test');
  });

  it('shows the error line from a chat.stream error event', async () => {
    render(<ChatApp />);
    await hydrateAndSend('trigger an error');

    const sent = postedOfType<{ payload: { requestId: string } }>(posted, 'chat.send')[0];
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'chat.stream',
          payload: {
            requestId: sent.payload.requestId,
            event: 'error',
            error: 'Host tool loop exploded in test',
          },
        },
      }),
    );

    // onError paints the error banner (role="alert") and the assistant error turn.
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Host tool loop exploded in test');
    });
  });

  it('SET-001 opens the Settings panel from the header More menu', async () => {
    render(<ChatApp />);

    // Settings lives behind the tab-strip "More" menu (no dedicated gear button).
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));

    // Overlay dialog + redesigned settings hub with the AI Providers tab active.
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    expect(document.querySelector('.settings-panel')).toBeTruthy();
    expect(screen.getByRole('button', { name: /AI Providers/ })).toBeTruthy();
  });

  it('SET-002 saves settings via the batch config.update contract', async () => {
    render(<ChatApp />);

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Queue/ }));

    const debounce = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(debounce, { target: { value: '450' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // Batch contract: { type:'config.update', values: {...} } (SettingsUI.persistToHost).
    const updates = postedOfType<{ type: string; values?: Record<string, unknown> }>(
      posted,
      'config.update',
    );
    expect(
      updates.some((u) => u.values && u.values['agent-k.queue.debounceMs'] === 450),
    ).toBe(true);
  });
});
