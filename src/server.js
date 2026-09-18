/*
 * 로컬 이벤트 수신 서버. 127.0.0.1 에만 바인딩한다.
 * Claude Code 훅(scripts/hook.js)이 여기로 JSON 을 POST 한다.
 */
const http = require('http');

const DEFAULT_PORT = Number(process.env.CLAUDE_PET_PORT) || 4577;
const MAX_BODY = 256 * 1024;

function startServer({ port = DEFAULT_PORT, onEvent, getState }) {
  const server = http.createServer((req, res) => {
    const url = (req.url || '').split('?')[0];

    if (req.method === 'GET' && url === '/health') {
      return json(res, 200, { ok: true, state: getState() });
    }

    if (req.method === 'POST' && url === '/event') {
      let body = '';
      let tooBig = false;
      req.on('data', (c) => {
        body += c;
        if (body.length > MAX_BODY) {
          tooBig = true;
          req.destroy();
        }
      });
      req.on('end', () => {
        if (tooBig) return;
        try {
          const evt = JSON.parse(body || '{}');
          const ok = onEvent(evt);
          json(res, ok ? 200 : 400, { ok });
        } catch (e) {
          json(res, 400, { ok: false, error: String(e && e.message) });
        }
      });
      req.on('error', () => {});
      return;
    }

    json(res, 404, { ok: false });
  });

  return new Promise((resolve) => {
    let attempt = 0;
    const tryListen = (p) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < 5) {
          attempt += 1;
          tryListen(p + 1);
        } else {
          resolve({ server, port: null, error: err });
        }
      });
      server.listen(p, '127.0.0.1', () => resolve({ server, port: p }));
    };
    tryListen(port);
  });
}

function json(res, code, obj) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': b.length });
  res.end(b);
}

module.exports = { startServer, DEFAULT_PORT };
