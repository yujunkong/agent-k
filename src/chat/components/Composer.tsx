import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';

interface ComposerProps {
  onSend: (text: string, files: any[]) => void;
  disabled: boolean;
  onStop: () => void;
  onRegenerate: () => void;
  onQueueMessage?: (text: string) => void; // Alt+Enter: queue message without interrupting
  isStreaming: boolean;
}

export function Composer({ onSend, disabled, onStop, onRegenerate, onQueueMessage, isStreaming }: ComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [height, setHeight] = useState(44);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      setHeight(newHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [text]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const isEnter = e.key === 'Enter' && !e.shiftKey;
    const isAltEnter = e.key === 'Enter' && e.altKey && !e.shiftKey;
    const isCtrlEnter = e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey;

    if (isAltEnter) {
      // Alt+Enter: Queue-only - send message without interrupting current stream
      e.preventDefault();
      if (text.trim() && !disabled && onQueueMessage) {
        onQueueMessage(text.trim());
        setText('');
      }
      return;
    }

    if (isEnter || isCtrlEnter) {
      e.preventDefault();
      if (isStreaming) {
        // Enter/Ctrl+Enter/Cmd+Enter during streaming: Interrupt & Resynthesize
        onStop();
        setTimeout(() => onRegenerate(), 100);
      } else if (text.trim() && !disabled) {
        // Idle: Enter = Send
        onSend(text.trim(), []);
        setText('');
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData.files;
    if (files.length > 0) {
      // Handle file paste
    }
  };

  const getPlaceholder = () => {
    if (isStreaming) {
      return 'Streaming... (Enter/Cmd+Enter: Stop & Regenerate, Alt+Enter: Queue message)';
    }
    return 'Type your message... (Enter to send, Shift+Enter for new line, Alt+Enter to queue)';
  };

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={getPlaceholder()}
        disabled={disabled}
        rows={1}
        style={{ height: `${height}px`, minHeight: '44px', maxHeight: '200px' }}
      />
      <div className="composer-actions">
        {isStreaming ? (
          <button onClick={onStop} className="stop-btn" title="Stop (Enter/Cmd+Enter)">
            ⏹ Stop
          </button>
        ) : (
          <>
            <button onClick={onRegenerate} disabled={disabled} className="regenerate-btn" title="Regenerate last response">
              ↻ Regenerate
            </button>
            <button onClick={() => onSend(text.trim(), [])} disabled={disabled || !text.trim()} className="send-btn">
              Send
            </button>
          </>
        )}
      </div>
    </div>
  );
}