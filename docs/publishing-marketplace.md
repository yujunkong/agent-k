# Agent K — VS Code Marketplace / Open VSX 게시 가이드

> **Repo**: [https://github.com/yujunkong/agent-k](https://github.com/yujunkong/agent-k)  
> **대상**: Visual Studio Marketplace (VS Code) · (선택) Open VSX (Cursor 등)

이 문서는 Agent K 확장을 **패키징·게시**하는 절차를 정리한다.

---

## 1. 현재 프로젝트 기준값

[`package.json`](../package.json)에서 확인:

| 필드 | 현재 값 | 비고 |
|------|---------|------|
| `name` | `agent-k` | extension id의 뒤쪽 (`publisher.name`) |
| `displayName` | `Agent K` | 마켓에 보이는 이름 |
| `version` | `0.0.2` | semver |
| `publisher` | `agent-k` | **Marketplace Publisher ID와 반드시 동일** |
| `engines.vscode` | `^1.85.0` | 최소 VS Code 버전 |
| `main` | `./dist/extension.js` | 빌드 산출물 |

게시 전 `publisher`를 실제 계정에 맞게 통일한다.

- GitHub 사용자: `yujunkong`
- 선택지 A: Marketplace에 publisher ID `agent-k` 생성 (현재 `package.json` 유지)
- 선택지 B: `package.json`의 `publisher`를 `yujunkong`으로 변경 후 그 ID로 publisher 생성

마켓 URL 형태:

```text
https://marketplace.visualstudio.com/items?itemName=<publisher>.agent-k
```

예: `agent-k.agent-k` 또는 `yujunkong.agent-k`

---

## 2. 게시 전 체크리스트

### 필수

- [ ] `publisher` ↔ Azure Marketplace Publisher ID 일치
- [ ] `version`이 이전에 올린 빌드보다 높음 (재게시 시)
- [ ] `npm run package` 성공 (`vscode:prepublish`가 이걸 호출)
- [ ] README에 기능·설정·요구사항이 실제 제품과 맞음
- [ ] LICENSE 존재 (없으면 `vsce`가 경고 / 일부 정책에서 문제)

### 권장

- [ ] Marketplace 아이콘: `package.json`에 `"icon": "resources/icon.png"` (보통 **128×128 PNG**)
- [ ] `repository` 필드 추가:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/yujunkong/agent-k.git"
}
```

- [ ] `bugs` / `homepage` (선택)
- [ ] CHANGELOG.md (릴리스 노트)
- [ ] `.vscodeignore`로 소스·테스트·docs 대량이 vsix에 안 들어가게 유지  
  (현재 [`/.vscodeignore`](../.vscodeignore) 참고 — `src/**` 제외, `dist`는 포함되어야 함)

### 로컬 검증

```bash
# 타입체크 + lint + extension/webview 프로덕션 빌드
npm run package

# vsix 생성만 (게시 전 설치 테스트)
npx @vscode/vsce package

# 생성된 .vsix를 VS Code/Cursor에 설치
# Extensions → … → Install from VSIX…
```

---

## 3. Publisher 생성 (최초 1회)

1. Microsoft 계정으로 [Azure DevOps](https://dev.azure.com/) 로그인
2. [https://marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) 접속
3. **Create publisher**
   - **Publisher ID**: `package.json`의 `publisher`와 동일 (`agent-k` 또는 `yujunkong`)
   - Display name, 연락 이메일 등 입력
4. Publisher 생성 완료 확인

---

## 4. Personal Access Token (PAT)

`vsce login` / `vsce publish`에 사용한다.

1. Azure DevOps → 우측 상단 사용자 아이콘 → **Personal access tokens**  
   또는: `https://dev.azure.com/<org>/_usersSettings/tokens`
2. **New Token**
   - Organization: **All accessible organizations** (중요)
   - Expiration: 필요 기간
   - Scopes: **Marketplace** → **Manage** (Custom define)
3. 생성 후 토큰을 안전한 곳에 보관 (다시 볼 수 없음)

---

## 5. vsce 설치·로그인

```bash
# 전역 또는 npx
npm i -g @vscode/vsce

# Publisher ID로 로그인 (PAT 붙여넣기)
vsce login <publisher-id>
```

또는 환경변수:

```bash
export VSCE_PAT="<azure-devops-pat>"
```

---

## 6. 패키징

```bash
cd /path/to/agent-k

# 프로덕션 빌드 (package.json scripts.package)
npm run package

# .vsix 생성
npx @vscode/vsce package
# → agent-k-0.0.2.vsix 형태 산출
```

`vsce package` / `vsce publish` 시 `vscode:prepublish` → `npm run package`가 자동 실행된다.

---

## 7. Marketplace 게시

```bash
# 현재 package.json version으로 게시
npx @vscode/vsce publish

# 버전 올리고 게시
npx @vscode/vsce publish patch   # 0.0.2 → 0.0.3
npx @vscode/vsce publish minor   # 0.0.2 → 0.1.0
npx @vscode/vsce publish major   # 0.0.2 → 1.0.0

# 이미 만든 vsix로 게시
npx @vscode/vsce publish --packagePath ./agent-k-0.0.2.vsix
```

게시 후:

1. [Marketplace Manage](https://marketplace.visualstudio.com/manage)에서 상태 확인
2. 검색 반영까지 **수분~수십 분** 걸릴 수 있음
3. VS Code → Extensions → `Agent K` 검색

---

## 8. (선택) Open VSX 게시

Cursor 등 VS Code 호환 에디터는 Open VSX를 쓰는 경우가 많다.

1. [https://open-vsx.org/](https://open-vsx.org/) 계정 생성
2. Access Token 발급
3. 게시:

```bash
npx ovsx publish ./agent-k-0.0.2.vsix -p <open-vsx-token>
# 또는
npx ovsx publish -p <open-vsx-token>
```

---

## 9. 업데이트 릴리스 흐름 (반복)

1. 코드 변경 → 커밋/푸시 (GitHub)
2. `package.json` `version` 올리기 (또는 `vsce publish patch|minor|major`)
3. CHANGELOG에 변경 요약
4. `npx @vscode/vsce publish`
5. Marketplace / Open VSX에서 새 버전 확인

---

## 10. 자주 나는 오류

| 증상 | 원인 / 조치 |
|------|-------------|
| `Publisher name mismatch` | `package.json` `publisher` ≠ login한 publisher ID |
| `401 / Invalid token` | PAT scope에 Marketplace Manage 없음, 또는 org가 All accessible가 아님 |
| `version already exists` | 같은 version 재게시 불가 → version bump |
| vsix가 너무 큼 | `.vscodeignore`에 `docs/`, `tests/`, `src/` 등 확인 |
| 확장 설치 후 안 뜸 | `main` 경로·`activationEvents`·빌드 산출물(`dist/`) 누락 확인 |
| README 이미지 깨짐 | Marketplace는 상대경로 이미지; 외부 URL은 허용 정책 확인 |

---

## 11. 관련 명령 요약

```bash
# 빌드
npm run package

# 패키지
npx @vscode/vsce package

# 게시 (VS Marketplace)
vsce login <publisher-id>
npx @vscode/vsce publish

# 게시 (Open VSX)
npx ovsx publish -p <token>

# GitHub (이미 연동된 경우)
git push origin main
```

---

## 참고 링크

- [Publishing Extensions (VS Code docs)](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Marketplace Manage](https://marketplace.visualstudio.com/manage)
- [@vscode/vsce](https://github.com/microsoft/vscode-vsce)
- [Open VSX](https://open-vsx.org/)
- Agent K repo: [yujunkong/agent-k](https://github.com/yujunkong/agent-k)
