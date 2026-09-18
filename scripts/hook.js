#!/usr/bin/env node
/*
 * Claude Code 훅 → Claude Pet 이벤트 브리지.
 *   node hook.js <event>
 *   node hook.js --selftest
 * stdin 으로 들어온 훅 JSON 을 읽어 로컬 펫 서버로 POST 한다.
 * 어떤 경우에도 Claude Code 를 막지 않도록 항상 0 으로 빠르게 종료한다.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EVENT = process.argv[2] || 'tool_end';
const TIMEOUT_MS = 500;
// 명시했을 때만 보낸다. 안 그러면 plan.js 가 밀어넣은 실제 윈도우 크기를 매 이벤트마다 덮어쓴다.
const CONTEXT_MAX = Number(process.env.CLAUDE_PET_CONTEXT_MAX) || 0;

function resolvePort() {
  if (process.env.CLAUDE_PET_PORT) return Number(process.env.CLAUDE_PET_PORT);
  try {
    const p = fs.readFileSync(path.join(os.homedir(), '.claude-pet', 'port'), 'utf8').trim();
    if (p) return Number(p);
  } catch { /* 앱이 꺼져 있으면 기본 포트로 시도 */ }
  return 4577;
}

/*
 * 트랜스크립트 뒤쪽 256KB 만 읽어서
 *  - text: 완료 메시지로 쓸 마지막 응답 첫 줄
 *  - ctx : 마지막 어시스턴트 메시지의 컨텍스트 점유 토큰 수
 * 를 뽑는다. ponytail: 누적 비용은 전체 파일 스캔이 필요해서 생략, 필요해지면 그때.
 */
function readTail(transcriptPath) {
  const out = { text: '', ctx: null };
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return out;
    const stat = fs.statSync(transcriptPath);
    const start = Math.max(0, stat.size - 256 * 1024);
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);

    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith('{')) continue;       // 잘린 첫 줄은 건너뛴다
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.type !== 'assistant') continue;
      const m = obj.message || {};

      // 가장 최근 어시스턴트 메시지의 usage 가 곧 현재 컨텍스트 점유량
      if (out.ctx === null && m.usage) {
        const u = m.usage;
        out.ctx = (u.input_tokens || 0)
          + (u.cache_read_input_tokens || 0)
          + (u.cache_creation_input_tokens || 0);
      }
      // 마지막 도구 호출에는 텍스트가 없을 수 있어 더 거슬러 올라간다
      if (!out.text && Array.isArray(m.content)) {
        const t = m.content.filter((c) => c && c.type === 'text').map((c) => c.text).join(' ').trim();
        if (t) out.text = t.split('\n').filter(Boolean)[0] || t;
      }
      if (out.ctx !== null && out.text) break;
    }
  } catch { /* 파싱 실패 시 기본값 사용 */ }
  return out;
}

if (process.argv.includes('--selftest')) {
  const assert = require('assert');
  const tmp = path.join(os.tmpdir(), 'claude-pet-selftest.jsonl');
  fs.writeFileSync(tmp, [
    JSON.stringify({ type: 'user', message: { content: 'hi' } }),
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 5 }, content: [{ type: 'text', text: '첫 응답\n둘째 줄' }] } }),
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 }, content: [{ type: 'tool_use', name: 'Bash' }] } }),
  ].join('\n'));
  const r = readTail(tmp);
  assert.strictEqual(r.ctx, 1210, 'ctx = 마지막 어시스턴트의 input + cache_read + cache_creation');
  assert.strictEqual(r.text, '첫 응답', '도구 호출만 있는 메시지는 건너뛰고 텍스트를 찾아야 한다');
  assert.strictEqual(readTail('/없는파일').ctx, null);
  fs.unlinkSync(tmp);
  console.log('✓ hook selftest ok');
  process.exit(0);
}

function buildPayload(input) {
  const tail = readTail(input.transcript_path);
  const base = {
    event: EVENT,
    session_id: input.session_id || 'default',
    cwd: input.cwd || '',
  };
  if (tail.ctx !== null) { base.ctx = tail.ctx; if (CONTEXT_MAX) base.ctxMax = CONTEXT_MAX; }

  switch (EVENT) {
    case 'prompt':
      return { ...base, prompt: input.prompt || '' };

    case 'tool_start':
    case 'tool_end': {
      const p = { ...base, tool: input.tool_name || '' };
      // TodoWrite 의 todos 로 실제 진행률을 계산한다
      const todos = input.tool_input && input.tool_input.todos;
      if (Array.isArray(todos)) p.todos = todos.map((t) => ({
        content: t.content, activeForm: t.activeForm, status: t.status,
      }));
      return p;
    }

    case 'notification':
      return { ...base, message: input.message || '입력을 기다리는 중' };

    case 'stop':
      return { ...base, message: tail.text || '작업 완료!' };

    default:
      return base;
  }
}

function send(payload, port) {
  const body = Buffer.from(JSON.stringify(payload));
  const req = http.request(
    {
      host: '127.0.0.1',
      port,
      path: '/event',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      timeout: TIMEOUT_MS,
    },
    (res) => { res.resume(); res.on('end', () => process.exit(0)); }
  );
  req.on('error', () => process.exit(0));   // 펫이 꺼져 있어도 조용히 통과
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.end(body);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { /* 빈 입력도 허용 */ }
  send(buildPayload(input), resolvePort());
});
process.stdin.on('error', () => process.exit(0));

// stdin 이 닫히지 않는 경우에 대비한 안전장치
setTimeout(() => process.exit(0), TIMEOUT_MS + 700).unref();
