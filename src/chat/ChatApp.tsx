import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MessageBubble } from './components/MessageBubble';
import { Composer } from './components/Composer';
import { ModeSelector } from './components/ModeSelector';
import { VirtualList } from './components/VirtualList';
import { useChatStream } from './hooks/useChatStream';
import type { ChatMessage, Mode, StreamDelta, Attachment } from './types';
import './chat.css';

const MODE_LABELS: Record<Mode, string> = {
  ask: 'Ask',
  agent: 'Agent',
  plan: 'Plan',
  debug: 'Debug'
};

const MODE_TOOLTIPS: Record<Mode, string> = {
  ask: 'Read-only exploration. No file edits.',
  agent: 'Autonomous implementation. Tools: read, edit, terminal.',
  plan: 'Design first. Outputs PLAN.md with Mermaid.',
  debug: 'Hypothesis → Instrument → Reproduce → Minimal fix.'
};

const STORAGE_KEY = 'agent-k.chat.history';

export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [mode, setMode] = useState<Mode>('agent');
  const [error, setError] = useState<string | null>(null);

  const { streaming, sendMessage, stop, regenerate } = useChatStream();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  const handleSend = useCallback((text: string, files: Attachment[]) => {
    if (!text.trim() && files.length === 0) return;
    setError(null);
    
    sendMessage(
      text,
      files,
      messages,
      mode,
      // onDelta - handle streaming content
      (delta: StreamDelta) => {
        if (delta.content) {
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
              const newMsgs = [...prev];
              newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: newMsgs[lastIdx].content + delta.content! };
              return newMsgs;
            }
            return prev;
          });
        }
      },
      // onComplete - mark as complete
      () => {
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
            const newMsgs = [...prev];
            newMsgs[lastIdx] = { ...newMsgs[lastIdx], status: 'complete' };
            return newMsgs;
          }
          return prev;
        });
      },
      // onError
      (err: string) => {
        setError(err);
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
            const newMsgs = [...prev];
            newMsgs[lastIdx] = { ...newMsgs[lastIdx], status: 'error', content: err };
            return newMsgs;
          }
          return prev;
        });
      }
    );
  }, [messages, mode, sendMessage]);

  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      const newMessages = [...prev];
      newMessages.splice(idx + 1);
      newMessages[idx] = { ...newMessages[idx], content: newContent };
      return newMessages;
    });
    const msg = messages.find((m) => m.id === messageId);
    if (msg?.role === 'user') {
      handleSend(newContent, msg.attachments || []);
    }
  }, [messages, handleSend]);

  const handleRetry = useCallback((messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    const msg = messages[idx];
    if (!msg) return;
    setMessages((prev) => prev.slice(0, idx));
    if (msg.role === 'user') {
      handleSend(msg.content, msg.attachments || []);
    }
  }, [messages, handleSend]);

  const handleDelete = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const handleModeChange = useCallback((newMode: Mode) => {
    if (newMode !== mode) {
      setMode(newMode);
      setMessages([]);
    }
  }, [mode]);

  return (
    <div className="chat-container">
      <header className="chat-header">
        <ModeSelector
          value={mode}
          onChange={handleModeChange}
          disabled={streaming}
          labels={MODE_LABELS}
          tooltips={MODE_TOOLTIPS}
        />
        <div className="chat-actions">
          <button onClick={() => setMessages([])} title="New Chat" disabled={streaming}>
            ➕
          </button>
          <button onClick={() => localStorage.removeItem(STORAGE_KEY)} title="Clear History" disabled={streaming}>
            🗑️
          </button>
          <button onClick={() => (window as any).vscode?.commands?.executeCommand('workbench.action.openSettings', 'agent-k')} title="Settings">
            ⚙️
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <VirtualList
        items={messages}
        itemHeight={120}
        renderItem={(item, index) => (
          <MessageBubble
            key={item.id}
            message={item}
            isStreaming={streaming && messages[messages.length - 1]?.id === item.id}
            onEdit={handleEditMessage}
            onRetry={handleRetry}
            onDelete={handleDelete}
            onCopy={(content) => navigator.clipboard.writeText(content)}
          />
        )}
      />

      <footer className="chat-footer">
        <Composer
          onSend={handleSend}
          disabled={streaming}
          onStop={stop}
          onRegenerate={() => regenerate(messages, mode, 
            (delta: StreamDelta) => {
              if (delta.content) {
                setMessages((prev) => {
                  const lastIdx = prev.length - 1;
                  if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
                    const newMsgs = [...prev];
                    newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: newMsgs[lastIdx].content + delta.content! };
                    return newMsgs;
                  }
                  return prev;
                });
              }
            },
            () => {
              setMessages((prev) => {
                const lastIdx = prev.length - 1;
                if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
                  const newMsgs = [...prev];
                  newMsgs[lastIdx] = { ...newMsgs[lastIdx], status: 'complete' };
                  return newMsgs;
                }
                return prev;
              });
            },
            (err: string) => {
              setError(err);
              setMessages((prev) => {
                const lastIdx = prev.length - 1;
                if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].status === 'streaming') {
                  const newMsgs = [...prev];
                  newMsgs[lastIdx] = { ...newMsgs[lastIdx], status: 'error', content: err };
                  return newMsgs;
                }
                return prev;
              });
            }
          )}
          isStreaming={streaming}
        />
      </footer>
    </div>
  );
}

const vscode = {
  commands: {
    executeCommand: (cmd: string, ...args: any[]) => {
      window.parent.postMessage({ type: 'vscode.command', command: cmd, args }, '*');
    }
  }
};

(window as any).vscode = vscode;