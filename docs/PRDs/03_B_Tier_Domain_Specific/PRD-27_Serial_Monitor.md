# PRD-27: 시리얼 모니터 패널 (Serial Monitor Panel)

> **Priority**: B급 (임베디드 개발 필수)  
> **Phase**: C6~C7  
> **관련 PRD**: `PRD-Tools-C_Terminal_Process.md`, `PRD-24_Firmware_SVD_Register.md`

---

## 1. Overview

### 목적
VS Code 내에서 **시리얼 포트(UART, USB CDC, JTAG-SWD 등)를 모니터링/송신**하는 패널을 제공한다. PlatformIO/Arduino IDE의 시리얼 모니터와 동등 이상의 UX를 확장만으로 제공.

### 비즈니스 가치
- **컨텍스트 스위칭 제로**: 코드 편집 ↔ 시리얼 모니터 탭 전환 불필요
- **디버그 연동**: 브레이크포인트 시 시리얼 출력 자동 일시정지/재개
- **다중 포트**: MCU + 블루투스 모듈 + 로거 동시 모니터링

### 사용자 스토리
| ID | 스토리 |
|----|--------|
| US-01 | 펌웨어 엔지니어로, `printf` 디버그 출력을 VS Code 하단 패널에서 실시간 보고 싶다 (115200 baud, ANSI 색상 지원) |
| US-02 | 개발자로, 보드 리셋 버튼 누르면 시리얼 모니터가 자동 재연결되고 부팅 로그 놓치지 않게 하고 싶다 |
| US-03 | 팀원으로, 시리얼 로그를 파일로 저장하고 팀원과 공유해 "이 에러 재현해줘" 할 때 붙여넣기만 하면 되게 하고 싶다 |

---

## 2. Functional Requirements

### 2.1 포트 관리
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-01 | 포트 자동 감지 | `serialport` 라이브러리로 `/dev/ttyUSB*`, `COM*`, `/dev/ttyACM*` 실시간 나열 |
| FR-02 | 필터/정렬 | VID/PID, 제조사, 설명(예: "STLink", "CH340")로 필터, 즐겨찾기 상단 고정 |
| FR-03 | 다중 세션 | 탭으로 여러 포트 동시 오픈 (각각 독립 버퍼/설정) |
| FR-04 | 자동 재연결 | 포트 분리/보드 리셋 시 설정 유지하며 자동 재시도 (지수 백오프) |

### 2.2 통신 설정
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-05 | 보레이트 | 드롭다운(300~4000000) + 커스텀 입력 |
| FR-06 | 데이터/패리티/스톱 | 8N1, 8E1, 8O1, 7N1 등 프리셋 + 커스텀 |
| FR-07 | 플로우 제어 | None, RTS/CTS, XON/XOFF |
| FR-08 | 인코딩 | UTF-8, ASCII, Latin1, CP949, GBK + 커스텀 |
| FR-09 | 줄 끝 처리 | LF, CR, CRLF, 없음 (송신/수신 독립 설정) |

### 2.3 모니터링 UX
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-10 | 실시간 스트리밍 | 논블로킹 읽기, 100ms마다 버퍼 플러시 |
| FR-11 | ANSI 색상/이모지 | ESC 시퀀스 파싱 → 렌더링 (xterm-256color 호환) |
| FR-12 | 타임스탬프 | 절대/상대/없음, 포맷 커스텀 (`[HH:mm:ss.fff]`) |
| FR-13 | 필터/하이라이트 | 정규식 필터(포함/제외), 키워드 하이라이트(에러/경고/정보 색상) |
| FR-14 | 일시정지/재개 | 버튼으로 수신 일시정지(버퍼링), 재개 시 버퍼 플러시 |
| FR-15 | 송신 입력창 | 하단 입력란, 히스토리(↑/↓), 전송 버튼/Enter, 16진수 모드(`\x01\x02`) |

### 2.4 고급 기능
| FR-ID | 요구사항 | 상세 |
|-------|----------|------|
| FR-16 | 로그 파일 저장 | 회전 로그(일/크기), 압축 옵션, 자동 파일명(`serial-2024-01-15_14-30.log`) |
| FR-17 | 프로토콜 디코더 | 플러그인: Modbus RTU, NMEA, MAVLink, 커스텀 프레임 파싱 → 구조화 뷰 |
| FR-18 | 디버그 연동 | 브레이크포인트 시 자동 일시정지, 계속 시 재개 (DAP `pause`/`continue` 이벤트 구독) |
| FR-19 | 매크로/스크립트 | 버튼/단축키로 반복 송신(`AT\r\n` 1초마다), Lua/JS 스크립트 지원 |
| FR-20 | 세션 저장/복원 | 포트/설정/필터/위치 → `.agentk/serial-sessions.json` 자동 저장 |

---

## 3. Non-Functional Requirements

| NFR-ID | 항목 | 목표 |
|--------|------|------|
| NFR-01 | 수신 지연 | 포트→UI < 10ms (버퍼링 최소화) |
| NFR-02 | 대용량 스트림 | 10 MB/s 지속 수신 시 UI 프리즈 없음 (가상화 렌더링) |
| NFR-03 | 메모리 | 세션당 버퍼 < 50 MB (순환 버퍼) |
| NFR-04 | 크로스 플랫폼 | Windows/macOS/Linux 동일 UX (시리얼 드라이버 추상화) |

---

## 4. API & Technical Spec

### 4.1 시리얼 매니저 (`src/serial/manager.ts`)

```typescript
import { SerialPort } from 'serialport';
import { ReadlineParser, ByteLengthParser, DelimiterParser } from '@serialport/parser-readline';

export interface SerialConfig {
  port: string;                    // '/dev/ttyUSB0' or 'COM3'
  baudRate: number;                // 115200
  dataBits: 5 | 6 | 7 | 8;         // 8
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
  stopBits: 1 | 1.5 | 2;
  flowControl: 'none' | 'rtscts' | 'xonxoff';
  encoding: BufferEncoding;        // 'utf8'
  eol: 'LF' | 'CR' | 'CRLF';       // 송신 줄끝
  receiveEol: 'LF' | 'CR' | 'CRLF' | 'auto'; // 수신 구분자
}

export interface SerialSession {
  id: string;
  config: SerialConfig;
  port: SerialPort;
  parser: ReadlineParser | DelimiterParser | ByteLengthParser;
  buffer: CircularBuffer<SerialChunk>;
  isPaused: boolean;
  logFile?: fs.WriteStream;
  stats: { rxBytes: number; txBytes: number; errors: number; };
}

export class SerialManager {
  private sessions = new Map<string, SerialSession>();
  private onDataCallbacks = new Set<(sessionId: string, chunk: SerialChunk) => void>();

  async listPorts(): Promise<PortInfo[]> {
    const ports = await SerialPort.list();
    return ports.map(p => ({
      path: p.path,
      manufacturer: p.manufacturer,
      serialNumber: p.serialNumber,
      pnpId: p.pnpId,
      vid: p.vendorId, pid: p.productId,
      friendlyName: this.guessFriendlyName(p),
    }));
  }

  async openSession(config: SerialConfig): Promise<SerialSession> {
    const sessionId = `serial-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const port = new SerialPort({ path: config.port, baudRate: config.baudRate, ... });
    
    // 파서 선택
    const parser = this.createParser(config);
    port.pipe(parser);

    const session: SerialSession = {
      id: sessionId,
      config,
      port,
      parser,
      buffer: new CircularBuffer(1024 * 1024 * 50), // 50MB
      isPaused: false,
      stats: { rxBytes: 0, txBytes: 0, errors: 0 },
    };

    parser.on('data', (data) => this.onData(sessionId, data));
    port.on('error', (err) => this.onError(sessionId, err));
    port.on('close', () => this.onClose(sessionId));

    this.sessions.set(sessionId, session);
    return session;
  }

  private createParser(config: SerialConfig) {
    const delimiter = config.receiveEol === 'LF' ? '\n' : config.receiveEol === 'CR' ? '\r' : '\r\n';
    return new DelimiterParser({ delimiter, includeDelimiter: false });
  }

  private onData(sessionId: string, data: Buffer) {
    const session = this.sessions.get(sessionId)!;
    if (session.isPaused) {
      session.buffer.push({ data, timestamp: Date.now() });
      return;
    }
    const chunk: SerialChunk = {
      text: data.toString(session.config.encoding),
      timestamp: Date.now(),
      raw: data,
    };
    session.buffer.push(chunk);
    session.stats.rxBytes += data.length;
    this.onDataCallbacks.forEach(cb => cb(sessionId, chunk));
  }

  async write(sessionId: string, text: string): Promise<void> {
    const session = this.sessions.get(sessionId)!;
    const eol = session.config.eol === 'LF' ? '\n' : session.config.eol === 'CR' ? '\r' : '\r\n';
    const data = Buffer.from(text + eol, session.config.encoding);
    await new Promise<void>((resolve, reject) => {
      session.port.write(data, (err) => err ? reject(err) : resolve());
    });
    session.stats.txBytes += data.length;
  }

  async closeSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.port.close();
    session.logFile?.close();
    this.sessions.delete(sessionId);
  }

  subscribe(onData: (sessionId: string, chunk: SerialChunk) => void) {
    this.onDataCallbacks.add(onData);
    return () => this.onDataCallbacks.delete(onData);
  }
}
```

### 4.2 Webview 패널 (`src/views/serialMonitor.ts`)

```html
<!-- Serial Monitor Webview -->
<div class="serial-monitor">
  <header class="toolbar">
    <select id="portSelect" title="Select port">
      <option value="">Select port...</option>
      <!-- 옵션 동적 생성 -->
    </select>
    <select id="baudSelect" title="Baud rate">
      <option value="9600">9600</option>
      <option value="115200" selected>115200</option>
      <option value="921600">921600</option>
      <option value="custom">Custom...</option>
    </select>
    <select id="encodingSelect">UTF-8 / ASCII / CP949...</select>
    <button id="connectBtn" class="primary">Connect</button>
    <button id="disconnectBtn" disabled>Disconnect</button>
    <div class="spacer"></div>
    <button id="pauseBtn" title="Pause">⏸</button>
    <button id="clearBtn" title="Clear">🗑</button>
    <button id="saveBtn" title="Save log">💾</button>
    <button id="settingsBtn" title="Settings">⚙</button>
  </header>

  <div class="terminal" id="terminal" role="log" aria-live="polite">
    <!-- 가상화된 라인 렌더링 -->
    <div class="line" data-ts="1705321200123">
      <span class="ts">[14:30:00.123]</span>
      <span class="text info">[INFO] System initialized</span>
    </div>
    <div class="line error">
      <span class="ts">[14:30:01.456]</span>
      <span class="text error">[ERROR] Sensor read failed: I2C timeout</span>
    </div>
    <!-- 가상 스크롤로 수만 줄 처리 -->
  </div>

  <footer class="input-bar">
    <input type="text" id="sendInput" placeholder="Type command... (Enter to send, ↑/↓ history)"
           autocomplete="off" spellcheck="false">
    <select id="sendMode">Text / Hex / Base64</select>
    <button id="sendBtn" title="Send (Enter)">Send</button>
    <button id="macroBtn" title="Macros">⚡</button>
  </footer>
</div>
```

### 4.3 가상화 렌더링 (성능)

```typescript
// 가상 스크롤: 보이는 영역만 DOM 생성
class VirtualTerminal {
  private lines: TerminalLine[] = [];
  private viewportHeight: number;
  private lineHeight = 20; // px
  private scrollTop = 0;

  render() {
    const start = Math.floor(this.scrollTop / this.lineHeight);
    const end = start + Math.ceil(this.viewportHeight / this.lineHeight) + 1;
    const visible = this.lines.slice(start, end);
    
    this.container.innerHTML = visible.map((line, i) => `
      <div class="line ${line.class}" style="top: ${(start+i)*this.lineHeight}px" data-ts="${line.ts}">
        <span class="ts">[${this.formatTs(line.ts)}]</span>
        <span class="text ${line.level}">${this.escapeHtml(line.text)}</span>
      </div>
    `).join('');
  }
}
```

---

## 5. UI/UX Specification

### 5.1 패널 레이아웃 (하단 패널 탭)
```
┌─ TERMINAL ────────────────────────────────────────────────────────────┐
│ [🔌 USB-SERIAL CH340 (COM3) ▼]  [115200 ▼] [8N1] [UTF-8] [LF]        │
│ [■ Connect] [■ Disconnect] [⏸ Pause] [🗑 Clear] [💾 Save] [⚙]       │
├────────────────────────────────────────────────────────────────────────┤
│ [14:30:00.123] [INFO]  System boot v2.1.0                            │
│ [14:30:00.234] [DEBUG] GPIO init: PA5=OUT, PA6=IN                    │
│ [14:30:01.001] [WARN]  ADC calibration failed, using defaults        │
│ [14:30:02.456] ▶▶▶ SENSOR: temp=23.4°C hum=45%                      │
│ [14:30:03.789] [ERROR] ❌ I2C read failed: NACK from 0x48            │
│ [14:30:03.790] [INFO]  Retrying in 100ms...                          │
│ [14:30:03.890] [INFO]  ✅ Retry success                              │
├────────────────────────────────────────────────────────────────────────┤
│ [Type command...                                        ] [Send] [⚡]  │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.2 설정 모달
```
┌─ Serial Port Settings ──────────────────────────────────────────────┐
│ Port: [/dev/ttyUSB0 ▼]  Refresh [🔄]                               │
│ Baud Rate: [115200 ▼]  [Custom: _______]                           │
│ Data Bits: [8 ▼]  Parity: [None ▼]  Stop Bits: [1 ▼]               │
│ Flow Control: [None ▼]                                              │
│ Encoding: [UTF-8 ▼]                                                 │
│ EOL (TX): [LF ▼]  EOL (RX): [Auto ▼]                               │
│                                                                     │
│ [🔧 Advanced]                                                       │
│   Reconnect on disconnect: [☑]  Retry interval: [2] sec            │
│   Buffer size: [50] MB  Auto-save log: [☑]  Path: [./logs/]        │
│   Timestamp format: [HH:mm:ss.SSS]  Show colors: [☑]               │
│                                                                     │
│   [Save as Preset]  [Load Preset]                                   │
│                                                                     │
│                    [Cancel]          [Apply & Connect]              │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.3 프로토콜 디코더 (확장)
```
┌─ Protocol Decoder: Modbus RTU ──────────────────────────────────────┐
│ [01] [03] [00 6B] [00 03] [76 87]  →  Read Holding Regs 107-109   │
│ [01] [03] [06] [00 00] [00 64] [00 C8] [3A 12]  →  Response OK    │
│   Reg 107: 0      Reg 108: 100      Reg 109: 200                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Acceptance Criteria

```gherkin
Feature: Serial Monitor Panel

  Scenario: Connect to Arduino at 115200 baud
    Given Arduino Uno connected via USB (CH340, COM3)
    When user selects COM3, 115200, 8N1 and clicks Connect
    Then status shows "Connected"
    And "Hello World" printed by Arduino appears in terminal
    And ANSI color codes from Arduino render correctly

  Scenario: Auto-reconnect on board reset
    Given serial monitor connected to STM32
    When user presses reset button on board
    Then monitor shows "Disconnected" briefly
    And automatically reconnects within 3 seconds
    And boot log appears without data loss

  Scenario: Hex mode send and ANSI color
    Given user types "\x01\x03\x00\x6B\x00\x03" in Hex mode
    And clicks Send
    Then raw bytes 01 03 00 6B 00 03 transmitted
    And response renders with Modbus decoder (if enabled)

  Scenario: Log rotation and export
    Given auto-save enabled, max file size 10MB
    When log reaches 10MB
    Then new file `serial-2024-01-15_14-30-01.log` created
    And old file compressed to `.gz`
    And user can export last 1000 lines via "Export Selection"

  Scenario: Debug integration pause/resume
    Given debug session active with breakpoint at `sensor_read()`
    When breakpoint hit
    Then serial monitor auto-pauses (buffering)
    And user clicks Continue in debug toolbar
    Then serial monitor resumes, buffered output flushes
```

---

## 7. Dependencies

| 의존성 | 타입 | 비고 |
|--------|------|------|
| `serialport` + `@serialport/parser-*` | npm | 크로스 플랫폼 시리얼 I/O (MIT) |
| `xterm` / `xterm-addon-webgl` | npm | 고성능 터미널 렌더링 (MIT) |
| `PRD-Tools-C_Terminal_Process.md` | 선행 | 터미널 인프라 재사용 |
| `PRD-24_Firmware_SVD_Register.md` | 병행 | 레지스터 패널과 탭 공유 가능 |

---

## 8. Implementation Phases

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | `serialport` 래퍼 + 세션 관리 + 기본 UI | 단일 포트 연결/송수신 |
| 2 | 파서/인코딩/줄끝/플로우 제어 + ANSI 파싱 | 완벽한 터미널 에뮬레이션 |
| 3 | 가상화 렌더링 + 일시정지/필터/하이라이트 | 대용량 스트림 대응 |
| 4 | 로그 저장(회전/압축) + 내보내기 + 매크로 | 운영 기능 완성 |
| 5 | 디버그 어댑터 연동 (pause/resume 이벤트) | 디버그 워크플로 통합 |
| 6 | 프로토콜 디코더 플러그인 아키텍처 + 내장 Modbus/NMEA | 확장성 확보 |

---

## 9. Risks & Mitigations

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| Windows COM 포트 권한/잠금 | 높음 | `serialport` 라이브러리 최신 버전, 관리자 권한 가이드 |
| macOS `/dev/tty.*` 권한 | 중간 | `sudo chmod 666 /dev/ttyUSB*` 자동 안내 |
| 대용량 로그 메모리 누수 | 중간 | 순환 버퍼 + 주기적 디스크 플러시 |
| 드라이버 충돌(동시 오픈) | 중간 | 포트 사용 중 감지 → 친절한 에러 메시지 |

---


## Out of Scope

- 본 도메인 외 범용 도구화 (Tools A–G에 억지 편입 금지)
- 상세: `00_Master_Context.md` Non-Goals

## 10. References

- 원본 설계: `Extension_high_impact.md` → **B급: 시리얼 모니터 패널**
- serialport: https://serialport.io/
- xterm.js: https://xtermjs.org/
- ANSI escape codes: https://gist.github.com/fnky/458719343aabd01cfb17a3a4f7296797