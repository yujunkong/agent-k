# PRD-28: Skills / 핀 스킬

> **Priority**: A급 인접 · Cursor 최근 기능 (원본 2025–2026 표)  
> **Phase**: **C7**  
> **관련 PRD**: `PRD-Tools-F_Orchestration_Extension.md` (`skill`), `PRD-Infra-01_Instructions_Rules.md`, `PRD-C7_Production_Grade.md`, `PRD-15_Memories.md`

---

## 1. Overview

### 목적
반복 워크플로를 **스킬 패키지**로 묶고, UI에서 핀해 매 턴(또는 트리거 시) 프롬프트/도구 힌트로 주입한다.

### 비즈니스 가치
- 팀·개인 반복 지시 감소 (Memories와 보완: Memories=사실/선호, Skills=절차)
- 중급 모델에 “어떻게 일할지”를 짧게 고정

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 개발자로서, “PR 올리기 전 체크” 스킬을 핀해 Agent가 매번 같은 순서로 돌게 하고 싶다 |
| US-02 | 팀으로서, `.agentk/skills/`에 스킬 md를 커밋해 공유하고 싶다 |

---

## 2. Functional Requirements

| FR-ID | 요구사항 |
|-------|----------|
| FR-01 | 스킬 정의: 이름, 설명, 트리거(수동 핀 / 키워드), 본문(프롬프트), 허용 도구 힌트 |
| FR-02 | 저장 위치: 워크스페이스 `.agentk/skills/*.md` (+ 유저 globalState) |
| FR-03 | 핀 UI: 채팅 헤더/설정에서 핀·해제 |
| FR-04 | 주입: 핀된 스킬을 Rules 옆 소예산 슬롯에 첨부 (Spec-03 예산 준수) |
| FR-05 | `skill` 도구: 모델이 필요 시 스킬 목록/본문 로드 (Tools-F) |
| FR-06 | Tier A: 동시 활성 스킬 수 캡 (예: ≤3) |

---

## 3. Non-Functional Requirements

| NFR-ID | 목표 |
|--------|------|
| NFR-01 | 스킬 본문 기본 truncate (예: 2k tokens/스킬) |
| NFR-02 | 시크릿을 스킬 md에 평문 저장 금지 |

---

## 4. Acceptance Criteria

- [ ] 핀한 스킬이 다음 Agent 턴 시스템 근처에 보임
- [ ] 핀 해제 즉시 주입 중단
- [ ] 워크스페이스 스킬 파일이 리로드됨
- [ ] Tier A에서 캡 초과 시 경고

---

## 5. Dependencies

| PRD | 관계 |
|-----|------|
| Tools-F | `skill` / `tool_search` |
| Infra-01 | Rules와 슬롯 분리 |
| Spec-03 | 토큰 예산 |
| PRD-15 | Memories와 역할 구분 |
| C7 | 구현 단계 |

---

## 6. Out of Scope

- Team MCP 마켓 / 스토어 풀 제품
- Cloud에서 팀 스킬 강제 배포 SaaS
- 자동으로 임의 장문 스킬 생성(환각) — 사용자가 편집·핀한 것만

---

## 7. References

`Extension_high_impact.md` — 최근 Cursor 기능 표 **Skills / 핀 스킬**, 도구 카탈로그 F절 `skill`
