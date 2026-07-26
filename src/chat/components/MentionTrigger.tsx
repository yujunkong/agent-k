/**
 * MentionTrigger - @멘션 트리거 + 자동완성 (C0-T12)
 * 
 * @file:, @folder:, @symbol:, @codebase: 멘션 파싱 및 드롭다운 UI
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface MentionResult {
  label: string;
  description?: string;
  detail?: string;
}

interface MentionTriggerProps {
  value: string;
  onChange: (value: string) => void;
  onMentionSelect?: (type: string, value: string) => void;
  disabled?: boolean;
  results?: MentionResult[];
  onSearch?: (type: string, query: string) => void;
}

const MENTION_TYPES = [
  { trigger: '@file:', label: 'File', icon: '📄' },
  { trigger: '@folder:', label: 'Folder', icon: '📁' },
  { trigger: '@symbol:', label: 'Symbol', icon: '🔣' },
  { trigger: '@codebase:', label: 'Codebase', icon: '🔍' }
];

export function MentionTrigger({ value, onChange, onMentionSelect, disabled, results = [], onSearch }: MentionTriggerProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionType, setMentionType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Detect @mention trigger in text
  const detectMention = useCallback((text: string) => {
    const cursorPos = inputRef.current?.selectionStart || text.length;
    const beforeCursor = text.slice(0, cursorPos);
    const atIndex = beforeCursor.lastIndexOf('@');
    
    if (atIndex === -1) return null;

    const afterAt = beforeCursor.slice(atIndex);
    for (const mt of MENTION_TYPES) {
      if (afterAt.startsWith(mt.trigger)) {
        const query = afterAt.slice(mt.trigger.length);
        return { type: mt.trigger, query, startPos: atIndex };
      }
    }

    // Plain @ — show type selector
    if (afterAt.length <= 1) {
      return { type: 'select', query: '', startPos: atIndex };
    }

    return null;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const mention = detectMention(newValue);
    if (mention) {
      setShowDropdown(true);
      setMentionType(mention.type === 'select' ? null : mention.type);
      setSearchQuery(mention.query);
      setSelectedIndex(0);
      if (mention.type !== 'select' && onSearch) {
        onSearch(mention.type, mention.query);
      }
    } else {
      setShowDropdown(false);
    }
  };

  const insertMention = useCallback((type: string, value: string) => {
    if (!inputRef.current) return;
    const cursorPos = inputRef.current.selectionStart;
    const text = value;
    
    // Find the @ position and replace
    const beforeCursor = text.slice(0, cursorPos);
    const atIndex = beforeCursor.lastIndexOf('@');
    if (atIndex === -1) return;

    const mentionText = `${type}${value} `;
    const newValue = text.slice(0, atIndex) + mentionText + text.slice(cursorPos);
    onChange(newValue);
    setShowDropdown(false);
    onMentionSelect?.(type, value);
  }, [onChange, onMentionSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    const items = mentionType 
      ? results 
      : MENTION_TYPES.map(mt => ({ label: `${mt.icon} ${mt.label}`, description: mt.trigger }));

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + items.length) % items.length);
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (items[selectedIndex]) {
          if (mentionType) {
            insertMention(mentionType, items[selectedIndex].label);
          } else {
            // Select mention type
            const selectedType = MENTION_TYPES[selectedIndex];
            if (selectedType) {
              setMentionType(selectedType.trigger);
              // Insert trigger
              const textarea = inputRef.current;
              if (textarea) {
                const cursorPos = textarea.selectionStart;
                const beforeCursor = value.slice(0, cursorPos);
                const atIndex = beforeCursor.lastIndexOf('@');
                if (atIndex !== -1) {
                  const newValue = value.slice(0, atIndex) + selectedType.trigger + value.slice(cursorPos);
                  onChange(newValue);
                  // Focus stays in textarea
                  setTimeout(() => {
                    textarea.focus();
                    const newPos = atIndex + selectedType.trigger.length;
                    textarea.setSelectionRange(newPos, newPos);
                  }, 0);
                }
              }
            }
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
        break;
    }
  };

  return (
    <div className="mention-trigger-wrapper" style={{ position: 'relative', flex: 1 }}>
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Type @ to mention files, folders, symbols, or codebase..."
        style={{ width: '100%', minHeight: 44 }}
      />
      
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="mention-dropdown"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            maxHeight: 200,
            overflowY: 'auto',
            background: 'var(--ak-panel-bg, var(--vscode-input-background, #3c3c3c))',
            border: '1px solid var(--ak-panel-border, rgba(255, 255, 255, 0.14))',
            borderRadius: 10,
            boxShadow: 'var(--ak-panel-shadow, 0 8px 24px rgba(0, 0, 0, 0.4))',
            zIndex: 1000
          }}
        >
          {mentionType ? (
            results.length > 0 ? (
              results.map((result, idx) => (
                <div
                  key={idx}
                  className={`mention-item ${idx === selectedIndex ? 'selected' : ''}`}
                  onClick={() => insertMention(mentionType, result.label)}
                  style={{
                    padding: '6px 12px',
                    cursor: 'pointer',
                    background: idx === selectedIndex ? 'var(--vscode-list-hoverBackground, #333)' : 'transparent'
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{result.label}</div>
                  {result.description && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{result.description}</div>}
                </div>
              ))
            ) : (
              <div style={{ padding: '8px 12px', opacity: 0.5 }}>Searching...</div>
            )
          ) : (
            MENTION_TYPES.map((mt, idx) => (
              <div
                key={mt.trigger}
                className={`mention-item ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => {
                  setMentionType(mt.trigger);
                  const textarea = inputRef.current;
                  if (textarea) {
                    const cursorPos = textarea.selectionStart;
                    const beforeCursor = value.slice(0, cursorPos);
                    const atIndex = beforeCursor.lastIndexOf('@');
                    if (atIndex !== -1) {
                      const newValue = value.slice(0, atIndex) + mt.trigger + value.slice(cursorPos);
                      onChange(newValue);
                      setTimeout(() => {
                        textarea.focus();
                        const newPos = atIndex + mt.trigger.length;
                        textarea.setSelectionRange(newPos, newPos);
                      }, 0);
                    }
                  }
                }}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  background: idx === selectedIndex ? 'var(--vscode-list-hoverBackground, #333)' : 'transparent'
                }}
              >
                <span>{mt.icon}</span> <span>{mt.label}</span>
                <span style={{ opacity: 0.5, marginLeft: 8, fontSize: '0.85em' }}>{mt.trigger}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
