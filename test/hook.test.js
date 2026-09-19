/*
 * hook.js 는 stdin 을 기다리는 CLI 라 require 하면 그 자리에서 리스너가 붙는다.
 * 그래서 안에 들어 있는 트랜스크립트 파서 자가진단을 따로 띄워 확인한다.
 * (진단 내용 자체는 scripts/hook.js 의 --selftest 에 있다)
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'scripts', 'hook.js');

test('트랜스크립트 파서 자가진단이 통과한다', () => {
  const r = spawnSync(process.execPath, [HOOK, '--selftest'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /selftest ok/);
});

test('펫이 꺼져 있어도 Claude Code 를 막지 않는다', () => {
  // 훅은 어떤 경우에도 빠르게 0 으로 빠져야 한다.
  // 여기서는 아무도 안 듣는 포트로 보내 놓고 조용히 끝나는지 본다.
  const r = spawnSync(process.execPath, [HOOK, 'stop'], {
    input: JSON.stringify({ session_id: 'test', cwd: '/tmp' }),
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, CLAUDE_PET_PORT: '59999' },
  });

  assert.strictEqual(r.status, 0, '연결 실패해도 0 으로 끝나야 한다');
});

test('깨진 입력을 받아도 죽지 않는다', () => {
  const r = spawnSync(process.execPath, [HOOK, 'tool_end'], {
    input: '이건 JSON 이 아니다',
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, CLAUDE_PET_PORT: '59999' },
  });

  assert.strictEqual(r.status, 0);
});
