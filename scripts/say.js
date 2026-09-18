#!/usr/bin/env node
/*
 * Push a pet state directly (handy for testing or for CI/build scripts).
 *   node scripts/say.js coding 42 "테스트 실행 중"
 *   node scripts/say.js done 100 "빌드 성공!"
 *   modes: idle | thinking | coding | waiting | done | error
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [mode = 'coding', percent = '50', ...rest] = process.argv.slice(2);

let port = Number(process.env.CLAUDE_PET_PORT) || 0;
if (!port) {
  try { port = Number(fs.readFileSync(path.join(os.homedir(), '.claude-pet', 'port'), 'utf8').trim()); } catch {}
}
if (!port) port = 4577;

const payload = JSON.stringify({
  event: 'set',
  mode,
  percent: Number(percent),
  message: rest.join(' ') || undefined,
  tool: mode === 'coding' ? 'EDIT' : '',
});

const req = http.request(
  { host: '127.0.0.1', port, path: '/event', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
  (res) => {
    res.resume();
    console.log(res.statusCode === 200 ? `✓ ${mode} ${percent}%` : `✗ HTTP ${res.statusCode}`);
  }
);
req.on('error', (e) => {
  console.error(`✗ Cannot reach the pet at 127.0.0.1:${port} — is the app running?`);
  console.error(`  ${e.message}`);
  process.exit(1);
});
req.end(payload);
