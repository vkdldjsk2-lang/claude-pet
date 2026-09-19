/*
 * 훅 이벤트 -> 펫 상태. 진행률 규칙이 여기 들어 있다.
 *
 * store 는 완료/오류 뒤에 setTimeout 으로 idle 복귀를 예약한다.
 * 실제 타이머를 그대로 두면 테스트 프로세스가 1분씩 살아 있으므로
 * 가짜 타이머를 쓰고, 그 김에 idle 복귀까지 확인한다.
 */
const test = require('node:test');
const assert = require('node:assert');

const { createStore } = require('../src/state');

/** 마지막으로 내보낸 상태를 들고 있는 store */
function makeStore() {
  const seen = [];
  const store = createStore((s) => seen.push(s), () => 'en');
  return { store, seen, last: () => seen[seen.length - 1] };
}

const todos = (...statuses) => statuses.map((status, i) => ({
  content: `task ${i}`,
  activeForm: `doing task ${i}`,
  status,
}));

test('진행 중 항목은 절반으로 세서 바가 멈춰 보이지 않게 한다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, last } = makeStore();

  // 4개 중 2개 완료 + 1개 진행 중 -> (2 + 0.5) / 4 = 62.5% -> 63%
  store.handle({ event: 'tool_end', session_id: 's', tool: 'Edit', todos: todos('completed', 'completed', 'in_progress', 'pending') });

  assert.strictEqual(last().percent, 63);
  assert.strictEqual(last().detail, '2/4');
  assert.strictEqual(last().mode, 'coding');
  assert.strictEqual(last().tool, 'Edit');
  assert.strictEqual(last().message, 'doing task 2', '진행 중 항목의 activeForm 을 보여준다');
});

test('할 일이 다 끝나도 stop 전에는 100% 가 되지 않는다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, last } = makeStore();

  store.handle({ event: 'tool_end', session_id: 's', todos: todos('completed', 'completed') });

  assert.strictEqual(last().percent, 99, '100% 는 실제로 끝났을 때만 쓴다');
  assert.strictEqual(last().message, '2/2 done', '진행 중 항목이 없으면 개수를 보여준다');
});

test('할 일이 없으면 도구 호출 수로 추정하고 90% 에서 멈춘다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, last } = makeStore();

  const seen = [];
  for (let i = 0; i < 5; i++) {
    store.handle({ event: 'tool_end', session_id: 's', tool: 'Bash' });
    seen.push(last().percent);
  }

  assert.deepStrictEqual([...seen].sort((a, b) => a - b), seen, '단조 증가해야 한다');
  assert.ok(seen[0] > 0 && seen[0] < 20, `첫 호출은 완만하게 시작한다 (${seen[0]}%)`);
  assert.match(last().detail, /5 steps/);

  for (let i = 0; i < 200; i++) store.handle({ event: 'tool_end', session_id: 's' });
  assert.strictEqual(last().percent, 90, '아무리 오래 돌아도 90% 를 넘지 않는다');
});

test('tool_start 는 진행률을 올리지 않는다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, last } = makeStore();

  store.handle({ event: 'tool_end', session_id: 's' });
  const after = last().percent;
  store.handle({ event: 'tool_start', session_id: 's', tool: 'Read' });

  assert.strictEqual(last().percent, after, '시작만 해서는 카운트가 늘지 않는다');
  assert.strictEqual(last().tool, 'Read');
});

test('새 프롬프트는 이전 진행 상태를 초기화한다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, last } = makeStore();

  store.handle({ event: 'tool_end', session_id: 's', todos: todos('completed', 'in_progress') });
  store.handle({ event: 'prompt', session_id: 's', prompt: '로그인 버그 고쳐줘' });

  assert.strictEqual(last().mode, 'thinking');
  assert.strictEqual(last().percent, 0);
  assert.strictEqual(last().message, '로그인 버그 고쳐줘');

  // 이전 todos 가 남아 있으면 진행률이 그대로 되살아난다
  store.handle({ event: 'tool_end', session_id: 's' });
  assert.ok(last().percent < 20, `추정값부터 다시 시작해야 한다 (${last().percent}%)`);
});

test('긴 프롬프트는 잘라서 한 줄로 만든다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, last } = makeStore();

  store.handle({ event: 'prompt', session_id: 's', prompt: 'a'.repeat(100) });
  assert.strictEqual(last().message.length, 42);
  assert.ok(last().message.endsWith('…'));

  store.handle({ event: 'prompt', session_id: 's', prompt: '  여러\n줄   짜리  ' });
  assert.strictEqual(last().message, '여러 줄 짜리', '줄바꿈과 공백을 한 칸으로 정리한다');
});

test('stop 이면 100% 로 끝내고, 잠시 뒤 스스로 idle 로 돌아간다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, last } = makeStore();

  store.handle({ event: 'tool_end', session_id: 's', todos: todos('completed', 'in_progress', 'pending') });
  store.handle({ event: 'stop', session_id: 's', message: '로그인 버그 수정 완료' });

  assert.strictEqual(last().mode, 'done');
  assert.strictEqual(last().percent, 100);
  assert.strictEqual(last().message, '로그인 버그 수정 완료');
  assert.strictEqual(last().detail, '3 tasks');

  t.mock.timers.tick(59 * 1000);
  assert.strictEqual(last().mode, 'done', '1분 동안은 결과를 들고 있는다');

  t.mock.timers.tick(2 * 1000);
  assert.strictEqual(last().mode, 'idle');
  assert.strictEqual(last().percent, 0);
});

test('notification 이면 입력 대기 상태가 된다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, last } = makeStore();

  store.handle({ event: 'notification', session_id: 's', message: 'Claude needs your permission to use Bash' });

  assert.strictEqual(last().mode, 'waiting');
  assert.ok(last().message.startsWith('Claude needs your permission'));
});

test('세션이 끝나면 그 세션의 진행 상태를 버린다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, last } = makeStore();

  store.handle({ event: 'tool_end', session_id: 's', ctx: 50000 });
  store.handle({ event: 'session_end', session_id: 's' });

  assert.strictEqual(last().mode, 'idle');
  assert.strictEqual(last().session, '');
  assert.strictEqual(last().ctx, 0, '컨텍스트 게이지도 비운다');

  // 같은 id 로 다시 시작하면 카운터가 처음부터여야 한다
  store.handle({ event: 'tool_end', session_id: 's' });
  assert.ok(last().percent < 20, `이전 세션 카운터가 남으면 안 된다 (${last().percent}%)`);
});

test('세션이 섞여도 서로의 진행률을 덮어쓰지 않는다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, last } = makeStore();

  store.handle({ event: 'tool_end', session_id: 'a', todos: todos('completed', 'completed', 'in_progress') });
  const aPercent = last().percent;

  store.handle({ event: 'tool_end', session_id: 'b', todos: todos('in_progress', 'pending', 'pending', 'pending') });
  assert.notStrictEqual(last().percent, aPercent);

  store.handle({ event: 'tool_end', session_id: 'a' });
  assert.strictEqual(last().percent, aPercent, 'a 의 todos 는 a 에 남아 있어야 한다');
});

test('컨텍스트 사용량은 어느 이벤트에 실려 오든 반영된다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, last } = makeStore();

  store.handle({ event: 'tool_end', session_id: 's', ctx: 120000, ctxMax: 500000 });
  assert.strictEqual(last().ctx, 120000);
  assert.strictEqual(last().ctxMax, 500000);

  // ctx 가 없는 이벤트가 와도 직전 값을 지우지 않는다
  store.handle({ event: 'tool_end', session_id: 's' });
  assert.strictEqual(last().ctx, 120000);
});

test('모르는 이벤트는 false 를 돌려주고 상태를 건드리지 않는다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, seen } = makeStore();

  assert.strictEqual(store.handle({ event: 'tool_end', session_id: 's' }), true);
  const before = seen.length;
  assert.strictEqual(store.handle({ event: '해괴한이벤트', session_id: 's' }), false);
  assert.strictEqual(seen.length, before, '아무것도 내보내지 않는다');
});
