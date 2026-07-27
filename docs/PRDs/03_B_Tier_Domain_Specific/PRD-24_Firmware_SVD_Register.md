# PRD-24: 펌웨어 SVD 뷰어 · 레지스터 패널 (Firmware SVD Viewer & Register Panel)

> **Priority**: B급 (NI Firmware 특화)  
> **Phase**: C6~C7 (도메인 특화 후순위)  
> **관련 PRD**: `PRD-Tools-A_Search_Explore.md`, `PRD-Tools-D_Web_Browser_Media.md`

---

## 1. Overview

### 목적
**ARM Cortex-M / RISC-V** 등 임베디드 펌웨어 개발 시 **SVD(System View Description) XML**을 파싱해 **메모리 맵·레지스터·비트필드**를 트리/테이블로 시각화하고, 디버그 세션 중 **실시간 레지스터 값**을 패널에 표시한다. 기존 NI Firmware 확장의 확장판을 Agent K 확장으로 이식.

### 비즈니스 가치
- **데이터시트 안 봐도 됨**: SVD에서 레지스터·비트필드 설명 바로 확인
- **디버그 가속**: 브레이크포인트 걸렸을 때 레지스터 패널 자동 갱신
- **팀 공유**: `.svd` 파일 워크스페이스 커밋 → 팀원 모두 같은 뷰 공유

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 펌웨어 엔지니어로, `STM32F4xx.svd` 열면 주변장치(GPIO, UART, SPI…) 트리가 뜨고 클릭 시 레지스터 테이블·비트필드 설명 보이길 원한다 |
| US-02 | 디버그 중 브레이크포인트 걸리면 레지스터 패널이 현재 값(hex/dec/bin)으로 갱신되고, 비트필드별로 하이라이트되길 원한다 |
| US-03 | 팀 리더로, `.svd` 파일을 리포에 커밋해 신입도 데이터시트 없이 레지스터 볼 수 있게 하고 싶다 |

---

## 2. Functional Requirements

### 2.1 SVD 파싱 및 뷰
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | SVD 로드 | `.svd` 파일 드롭 또는 명령 `Agent K: Load SVD` → XML 파싱 |
| FR-02 | 주변장치 트리 | `device/peripherals/peripheral` 계층 트리 (그룹: System, GPIO, UART, SPI…) |
| FR-03 | 레지스터 테이블 | 주변장치 선택 시: 오프셋, 이름, 설명, 접근(R/W), 리셋값, 크기 |
| FR-04 | 비트필드 상세 | 레지스터 클릭 → 비트필드별: 위치, 폭, 이름, 설명, 열거값(enum) |
| FR-05 | 검색/필터 | 주변장치/레지스터/비트필드 이름으로 통합 검색 |
| FR-06 | 주소 계산 | 기본 주소 + 오프셋 = 절대 주소 자동 표시 (0x40020000 + 0x14 = 0x40020014) |
| FR-07 | 다중 SVD | 여러 `.svd` 탭 전환 (예: STM32F4 + 커스텀 IP) |

### 2.2 디버그 연동 레지스터 패널
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-08 | 디버그 어댑터 연동 | `cortex-debug` / `native-debug` 세션 이벤트 구독 |
| FR-09 | 실시간 갱신 | 브레이크/스텝 시 레지스터 값 재조회 (`readMemory` 또는 DAP) |
| FR-10 | 변경 하이라이트 | 이전 값과 다른 비트/레지스터 **노란 배경** + 변경 전 값 툴팁 |
| FR-11 | 비트필드 디코딩 | 값(예: 0x00000003) → 비트필드별 의미 표시 (`GPIO_MODER_MODER0 = Output`) |
| FR-12 | 쓰기 지원 | 레지스터 값 더블클릭 → 16진/10진/2진 입력 → `writeMemory`로 타겟에 반영 |
| FR-13 | 즐겨찾기 | 자주 보는 레지스터(예: `RCC_CR`, `GPIO_ODR`) 별표로 상단 고정 |

### 2.3 SVD 메타데이터 관리
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-14 | 내장 SVD 캐시 | 공통 MCU(STM32, nRF, ESP32, RP2040) SVD 내장 번들 (라이선스 확인) |
| FR-15 | 사용자 SVD 추가 | 워크스페이스 `.vscode/svd/` 폴더 드롭 자동 인식 |
| FR-16 | 버전 관리 | SVD 파일에 `vendor/version` 메타 표시, 업데이트 알림 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | SVD 파싱 시간 | 1MB XML < 500ms (스트리밍 파서) |
| NFR-02 | 레지스터 패널 갱신 지연 | 브레이크 후 < 200ms |
| NFR-03 | 메모리 사용량 | SVD 트리 + 패널 < 50MB |
| NFR-04 | 오프라인 동작 | SVD 뷰는 디버그 없이도 완전 동작 |

---

## 4. API & Technical Spec

### 4.1 SVD 파서 (`src/firmware/svdParser.ts`)

```typescript
// SVD XML → 타입스크립트 인터페이스 (간소화)
export interface SVDDevice {
  name: string;
  version: string;
  addressUnitBits: 8 | 16 | 32;
  width: 32;
  peripherals: SVDPeripheral[];
  vendor?: string;
  vendorID?: string;
}

export interface SVDPeripheral {
  name: string;
  description?: string;
  groupName?: string;
  baseAddress: number;
  addressBlock?: { offset: number; size: number; usage: 'registers' | 'buffer' | 'flash' };
  interrupt?: SVDInterrupt[];
  registers: SVDRegister[];
  derivedFrom?: string;  // 상속
}

export interface SVDRegister {
  name: string;
  description?: string;
  addressOffset: number;
  size: 8 | 16 | 32 | 64;
  access: 'read-only' | 'write-only' | 'read-write' | 'read-writeOnce' | 'writeOnce';
  resetValue: number;
  resetMask?: number;
  fields: SVDField[];
  alternateRegister?: SVDRegister[]; // 배열 레지스터
  alternateGroup?: string;
}

export interface SVDField {
  name: string;
  description?: string;
  bitOffset: number;
  bitWidth: number;
  access?: 'read-only' | 'write-only' | 'read-write';
  enumeratedValues?: SVDEnumeratedValue[];
  writeConstraint?: 'writeZeros' | 'writeOnes' | 'write0ToClear' | 'write1ToClear' | 'write0ToSet' | 'write1ToSet';
}

export interface SVDEnumeratedValue {
  name: string;
  description?: string;
  value: number;
  isDefault?: boolean;
}

// 파서: fast-xml-parser 스트리밍
export async function parseSVD(xml: string): Promise<SVDDevice> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const json = parser.parse(xml);
  return transformSVD(json.device);
}
```

### 4.2 레지스터 패널 Webview (`src/views/svdRegisterPanel.ts`)

```typescript
export class SVDRegisterPanel {
  private svd: SVDDevice;
  private debugSession: vscode.DebugSession | undefined;
  private currentValues: Map<string, number> = new Map(); // key: "peripheral.register"

  async registerDebugListener(session: vscode.DebugSession) {
    this.debugSession = session;
    session.onDidTerminate(() => this.clearHighlight());
    
    // 브레이크/스텝 시 값 갱신
    session.onDidChangeBreakpoints(() => this.refresh());
    // 또는 custom event: cortex-debug fires 'memoryChanged'
  }

  async refresh() {
    if (!this.debugSession) return;
    const peripherals = this.svd.peripherals.filter(p => p.registers.length > 0);
    
    for (const p of peripherals) {
      for (const reg of p.registeres) {
        const addr = p.baseAddress + reg.addressOffset;
        const value = await this.readRegister(addr, reg.size);
        const key = `${p.name}.${reg.name}`;
        const prev = this.currentValues.get(key);
        this.currentValues.set(key, value);
        this.postUpdate(key, value, prev); // Webview로 전송
      }
    }
  }

  private async readRegister(address: number, size: number): Promise<number> {
    // cortex-debug: customRequest('readMemory', { address, bytes: size/8 })
    // native-debug: debugSession.customRequest('readMemory', ...)
    const resp = await this.debugSession.customRequest('readMemory', { 
      address: `0x${address.toString(16)}`, 
      count: size / 8 
    });
    return parseInt(resp.data[0], 16);
  }
}
```

### 4.3 Webview UI (React/Vanilla JS)

```html
<!-- SVD Viewer Layout -->
<div class="svd-viewer">
  <header>
    <select id="svdSelect">Loaded SVDs...</select>
    <input type="search" placeholder="Search peripheral/register/field..." id="svdSearch">
  </header>
  <div class="panes">
    <!-- 좌측: 주변장치 트리 -->
    <aside class="peripheral-tree" id="peripheralTree">
      <details open><summary>🔧 System Control (0xE000E000)</summary>
        <ul>
          <li data-reg="SCB_CPUID">CPUID Base Register</li>
          <li data-reg="SCB_ICSR">Interrupt Control State Register</li>
        </ul>
      </details>
      <details><summary>📍 GPIOA (0x48000000)</summary>
        <ul>
          <li data-reg="GPIOA_MODER" class="fav">★ GPIO port mode register</li>
          <li data-reg="GPIOA_ODR">GPIO port output data register</li>
        </ul>
      </details>
    </aside>

    <!-- 우측: 레지스터 상세 -->
    <section class="register-detail" id="registerDetail">
      <header>
        <h3>GPIOA_MODER <span class="addr">0x48000000</span></header>
        <div class="meta">Offset: 0x00 | Size: 32-bit | Access: RW | Reset: 0xA8000000</div>
      </header>
      <table class="bitfield-table">
        <thead><tr><th>Bits</th><th>Name</th><th>Description</th><th>Value</th><th>Enum</th></tr></thead>
        <tbody>
          <tr class="changed" data-bit="0-1" title="Previous: 00">
            <td>1:0</td><td>MODER0</td><td>Port 0 mode</td>
            <td class="val"><input type="text" value="10" size="4"></td>
            <td><select><option value="00">Input</option><option value="01" selected>Output</option><option value="10">Alt func</option><option value="11">Analog</option></select></td>
          </tr>
          <tr data-bit="2-3">
            <td>3:2</td><td>MODER1</td><td>Port 1 mode</td>
            <td class="val">00</td>
            <td>...</td>
          </tr>
        </tbody>
      </table>
      <div class="raw-value">
        Raw: <input type="text" value="0xA8000003" id="rawInput"> 
        <button onclick="writeReg()">Write</button>
      </div>
    </section>
  </div>
</div>
```

---

## 5. UI/UX Specification

### 5.1 SVD 뷰어 메인
```
┌─ SVD Viewer ────────────────────────────────────────────────────────┐
│  [STM32F407.svd ▼]  [🔍 Search: GPIO]  [+ Add SVD]                 │
├──────────────────────────────────────────────────────────────────────┤
│ Peripherals                    │ Register Detail: GPIOA_MODER        │
│ ┌────────────────────────────┐ ├──────────────────────────────────┤  │
│ │ 🔧 System Control          │ │ GPIOA_MODER  @ 0x48000000         │
│ │   ▸ SCB                     │ │ Offset: 0x00 | 32-bit | RW       │
│ │   ▸ SysTick                 │ │ Reset: 0xA8000000                │
│ │ 📍 GPIOA (0x48000000)  ★    │ ├──────────────────────────────────┤
│ │   ▸ MODER        ▲         │ │ Bits  Name        Description    │
│ │   ▸ OTYPER       │         │ │ 1:0   MODER0      Port 0 mode    │
│ │   ▸ OSPEEDR      │         │ │       00=In  01=Out 10=AF 11=An  │
│ │   ▸ PUPDR        │         │ │ 3:2   MODER1      Port 1 mode    │
│ │   ▸ IDR          │         │ │ ...                              │
│ │   ▸ ODR      ●●● │         │ ├──────────────────────────────────┤
│ │   ▸ BSRR         │         │ │ Raw Value: 0xA8000003  [Write]   │
│ │   ▸ LCKR         │         │ └──────────────────────────────────┘
│ │   ▸ AFRL         │         │                                     │
│ │   ▸ AFRH         │         │ Bitfield Decoder:                   │
│ │ 📍 GPIOB         │         │   MODER0 = 0b10 → Alternate Func   │
│ │ 📡 USART1        │         │   MODER1 = 0b00 → Input            │
│ │ 📡 SPI1          │         │                                     │
│ └────────────────────────────┘                                     │
└────────────────────────────────────────────────────────────────────┘
```

### 5.2 디버그 중 레지스터 패널 (하단 패널)
```
┌─ Registers (Live) ──────────────────────────────────────────────────┐
│  ★ Favorites:  GPIOA_ODR=0x00000003  RCC_CR=0x00000083              │
│  ⚠ Changed since last break: GPIOA_MODER (was 0xA8000000)           │
├──────────────────────────────────────────────────────────────────────┤
│ GPIOA_MODER  0x48000000  RW  0xA8000003  ▼  (changed: bits 0-1)     │
│   1:0 MODER0 = 0b11 (Analog)  ← was 0b10 (Alt Func)                │
│   3:2 MODER1 = 0b00 (Input)                                         │
│   ...                                                                │
│ RCC_CR       0x40021000  RW  0x00000083  ▼                          │
│   0  HSION = 1 (HSI oscillator ON)                                 │
│   1  HSIRDY = 1 (HSI ready)                                        │
│   7  PLLON = 0                                                     │
│                                                                        │
│ [Refresh] [Read All] [Write Selected] [Clear Highlights]            │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Firmware SVD Viewer & Register Panel

  Scenario: Load STM32 SVD and browse GPIO registers
    Given user runs "Agent K: Load SVD" and selects STM32F407.svd
    When user expands GPIOA in peripheral tree
    Then MODER, OTYPER, OSPEEDR, PUPDR, IDR, ODR, BSRR, LCKR, AFRL, AFRH listed
    And clicking MODER shows 16 bitfields (MODER0..MODER15) with enums
    And address shows 0x48000000 (base 0x48000000 + offset 0x00)

  Scenario: Debug session updates register panel
    Given SVD loaded and debug session started (cortex-debug)
    When breakpoint hit at GPIOA->ODR write
    Then register panel auto-refreshes
    And GPIOA_ODR shows new value with yellow highlight
    And bitfield decoder shows "ODR0=1, ODR1=1"

  Scenario: Write register from panel
    Given user double-clicks GPIOA_ODR raw value
    And enters 0x00000005
    And clicks Write
    Then debug adapter writes 0x5 to 0x48000014
    And panel refreshes showing new value

  Scenario: Bitfield enum decode
    Given GPIOA_MODER value 0x00000002 (binary 10)
    When register detail opened
    Then MODER0 shows "Alternate Function (10)" with enum dropdown

  Scenario: Multiple SVD tabs
    Given user loads STM32F4.svd and CustomIP.svd
    Then two tabs in SVD viewer
    And each maintains independent search/tree state
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `cortex-debug` / `native-debug` | 런타임 | 디버그 어댑터 이벤트 구독 |
| `fast-xml-parser` | npm | SVD 스트리밍 파서 (MIT) |
| `PRD-Tools-D_Web_Browser_Media.md` | 병행 | Webview UI 공통 컴포넌트 |
| CMSIS-SVD 리포지토리 | 데이터 | 공통 MCU SVD 소스 (Apache 2.0) |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | SVD 파서 + 타입 정의 + 검증 테스트 | `parseSVD()` 100% 커버리지 |
| 2 | 주변장치 트리 Webview + 검색 | 트리 UI, 가상화(1000+ 노드) |
| 3 | 레지스터/비트필드 상세 뷰 + 비트필드 디코더 | 테이블 + enum 드롭다운 |
| 4 | 디버그 어댑터 연동 (cortex-debug 커스텀 리퀘스트) | 실시간 갱신, 변경 하이라이트 |
| 5 | 레지스터 쓰기 + 즐겨찾기 + 다중 SVD | 완전한 패널 |
| 6 | 내장 SVD 번들 (STM32, nRF, ESP32, RP2040) | 오프라인 즉시 사용 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| SVD 스키마 변형(벤더별 확장) | 중간 | 유연한 파서 + `derivedFrom` 상속 처리, 알 수 없는 요소 무시 |
| 디버그 어댑터 메모리 읽기 권한/속도 | 중간 | 배치 읽기(`readMemory` 다중 주소), 캐싱, 타임아웃 500ms |
| 대형 SVD (10MB+) 파싱 지연 | 낮음 | Web Worker에서 스트리밍 파싱, 인덱스 캐싱 |
| 라이선스 문제 (ARM SVD 재배포) | 높음 | Apache 2.0 / BSD 라이선스만 내장, 사용자 직접 다운로드 가이드 |

---


## Out of Scope

- 본 도메인 외 범용 도구화 (Tools A–G에 억지 편입 금지)
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **B급: 펌웨어: SVD 뷰어 · 레지스터 패널**
- CMSIS-SVD: https://github.com/cmsis-svd/cmsis-svd-data
- Cortex-Debug Protocol: https://github.com/Marus/cortex-debug
- SVD Schema: https://developer.arm.com/tools-and-software/open-source-software/cmsis/svd