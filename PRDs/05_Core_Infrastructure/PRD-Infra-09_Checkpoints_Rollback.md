# PRD-Infra-09: Checkpoints / Rollback (체크포인트 / 롤백)

> **Category**: Core Infrastructure  
> **Phase**: C4 (C2~C3 쓰기 도구 안정화 후)  
> **관련 PRD**: `PRD-C2_Agent_SingleTurn.md`, `PRD-C4_Infrastructure.md`, `PRD-C4_Infrastructure.md`

---

## 1. Overview

### 목적
에이전트가 **큰 수정 전/주기적/사용자 요청 시** 워크스페이스 상태 스냅샷을 만들고, **원클릭 롤백**으로 되돌릴 수 있게 한다. Git과 독립적이며 "에이전트 변경분만 되돌리기"에 특화.

### 비즈니스 가치
- **안전망**: 에이전트가 코드베이스 망가뜨려도 1초 만에 복구
- **실험 자유도**: "일단 해보고 이상하면 되돌리자" 심리적 안전감
- **Git 보완**: 커밋 단위보다 세밀, 언트랙 파일도 복구 가능

---

## 2. Functional Requirements

### 2.1 체크포인트 생성 트리거
| 트리거 | 조건 | 자동/수동 |
|--------|------|----------|
| **첫 쓰기 전** | 첫 `edit_file`/`write_file`/`delete_file` 호출 직전 | 자동 |
| **N 파일 변경 후** | 기본 5개 파일 수정 후마다 | 자동 |
| **사용자 요청** | 채팅에서 `/checkpoint` 또는 UI 버튼 | 수동 |
| **계획 승인 후** | Plan 모드 승인 → Agent 전환 시 | 자동 |
| **Best-of-N 시작 전** | `/best-of-n` 실행 전 | 자동 |

### 2.2 스냅샷 내용
| 대상 | 포함 여부 | 비고 |
|------|-----------|------|
| **Git 추적 파일** | ✅ 전체 내용 | `git ls-files` 기반 |
| **Untracked 파일** | ⚙️ 설정 가능 (기본: 최근 24h 내 생성) | `.gitignore` 밖의 새 파일 |
| **Ignored 파일** | ❌ 제외 | `.gitignore` 존중 |
| **메타데이터** | ✅ mtime, hash(xxhash64), 인코딩 | 스테일니스 검증용 |

### 2.3 롤백 동작
| 옵션 | 동작 |
|------|------|
| **Restore** | 스냅샷에 있는 파일 → 내용 복원, 없는 파일 → 삭제 |
| **Untracked 처리** | `keep`(기본) / `delete` / `ask` 선택 가능 |
| **Git 연동** | `git checkout -- .`와 병행 가능, 별도 저장소 |

---

## 3. Technical Spec

### 3.1 체크포인트 데이터 구조 (`src/infra/checkpoint.ts`)

```typescript
export interface FileSnapshot {
  path: string;              // 워크스페이스 상대 경로
  content: Uint8Array;       // 파일 전체 내용 (바이너리 안전)
  mtime: number;             // 수정 시간 (ms)
  hash: string;              // xxhash64(content)
  encoding: 'utf8' | 'binary';
  isNew: boolean;            // 체크포인트 시점에 untracked였는지
}

export interface Checkpoint {
  id: string;                // cp-<timestamp>-<random>
  label: string;             // "Before refactor", "User requested"
  timestamp: number;
  snapshots: FileSnapshot[];
  metadata: {
    trigger: 'first_write' | 'n_files' | 'user_request' | 'plan_approved' | 'best_of_n';
    agentTurn: number;
    gitCommit?: string;      // 생성 시점 HEAD SHA
    stats: { files: number; totalBytes: number };
  };
}

export class CheckpointManager {
  private checkpoints: Checkpoint[] = [];
  private readonly maxCheckpoints = 50;
  private storagePath: string;  // .agentk/checkpoints/
  
  async create(label: string, trigger: Checkpoint['metadata']['trigger']): Promise<string> {
    // 1. 대상 파일 수집 (Git tracked + 옵션 untracked)
    const files = await this.collectFiles();
    
    // 2. 스냅샷 생성 (병렬 읽기 + 해시)
    const snapshots: FileSnapshot[] = await Promise.all(
      files.map(async f => ({
        path: f,
        content: await fs.readFile(f),
        mtime: (await fs.stat(f)).mtimeMs,
        hash: xxhash64(await fs.readFile(f)),
        encoding: isBinary(await fs.readFile(f)) ? 'binary' : 'utf8',
        isNew: !await this.isGitTracked(f),
      }))
    );
    
    // 3. 체크포인트 객체 생성
    const cp: Checkpoint = {
      id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      timestamp: Date.now(),
      snapshots,
      metadata: { trigger, agentTurn: this.currentTurn, gitCommit: await this.getHeadSHA(), stats: {...} },
    };
    
    // 4. 저장 (메모리 + 디스크 직렬화)
    this.checkpoints.unshift(cp);
    if (this.checkpoints.length > this.maxCheckpoints) this.checkpoints.pop();
    await this.persist();
    
    return cp.id;
  }

  async restore(checkpointId: string, options: RestoreOptions = {}): Promise<RestoreResult> {
    const cp = this.checkpoints.find(c => c.id === checkpointId);
    if (!cp) throw new Error('Checkpoint not found');
    
    const edit = new vscode.WorkspaceEdit();
    let restored = 0, deleted = 0, skipped = 0;
    
    for (const snap of cp.snapshots) {
      const uri = vscode.Uri.file(path.join(this.workspaceRoot, snap.path));
      
      if (snap.isNew && options.untrackedPolicy === 'delete') {
        // 체크포인트 생성 후에 생긴 untracked 파일 → 삭제
        const edit = new vscode.WorkspaceEdit();
        edit.deleteFile(vscode.Uri.file(path.join(this.workspaceRoot, snap.path)));
        await vscode.workspace.applyEdit(edit);
        deleted++;
        continue;
      }
      
      // 파일 내용 복원
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        vscode.Uri.file(path.join(this.workspaceRoot, snap.path)),
        new vscode.Range(0, 0, Infinity, Infinity),
        new TextDecoder(snap.encoding).decode(snap.content)
      );
      await vscode.workspace.applyEdit(edit);
      restored++;
    }
    
    // 스테일니스 검증: 현재 mtime/hash와 비교
    const stale = await this.detectStaleFiles(cp);
    
    return { restored, deleted, skipped, staleFiles: stale };
  }
}
```

### 3.2 스테일니스 검증 (Staleness Check)

```typescript
async function detectStaleFiles(cp: Checkpoint): Promise<StaleFile[]> {
  const stale: StaleFile[] = [];
  
  for (const snap of cp.snapshots) {
    const filePath = path.join(workspaceRoot, snap.path);
    
    try {
      const stat = await fs.stat(filePath);
      const currentContent = await fs.readFile(filePath);
      const currentHash = xxhash64(currentContent);
      
      // 체크포인트 생성 후 외부에서 수정됨
      if (stat.mtimeMs > cp.timestamp && currentHash !== snap.hash) {
        stale.push({
          path: snap.path,
          checkpointHash: snap.hash,
          currentHash,
          checkpointTime: snap.mtime,
          currentTime: stat.mtimeMs,
        });
      }
    } catch (e) {
      // 파일 삭제됨 → 스테일 아님 (복원 대상)
    }
  }
  return stale;
}
```

---

## 4. UI/UX Specification

### 4.1 체크포인트 타임라인 (채팅 사이드바)
```
🕐 Checkpoints
├─ 📍 cp-1705123456-abc1  "Before refactor auth"     2 min ago  [Restore] [Delete]
│   Files: 12 changed, 3.2 KB
│   Turn: 3 | Trigger: first_write
├─ 📍 cp-1705123400-def2  "User requested"           5 min ago  [Restore] [Delete]
│   Files: 5 changed, 1.1 KB
│   Turn: 1 | Trigger: user_request
└─ 📍 cp-1705123300-ghi3  "Plan approved"            10 min ago [Restore] [Delete]
    Files: 0 changed (pre-emptive)
    Turn: 0 | Trigger: plan_approved
```

### 4.2 롤백 확인 모달
```
┌─ Restore Checkpoint: "Before refactor auth" ────────────────────────┐
│  This will revert 12 files to state at 14:32:10                     │
│                                                                     │
│  Files to restore: 12                                               │
│  New files since checkpoint (untracked): 3  →  [Delete] [Keep] [Ask]│
│  Stale files (modified externally): 2  →  [Show details]           │
│                                                                     │
│  [Cancel]                    [Restore]                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Checkpoints & Rollback

  Scenario: Auto-checkpoint before first write
    Given agent in Agent mode
    When user asks "Add null check to getUser"
    And agent calls edit_file for first time
    Then checkpoint "Before edit: getUser null check" created silently
    And checkpoint appears in timeline

  Scenario: Manual checkpoint via command
    When user types "/checkpoint Before risky refactor"
    Then checkpoint created with label "Before risky refactor"
    And appears in timeline immediately

  Scenario: Rollback restores files correctly
    Given checkpoint exists with 5 file snapshots
    And user modified 3 of those files since
    When user clicks [Restore] on checkpoint
    Then 3 modified files revert to checkpoint content
    And 2 unchanged files unchanged
    And new untracked files handled per policy (keep/delete/ask)

  Scenario: Stale file detection warns user
    Given checkpoint created at 10:00
    And external process modified config.json at 10:05
    When user tries to restore checkpoint
    Then warning "config.json modified externally since checkpoint"
    And user can choose: overwrite / skip / view diff

  Scenario: Checkpoint limit enforced
    Given maxCheckpoints = 3
    When 4th checkpoint created
    Then oldest (1st) automatically removed
    And only latest 3 remain

  Scenario: Checkpoint persists across VS Code restart
    Given checkpoints exist
    When VS Code restarted
    Then timeline shows previous checkpoints
    And restore works without re-indexing
```

---


## Out of Scope

- 제품 UX 전체 재정의 (Feature PRD / Spec Primary 참고)
- 상세: Canonical Owner Matrix in `00_Master_Context.md`

## 5. References

- `PRD-C2_Agent_SingleTurn.md` — 첫 쓰기 시 체크포인트 자동 생성
- `PRD-C4_Infrastructure.md` — 인프라 통합 (훅, 컴팩션, 둠 루프와 연계)
- `PRD-Harness-10_Verification_MicroLoop.md` — 수정 후 검증 실패 시 자동 롤백 제안
- VS Code WorkspaceEdit: https://code.visualstudio.com/api/references/vscode-api#WorkspaceEdit