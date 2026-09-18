/*
 * 훅 이벤트를 펫 상태로 환원(reduce)한다.
 * mode: idle | thinking | coding | waiting | done | error
 */
const { t } = require('./i18n');

const IDLE_AFTER_DONE_MS = 60 * 1000; // 완료 메시지를 들고 있는 시간

function createStore(onChange, getLang = () => 'en') {
  const T = (key, vars) => t(getLang(), key, vars);

  const state = {
    mode: 'idle',
    percent: 0,
    message: T('idle'),
    detail: '',
    tool: '',
    session: '',
    ctx: 0,          // 현재 컨텍스트 점유 토큰 수
    ctxMax: 200000,
    plan: null,      // { fiveHour, weekly, resetsIn } — 세션 밖에서는 못 읽어서 push 로만 들어온다
    planAt: 0,       // 그 값을 받은 시각 (얼마나 묵었는지 표시용)
    updatedAt: Date.now(),
  };

  // 세션별 보조 카운터 (todo 가 없을 때 진행률 추정용)
  const sessions = new Map();
  let idleTimer = null;

  function sess(id) {
    if (!sessions.has(id)) sessions.set(id, { tools: 0, todos: null });
    return sessions.get(id);
  }

  function commit(patch) {
    Object.assign(state, patch, { updatedAt: Date.now() });
    onChange({ ...state });
  }

  function idlePatch() {
    return { mode: 'idle', percent: 0, message: T('idle'), detail: '', tool: '' };
  }

  function scheduleIdle(ms) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => commit(idlePatch()), ms);
  }

  function cancelIdle() {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  /** todos 배열 → { percent, label, done, total } */
  function fromTodos(todos) {
    if (!Array.isArray(todos) || todos.length === 0) return null;
    const total = todos.length;
    const done = todos.filter((x) => x.status === 'completed').length;
    const active = todos.find((x) => x.status === 'in_progress');
    // 진행 중 항목은 절반 완료로 셈해서 바가 멈춰 보이지 않게 한다
    const percent = Math.round(((done + (active ? 0.5 : 0)) / total) * 100);
    return {
      percent: Math.min(99, percent),
      label: active ? active.activeForm || active.content : T('tasksDone', { done, total }),
      done,
      total,
    };
  }

  /** todo 가 없을 때: 도구 호출 횟수로 완만하게 증가 */
  function estimate(n) {
    return Math.min(90, Math.round(100 * (1 - Math.pow(0.93, n))));
  }

  function handle(evt) {
    const id = evt.session_id || 'default';
    const s = sess(id);

    // 사용량은 어떤 이벤트에 실려 오든 그대로 반영한다 (commit 이 state 를 통째로 내보낸다)
    if (typeof evt.ctx === 'number') state.ctx = evt.ctx;
    if (evt.ctxMax) state.ctxMax = evt.ctxMax;
    if (evt.plan) { state.plan = evt.plan; state.planAt = Date.now(); }

    switch (evt.event) {
      case 'session_start':
        s.tools = 0;
        s.todos = null;
        cancelIdle();
        commit({ ...idlePatch(), message: T('sessionStart'), session: id });
        scheduleIdle(4000);
        break;

      case 'prompt':
        s.tools = 0;
        s.todos = null;
        cancelIdle();
        commit({
          mode: 'thinking',
          percent: 0,
          message: evt.prompt ? truncate(evt.prompt, 42) : T('thinking'),
          detail: '',
          tool: '',
          session: id,
        });
        break;

      case 'tool_start':
      case 'tool_end': {
        if (evt.event === 'tool_end') s.tools += 1;
        if (evt.todos) s.todos = fromTodos(evt.todos);
        cancelIdle();
        const td = s.todos;
        commit({
          mode: 'coding',
          percent: td ? td.percent : estimate(s.tools),
          message: td ? td.label : T('working'),
          detail: td ? `${td.done}/${td.total}` : T('steps', { n: s.tools }),
          tool: evt.tool || '',
          session: id,
        });
        break;
      }

      case 'notification':
        cancelIdle();
        commit({
          mode: 'waiting',
          message: truncate(evt.message || T('waiting'), 46),
          detail: '',
          session: id,
        });
        break;

      case 'stop':
        cancelIdle();
        commit({
          mode: 'done',
          percent: 100,
          message: truncate(evt.message || T('done'), 70),
          detail: s.todos ? T('taskCount', { n: s.todos.total }) : '',
          tool: '',
          session: id,
        });
        scheduleIdle(IDLE_AFTER_DONE_MS);
        break;

      case 'error':
        cancelIdle();
        commit({ mode: 'error', message: truncate(evt.message || T('error'), 60), session: id });
        scheduleIdle(20000);
        break;

      case 'session_end':
        sessions.delete(id);
        cancelIdle();
        commit({ ...idlePatch(), session: '', ctx: 0 });
        break;

      // 사용량만 갱신 (위에서 이미 반영했으니 그대로 내보내기만 한다)
      case 'usage':
        commit({});
        break;

      // 수동/데모용
      case 'set':
        cancelIdle();
        commit({
          mode: evt.mode || state.mode,
          percent: typeof evt.percent === 'number' ? evt.percent : state.percent,
          message: evt.message != null ? truncate(evt.message, 70) : state.message,
          detail: evt.detail != null ? evt.detail : state.detail,
          tool: evt.tool != null ? evt.tool : state.tool,
        });
        break;

      default:
        return false;
    }
    return true;
  }

  /** 언어가 바뀌면 기본 문구를 새 언어로 다시 그린다 */
  function relabel() {
    if (state.mode === 'idle') commit(idlePatch());
    else commit({});
  }

  return {
    handle,
    relabel,
    get: () => ({ ...state }),
  };
}

function truncate(str, n) {
  const s = String(str).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

module.exports = { createStore };
