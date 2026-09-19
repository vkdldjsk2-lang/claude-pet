#!/usr/bin/env node
/*
 * ~/.claude/settings.json 에 Claude Pet 훅을 설치/제거한다.
 *
 * CLI (개발자용):
 *   node scripts/install-hooks.js            설치
 *   node scripts/install-hooks.js --remove   제거
 *   node scripts/install-hooks.js --project  현재 폴더의 .claude/settings.json 에 설치
 *   node scripts/install-hooks.js --status   설치 상태만 출력
 *
 * 패키지된 앱(일반 사용자용)에서는 main.js 가 이 파일을 require 해서
 * apply()/status() 를 직접 호출한다 — 터미널을 열 필요가 없다.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// 명령 문자열 끝에 항상 붙는 표식. 설치 경로와 무관하게 우리 항목을 알아본다.
// (1.0 에서는 경로에 'claude-pet' 이 섞여 있는지로 찾았는데, 설치 폴더 이름이
//  'Claude Pet' 이면 못 찾아서 재설치할 때마다 항목이 중복으로 쌓였다)
const MARKER = '--claude-pet';
const LEGACY_MARKER = 'claude-pet';

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

/** 경로를 훅 설정에 넣기 좋은 정슬래시 형태로 바꾼다 */
const slash = (p) => p.split(path.sep).join('/');

/**
 * hook.js 의 실제 경로.
 * 패키지된 앱에서 __dirname 은 app.asar 안을 가리키는데, asar 는 Electron 밖에서는
 * 못 읽는다. 빌드에서 scripts/ 를 asarUnpack 해 두었으므로 그 경로로 바꿔 준다.
 */
function hookPath() {
  return slash(path.resolve(__dirname, 'hook.js')).replace('app.asar/', 'app.asar.unpacked/');
}

function settingsFile(project) {
  return project
    ? path.join(process.cwd(), '.claude', 'settings.json')
    : path.join(os.homedir(), '.claude', 'settings.json');
}

/** PATH 에 node 가 있는지 (없으면 앱에 들어 있는 Electron 을 node 모드로 쓴다) */
function hasNode() {
  try {
    execFileSync('node', ['-v'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 훅을 실행할 런타임을 고른다.
 *  - node 가 있으면 그냥 node (가장 가볍고 빠르다)
 *  - 없으면 앱 실행 파일을 ELECTRON_RUN_AS_NODE 로 돌린다 (Node 미설치 사용자용)
 */
function runtime() {
  if (hasNode()) return { kind: 'node', exec: 'node' };
  return { kind: 'electron', exec: process.execPath };
}

/** 훅 설정에 들어갈 셸 명령 한 줄 */
function command(evt, rt) {
  const hook = hookPath();
  if (rt.kind === 'node') return `node "${hook}" ${evt} ${MARKER}`;
  const exec = slash(rt.exec);
  return process.platform === 'win32'
    ? `set ELECTRON_RUN_AS_NODE=1&& "${exec}" "${hook}" ${evt} ${MARKER}`
    : `ELECTRON_RUN_AS_NODE=1 "${exec}" "${hook}" ${evt} ${MARKER}`;
}

function isOurs(entry) {
  return Array.isArray(entry.hooks) && entry.hooks.some((h) => {
    const c = h && typeof h.command === 'string' ? h.command : '';
    return c.includes(MARKER) || c.includes(LEGACY_MARKER);
  });
}

function read(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { settings: parsed && typeof parsed === 'object' ? parsed : {} };
  } catch (e) {
    if (e.code === 'ENOENT') return { settings: {} };
    return { settings: null, error: `${file} 을 읽을 수 없다 (JSON 오류?): ${e.message}` };
  }
}

/** 지금 설치된 훅이 몇 개인지 본다. 트레이 메뉴 상태 표시에 쓴다. */
function status({ project = false } = {}) {
  const file = settingsFile(project);
  const { settings, error } = read(file);
  if (!settings) return { file, installed: 0, total: MAP.length, error };
  const hooks = settings.hooks || {};
  let installed = 0;
  for (const [claudeEvent] of MAP) {
    const list = Array.isArray(hooks[claudeEvent]) ? hooks[claudeEvent] : [];
    installed += list.filter(isOurs).length;
  }
  return { file, installed, total: MAP.length, hookPath: hookPath() };
}

/**
 * 훅을 설치하거나 제거한다.
 * @returns {{ok: boolean, file: string, backup?: string, runtime?: string, error?: string}}
 */
function apply({ remove = false, project = false } = {}) {
  const file = settingsFile(project);
  const { settings, error } = read(file);
  if (!settings) return { ok: false, file, error };

  const rt = remove ? null : runtime();
  settings.hooks = settings.hooks || {};

  for (const [claudeEvent, petEvent, matcher] of MAP) {
    const list = Array.isArray(settings.hooks[claudeEvent]) ? settings.hooks[claudeEvent] : [];
    // 기존 claude-pet 항목은 항상 걷어낸다 (재설치 시 중복 방지)
    const cleaned = list.filter((e) => !isOurs(e));

    if (!remove) {
      const entry = { hooks: [{ type: 'command', command: command(petEvent, rt), timeout: 5 }] };
      if (matcher) entry.matcher = matcher;
      cleaned.push(entry);
    }

    if (cleaned.length) settings.hooks[claudeEvent] = cleaned;
    else delete settings.hooks[claudeEvent];
  }

  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

  let backup;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      backup = `${file}.claude-pet.bak`;
      fs.copyFileSync(file, backup);
    }
    fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  } catch (e) {
    return { ok: false, file, error: `${file} 에 쓸 수 없다: ${e.message}` };
  }

  return { ok: true, file, backup, runtime: rt ? rt.kind : undefined };
}

module.exports = { apply, status, hookPath, MAP };

// ── CLI ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const argv = process.argv.slice(2);
  const opts = { remove: argv.includes('--remove'), project: argv.includes('--project') };

  if (argv.includes('--status')) {
    const s = status(opts);
    if (s.error) { console.error(`✗ ${s.error}`); process.exit(1); }
    console.log(`${s.installed}/${s.total} hooks installed in ${s.file}`);
    console.log(`  hook: ${s.hookPath}`);
    process.exit(s.installed ? 0 : 1);
  }

  const r = apply(opts);
  if (!r.ok) { console.error(`✗ ${r.error}`); process.exit(1); }
  console.log(`${opts.remove ? '✓ removed from' : '✓ installed into'} ${r.file}`);
  if (r.backup) console.log(`  backup: ${r.backup}`);
  if (!opts.remove) {
    if (r.runtime === 'electron') console.log('  node 를 못 찾아 앱에 들어 있는 런타임을 쓴다');
    console.log('  Restart Claude Code and the pet will follow along.');
  }
}
