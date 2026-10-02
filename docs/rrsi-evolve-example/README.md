# Evolve set 예제

RRSI가 진화를 관찰하는 태스크 묶음. `docs/rrsi-evolve-example/tasks/*.json`이
형식 참조다. 실제 운영 시 global storage 아래 `evolve/tasks/`로 복사하거나
저장소의 별도 디렉터리를 `AgentKCodingDomain`에 지정한다.

필드:
- `id` — 고유 태스크 식별자 (히스토리/프론티어의 키)
- `prompt` — 워커에게 보낼 지시
- `repo` — 실행할 저장소 경로 (evolve set 기준 상대, 기본 `.`)
- `verify` — 에이전트 종료 후 실행할 검증 명령 (exit code로 pass/fail)
- `requirements` — 사람이 읽는 요구사항 (1:1 검증 대응 권장)
- `timeoutMs` — 에이전트 런 타임아웃

규칙:
- `heldout/` 태스크는 진화에 절대 사용하지 않는다 (OOD 확인용).
- `verify` 명령은 결정적이어야 한다 (네트워크/랜덤 의존 금지).
