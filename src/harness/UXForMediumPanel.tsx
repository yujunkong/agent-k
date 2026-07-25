/**
 * HARB-T13 UI: 중급 모델 하네스 상태 표시 + stuck 시 액션 버튼
 * UXForMedium.ts의 formatStatusBar / suggestUXAction 사용
 */
import React from 'react';
import type { HarnessUXState, UXEventType } from './UXForMedium';
import { formatStatusBar, suggestUXAction } from './UXForMedium';

export interface UXForMediumPanelProps {
  /** 현재 하네스 UX 상태 (티어·프리페치·도구 사용량 등) */
  uxState: HarnessUXState;
  /** 루프가 막혔을 때 표시할 이벤트 (null이면 액션 패널 숨김) */
  stuckEvent?: UXEventType | null;
  /** 사용자가 제안 액션 버튼을 눌렀을 때 */
  onAction?: (action: string, event: UXEventType) => void;
}

export function UXForMediumPanel({ uxState, stuckEvent, onAction }: UXForMediumPanelProps) {
  const statusLine = formatStatusBar(uxState);
  const suggestion = stuckEvent ? suggestUXAction(stuckEvent) : null;

  return (
    <div
      className="ux-for-medium-panel"
      style={{
        padding: '4px 10px',
        fontSize: '11px',
        borderBottom: '1px solid var(--vscode-panel-border, #444)',
        background: 'var(--vscode-editor-background, #1e1e1e)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }}
      title="Harness tier status (Flash / Pro routing)"
    >
      <div style={{ opacity: 0.9 }}>{statusLine}</div>
      {suggestion && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--vscode-errorForeground, #f48771)' }}>{suggestion.message}</span>
          {suggestion.actions.map(action => (
            <button
              key={action}
              type="button"
              style={{ fontSize: '11px', padding: '2px 8px' }}
              onClick={() => onAction?.(action, suggestion.event)}
            >
              {action}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
