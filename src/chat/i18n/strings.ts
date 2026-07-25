/**
 * i18n - 국제화 문자열 모듈 (C0-T28)
 * 
 * 한국어/영어 문자열 분리, 언어 감지
 */

export type Language = 'en' | 'ko';

type StringKey = 
  | 'mode.ask.label' | 'mode.agent.label' | 'mode.plan.label' | 'mode.debug.label'
  | 'mode.ask.tooltip' | 'mode.agent.tooltip' | 'mode.plan.tooltip' | 'mode.debug.tooltip'
  | 'composer.placeholder' | 'composer.placeholderStreaming'
  | 'composer.stop' | 'composer.regenerate' | 'composer.send' | 'composer.queue'
  | 'composer.keyboardHint' | 'composer.keyboardHintStreaming'
  | 'message.edit' | 'message.retry' | 'message.copy' | 'message.delete' | 'message.pin'
  | 'settings.title' | 'settings.models' | 'settings.secrets' | 'settings.permission'
  | 'settings.queue' | 'settings.harness' | 'settings.context' | 'settings.mcp' | 'settings.privacy'
  | 'error.generic' | 'error.network' | 'error.timeout'
  | 'timeline.title' | 'planning.thinking' | 'planning.planning' | 'planning.executing'
  | 'planning.idle' | 'mention.file' | 'mention.folder' | 'mention.symbol' | 'mention.codebase'
  | 'mention.searching' | 'secrets.title' | 'secrets.description' | 'secrets.save'
  | 'secrets.saved' | 'secrets.stored' | 'secrets.clear' | 'secrets.show' | 'secrets.hide'
  | 'common.newChat' | 'common.clearHistory' | 'common.settings';

const EN: Record<StringKey, string> = {
  'mode.ask.label': 'Ask',
  'mode.agent.label': 'Agent',
  'mode.plan.label': 'Plan',
  'mode.debug.label': 'Debug',
  'mode.ask.tooltip': 'Read-only exploration. No file edits.',
  'mode.agent.tooltip': 'Autonomous implementation. Tools: read, edit, terminal.',
  'mode.plan.tooltip': 'Design first. Outputs PLAN.md with Mermaid.',
  'mode.debug.tooltip': 'Hypothesis → Instrument → Reproduce → Minimal fix.',
  'composer.placeholder': 'Type your message... (Enter to send, Shift+Enter for new line, Alt+Enter to queue)',
  'composer.placeholderStreaming': 'Streaming... (Enter/Cmd+Enter: Stop & Regenerate, Alt+Enter: Queue message)',
  'composer.stop': 'Stop',
  'composer.regenerate': 'Regenerate',
  'composer.send': 'Send',
  'composer.queue': 'Queue',
  'composer.keyboardHint': 'Enter to send • Shift+Enter new line • Alt+Enter to queue',
  'composer.keyboardHintStreaming': 'Enter/Cmd+Enter: Stop & Regenerate • Alt+Enter: Queue message',
  'message.edit': 'Edit',
  'message.retry': 'Regenerate',
  'message.copy': 'Copy',
  'message.delete': 'Delete',
  'message.pin': 'Pin',
  'settings.title': 'Settings',
  'settings.models': 'Models',
  'settings.secrets': 'Secrets',
  'settings.permission': 'Permission',
  'settings.queue': 'Queue',
  'settings.harness': 'Harness',
  'settings.context': 'Context',
  'settings.mcp': 'MCP',
  'settings.privacy': 'Privacy',
  'error.generic': 'An error occurred. Please try again.',
  'error.network': 'Network error. Check your connection and provider URL.',
  'error.timeout': 'Request timed out. The model may be overloaded.',
  'timeline.title': 'Agent Loop Timeline',
  'planning.thinking': 'Thinking about next steps...',
  'planning.planning': 'Planning approach...',
  'planning.executing': 'Executing plan...',
  'planning.idle': 'Idle',
  'mention.file': 'File',
  'mention.folder': 'Folder',
  'mention.symbol': 'Symbol',
  'mention.codebase': 'Codebase',
  'mention.searching': 'Searching...',
  'secrets.title': 'Secrets Management',
  'secrets.description': 'API keys and secrets are stored in VS Code encrypted SecretStorage.',
  'secrets.save': 'Save Secrets',
  'secrets.saved': 'Saved ✓',
  'secrets.stored': '✓ stored',
  'secrets.clear': 'Clear',
  'secrets.show': 'Show',
  'secrets.hide': 'Hide',
  'common.newChat': 'New Chat',
  'common.clearHistory': 'Clear History',
  'common.settings': 'Settings'
};

const KO: Record<StringKey, string> = {
  'mode.ask.label': '질문',
  'mode.agent.label': '에이전트',
  'mode.plan.label': '계획',
  'mode.debug.label': '디버그',
  'mode.ask.tooltip': '읽기 전용 탐색. 파일 편집 불가.',
  'mode.agent.tooltip': '자율 구현. 도구: 읽기, 편집, 터미널.',
  'mode.plan.tooltip': '설계 우선. PLAN.md + Mermaid 출력.',
  'mode.debug.tooltip': '가설 → 계측 → 재현 → 최소 수정.',
  'composer.placeholder': '메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈, Alt+Enter 대기열)',
  'composer.placeholderStreaming': '스트리밍 중... (Enter/Cmd+Enter: 중단 & 재생성, Alt+Enter: 대기열 추가)',
  'composer.stop': '중단',
  'composer.regenerate': '재생성',
  'composer.send': '전송',
  'composer.queue': '대기',
  'composer.keyboardHint': 'Enter 전송 • Shift+Enter 줄바꿈 • Alt+Enter 대기열',
  'composer.keyboardHintStreaming': 'Enter/Cmd+Enter: 중단 & 재생성 • Alt+Enter: 대기열',
  'message.edit': '편집',
  'message.retry': '재생성',
  'message.copy': '복사',
  'message.delete': '삭제',
  'message.pin': '고정',
  'settings.title': '설정',
  'settings.models': '모델',
  'settings.secrets': '시크릿',
  'settings.permission': '권한',
  'settings.queue': '대기열',
  'settings.harness': '하네스',
  'settings.context': '컨텍스트',
  'settings.mcp': 'MCP',
  'settings.privacy': '개인정보',
  'error.generic': '오류가 발생했습니다. 다시 시도하세요.',
  'error.network': '네트워크 오류. 연결과 공급자 URL을 확인하세요.',
  'error.timeout': '요청 시간이 초과되었습니다. 모델이 과부하 상태일 수 있습니다.',
  'timeline.title': '에이전트 루프 타임라인',
  'planning.thinking': '다음 단계를 생각하는 중...',
  'planning.planning': '접근 방식을 계획하는 중...',
  'planning.executing': '계획을 실행하는 중...',
  'planning.idle': '대기 중',
  'mention.file': '파일',
  'mention.folder': '폴더',
  'mention.symbol': '심볼',
  'mention.codebase': '코드베이스',
  'mention.searching': '검색 중...',
  'secrets.title': '시크릿 관리',
  'secrets.description': 'API 키와 시크릿은 VS Code 암호화 SecretStorage에 저장됩니다.',
  'secrets.save': '시크릿 저장',
  'secrets.saved': '저장됨 ✓',
  'secrets.stored': '✓ 저장됨',
  'secrets.clear': '지우기',
  'secrets.show': '표시',
  'secrets.hide': '숨김',
  'common.newChat': '새 채팅',
  'common.clearHistory': '기록 지우기',
  'common.settings': '설정'
};

const strings: Record<Language, Record<StringKey, string>> = { en: EN, ko: KO };

let currentLang: Language = 'en';

export function setLanguage(lang: Language): void {
  currentLang = lang;
}

export function getLanguage(): Language {
  return currentLang;
}

export function t(key: StringKey): string {
  return strings[currentLang][key] || strings['en'][key] || `[${key}]`;
}

export function getStrings(): Record<StringKey, string> {
  return { ...strings[currentLang] };
}
