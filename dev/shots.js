/*
 * README 용 스크린샷 / GIF 프레임 생성기.
 *   npx electron dev/shots.js
 * 결과물은 docs/ 에 떨어지고 커밋된다. GIF 합성은 dev/shots.sh 가 ffmpeg 로 처리한다.
 * (앱을 돌리는 데는 필요 없고, 이미지를 다시 뽑을 때만 쓰는 도구다)
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'docs');
const FRAMES = path.join(OUT, 'frames');
const SCALE = 2;          // 픽셀아트라 2배로 떠야 선명하다
const BG = '#1b1a19';     // 밝은/어두운 테마 양쪽에서 읽히도록 배경을 깐다

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 요청한 상태가 실제로 한 프레임 그려질 때까지 기다린다 */
const settled = (win) => win.webContents.executeJavaScript(
  'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))'
);

async function main() {
  fs.mkdirSync(FRAMES, { recursive: true });
  const win = new BrowserWindow({
    width: 320 * SCALE,
    height: 320 * SCALE,
    show: true,
    webPreferences: { offscreen: false, backgroundThrottling: false },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await win.webContents.executeJavaScript(`
    document.body.style.background = ${JSON.stringify(BG)};
    document.getElementById('stage').style.transform = 'scale(${SCALE})';
    true;
  `);
  await sleep(400);

  const set = (js) => win.webContents.executeJavaScript(js + '; true;');

  /** 보이는 요소들의 합집합 사각형 (상태마다 높이가 달라서 매번 잰다) */
  async function contentRect(pad = 14) {
    const r = await win.webContents.executeJavaScript(`
      (() => {
        const els = [...document.querySelectorAll('#board, #meter, #pet, #tool, #usage, #plan')]
          .filter(e => getComputedStyle(e).opacity !== '0' && e.getBoundingClientRect().height > 0);
        const b = els.map(e => e.getBoundingClientRect());
        return {
          x: Math.min(...b.map(r => r.left)), y: Math.min(...b.map(r => r.top)),
          r: Math.max(...b.map(r => r.right)), b: Math.max(...b.map(r => r.bottom)),
        };
      })()
    `);
    return {
      x: Math.max(0, Math.floor(r.x - pad)),
      y: Math.max(0, Math.floor(r.y - pad)),
      width: Math.ceil(r.r - r.x + pad * 2),
      height: Math.ceil(r.b - r.y + pad * 2),
    };
  }

  async function shot(name, rect) {
    await settled(win);
    const img = await win.webContents.capturePage(rect || (await contentRect()));
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('✓', name);
  }

  const USAGE = `ctx: 193200, ctxMax: 1000000, plan: { fiveHour: 34, weekly: 5, resetsIn: '2h 41m' }`;

  await set(`window.__setPetLang('en')`);

  // ── 정지 컷 ────────────────────────────────────────────
  for (const c of ['blob', 'cat', 'penguin']) {
    await set(`window.__setPetCharacter('${c}');
      window.__setPetState({ mode: 'idle', percent: 0, message: '', tool: '', ${USAGE} })`);
    await sleep(500);
    await shot(`char-${c}.png`);
  }

  await set(`window.__setPetCharacter('cat');
    window.__setPetState({ mode: 'coding', percent: 45, message: 'Reading auth code', tool: 'Read', ${USAGE} })`);
  await sleep(600);
  await shot('state-coding.png');

  await set(`window.__setPetState({ mode: 'done', percent: 100, message: 'Fixed the expiring-session bug — 12 tests pass', tool: '', ${USAGE} })`);
  await sleep(900);
  await shot('state-done.png');

  await set(`window.__setPetState({ mode: 'waiting', percent: 60, message: 'Allow Bash to run the test suite?', tool: '', ${USAGE} })`);
  await sleep(700);
  await shot('state-waiting.png');

  // ── GIF 프레임: 프롬프트 → 작업 → 완료 ─────────────────
  await set(`window.__setPetState({ mode: 'done', percent: 100, message: 'Fixed the expiring-session bug — 12 tests pass', ${USAGE} })`);
  await sleep(300);
  const gifRect = await contentRect(16);   // 가장 큰 상태 기준으로 고정해야 프레임이 흔들리지 않는다

  const script = [
    { ms: 600,  js: `window.__setPetState({ mode: 'thinking', percent: 0, message: 'fix the login bug', tool: '', ${USAGE} })` },
    { ms: 1100, js: `window.__setPetState({ mode: 'coding', percent: 13, message: 'Reading auth code', tool: 'Read', ${USAGE} })` },
    { ms: 1100, js: `window.__setPetState({ mode: 'coding', percent: 38, message: 'Finding the expiry logic', tool: 'Grep', ${USAGE} })` },
    { ms: 1100, js: `window.__setPetState({ mode: 'coding', percent: 63, message: 'Fixing token refresh', tool: 'Edit', ${USAGE} })` },
    { ms: 1100, js: `window.__setPetState({ mode: 'coding', percent: 88, message: 'Running tests', tool: 'Bash', ${USAGE} })` },
    { ms: 2200, js: `window.__setPetState({ mode: 'done', percent: 100, message: 'Fixed the expiring-session bug — 12 tests pass', tool: '', ${USAGE} })` },
  ];

  let n = 0;
  const STEP = 80;   // 12.5 fps
  for (const step of script) {
    await set(step.js);
    await settled(win);
    for (let elapsed = 0; elapsed < step.ms; elapsed += STEP) {
      const img = await win.webContents.capturePage(gifRect);
      fs.writeFileSync(path.join(FRAMES, `f${String(n++).padStart(4, '0')}.png`), img.toPNG());
      await sleep(STEP);
    }
  }
  console.log(`✓ ${n} frames → docs/frames`);
  app.quit();
}

app.whenReady().then(main).catch((e) => { console.error(e); app.exit(1); });
