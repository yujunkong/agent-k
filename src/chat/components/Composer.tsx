import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';

interface ComposerProps {
  onSend: (text: string, files: any[]) => void;
  disabled: boolean;
  onStop: () => void;
  onRegenerate: () => void;
  isStreaming: boolean;
}

export function Composer({ onSend, disabled, onStop, onRegenerate, isStreaming }: ComposerProps) {
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        onStop();
        setTimeout(() => onRegenerate(), 100);
      } else if (text.trim() && !disabled) {
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

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={isStreaming ? 'Streaming... (Enter to stop & regenerate)' : 'Type your message... (Enter to send, Shift+Enter for new line)'}
        disabled={disabled}
        rows={1}
        style={{ height: `${height}px`, minHeight: '44px', maxHeight: '200px' }}
      />
      <div className="composer-actions">
        {isStreaming ? (
          <button onClick={onStop} className="stop-btn" title="Stop (Enter)">
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