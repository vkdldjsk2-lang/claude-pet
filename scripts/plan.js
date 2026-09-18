#!/usr/bin/env node
/*
 * 요금제 한도 사용량을 펫에 밀어넣는다.
 *   node scripts/plan.js <5시간%> <주간%> [리셋까지] [컨텍스트윈도우]
 *   node scripts/plan.js 34 5 "2h 41m" 1000000
 *
 * ponytail: 이 값은 Claude Code 세션 안에서만 읽을 수 있다(데스크톱 앱의 usage 카드 /
 * get_usage MCP). 훅·트랜스크립트·CLI 어디에도 없어서 자동 폴링 경로가 없고,
 * 그래서 push 전용이다. 자동화하려면 세션에서 주기적으로 이 스크립트를 부르는 수밖에 없다.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [five, weekly, resetsIn = '', ctxMax = ''] = process.argv.slice(2);
if (five === undefined || weekly === undefined) {
  console.error('사용법: node scripts/plan.js <5시간%> <주간%> [리셋까지] [컨텍스트윈도우]');
  process.exit(2);
}

let port = Number(process.env.CLAUDE_PET_PORT) || 0;
if (!port) {
  try { port = Number(fs.readFileSync(path.join(os.homedir(), '.claude-pet', 'port'), 'utf8').trim()); } catch {}
}
if (!port) port = 4577;

const body = JSON.stringify({
  event: 'usage',
  plan: { fiveHour: Number(five), weekly: Number(weekly), resetsIn },
  ...(ctxMax ? { ctxMax: Number(ctxMax) } : {}),
});

const req = http.request(
  { host: '127.0.0.1', port, path: '/event', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
  (res) => { res.resume(); console.log(res.statusCode === 200 ? `✓ 5H ${five}% · 주 ${weekly}%` : `✗ HTTP ${res.statusCode}`); }
);
req.on('error', (e) => { console.error(`✗ 펫에 연결 실패 (127.0.0.1:${port}): ${e.message}`); process.exit(1); });
req.end(body);
