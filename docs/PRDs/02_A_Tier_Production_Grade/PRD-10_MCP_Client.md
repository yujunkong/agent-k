# PRD-10: MCP 클라이언트 (MCP Client)

> **Priority**: A급 (외부 도구 생태계 연동)  
> **Phase**: C7 (핵심 루프 안정화 후)  
> **관련 PRD**: `PRD-Infra-04_Tool_Registry.md`, `PRD-Tools-F_Orchestration_Extension.md`, `PRD-Spec-01_Provider_ToolJSON.md`

---

## 1. Overview

### 목적
**Model Context Protocol (MCP)** 클라이언트를 확장에 내장해, 외부 MCP 서버(파일시스템, GitHub, PostgreSQL, 브라우저 등)가 제공하는 **Tool/Resource/Prompt**를 에이전트 도구 레지스트리에 동적으로 등록한다.

### 비즈니스 가치
- **생태계 활용**: 수천 개 MCP 서버 즉시 사용 가능
- **도구 확장성**: 확장에 하드코딩하지 않고 런타임에 도구 추가
- **표준 준수**: Anthropic/Claude Code/OpenCode와 도구 호환성 확보

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, `mcp-server-github`를 연결해 에이전트에게 "이슈 #123 읽어와" "PR 열여줘" 시키고 싶다 |
| US-02 | 팀 리더로서, 사내 MCP 서버(DB, 내부 API)를 팀 전체에 배포해 표준 도구로 쓰고 싶다 |
| US-03 | 개발자로서, MCP 도구 스키마가 너무 많아지면 `tool_search`로 지연 로드해 토큰 아끼고 싶다 |

---

## 2. Functional Requirements

### 2.1 MCP 서버 연결 관리
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 서버 설정 저장 | `agentK.mcp.servers` 배열: `{ id, name, command, args, env, transport }` |
| FR-02 | 전송 방식 지원 | `stdio` (자식 프로세스), `sse` (HTTP 스트리밍), `websocket` |
| FR-03 | 자동 시작/재시작 | 확장 활성화 시 `stdio` 서버 스폰, 크래시 시 지수 백오프 재시작 |
| FR-04 | 헬스체크 | 주기적 `ping` / `initialize` 로 생존 확인 |
| FR-05 | 인증/시크릿 | `env`에 `${secret:key}` 플레이스홀더 → `SecretStorage` 치환 |

### 2.2 도구/리소스/프롬프트 동기화
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-06 | 초기 동기화 | 연결 후 `tools/list`, `resources/list`, `prompts/list` 호출 |
| FR-07 | 변경 감지 | `notifications/tools/list_changed` 수신 시 재동기화 |
| FR-08 | 네임스페이스 프리픽스 | 도구명 충돌 방지: `mcp_<serverId>_<toolName>` (예: `mcp_github_create_issue`) |
| FR-09 | 스키마 변환 | MCP JSON Schema → 내부 Zod 스키마 + `ToolDefinition` 자동 등록 |
| FR-10 | 지연 로드 (Deferred) | 도구 50개 초과 시 스키마만 스텁 등록, 최초 호출 시 상세 로드 |

### 2.3 도구 실행 브리지
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-11 | 호출 전달 | 내부 `ToolCall` → MCP `tools/call` 요청 → 결과 매핑 |
| FR-12 | 타임아웃 | 기본 30초, 도구별 `timeout` 오버라이드 지원 |
| FR-13 | 진행 스트리밍 | `notifications/progress` 수신 → UI 프로그레스 바 업데이트 |
| FR-14 | 취소 전파 | 사용자 Stop → MCP `cancel` 요청 전송 |

### 2.4 리소스/프롬프트 지원
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-15 | 리소스 읽기 | `resources/read` → 컨텍스트 주입 (파일, DB 레코드, API 응답) |
| FR-16 | 프롬프트 템플릿 | `prompts/get` → 시스템 프롬프트에 동적 주입 (스킬과 유사) |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 연결 수립 지연 | stdio 서버 스폰 < 2초, SSE 연결 < 500ms |
| NFR-02 | 도구 호출 오버헤드 | MCP 브리지 레이어 < 50ms (직렬화/역직렬화) |
| NFR-03 | 동시 서버 수 | 10개 이상 동시 연결 안정적 운영 |
| NFR-04 | 메모리 누수 방지 | 서버 분리 시 핸들러/리스너 완전 정리 |
| NFR-05 | 시크릿 보안 | `SecretStorage` 외 디스크 기록 금지 |

---

## 4. API & Technical Spec

### 4.1 설정 스키마 (`package.json` configuration)

```json
{
  "agentK.mcp.servers": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
        "name": { "type": "string" },
        "transport": { "enum": ["stdio", "sse", "websocket"], "default": "stdio" },
        "command": { "type": "string" },
        "args": { "type": "array", "items": { "type": "string" } },
        "env": { "type": "object", "additionalProperties": { "type": "string" } },
        "url": { "type": "string", "format": "uri" },
        "headers": { "type": "object" },
        "autoStart": { "type": "boolean", "default": true },
        "timeout": { "type": "number", "default": 30000 },
        "deferredLoadThreshold": { "type": "number", "default": 50 }
      },
      "required": ["id", "name"]
    },
    "default": [
      { "id": "filesystem", "name": "File System", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "${workspaceFolder}"] },
      { "id": "github", "name": "GitHub", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${secret:githubToken}" } }
    ]
  }
}
```

### 4.2 MCP 클라이언트 핵심 클래스 (`src/mcp/client.ts`)

```typescript
export class MCPClient {
  private servers = new Map<string, MCPServerConnection>();
  private toolRegistry: ToolRegistry;
  private secretStorage: vscode.SecretStorage;

  constructor(registry: ToolRegistry, secrets: vscode.SecretStorage) {
    this.toolRegistry = registry;
    this.secretStorage = secrets;
  }

  async initialize(config: MCPServerConfig[]): Promise<void> {
    for (const serverConfig of config) {
      if (serverConfig.autoStart) {
        await this.connectServer(serverConfig);
      }
    }
  }

  private async connectServer(config: MCPServerConfig): Promise<void> {
    // 1. 환경변수 시크릿 치환
    const env = await this.resolveSecrets(config.env || {});
    
    // 2. 트랜스포트별 연결
    let transport: MCPTransport;
    if (config.transport === 'stdio') {
      transport = new StdioTransport(config.command, config.args, env, config.cwd);
    } else if (config.transport === 'sse') {
      transport = new SSETransport(config.url!, config.headers);
    } else {
      transport = new WebSocketTransport(config.url!, config.headers);
    }

    const conn = new MCPServerConnection(config.id, transport, config);
    this.servers.set(config.id, conn);

    // 3. 초기화 핸드셰이크
    await conn.initialize({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {}, resources: {}, prompts: {} },
      clientInfo: { name: 'agent-k', version: '0.1.0' }
    });

    // 4. 도구/리소스/프롬프트 동기화
    await this.syncCapabilities(conn);
    
    // 5. 변경 알림 리스너
    conn.on('notification', (notif) => {
      if (notif.method === 'notifications/tools/list_changed') {
        this.syncCapabilities(conn);
      }
    });

    // 6. 크래시 감시 (stdio만)
    if (config.transport === 'stdio') {
      conn.on('exit', (code) => this.handleServerExit(config, code));
    }
  }

  private async syncCapabilities(conn: MCPServerConnection): Promise<void> {
    const [tools, resources, prompts] = await Promise.all([
      conn.listTools(),
      conn.listResources(),
      conn.listPrompts(),
    ]);

    // 도구 등록 (네임스페이스 프리픽스)
    for (const tool of tools.tools) {
      const prefixedName = `mcp_${conn.config.id}_${tool.name}`;
      this.toolRegistry.register({
        name: prefixedName,
        description: `[MCP:${conn.config.name}] ${tool.description}`,
        schema: tool.inputSchema,
        handler: (args) => conn.callTool(tool.name, args),
        metadata: {
          category: 'mcp',
          serverId: conn.config.id,
          originalName: tool.name,
          deferred: tools.tools.length > conn.config.deferredLoadThreshold,
        },
      });
    }

    // 리소스/프롬프트는 별도 레지스트리 또는 컨텍스트 조립기에서 사용
    conn.capabilities = { tools, resources, prompts };
  }

  private async handleServerExit(config: MCPServerConfig, code: number): Promise<void> {
    this.servers.delete(config.id);
    this.toolRegistry.unregisterByServer(config.id);
    
    if (config.autoStart && code !== 0) {
      // 지수 백오프 재시도
      const delay = Math.min(1000 * Math.pow(2, config.restartCount || 0), 30000);
      config.restartCount = (config.restartCount || 0) + 1;
      setTimeout(() => this.connectServer(config), delay);
    }
  }

  private async resolveSecrets(env: Record<string, string>): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      const match = value.match(/^\$\{secret:(.+)\}$/);
      if (match) {
        const secret = await this.secretStorage.get(match[1]);
        resolved[key] = secret || '';
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }
}
```

### 4.3 트랜스포트 추상화 (`src/mcp/transports/`)

```typescript
interface MCPTransport {
  send(message: JSONRPCMessage): Promise<void>;
  onMessage: Event<JSONRPCMessage>;
  onClose: Event<void>;
  close(): Promise<void>;
}

class StdioTransport implements MCPTransport {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = '';

  constructor(cmd: string, args: string[], env: Record<string, string>, cwd?: string) {
    this.proc = spawn(cmd, args, { env: { ...process.env, ...env }, cwd });
    this.proc.stdout.on('data', (chunk) => this.onData(chunk.toString()));
    this.proc.stderr.on('data', (chunk) => this.logError(chunk.toString()));
  }

  private onData(data: string) {
    this.buffer += data;
    let line;
    while ((line = this.buffer.split('\n')[0]) && this.buffer.includes('\n')) {
      this.buffer = this.buffer.slice(line.length + 1);
      try { this.onMessage.fire(JSON.parse(line)); } catch { /* ignore */ }
    }
  }

  async send(msg: JSONRPCMessage): Promise<void> {
    this.proc.stdin.write(JSON.stringify(msg) + '\n');
  }

  async close(): Promise<void> {
    this.proc.kill('SIGTERM');
    await new Promise(r => this.proc.on('exit', r));
  }
}
```

### 4.4 지연 로드 (Deferred Loading) - `tool_search` 연동

```typescript
// 도구 50개 초과 시 스텁만 등록
if (tools.tools.length > config.deferredLoadThreshold) {
  this.toolRegistry.register({
    name: `mcp_${serverId}_tool_search`,
    description: `Search available tools in ${config.name}`,
    schema: z.object({ query: z.string() }),
    handler: async ({ query }) => {
      const allTools = await conn.listTools();
      const matched = fuzzyMatch(query, allTools.tools.map(t => t.name));
      return { tools: matched.map(t => ({ name: t.name, description: t.description })) };
    },
    metadata: { category: 'orchestrate' },
  });

  // 실제 도구는 호출 시 지연 등록
  const stubHandler = async (args) => {
    const tool = await conn.getToolSchema(originalName); // 캐시됨
    this.toolRegistry.registerFullTool(tool);
    return this.toolRegistry.execute(originalName, args);
  };
}
```

---

## 5. UI/UX Specification

### 5.1 MCP 서버 관리 패널 (설정 웹뷰)
```
┌─ MCP Servers ────────────────────────────────────────────────────┐
│  [+ Add Server]                                                    │
├────────────────────────────────────────────────────────────────────┤
│ 🟢 filesystem (stdio)     File System        12 tools  [⚙] [✕]   │
│ 🟢 github (stdio)         GitHub             28 tools  [⚙] [✕]   │
│ 🟡 postgres (sse)         Database           0 tools  [⚙] [▶]    │
│ 🔴 slack (stdio)          Slack              ERROR   [⚙] [🔄]    │
├────────────────────────────────────────────────────────────────────┤
│  Server: github                                                    │
│  Command: npx -y @modelcontextprotocol/server-github              │
│  Env: GITHUB_PERSONAL_ACCESS_TOKEN=•••••••• [Edit Secret]        │
│  Tools: create_issue, get_issue, list_issues, create_pr, ...      │
│  [Save]  [Test Connection]  [Restart]                             │
└────────────────────────────────────────────────────────────────────┘
```

### 5.2 도구 호출 시 진행 표시 (채팅 내)
```
🔧 mcp_github_create_issue (running...)
   ├─ Validating repository access...
   ├─ Creating issue #234...
   └─ ✓ Done (1.2s)
```

---

## 6. Acceptance Criteria

```gherkin
Feature: MCP Client

  Scenario: Stdio server auto-starts and registers tools
    Given config includes "filesystem" server with command "npx -y @mcp/server-filesystem ."
    When extension activates
    Then server process spawns within 2s
    And initialize handshake completes
    And tools like "mcp_filesystem_read_file" appear in tool registry
    And agent can call them successfully

  Scenario: SSE server connects and reconnects on disconnect
    Given SSE server at "http://localhost:3001/sse"
    When network disconnects for 5s
    Then client detects disconnect via heartbeat
    And auto-reconnects when server available
    And tool list re-syncs automatically

  Scenario: Secret injection from SecretStorage
    Given config has env.GITHUB_TOKEN="${secret:githubToken}"
    And SecretStorage contains "githubToken"="ghp_xxx"
    When server starts
    Then process env receives actual token value
    And token never written to disk/settings.json

  Scenario: Deferred loading for large tool sets
    Given MCP server exposes 100 tools
    And deferredLoadThreshold=50
    Then only "mcp_*_tool_search" stub registered initially
    When agent calls "mcp_github_create_issue"
    Then full schema fetched, registered, then executed
    And subsequent calls use cached registration

  Scenario: Tool name collision avoided by namespace
    Given two servers both expose "read_file"
    When both connected
    Then tools registered as "mcp_fs_read_file" and "mcp_github_read_file"
    And both callable without conflict
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `PRD-Infra-04_Tool_Registry.md` | 선행 | 도구 등록/스키마/메타데이터 (MCP 도구 통합) |
| `PRD-Tools-F_Orchestration_Extension.md` | 병행 | MCP·오케스트레이션 도구 카탈로그 |
| `PRD-21_Secrets_Config_Vault.md` | 병행 | 시크릿 저장/치환 |
| `@modelcontextprotocol/sdk` | 런타임 | TypeScript MCP SDK (MIT) |
| `PRD-Tools-F_Orchestration_Extension.md` | 후속 | 지연 로드 구현체 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | MCP SDK 래퍼 + Stdio/SSE/WS 트랜스포트 | 연결/핸드셰이크 테스트 |
| 2 | 서버 설정 UI + SecretStorage 연동 | 설정 패널 동작 |
| 3 | 도구/리소스/프롬프트 동기화 + 네임스페이스 | 레지스트리 등록 검증 |
| 4 | 지연 로드 (`tool_search` 스텁) | 100개 도구 시나리오 테스트 |
| 5 | 진행 스트리밍 + 취소 전파 | 긴 작업 UX 검증 |
| 6 | 크래시 복구 + 헬스체크 | 장시간 안정성 테스트 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| MCP 스펙 변경 (초안 단계) | 중간 | SDK 버전 고정, 어댑터 레이어로 인터페이스 보호 |
| 서버 프로세스 좀비/누수 | 높음 | `SIGTERM` → `SIGKILL` 폴백, `finally` 블록에서 정리 |
| 스키마 검증 실패 (MCP 서버 버그) | 중간 | Zod `safeParse`로 런타임 검증, 실패 시 스텁으로 폴백 |
| 대량 도구로 컨텍스트 창 압박 | 높음 | 지연 로드 필수, `tool_search`로 온디맨드만 주입 |

---


## Out of Scope

- Team MCP 마켓 풀 복제 / Cloud 상시 에이전트
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **A급: MCP 클라이언트**
- MCP Specification: https://modelcontextprotocol.io/specification
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Example Servers: https://github.com/modelcontextprotocol/servers