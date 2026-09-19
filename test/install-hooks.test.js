/*
 * install-hooks 는 사용자의 Claude Code 설정 파일을 직접 고쳐 쓴다.
 * 여기서 잘못되면 남의 설정이 깨지므로, 지켜야 할 약속을 못으로 박아 둔다.
 *
 * 모든 테스트는 --project 경로(= process.cwd()/.claude/settings.json)만 쓴다.
 * 진짜 홈 디렉터리는 어떤 경우에도 건드리지 않는다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hooks = require('../scripts/install-hooks');

const OPTS = { project: true };
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];

/** 임시 폴더를 만들어 그 안에서 fn 을 돌린다 (cwd 는 반드시 되돌린다) */
function inTempDir(fn) {
  // macOS 의 tmpdir 은 심볼릭 링크라(/var -> /private/var) chdir 뒤 cwd 가 달라진다.
  // apply() 가 cwd 기준으로 경로를 잡으므로 실제 경로로 맞춰 둔다.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-pet-test-')));
  const prev = process.cwd();
  process.chdir(dir);
  try {
    const file = path.join(dir, '.claude', 'settings.json');
    // 안전장치: 진짜 홈이 아니라 임시 폴더를 겨냥하고 있는지 확인한다
    assert.ok(file.startsWith(dir), 'settings file must live inside the temp dir');
    assert.notStrictEqual(path.dirname(path.dirname(file)), os.homedir());
    return fn({ dir, file });
  } finally {
    process.chdir(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const writeSettings = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
};
const readSettings = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** 우리 표식이 붙은 항목만 센다 */
const ours = (list) => (list || []).filter((e) => e.hooks.some((h) => h.command.includes('--claude-pet')));

test('빈 상태에서 설치하면 이벤트 7개가 모두 등록된다', () => {
  inTempDir(({ file }) => {
    const r = hooks.apply(OPTS);
    assert.strictEqual(r.ok, true);

    const s = readSettings(file);
    assert.deepStrictEqual(Object.keys(s.hooks).sort(), [...EVENTS].sort());
    for (const evt of EVENTS) {
      assert.strictEqual(ours(s.hooks[evt]).length, 1, `${evt} 에 우리 항목 1개`);
    }
    assert.strictEqual(hooks.status(OPTS).installed, 7);
  });
});

test('도구 훅에만 matcher 가 붙는다', () => {
  inTempDir(({ file }) => {
    hooks.apply(OPTS);
    const s = readSettings(file);
    assert.strictEqual(s.hooks.PreToolUse[0].matcher, '*');
    assert.strictEqual(s.hooks.PostToolUse[0].matcher, '*');
    assert.strictEqual(s.hooks.Stop[0].matcher, undefined);
  });
});

test('명령에 hook.js 경로와 이벤트 이름이 들어간다', () => {
  inTempDir(({ file }) => {
    hooks.apply(OPTS);
    const cmd = readSettings(file).hooks.Stop[0].hooks[0].command;
    assert.match(cmd, /hook\.js/);
    assert.match(cmd, /\bstop\b/);
    assert.match(cmd, /--claude-pet/);
    // 경로에 공백이 있어도 깨지지 않도록 따옴표로 감싼다
    assert.match(cmd, /"[^"]*hook\.js"/);
  });
});

test('사용자가 직접 넣은 훅은 건드리지 않는다', () => {
  inTempDir(({ file }) => {
    writeSettings(file, {
      model: 'opus',
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node /my/guard.js' }] }],
      },
    });

    hooks.apply(OPTS);
    const s = readSettings(file);

    assert.strictEqual(s.model, 'opus', '훅과 무관한 설정은 그대로');
    const mine = s.hooks.PreToolUse.filter((e) => e.hooks[0].command === 'node /my/guard.js');
    assert.strictEqual(mine.length, 1, '남의 훅은 그대로 남는다');
    assert.strictEqual(ours(s.hooks.PreToolUse).length, 1);
  });
});

test('여러 번 설치해도 항목이 중복되지 않는다', () => {
  inTempDir(({ file }) => {
    hooks.apply(OPTS);
    hooks.apply(OPTS);
    hooks.apply(OPTS);

    const s = readSettings(file);
    for (const evt of EVENTS) {
      assert.strictEqual(ours(s.hooks[evt]).length, 1, `${evt} 가 중복되면 안 된다`);
    }
    assert.strictEqual(hooks.status(OPTS).installed, 7);
  });
});

/*
 * 1.0 은 명령 문자열에 'claude-pet' 이 들어 있는지로 우리 항목을 찾았다.
 * 설치 폴더가 'Claude Pet'(공백·대문자)이면 그 검사가 우리 항목을 놓쳐서
 * 재설치할 때마다 훅이 중복으로 쌓였다.
 *
 * 중복이 쌓이지 않는다는 보장 자체는 위아래의 왕복 테스트가 맡는다
 * (표식을 떼면 그쪽이 깨진다). 여기서는 판별 함수가 어떤 설치 경로 모양을
 * 받아들이고 무엇을 거절하는지 — 특히 남의 훅을 건드리지 않는지 — 를 고정한다.
 */
test('판별 함수가 우리 항목만 골라낸다', () => {
  const entry = (command) => ({ hooks: [{ type: 'command', command }] });

  assert.strictEqual(
    hooks.isOurs(entry('node "C:/Program Files/Claude Pet/resources/app.asar.unpacked/scripts/hook.js" stop --claude-pet')),
    true,
    "폴더 이름이 'Claude Pet' 이어도 찾아야 한다",
  );
  assert.strictEqual(
    hooks.isOurs(entry('node "/Applications/Claude Pet.app/Contents/Resources/app.asar.unpacked/scripts/hook.js" prompt --claude-pet')),
    true,
  );
  assert.strictEqual(
    hooks.isOurs(entry('node "C:/old/claude-pet/scripts/hook.js" stop')),
    true,
    '1.0 형식도 알아봐야 재설치 때 걷어낼 수 있다',
  );
  assert.strictEqual(hooks.isOurs(entry('node /my/guard.js')), false, '남의 훅을 건드리면 안 된다');
  assert.strictEqual(hooks.isOurs({ hooks: [] }), false);
  assert.strictEqual(hooks.isOurs({}), false);
});

test('예전 형식으로 설치돼 있으면 교체한다', () => {
  inTempDir(({ file }) => {
    writeSettings(file, {
      hooks: {
        Stop: [
          { hooks: [{ type: 'command', command: 'node "C:/old/claude-pet/scripts/hook.js" stop' }] },
        ],
      },
    });

    hooks.apply(OPTS);
    const s = readSettings(file);

    assert.strictEqual(s.hooks.Stop.length, 1, '예전 항목은 교체된다');
    assert.strictEqual(ours(s.hooks.Stop).length, 1);
  });
});

test('제거하면 우리 항목만 사라지고 남의 훅은 남는다', () => {
  inTempDir(({ file }) => {
    writeSettings(file, {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node /my/guard.js' }] }],
      },
    });

    hooks.apply(OPTS);
    const r = hooks.apply({ ...OPTS, remove: true });
    assert.strictEqual(r.ok, true);

    const s = readSettings(file);
    assert.strictEqual(s.hooks.PreToolUse.length, 1);
    assert.strictEqual(s.hooks.PreToolUse[0].hooks[0].command, 'node /my/guard.js');
    assert.deepStrictEqual(Object.keys(s.hooks), ['PreToolUse'], '빈 이벤트 키는 지운다');
    assert.strictEqual(hooks.status(OPTS).installed, 0);
  });
});

test('남는 훅이 없으면 hooks 키 자체를 지운다', () => {
  inTempDir(({ file }) => {
    writeSettings(file, { model: 'opus' });
    hooks.apply(OPTS);
    hooks.apply({ ...OPTS, remove: true });

    const s = readSettings(file);
    assert.strictEqual(s.hooks, undefined, '빈 hooks 객체를 남기지 않는다');
    assert.strictEqual(s.model, 'opus');
  });
});

test('기존 설정 파일은 고치기 전에 백업한다', () => {
  inTempDir(({ file }) => {
    writeSettings(file, { model: 'opus' });
    const r = hooks.apply(OPTS);

    assert.ok(r.backup, '백업 경로를 알려준다');
    assert.deepStrictEqual(readSettings(r.backup), { model: 'opus' }, '백업은 고치기 전 내용');
  });
});

test('JSON 이 깨져 있으면 덮어쓰지 않고 오류를 돌려준다', () => {
  inTempDir(({ file }) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ 이건 JSON 이 아니다');

    const r = hooks.apply(OPTS);
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /JSON/);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ 이건 JSON 이 아니다', '원본을 보존한다');

    const st = hooks.status(OPTS);
    assert.strictEqual(st.installed, 0);
    assert.ok(st.error, 'status 도 조용히 0 을 말하지 않고 오류를 알린다');
  });
});

test('hookPath 는 asar 안이 아니라 실제 파일을 가리킨다', () => {
  const p = hooks.hookPath();
  assert.ok(!p.includes('app.asar/scripts'), 'asar 내부 경로면 node 가 못 읽는다');
  assert.ok(fs.existsSync(p), `${p} 가 있어야 한다`);
});
