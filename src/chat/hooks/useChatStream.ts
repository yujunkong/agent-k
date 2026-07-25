import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, Mode, Attachment, StreamDelta } from '../types';

interface UseChatStreamOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

interface UseChatStreamReturn {
  streaming: boolean;
  sendMessage: (
    text: string,
    files: Attachment[],
    messages: ChatMessage[],
    mode: Mode,
    onDelta: (delta: StreamDelta) => void,
    onComplete: () => void,
    onError: (err: string) => void
  ) => Promise<void>;
  stop: () => void;
  regenerate: (
    messages: ChatMessage[],
    mode: Mode,
    onDelta: (delta: StreamDelta) => void,
    onComplete: () => void,
    onError: (err: string) => void
  ) => Promise<void>;
}

export function useChatStream(options: UseChatStreamOptions = {}): UseChatStreamReturn {
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (
      text: string,
      files: Attachment[],
      messages: ChatMessage[],
      mode: Mode,
      onDelta: (delta: StreamDelta) => void,
      onComplete: () => void,
      onError: (err: string) => void
    ) => {
      abortRef.current = new AbortController();
      setStreaming(true);

      try {
        const response = await fetch(`${options.baseUrl || 'http://localhost:4000'}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(options.apiKey ? { 'Authorization': `Bearer ${options.apiKey}` } : {})
          },
          body: JSON.stringify({
            model: options.model || 'gemma-2-27b',
            messages: messages.map(m => ({
              role: m.role,
              content: m.content
            })),
            stream: true,
            temperature: 0.7,
            max_tokens: 4096
          }),
          signal: abortRef.current.signal
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`API Error: ${response.status} - ${error}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                  onComplete();
                  return;
                }
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta;
                  if (delta?.content) {
                    onDelta({ content: delta.content });
                  }
                } catch {
                  // Ignore parse errors for incomplete JSON
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          onDelta({ error: 'Stream aborted', done: true });
        } else {
          onError(e instanceof Error ? e.message : 'Unknown error');
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [options.baseUrl, options.apiKey, options.model]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const regenerate = useCallback(async (
    messages: ChatMessage[],
    mode: Mode,
    onDelta: (delta: StreamDelta) => void,
    onComplete: () => void,
    onError: (err: string) => void
  ) => {
    // Find last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    const idx = messages.findIndex(m => m.id === lastUserMsg.id);
    const newMessages = messages.slice(0, idx + 1);

    await sendMessage(
      lastUserMsg.content,
      lastUserMsg.attachments || [],
      newMessages,
      mode,
      onDelta,
      onComplete,
      onError
    );
  }, [sendMessage]);

  return {
    streaming,
    sendMessage,
    stop,
    regenerate
  };
}