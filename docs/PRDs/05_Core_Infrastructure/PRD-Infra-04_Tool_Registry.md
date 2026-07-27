# PRD-Infra-04: Tool Registry (도구 레지스트리)

> **Category**: Core Infrastructure  
> **Phase**: C0~C1 (최초 구현)  
> **관련 PRD**: `PRD-06_Workspace_Tools.md`, `PRD-Harness-06_A_Tier_Whitelist.md`, `PRD-C1_Ask_Mode.md`

---

## 1. Overview

### 목적
모든 에이전트 도구의 **중앙 레지스트리**를 제공한다. 도구 정의(스키마, 핸들러, 메타데이터)를 한 곳에서 관리하고, 모드별 화이트리스트, 권한 분류, 훅 연동, 지연 로드(MCP)를 일관리 deferred loading)를 지원한다.

### 비즈니스 가치
- **단일 진실 공급원**: 도구 추가/수정이 한 곳에서만 필요
- **모드별 격리**: Ask/Agent/Plan/Debug 각각 허용 도구 다르게 설정
- **보안/안전**: 파괴적 도구 자동 분류, 승인 게이트 연동
- **확장성**: MCP 도구 동적 등록, 지연 로드로 토큰 절약

---

## 2. Functional Requirements

### 2.1 도구 정의 스키마
```typescript
export interface ToolDefinition {
  name: string;                    // 고유 ID (snake_case)
  description: string;             // 모델용 설명 (한 줄)
  schema: z.ZodSchema<any>;        // Zod 스키마 → JSON Schema 변환
  handler: ToolHandler;            // 실제 실행 함수
  metadata: ToolMetadata;          // 분류/권한/동작 메타
}

export interface ToolMetadata {
  category: 'readonly' | 'write' | 'exec' | 'network' | 'orchestrate';
  readonly: boolean;               // true면 병렬 실행 허용
  destructive?: boolean;           // delete, chmod 등
  allowlist?: string[];            // exec 도구: 허용 명령어 패턴
  requiresApproval?: boolean;      // 기본 승인 필요 여부
  maxParallel?: number;            // 동시 실행 상한 (readonly: 16, write: 1)
  idempotent?: boolean;            // 재시도 안전 여부
  estimatedCost?: 'low' | 'medium' | 'high';  // 토큰/시간 추정
  tags?: string[];                 // 'search', 'edit', 'terminal', 'mcp' 등
}
```

### 2.2 모드별 화이트리스트 (자동 필터링)
```typescript
export const MODE_WHITELISTS: Record<Mode, string[]> = {
  ask: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'lsp_definition', 'lsp_references', 'lsp_diagnostics', 'ask_question', 'todo_write'],
  agent: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'lsp_*', 'edit_file', 'write_file', 'delete_file', 'apply_patch', 'reapply', 'run_terminal_cmd', 'todo_write', 'read_lints', 'ask_question'],
  plan: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'lsp_*', 'ask_question', 'todo_write', 'switch_mode'],
  debug: ['grep', 'glob', 'list_dir', 'read_file', 'codebase_search', 'lsp_*', 'edit_file', 'write_file', 'run_terminal_cmd', 'add_instrumentation', 'collect_runtime_logs', 'request_reproduce', 'remove_instrumentation', 'read_lints'],
};
```

### 2.3 핵심 API
```typescript
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private mcpStubs = new Map<string, ToolDefinition>();  // 지연 로드용 스텁

  register(def: ToolDefinition): void;
  unregister(name: string): void;
  get(name: string): ToolDefinition | undefined;
  getSchemas(mode: Mode): ToolSchema[];           // 모드별 화이트리스트 적용
  getSchemasForMCP(serverId: string): ToolSchema[];  // MCP 서버별 도구
  isReadOnly(name: string): boolean;
  isDestructive(name: string): boolean;
  async execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult>;
  
  // MCP 지연 로드
  registerMCPStub(serverId: string, toolName: string): void;
  async ensureMCPToolLoaded(serverId: string, toolName: string): Promise<ToolDefinition>;
}
```

---

## 3. Technical Spec

### 3.1 레지스트리 구현 (`src/tools/registry.ts`)

```typescript
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private mcpStubs = new Map<string, ToolDefinition>();  // key: "mcp_serverId_toolName"
  private mcpClients = new Map<string, MCPClient>();

  register(def: ToolDefinition): void {
    // 스키마 검증
    const parsed = def.schema.safeParse({});
    if (!parsed.success && !def.schema.safeParse({}).success) {
      throw new Error(`Invalid schema for tool ${def.name}`);
    }
    
    // 메타데이터 기본값
    const meta: ToolMetadata = {
      category: def.metadata.category || 'write',
      readonly: def.metadata.readonly ?? false,
      destructive: def.metadata.destructive ?? false,
      allowlist: def.metadata.allowlist,
      requiresApproval: def.metadata.requiresApproval ?? (def.metadata.category !== 'readonly'),
      maxParallel: def.metadata.maxParallel ?? (def.metadata.readonly ? 16 : 1),
      idempotent: def.metadata.idempotent ?? false,
      estimatedCost: def.metadata.estimatedCost || 'low',
      tags: def.metadata.tags || [],
      ...def.metadata,
    };

    this.tools.set(def.name, { ...def, metadata: meta });
  }

  getSchemas(mode: Mode): ToolSchema[] {
    const allowed = MODE_WHITELISTS[mode] || [];
    return allowed
      .map(name => this.tools.get(name) || this.mcpStubs.get(name))
      .filter((t): t is ToolDefinition => !!t)
      .map(t => ({
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.schema),
      }));
  }

  async execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name) || this.mcpStubs.get(name);
    if (!tool) return { error: `Unknown tool: ${name}` };

    // 1. 스키마 검증
    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      return { error: `Invalid arguments: ${parsed.error.message}` };
    }

    // 2. Pre-Hook 실행 (보안 스캔, 시크릿 마스킹 등)
    await this.runPreHooks(name, parsed.data, ctx);

    // 3. MCP 스텁이면 실제 도구 로드 후 실행
    if (this.mcpStubs.has(name)) {
      await this.ensureMCPToolLoaded(name);
      return this.execute(name, args, ctx);  // 재귀 호출 (이제 실제 도구)
    }

    // 4. 실행
    try {
      const result = await tool.handler(parsed.data, ctx);
      
      // 4. Post-Hook
      await this.runPostHooks(name, result, ctx);
      return result;
    } catch (err) {
      return { error: err.message, metadata: { recoverable: isRecoverable(err) } };
    }
  }

  // MCP 지연 로드
  registerMCPStub(serverId: string, toolName: string, schema: z.ZodSchema): void {
    const fullName = `mcp_${serverId}_${toolName}`;
    this.mcpStubs.set(fullName, {
      name: fullName,
      description: `[MCP:${serverId}] ${toolName}`,
      schema,
      handler: async () => { throw new Error('MCP tool not loaded'); },
      metadata: { category: 'mcp', readonly: false, requiresApproval: true, tags: ['mcp'] },
    });
  }

  async ensureMCPToolLoaded(fullName: string): Promise<void> {
    if (!this.mcpStubs.has(fullName)) return;
    const stub = this.mcpStubs.get(fullName)!;
    const [, serverId, toolName] = fullName.split('_');
    
    const client = this.mcpClients.get(serverId);
    const mcpTool = await client.getToolSchema(toolName);
    
    this.mcpStubs.delete(fullName);
    this.register({
      name: fullName,
      description: `[MCP:${serverId}] ${mcpTool.description}`,
      schema: zodFromMCP(mcpTool.inputSchema),
      handler: (args) => client.callTool(toolName, args),
      metadata: { ...stub.metadata, originalName: toolName },
    });
  }
}
```

### 3.2 Zod → JSON Schema 변환 (`src/tools/zodToJsonSchema.ts`)

```typescript
export function zodToJsonSchema(schema: z.ZodSchema): JSONSchema {
  // zod-to-json-schema 라이브러리 사용 또는 커스텀 변환
  // 중요: description 필드 보존, required 필드 정확 매핑
  // 예: z.string().describe("File path") → { type: "string", description: "File path" }
}
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Tool Registry

  Scenario: Register tool with full metadata
    When registering edit_file with category=write, readonly=false
    Then tool stored with correct metadata
    And getSchemas('agent') includes edit_file
    And getSchemas('ask') does NOT include edit_file

  Scenario: Mode-based schema filtering
    Given tools: grep (readonly), edit_file (write), run_terminal_cmd (exec)
    When getSchemas('ask') called
    Then only grep schema returned
    When getSchemas('agent') called
    Then all three schemas returned
    When getSchemas('plan') called
    Then grep + ask_question + todo_write returned

  Scenario: Destructive tool flagged
    Given delete_file registered with destructive=true
    When permission gate checks
    Then requiresApproval = true regardless of level

  Scenario: MCP stub registration and lazy load
    Given MCP server "github" with tool "create_issue"
    When registerMCPStub('github', 'create_issue', schema) called
    Then mcp_github_create_issue stub registered
    When execute('mcp_github_create_issue', args) called
    Then real tool loaded from MCP client
    And subsequent calls use real handler

  Scenario: Parallel execution policy
    Given 10 grep calls and 2 edit_file calls in same turn
    When executing
    Then grep calls run in parallel (max 16)
    And edit_file calls run sequentially (max 1)
    And edit_file waits for grep results if same file

  Scenario: Schema validation rejects invalid args
    Given edit_file requires {path, search, replace}
    When execute called with {path: "x"}
    Then returns error "Invalid arguments: required field 'search' missing"
    And handler NOT called
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 5. References

- `PRD-06_Workspace_Tools.md` — 전체 도구 카탈로그
- `PRD-Harness-06_A_Tier_Whitelist.md` — 중급 모델 도구 제한
- `PRD-Infra-05_Permission_Autorun.md` — 승인 게이트와 연동
- `PRD-Infra-06_Hooks.md` — Pre/Post 훅 연동
- `PRD-10_MCP_Client.md` — MCP 도구 등록 상세