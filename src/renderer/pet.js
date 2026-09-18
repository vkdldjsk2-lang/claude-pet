/* 캔버스 픽셀 렌더링 + 상태 애니메이션 */
(() => {
  const S = window.SPRITES;
  let chr = S.get('blob');
  let lang = 'en';
  const T = (k, v) => window.I18N.t(lang, k, v);
  const CELL = 7;

  const canvas = document.getElementById('pet');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const stage = document.getElementById('stage');
  const dotsEl = document.getElementById('dots');
  const pctEl = document.getElementById('pct');
  const boardText = document.getElementById('board-text');
  const boardIcon = document.getElementById('board-icon');
  const toolEl = document.getElementById('tool');
  const usageEl = document.getElementById('usage');
  const usageFill = document.getElementById('usage-fill');
  const usageText = document.getElementById('usage-text');
  const planEl = document.getElementById('plan');
  const plan5Fill = document.getElementById('plan5-fill');
  const plan5Text = document.getElementById('plan5-text');
  const planwFill = document.getElementById('planw-fill');
  const planwText = document.getElementById('planw-text');
  const planAge = document.getElementById('plan-age');

  const DOT_COUNT = 10;
  const dotEls = [];
  for (let i = 0; i < DOT_COUNT; i++) {
    const d = document.createElement('span');
    d.className = 'dot';
    dotsEl.appendChild(d);
    dotEls.push(d);
  }

  let state = { mode: 'idle', percent: 0, message: '대기 중', detail: '', tool: '' };
  let shownPercent = 0;

  // 앞발은 목표 위치로 부드럽게 따라간다 (픽셀 좌표)
  const paws = S.LAYOUT.paws.rest.map(([x, y]) => ({ x: x * CELL, y: y * CELL }));

  // 눈 깜빡임 스케줄
  let nextBlink = 1500;
  let blinkUntil = 0;

  const ICONS = { done: '✓', waiting: '?', error: '!' };

  function apply(next) {
    const prevMode = state.mode;
    state = { ...state, ...next };
    stage.dataset.mode = state.mode;
    boardIcon.textContent = ICONS[state.mode] || '✓';
    if (state.message) boardText.textContent = state.message;
    toolEl.textContent = state.tool ? state.tool.toUpperCase() : '';
    if (prevMode !== state.mode && state.mode === 'idle') shownPercent = 0;
    updateUsage();
  }

  const kilo = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));

  function gauge(fill, text, pct, label) {
    fill.style.width = Math.min(100, pct) + '%';
    fill.style.setProperty('--u', pct >= 85 ? '#f2705f' : pct >= 65 ? '#f2c14e' : '#7fd8c4');
    text.textContent = label;
  }

  function updateUsage() {
    const used = state.ctx || 0;
    usageEl.classList.toggle('show', used > 0);
    if (used) {
      const pct = Math.min(100, Math.round((used / (state.ctxMax || 200000)) * 100));
      gauge(usageFill, usageText, pct, T('ctx') + ' ' + pct + '% · ' + kilo(used));
    }

    const p = state.plan;
    planEl.classList.toggle('show', !!p);
    if (p) {
      gauge(plan5Fill, plan5Text, p.fiveHour || 0, T('fiveHour') + ' ' + (p.fiveHour || 0) + '%');
      gauge(planwFill, planwText, p.weekly || 0, T('weekly') + ' ' + (p.weekly || 0) + '%');
      planEl.title = p.resetsIn ? T('resetsIn', { v: p.resetsIn }) : '';
      updateAge();
    }
  }

  /** 요금제 값은 push 로만 들어오므로 얼마나 묵었는지 같이 보여준다 */
  function updateAge() {
    if (!state.plan || !state.planAt) { planAge.textContent = ''; return; }
    const min = Math.floor((Date.now() - state.planAt) / 60000);
    planAge.textContent = min < 1 ? '방금' : min < 60 ? min + '분 전' : Math.floor(min / 60) + '시간 전';
    planAge.classList.toggle('stale', min >= 30);
  }

  function updateDots() {
    const p = Math.round(shownPercent);
    const filled = p / 10;
    const full = Math.floor(filled);
    for (let i = 0; i < DOT_COUNT; i++) {
      const cls = i < full ? 'dot on' : i === full && p % 10 !== 0 ? 'dot partial' : 'dot';
      if (dotEls[i].className !== cls) dotEls[i].className = cls;
    }
    pctEl.textContent = `${p}%`;
  }

  /** 스프라이트 한 장을 픽셀 좌표에 그린다. overrides 로 특정 문자의 색을 바꿀 수 있다. */
  function drawSprite(rows, px, py, overrides) {
    for (let y = 0; y < rows.length; y++) {
      const line = rows[y];
      for (let x = 0; x < line.length; x++) {
        const ch = line[x];
        const color = (overrides && overrides[ch] !== undefined) ? overrides[ch] : S.PALETTE[ch];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(px + x * CELL, py + y * CELL, CELL, CELL);
      }
    }
  }

  function bodyFor(mode) {
    if (mode === 'done') return chr.HAPPY;
    if (mode === 'thinking' || mode === 'waiting') return chr.UP;
    return chr.BODY;
  }

  function pawTargetKey(mode, beatUp) {
    if (mode === 'done' || mode === 'waiting' || mode === 'error') return 'hold';
    if (mode === 'coding') return beatUp ? 'type' : 'rest';
    return 'rest';
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function frame(t) {
    // 진행률 스무딩
    const target = state.mode === 'idle' ? 0 : state.percent;
    shownPercent = Math.abs(target - shownPercent) < 0.4 ? target : lerp(shownPercent, target, 0.14);
    updateDots();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const mode = state.mode;

    // 완료 시 뒤쪽 발광
    if (mode === 'done') {
      const cx = canvas.width / 2;
      const cy = S.LAYOUT.bodyY * CELL + 7 * CELL;
      const pulse = 0.28 + 0.18 * Math.sin(t / 420);
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 92);
      g.addColorStop(0, `rgba(110, 231, 200, ${pulse})`);
      g.addColorStop(1, 'rgba(110, 231, 200, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 호흡 / 들썩임
    let bob;
    if (mode === 'coding') bob = Math.sin(t / 190) > 0 ? 0 : 2;
    else if (mode === 'done') bob = Math.sin(t / 300) > 0 ? 0 : 3;
    else if (mode === 'waiting') bob = Math.sin(t / 260) > 0 ? 0 : 2;
    else bob = Math.sin(t / 900) > 0 ? 0 : 2;

    // 깜빡임
    if (t > nextBlink && t > blinkUntil) {
      blinkUntil = t + 120;
      nextBlink = t + 2200 + Math.random() * 3600;
    }
    const blinking = t < blinkUntil && mode !== 'done';

    // 안테나 색: 상태별 + 맥동
    const antenna = {
      idle: '#8a7f6b',
      thinking: '#ffd66b',
      coding: '#ffd66b',
      waiting: '#f2c14e',
      done: '#8fe3d0',
      error: '#f2705f',
    }[mode] || '#ffd66b';
    const antennaOn = mode === 'idle'
      ? Math.sin(t / 1100) > 0.4
      : mode === 'thinking' ? Math.sin(t / 130) > -0.2
      : mode === 'coding' ? Math.sin(t / 260) > -0.4
      : true;

    // 노트북 로고 깜빡임
    const screen = mode === 'coding'
      ? (Math.sin(t / 110) > -0.5 ? '#b6fbe9' : '#5fbfa9')
      : mode === 'done' ? '#b6fbe9'
      : mode === 'error' ? '#f2705f'
      : '#6f8f88';

    const bodyY = S.LAYOUT.bodyY * CELL + bob;
    const body = blinking ? chr.BLINK : bodyFor(mode);

    drawSprite(body, 0, bodyY, { A: antennaOn ? antenna : '#4a4038' });

    // 안테나 발광
    if (antennaOn) {
      ctx.save();
      ctx.shadowColor = antenna;
      ctx.shadowBlur = 14;
      ctx.fillStyle = antenna;
      ctx.fillRect(10 * CELL, bodyY, CELL, CELL);
      ctx.restore();
    }

    // 노트북 (몸통 앞)
    drawSprite(S.LAPTOP, 0, S.LAYOUT.laptopY * CELL, { S: screen });

    // 앞발
    const beatUp = Math.floor(t / 95) % 2 === 0;
    const key = pawTargetKey(mode, beatUp);
    const targets = S.LAYOUT.paws[key];
    const ease = key === 'hold' ? 0.14 : 0.45;
    for (let i = 0; i < paws.length; i++) {
      // 타이핑 중에는 좌우 앞발이 엇갈리게 움직인다
      let [tx, ty] = targets[i];
      if (mode === 'coding' && i === 1) {
        const alt = beatUp ? S.LAYOUT.paws.rest[1] : S.LAYOUT.paws.type[1];
        tx = alt[0]; ty = alt[1];
      }
      // 완료 시 판을 살짝 흔든다
      const wiggle = key === 'hold' ? Math.sin(t / 340 + i * 1.7) * 1.5 : 0;
      paws[i].x = lerp(paws[i].x, tx * CELL, ease);
      paws[i].y = lerp(paws[i].y, ty * CELL + bob + wiggle, ease);
      drawSprite(chr.PAW, Math.round(paws[i].x), Math.round(paws[i].y));
    }

    if (t - lastAgeTick > 30000) { lastAgeTick = t; updateAge(); }

    requestAnimationFrame(frame);
  }

  let lastAgeTick = 0;
  requestAnimationFrame(frame);

  // 브라우저에서 열었을 때(개발용) 상태를 직접 넣어볼 수 있게 한다
  window.__setPetState = apply;
  window.__setPetCharacter = (name) => { chr = S.get(name); };
  window.__setPetLang = (v) => { lang = window.I18N.pick(v); updateUsage(); };

  // ── 메인 프로세스 연동 ─────────────────────
  const bridge = window.claudePet;
  if (bridge && typeof bridge.onState === 'function') {
    bridge.onState(apply);
    bridge.onScale((v) => { stage.style.transform = 'scale(' + v + ')'; });
    bridge.onCharacter((name) => { chr = S.get(name); });
    bridge.onLang((v) => { lang = window.I18N.pick(v); updateUsage(); });
    bridge.get().then((s) => { if (s) apply(s); }).catch(() => {});
  }

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (bridge && typeof bridge.menu === 'function') bridge.menu();
  });
})();
