#!/usr/bin/env node
/*
 * ~/.claude/settings.json 에 Claude Pet 훅을 설치/제거한다.
 *   node scripts/install-hooks.js            설치
 *   node scripts/install-hooks.js --remove   제거
 *   node scripts/install-hooks.js --project  현재 폴더의 .claude/settings.json 에 설치
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const REMOVE = process.argv.includes('--remove');
const PROJECT = process.argv.includes('--project');

const HOOK_JS = path.resolve(__dirname, 'hook.js').replace(/\\/g, '/');
const MARKER = 'claude-pet';

const settingsFile = PROJECT
  ? path.join(process.cwd(), '.claude', 'settings.json')
  : path.join(os.homedir(), '.claude', 'settings.json');

const cmd = (evt) => `node "${HOOK_JS}" ${evt}`;

// Claude Code 훅 이벤트 → 펫 이벤트
const MAP = [
  ['SessionStart', 'session_start', null],
  ['UserPromptSubmit', 'prompt', null],
  ['PreToolUse', 'tool_start', '*'],
  ['PostToolUse', 'tool_end', '*'],
  ['Notification', 'notification', null],
  ['Stop', 'stop', null],
  ['SessionEnd', 'session_end', null],
];

function isOurs(entry) {
  return Array.isArray(entry.hooks)
    && entry.hooks.some((h) => typeof h.command === 'string' && h.command.includes(MARKER));
}

function read() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    console.error(`✗ ${settingsFile} 를 읽을 수 없습니다 (JSON 형식 오류일 수 있음): ${e.message}`);
    process.exit(1);
  }
}

const settings = read();
settings.hooks = settings.hooks || {};

for (const [claudeEvent, petEvent, matcher] of MAP) {
  const list = Array.isArray(settings.hooks[claudeEvent]) ? settings.hooks[claudeEvent] : [];
  // 기존 claude-pet 항목은 항상 걷어낸다 (재설치 시 중복 방지)
  const cleaned = list.filter((e) => !isOurs(e));

  if (!REMOVE) {
    const entry = { hooks: [{ type: 'command', command: cmd(petEvent), timeout: 5 }] };
    if (matcher) entry.matcher = matcher;
    cleaned.push(entry);
  }

  if (cleaned.length) settings.hooks[claudeEvent] = cleaned;
  else delete settings.hooks[claudeEvent];
}

if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
if (fs.existsSync(settingsFile)) {
  fs.copyFileSync(settingsFile, `${settingsFile}.claude-pet.bak`);
}
fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n', 'utf8');

console.log(`${REMOVE ? '✓ 제거 완료' : '✓ 설치 완료'}: ${settingsFile}`);
if (fs.existsSync(`${settingsFile}.claude-pet.bak`)) {
  console.log(`  백업: ${settingsFile}.claude-pet.bak`);
}
if (!REMOVE) {
  console.log('  Claude Code 를 새로 실행하면 펫이 상태를 따라갑니다.');
}
