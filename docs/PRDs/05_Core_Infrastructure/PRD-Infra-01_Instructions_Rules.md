# PRD-Infra-01: Instructions / Rules (시스템 프롬프트 + 프로젝트/유저/팀 규칙)

> **Category**: Core Infrastructure  
> **Phase**: C0~C1 (초기부터 필요)  
> **관련 PRD**: `PRD-C0_Chat_UI_Streaming.md`, `PRD-C1_Ask_Mode.md`, `PRD-Harness-07_Prompt_Turn_Structure.md`

---

## 1. Overview

### 목적
에이전트 행동의 **헌법**이 되는 규칙 시스템을 구축한다. 모드별 시스템 프롬프트 + 사용자/프로젝트/팀 규칙 파일을 **경로 매칭**으로 동적 주입한다.

### 비즈니스 가치
- **일관성**: 팀 전체가 같은 코딩 컨벤션/아키텍처 원칙 공유
- **유연성**: 프로젝트별/폴더별 규칙 오버라이드 가능
- **투명성**: 규칙이 무엇인지 언제든 확인·편집 가능

---

## 2. Functional Requirements

### 2.1 규칙 계층 구조 (우선순위 높은 순)
| 계층 | 소스 | 범위 | 예시 |
|------|------|------|------|
| **System** | 내장 | 전역 | 모드별 기본 프롬프트 (Ask/Agent/Plan/Debug) |
| **Team** | `.agentk/team-rules.md` | 워크스페이스 공유 | "이 프로젝트는 NestJS 쓴다", "MISRA C++ 준수" |
| **Project** | `.agentk/project-rules.md` | 현재 워크스페이스 | "src/ 하위만 수정", "테스트 필수" |
| **User** | `~/.agentk/user-rules.md` | 개인 | "변수명은 camelCase", "한국어 주석 선호" |
| **Folder** | `.agentk/rules/<path>.md` | 특정 경로 | "src/legacy/* 는 읽기만", "tests/* 는 Jest 강제" |

### 2.2 규칙 파일 포맷 (Markdown + Frontmatter)
```markdown
---
id: team-nestjs-convention
version: 1.2
scope: workspace
match: "**/*.ts"  # glob 패턴 (선택)
priority: 100
---

# Team Rules: NestJS Convention

## Coding Style
- Use **camelCase** for variables/functions, **PascalCase** for classes
- Prefer `interface` over `type` for object shapes
- Use `readonly` for immutable properties

## Architecture
- Controllers thin, Services fat
- Use Repository pattern for DB access
- Guards for auth, Interceptors for logging

## Testing
- Unit tests: `*.spec.ts` alongside source
- E2E tests: `test/e2e/`
- Mock external APIs with `jest.mock`

## Forbidden
- ❌ `any` type (use `unknown` + type guards)
- ❌ `console.log` in production code (use `Logger`)
- ❌ Circular dependencies (enforced by `madge`)
```

### 2.3 규칙 주입 파이프라인
| 단계 | 동작 |
|------|------|
| 1. 발견 | 워크스페이스 루트 → 사용자 홈 → 팀 공유 경로 스캔 |
| 2. 매칭 | 현재 열려 있는 파일/언어/경로에 `match` 글로브 적용 |
| 3. 정렬 | `priority` 내림차순 → 구체적 매칭 우선 |
| 4. 주입 | 시스템 프롬프트 뒤, 컨텍스트 예산(5%) 내 포함 |
| 5. 캐싱 | 파일 mtime/hash 기반 무효화 |

---

## 3. Technical Spec

### 3.1 Rules Engine (`src/rules/engine.ts`)

```typescript
export interface RuleFile {
  id: string;
  path: string;
  frontmatter: RuleFrontmatter;
  content: string;
  hash: string;
  mtime: number;
}

export interface RuleFrontmatter {
  id: string;
  version: string;
  scope: 'user' | 'workspace' | 'team' | 'folder';
  match?: string;        // glob pattern
  priority: number;      // 높을수록 우선
  tags?: string[];
}

export class RulesEngine {
  private cache = new Map<string, RuleFile>();
  private watchers: vscode.FileSystemWatcher[] = [];

  async initialize(): Promise<void> {
    // 1. 규칙 파일 탐색
    const paths = await this.discoverRuleFiles();
    
    // 2. 파싱 + 캐싱
    for (const path of paths) {
      await this.loadRuleFile(path);
    }
    
    // 3. 파일 변경 감시
    this.setupWatchers();
  }

  async getActiveRules(context: RuleContext): Promise<RuleFile[]> {
    const all = Array.from(this.cache.values());
    
    // 1. 매칭 필터
    const matched = all.filter(rule => this.matches(rule, context));
    
    // 2. 우선순위 정렬
    matched.sort((a, b) => b.frontmatter.priority - a.frontmatter.priority);
    
    // 3. 중복 제거 (동일 id 최신 버전만)
    const unique = new Map<string, RuleFile>();
    for (const rule of matched) {
      if (!unique.has(rule.id) || rule.frontmatter.version > unique.get(rule.id)!.frontmatter.version) {
        unique.set(rule.id, rule);
      }
    }
    
    return Array.from(unique.values());
  }

  private matches(rule: RuleFile, context: RuleContext): boolean {
    if (!rule.frontmatter.match) return true;
    return minimatch(context.filePath, rule.frontmatter.match) || 
           minimatch(context.language, rule.frontmatter.match);
  }

  formatForInjection(rules: RuleFile[]): string {
    if (rules.length === 0) return '';
    
    const blocks = rules.map(r => `## ${r.frontmatter.id} (priority: ${r.frontmatter.priority})\n${r.content}`);
    return `## Active Rules (${rules.length} matched)\n\n${blocks.join('\n\n---\n\n')}`;
  }
}
```

### 3.2 규칙 편집 UI (`src/views/rulesEditor.ts`)

```html
<!-- Rules Editor Webview -->
<div class="rules-editor">
  <header>
    <h2>Rules Manager</h2>
    <select id="scopeFilter">
      <option value="all">All Scopes</option>
      <option value="team">Team</option>
      <option value="workspace">Workspace</option>
      <option value="user">User</option>
      <option value="folder">Folder</option>
    </select>
    <button id="newRule">+ New Rule</button>
  </header>
  
  <div class="rules-list" id="rulesList">
    <div class="rule-card" data-id="team-nestjs">
      <div class="rule-header">
        <span class="scope team">TEAM</span>
        <span class="id">team-nestjs-convention</span>
        <span class="priority">P100</span>
        <span class="match">**/*.ts</span>
      </div>
      <div class="preview">Use camelCase... prefer interface... no any...</div>
      <div class="actions">
        <button class="edit">✎ Edit</button>
        <button class="disable" title="Disable">⏸</button>
        <button class="delete">🗑</button>
      </div>
    </div>
  </div>

  <!-- Edit Modal -->
  <div id="ruleModal" class="modal hidden">
    <form id="ruleForm">
      <input type="hidden" name="id">
      <div class="field"><label>ID</label><input name="id" required></div>
      <div class="field"><label>Scope</label><select name="scope"><option value="team">Team</option>...</select></div>
      <div class="field"><label>Match Glob</label><input name="match" placeholder="**/*.ts"></div>
      <div class="field"><label>Priority</label><input type="number" name="priority" value="100"></div>
      <div class="field"><label>Content (Markdown)</label><textarea name="content" rows="20"></textarea></div>
      <div class="actions"><button type="button" class="cancel">Cancel</button><button type="submit" class="primary">Save</button></div>
    </form>
  </div>
</div>
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Instructions / Rules

  Scenario: Team rules injected for matching files
    Given .agentk/team-rules.md exists with match="**/*.ts" priority=100
    When user opens src/auth.ts in editor
    And asks "How should I name this function?"
    Then system prompt includes "Use camelCase for variables/functions"
    And model answers with camelCase convention

  Scenario: Folder-specific rules override team rules
    Given team rule: "Use interface" (priority 100)
    And folder rule .agentk/rules/src/legacy.md: "Legacy code uses type" (priority 200)
    When user edits src/legacy/user.ts
    Then folder rule (priority 200) overrides team rule
    And model suggests `type` for legacy code

  Scenario: Rule file change hot-reloads
    Given user edits .agentk/team-rules.md and saves
    When next turn starts
    Then new rules loaded (mtime/hash change detected)
    And injected rules updated without restart

  Scenario: Rules UI shows active rules for current file
    Given user opens Rules panel
    And current file is src/auth.ts
    Then list shows team-nestjs, project-testing, folder-src-auth rules
    And each shows scope badge, priority, match glob

  Scenario: User creates new folder rule via UI
    When user clicks "+ New Rule", fills form for src/auth/*.ts
    And saves
    Then .agentk/rules/src/auth.md created
    And immediately active for src/auth/ files
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 5. References

- `PRD-C0_Chat_UI_Streaming.md` — 채팅 UI에서 규칙 표시
- `PRD-C1_Ask_Mode.md` — Ask 모드 시스템 프롬프트
- `PRD-Harness-07_Prompt_Turn_Structure.md` — 프롬프트 구조
- VS Code FileSystemWatcher: https://code.visualstudio.com/api/references/vscode-api#FileSystemWatcher