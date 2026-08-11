/**
 * McpTab — shows configured MCP servers (agent-k.mcp.servers) and wiring hints.
 * Connection runs in the extension host on activate / agent-k.mcp.reload.
 */
import React, { useMemo, useState } from 'react';
import { configManager } from '../../core/ConfigManager';
import { isFeatureEnabled } from '../../core/featureFlags';
import { parseMcpServersMap } from '../../mcp/parseMcpServers';
import { persistSetting } from '../persistSettings';
import { SettingsSaveButton } from '../SettingsSaveButton';

export function McpTab() {
  const servers = useMemo(() => {
    const raw = configManager.get('agent-k.mcp.servers') || undefined;
    return parseMcpServersMap(raw);
  }, []);

  const [maxSchemaTokens, setMaxSchemaTokens] = useState<number>(
    Number(configManager.get('agent-k.mcp.maxSchemaTokens')) || 8000
  );
  const mcpEnabled = isFeatureEnabled('mcp');

  return (
    <div className="settings-tab-content">
      <h3>MCP</h3>
      {!mcpEnabled ? (
        <p className="settings-banner settings-banner--warn" role="status">
          Features에서 MCP가 꺼져 있습니다. 서버를 연결하려면 Features → MCP
          Client를 켠 뒤 저장하세요.
        </p>
      ) : null}
      <p className="settings-hint">
        서버 목록은 VS Code 설정의 <code>agent-k.mcp.servers</code> 또는
        Project 탭 <code>.agentk/settings.json</code>에서 편집합니다.
        OpenCode/Continue 스타일 맵(command argv, enabled). 활성화 시 호스트가
        연결합니다.
      </p>
      {servers.length === 0 ? (
        <p className="settings-empty">
          설정된 MCP 서버가 없습니다. <code>agent-k.mcp.servers</code>에
          추가한 뒤 Command Palette → <code>Agent K: MCP Reload</code>를
          실행하세요.
        </p>
      ) : (
        <ul className="settings-list">
          {servers.map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong>
              <div className="settings-muted">
                {[s.command, ...(s.args || [])].filter(Boolean).join(' ')}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="settings-field">
        <label>스키마 토큰 예산 (deferred)</label>
        <input
          type="number"
          value={maxSchemaTokens}
          onChange={(e) =>
            setMaxSchemaTokens(parseInt(e.target.value, 10) || 8000)
          }
          min={500}
          max={200000}
          step={500}
        />
        <p className="settings-hint">
          이 예산을 넘는 서버 스키마는 미리 등록하지 않고 지연 로드합니다.
          기본 8000.
        </p>
      </div>
      <SettingsSaveButton
        onSave={() => {
          const tokens = Math.min(
            200000,
            Math.max(500, Math.floor(maxSchemaTokens) || 8000)
          );
          setMaxSchemaTokens(tokens);
          persistSetting('agent-k.mcp.maxSchemaTokens', tokens);
        }}
      />
      <p className="settings-muted" style={{ marginTop: 12 }}>
        도구 이름: <code>mcp_&lt;server&gt;_&lt;tool&gt;</code> (예:{' '}
        <code>mcp_searxng_web_search</code>).
      </p>
    </div>
  );
}
