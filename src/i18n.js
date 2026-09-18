/*
 * 앱 문자열. 메인/렌더러/상태 모듈이 함께 쓴다.
 * 언어는 설정 > OS 로케일 순으로 정해지고, 한국어가 아니면 영어로 떨어진다.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.I18N = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const STRINGS = {
    en: {
      idle: 'Idle',
      sessionStart: 'Session started',
      thinking: 'Thinking',
      working: 'Working',
      waiting: 'Waiting for you',
      done: 'Done!',
      error: 'Something broke',
      tasksDone: '{done}/{total} done',
      taskCount: '{n} tasks',
      steps: '{n} steps',

      ctx: 'CTX',
      fiveHour: '5H',
      weekly: 'WK',
      justNow: 'just now',
      minAgo: '{n}m ago',
      hourAgo: '{n}h ago',
      resetsIn: '5-hour limit resets in {v}',

      trayPort: 'Claude Pet — port {port}',
      trayNoPort: 'Claude Pet — not connected',
      showHide: 'Show / Hide',
      alwaysOnTop: 'Always on top',
      clickThrough: 'Click-through (ignore mouse)',
      character: 'Character',
      size: 'Size',
      language: 'Language',
      resetPosition: 'Reset position',
      demo: 'Play demo',
      copyHookCmd: 'Copy hook install command',
      quit: 'Quit',

      sizeS: 'Small', sizeM: 'Normal', sizeL: 'Large', sizeXL: 'Extra large',
      blob: 'Blob', cat: 'Cat', penguin: 'Penguin',
    },
    ko: {
      idle: '대기 중',
      sessionStart: '세션 시작',
      thinking: '생각하는 중',
      working: '작업 중',
      waiting: '입력을 기다리는 중',
      done: '작업 완료!',
      error: '오류 발생',
      tasksDone: '{done}/{total} 완료',
      taskCount: '{n}개 작업',
      steps: '{n} steps',

      ctx: 'CTX',
      fiveHour: '5H',
      weekly: '주',
      justNow: '방금',
      minAgo: '{n}분 전',
      hourAgo: '{n}시간 전',
      resetsIn: '5시간 한도 리셋까지 {v}',

      trayPort: 'Claude Pet — 포트 {port}',
      trayNoPort: 'Claude Pet — 연결 안 됨',
      showHide: '보이기 / 숨기기',
      alwaysOnTop: '항상 위에',
      clickThrough: '클릭 통과 (마우스 무시)',
      character: '캐릭터',
      size: '크기',
      language: '언어',
      resetPosition: '위치 초기화',
      demo: '데모 재생',
      copyHookCmd: '훅 설치 명령 복사',
      quit: '종료',

      sizeS: '작게', sizeM: '보통', sizeL: '크게', sizeXL: '아주 크게',
      blob: '블롭', cat: '고양이', penguin: '펭귄',
    },
  };

  /** 지원하지 않는 언어는 영어로 떨어뜨린다 */
  function pick(lang) {
    return STRINGS[lang] ? lang : 'en';
  }

  /** OS 로케일에서 언어를 고른다 ('ko-KR' → 'ko') */
  function fromLocale(locale) {
    return pick(String(locale || '').slice(0, 2).toLowerCase());
  }

  function t(lang, key, vars) {
    const s = STRINGS[pick(lang)][key];
    if (s === undefined) return key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)) : s;
  }

  return { STRINGS, t, pick, fromLocale, LANGS: Object.keys(STRINGS) };
});
