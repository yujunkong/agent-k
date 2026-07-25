# PRD-Spec-04: Terminal Execution (터미널 실행 모델)

> **Category**: Advanced Specs  
> **Priority**: ④ (Provider/JSON → Patch → Context → Terminal)  
> **Phase**: C2~C3 (첫 터미널 도구부터)  
> **관련 PRD**: `PRD-C2_Agent_SingleTurn.md`, `PRD-C3_Agent_MultiTurn.md`, `PRD-Tools-C_Terminal_Process.md`

---

## 1. Overview

### 목적
에이전트가 **안전하게 셸 명령어를 실행**하고, **출력을 모델에 구조화해 반환**하며, **타임아웃/시그널/권한**을 하네스가 제어한다.

### 비즈니스 가치
- **안전성**: `rm -rf /`, `curl \| sh` 등 위험 명령 차단
- **재현성**: CWD/ENV 세션 유지, 백그라운드 작업 관리
- **모델 친화**: 출력은 32KB 캡 + head/tail 보존, ANSI 색상 파싱

---

## 2. Functional Requirements

### 2.1 세션 모델
| 항목 | 스펙 |
|------|------|
| **세션당 셸** | 1개 (CWD/ENV 유지) |
| **백그라운드 잡** | 별도 PID 관리, `jobs` 명령으로 조회 |
| **인코딩** | UTF-8 강제, Windows `chcp 65001` |
| **신호 처리** | `SIGTERM` → 2초 후 `SIGKILL` |

### 2.2 도구 스펙 (`run_terminal_cmd`)

```typescript
interface RunTerminalCmdArgs {
  cmd: string;                    // 단일 명령 (파이프/리다이렉트 허용)
  cwd?: string;                   // 기본: 워크스페이스 루트
  timeoutMs?: number;             // 기본 30s, 빌드/테스트 10m까지 인자로 연장
  isBackground?: boolean;         // 백그라운드 잡 (PID 반환)
  env?: Record<string, string>;   // 추가 환경변수
}
```

### 2.3 반환 포맷 (`ToolResult`)

```json
{
  "callId": "call_abc123",
  "output": "stdout+stderr merged, max 32KB\n...(truncated, 45KB omitted)...",
  "metadata": {
    "exitCode": 0,
    "durationMs": 1234,
    "truncated": true,
    "originalBytes": 78000,
    "cwd": "/workspace",
    "pid": 12345
  }
}
```

---

## 3. Safety & Permission (안전/권한)

### 3.1 Allowlist (기본 허용 명령)

```json
{
  "terminal": {
    "patterns": [
      "^git ",
      "^npm (test|run|install|ci)",
      "^pnpm (test|run|install)",
      "^yarn (test|run|install)",
      "^pytest",
      "^jest",
      "^go test",
      "^cargo test",
      "^make",
      "^docker compose",
      "^kubectl (get|logs|describe|apply)",
      "^npm run lint",
      "^npm run typecheck"
    ],
    "blocked": [
      "rm -rf /",
      "curl.*\\|.*sh",
      "wget.*\\|.*sh",
      "chmod 777",
      "dd if=",
      "mkfs",
      "fdisk"
    ]
  }
}
```

### 3.2 권한 게이트 (`PermissionGate`)

```typescript
function checkTerminalPermission(cmd: string, level: PermissionLevel): PermissionDecision {
  // 1. 읽기 전용 아님 → deny (터미널은 exec)
  if (level === 'ask') return { allow: false, reason: 'Terminal requires approval', prompt: true };
  
  // 2. Deny globs
  if (matchesAny(cmd, config.terminal.blocked)) {
    return { allow: false, reason: 'Command matches blocked pattern' };
  }
  
  // 3. Allowlist
  if (!matchesAny(cmd, config.terminal.patterns)) {
    if (level === 'accept_edits') return { allow: false, reason: 'Not in allowlist', prompt: true };
    if (level === 'auto') return { allow: false, reason: 'Not in allowlist', prompt: true };
  }
  
  // 4. Destructive patterns (rm -rf, chmod 777 등)
  if (isDestructive(cmd)) {
    return { allow: false, reason: 'Destructive command', prompt: true };
  }
  
  return { allow: true };
}
```

---

## 3. Execution Model (`src/terminal/executor.ts`)

```typescript
export class TerminalExecutor {
  private shell: ShellSession;  // 단일 영구 세션
  private bgJobs = new Map<number, BackgroundJob>(); // PID -> Job

  async execute(args: RunTerminalCmdArgs, ctx: ToolContext): Promise<ToolResult> {
    // 1. 권한 체크
    const perm = await this.permissionGate.check({ name: 'run_terminal_cmd', args }, ctx);
    if (!perm.allow) return { error: perm.reason, prompt: perm.prompt };

    // 2. 타임아웃 설정
    const timeout = args.timeoutMs ?? this.getDefaultTimeout(args.cmd);
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout);

    // 3. 실행
    const start = Date.now();
    try {
      if (args.isBackground) {
        return await this.runBackground(args.cmd, args.cwd, args.env, abortController.signal);
      } else {
        return await this.runForeground(args.cmd, args.cwd, args.env, abortController.signal);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return { error: `Timeout after ${timeout}ms`, error: true };
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async runForeground(cmd: string, cwd: string, env: Record<string,string>, signal: AbortSignal): Promise<ToolResult> {
    // Windows: cmd.exe /c, Unix: bash -c
    const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
    const args = process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd];
    
    const proc = spawn(shell, args, {
      cwd: cwd ?? this.workspaceRoot,
      env: { ...process.env, ...env },
      windowsVerbatimArguments: true,
      signal,
    });

    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());

    const exitCode = await new Promise<number>((resolve, reject) => {
      proc.on('close', resolve);
      proc.on('error', reject);
      signal.addEventListener('abort', () => proc.kill('SIGTERM'));
    });

    const output = this.mergeAndTruncate(stdout, stderr);
    return { output, exitCode, duration: Date.now() - start };
  }

  private mergeAndTruncate(stdout: string, stderr: string): string {
    const combined = stdout + (stderr ? '\n[stderr]\n' + stderr : '');
    const maxBytes = 32 * 1024;
    const bytes = Buffer.from(combined, 'utf8');
    if (bytes.length <= maxBytes) return combined;
    // head + tail 보존
    const head = bytes.subarray(0, maxBytes / 2).toString('utf8');
    const tail = bytes.subarray(bytes.length - maxBytes / 2).toString('utf8');
    return `${head}\n...(truncated, ${bytes.length} bytes total)...\n${tail}`;
  }
}
```

---

## 4. Background Jobs & Monitoring

```typescript
interface BackgroundJob {
  pid: number;
  cmd: string;
  cwd: string;
  startTime: number;
  proc: ChildProcess;
}

async function runBackground(cmd: string, cwd: string, env: Record<string,string>): Promise<ToolResult> {
  const proc = spawn(shell, args, { cwd, env, detached: true });
  const job: BackgroundJob = { pid: proc.pid!, cmd, cwd, startTime: Date.now(), proc };
  this.bgJobs.set(proc.pid!, job);
  
  proc.on('close', (code) => {
    this.bgJobs.delete(proc.pid!);
    // 로그에 완료 기록
  });
  
  return { output: `Background job started (PID: ${proc.pid})`, metadata: { pid: proc.pid, background: true } };
}
```

### 도구: `await_terminal` / `monitor`
```typescript
// 백그라운드 잡 출력 스트리밍
async function awaitTerminal(pid: number, timeoutMs = 30000): Promise<ToolResult> {
  const job = this.bgJobs.get(pid);
  if (!job) return { error: 'Job not found' };
  
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve({ error: 'Timeout' }), timeoutMs);
    job.proc.once('close', (code) => {
      clearTimeout(timeout);
      resolve({ output: job.buffer, metadata: { exitCode: code } });
    });
  });
}
```

---

## 4. Acceptance Criteria

```gherkin
Feature: Terminal Execution

  Scenario: Allowlisted command runs and returns output
    Given permission level = "accept_edits"
    When agent calls run_terminal_cmd("npm test")
    Then command executes without prompt
    And output includes test results
    And exitCode = 0
    And durationMs recorded

  Scenario: Non-allowlisted command prompts
    Given permission level = "accept_edits"
    When agent calls run_terminal_cmd("custom-script.sh")
    Then permission gate shows modal with command preview
    And user must click "Allow Once" to proceed

  Scenario: Blocked command rejected
    When agent calls run_terminal_cmd("rm -rf /")
    Then permission gate rejects with "Command matches blocked pattern"
    And no execution occurs

  Scenario: Timeout kills process
    Given toolTimeout = 10 seconds
    When agent runs "sleep 20"
    After 10 seconds
    Then process killed with SIGTERM → SIGKILL
    And tool_result.error = "Timeout after 10000ms"

  Scenario: Output truncation preserves head/tail
    Given command outputs 100KB
    When tool_result returned
    Then output <= 32KB
    And contains first 16KB and last 16KB
    And contains "(truncated, 100KB total)"

  Scenario: Background job management
    When agent runs "npm run dev" with isBackground=true
    Then returns PID immediately
    And agent can call await_terminal(PID) to get final output
    And job cleaned up on completion

  Scenario: CWD/ENV persistence
    Given agent runs "cd src && export FOO=bar"
    When agent runs "echo $FOO" in next turn
    Then output contains "bar"
    And CWD is src/
```

---


## Out of Scope

- Spec 범위를 넘는 제품 기능 (Feature PRD로 위임)
- 상세: Canonical Owner Matrix

## 5. References

- `PRD-C2_Agent_SingleTurn.md` — 첫 터미널 도구 승인
- `PRD-Infra-05_Permission_Autorun.md` — 권한 게이트
- `PRD-Infra-12_MaxTurns_Timeout_Stop.md` — 타임아웃/AbortController
- `PRD-Tools-C_Terminal_Process.md` — 도구 상세 스펙