# RRSI — Agent-K Harness Self-Improvement

`google-research/rrsi`(Apache-2.0)의 Algorithm 1/2를 Agent-K에 포팅한 구현.
에이전트의 작업 데이터(evidence)를 보고 **harness 정책만** 재귀적으로 개선한다.
코어 런타임·안전 경계는 절대 건드리지 않는다.

## 아키텍처

```
packages/rrsi/                      ← 순수 검색 코어 (vscode/AgentLoop 무의존)
├── evidence/evaluate.ts            S_hat/C_hat (missing trial = 0, 전체 분모)
├── search/
│   ├── selection.ts                Algorithm 2: noise floor + cost rule + novelty
│   ├── history.ts                  JSONL 편집 기록 (tried/yield/prune 집합)
│   ├── schedule.ts                 annealed edit budget b_t
│   ├── components.ts               K 태그, text_only, diff 기반 복구
│   ├── critic.ts                   결정론 precheck (credential denylist)
│   ├── criticLlm.ts                critic LLM 레이어 (누수/디제너러시/그레이더 게이밍)
│   ├── calibrate.ts                δ 노이즈 밴드 자동 추정
│   └── propose.ts                  Analyst + Proposer (LLM 주입형)
├── policy/schema.ts                ★ RRSI의 유일한 Agent-K 쓰기 표면
├── domain/
│   ├── domain.ts                   Domain 어댑터 + verification 가중 reward
│   └── loop.ts                     라운드 드라이버 (Algorithm 1+2)
└── trajectory/recorder.ts          런당 evidence JSONL

packages/host/src/rrsi/rrsiHost.ts  ← vscode 연결 (global storage 바인딩)
```

## 안전 경계 (테스트로 잠김)

RRSI가 수정할 수 있는 것은 **`harness/policies/*.policy.json` 데이터뿐**이다.

1. **non-policy 파일 제안 → 즉시 critic_reject** (`loop.test.ts`)
2. **스키마 위반 JSON → eval_invalid** — 미지 키/타입 드리프트/enum 이탈 거부
3. **critic 선행** — 평가 비용을 쓰기 전에 결정론 precheck + LLM 누수 스크린
4. **worktree 격리** — 후보는 독립 worktree/디렉터리에서만 평가, accept 시에만 반영
5. **missing trial = 0** — 후보가 어려운 trial을 파괴해서 유리해질 수 없음
6. **cost rule** — ΔC ≤ β₀ + β₁·ΔS (토큰 증가는 측정된 gain으로 지불)

불변 영역: `core/runtime`, `safety`, tool permission, git safety, verification invariant.

## 정책 파일 (RRSI가 진화시키는 것)

```
harness/policies/
├── verification.policy.json   검증 순서/강도 (steps 배열, maxPostEditAttempts)
├── microloop.policy.json      observe→act→verify 사이클 구성 (extraSteps enum)
├── prefetch.policy.json       선행 조회 신호 (signals enum)
└── worker.policy.json         worker 지시문 + maxTurns (1..100)
```

스키마: `packages/rrsi/src/policy/schema.ts` — 미지 키 거부, 화이트리스트 enum,
범위 검사. 정책이 **데이터**이므로 임의 코드 실행 경로가 생기지 않는다.

## 사용법

### 런 기록 (자동)
확장 활성화 시 `globalStorage/rrsi/`에 바인딩되고, 모든 chat.send가
trajectory(JSONL)를 기록한다. 수동 개입 불필요.

### 진화 루프 실행 (호스트 스크립트에서)

```ts
import { RRSILoop } from '@agent-k/rrsi';

const loop = new RRSILoop(
  { runsDir, policiesDir },
  {
    domain: new MyCodingDomain(),        // Domain 어댑터 구현
    generate: myModelBridge,             // proposer/analyst/critic 호출
    evaluate: async ({ policyDir, worktreePath, tasks, k }) => { ... },
    createWorktree, removeWorktree,
  },
  { T: 20, k: 2, m: 2, delta: null /* calibrate로 추정 */, ... }
);

await loop.baseline();     // Evaluate(H_0), frontier.json 시드
await loop.round(0);       // analyze → propose → screen → evaluate → select
```

### δ 캘리브레이션

```ts
const cal = calibrate([ev1, ev2]);  // 같은 harness 2회 평가
// 또는 1회 평가로 bootstrap
loop.config = { ...loop.config, delta: cal.delta };
```

## 진화 대상 vs 불변 (원 설계대로)

| Agent-K 컴포넌트 | RRSI가 최적화 |
|---|---|
| Evidence-first | 정책의 verification.steps |
| Prefetch | prefetch.signals |
| Micro-loop | microloop.extraSteps |
| Worker | worker.appendix / maxTurns |
| Verification Loop | verification.steps / maxPostEditAttempts |

| 불변 | 이유 |
|---|---|
| core/runtime | 안정 표면 (STREAM/CHAT 계약) |
| safety | SAFE-* 게이트 |
| tool permission | SAFE-001 |
| git/worktree 안전 | WT-*, R-003 |

## Phase 잔여

- **evolve set**: 실제 태스크 묶음 작성 (Domain 어댑터가 읽는 형식) — self-hosting 진화의 전제
- **critic LLM은 host 모델 경로**: `GenerateFn`을 provider 브리지로 연결 필요
- **프론티어 gitops**: 현재 policy dir 복사 기반; `evolve/<domain>` 브랜치 fast-forward로 승격 가능
