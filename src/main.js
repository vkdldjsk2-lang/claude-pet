const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const hooks = require('../scripts/install-hooks');
const { startServer, DEFAULT_PORT } = require('./server');
const { createStore } = require('./state');
const { makeIconPNG } = require('./icon');
const { CHARACTERS } = require('./sprites');
const { t, fromLocale } = require('./i18n');

const WIN_W = 320;
const WIN_H = 320;
const SCALES = [['sizeS', 0.75], ['sizeM', 1], ['sizeL', 1.3], ['sizeXL', 1.6]];
const README_URL = 'https://github.com/vkdldjsk2-lang/claude-pet#readme';

let win = null;
let tray = null;
let store = null;
let activePort = null;
let demoTimer = null;
let hookState = { installed: 0, total: 0 };

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2));
  } catch { /* 설정 저장 실패는 치명적이지 않다 */ }
  return next;
}

function currentLang() {
  return loadSettings().language || fromLocale(app.getLocale());
}

const T = (key, vars) => t(currentLang(), key, vars);

function setLanguage(lang) {
  saveSettings({ language: lang });
  if (win && !win.isDestroyed()) win.webContents.send('pet:lang', lang);
  if (store) store.relabel();
  refreshTrayMenu();
}

function defaultPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  const scale = loadSettings().scale || 1;
  return {
    x: Math.round(workArea.x + workArea.width - WIN_W * scale - 24),
    y: Math.round(workArea.y + workArea.height - WIN_H * scale - 12),
  };
}

/** 저장된 좌표가 현재 연결된 디스플레이 안에 있는지 확인 */
function isVisiblePosition(x, y) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return x + WIN_W > a.x && x < a.x + a.width && y + WIN_H > a.y && y < a.y + a.height;
  });
}

function createWindow() {
  const s = loadSettings();
  let pos = s.position;
  if (!pos || !isVisiblePosition(pos.x, pos.y)) pos = defaultPosition();

  const scale = s.scale || 1;
  win = new BrowserWindow({
    width: Math.round(WIN_W * scale),
    height: Math.round(WIN_H * scale),
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(s.alwaysOnTop !== false, process.platform === 'darwin' ? 'floating' : 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    if (store) win.webContents.send('pet:state', store.get());
    win.webContents.send('pet:scale', scale);
    win.webContents.send('pet:character', s.character || 'blob');
    win.webContents.send('pet:lang', currentLang());
    win.webContents.send('pet:info', { port: activePort });
  });

  const persist = () => {
    if (!win || win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    saveSettings({ position: { x, y } });
  };
  win.on('moved', persist);
  win.on('close', persist);
  win.on('closed', () => { win = null; });

  if (s.clickThrough) setClickThrough(true);
}

/** 창을 아래쪽 가운데 기준으로 키우거나 줄인다 (펫 발밑이 제자리에 있도록) */
function setScale(scale) {
  saveSettings({ scale });
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();
  const nw = Math.round(WIN_W * scale);
  const nh = Math.round(WIN_H * scale);
  win.setBounds({ x: Math.round(x + (w - nw) / 2), y: y + (h - nh), width: nw, height: nh });
  win.webContents.send('pet:scale', scale);
  refreshTrayMenu();
}

function setCharacter(name) {
  saveSettings({ character: name });
  if (win && !win.isDestroyed()) win.webContents.send('pet:character', name);
  if (tray) tray.setImage(nativeImage.createFromBuffer(makeIconPNG(32, name)).resize({ width: 16, height: 16 }));
  refreshTrayMenu();
}

function setClickThrough(on) {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(on, { forward: true });
  saveSettings({ clickThrough: !!on });
  if (win && !win.isDestroyed()) win.webContents.send('pet:click-through', !!on);
}

function push(state) {
  if (win && !win.isDestroyed()) win.webContents.send('pet:state', state);
  updateTrayTitle(state);
}

function updateTrayTitle(state) {
  if (!tray) return;
  const label = state.mode === 'coding' || state.mode === 'thinking'
    ? `${state.percent}%`
    : state.mode === 'done' ? '✓' : '';
  if (process.platform === 'darwin') tray.setTitle(label ? ` ${label}` : '');
  tray.setToolTip(`Claude Pet — ${state.message || state.mode}`);
}

function buildTray() {
  const icon = nativeImage.createFromBuffer(makeIconPNG(32, loadSettings().character || 'blob'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  refreshTrayMenu();
  tray.on('click', () => toggleWindow());
}

function refreshTrayMenu() {
  const s = loadSettings();
  const connected = hookState.installed > 0;
  const menu = Menu.buildFromTemplate([
    { label: activePort ? T('trayPort', { port: activePort }) : T('trayNoPort'), enabled: false },
    { label: connected ? T('hookOn') : T('hookOff'), enabled: false },
    { type: 'separator' },
    { label: connected ? T('disconnect') : T('connect'), click: () => toggleHooks(connected) },
    {
      label: T('openAtLogin'),
      type: 'checkbox',
      checked: openAtLogin(),
      click: (item) => setOpenAtLogin(item.checked),
    },
    { type: 'separator' },
    { label: T('showHide'), click: () => toggleWindow() },
    {
      label: T('alwaysOnTop'),
      type: 'checkbox',
      checked: s.alwaysOnTop !== false,
      click: (item) => {
        if (win) win.setAlwaysOnTop(item.checked, process.platform === 'darwin' ? 'floating' : 'screen-saver');
        saveSettings({ alwaysOnTop: item.checked });
      },
    },
    {
      label: T('clickThrough'),
      type: 'checkbox',
      checked: !!s.clickThrough,
      click: (item) => setClickThrough(item.checked),
    },
    {
      label: T('character'),
      submenu: Object.keys(CHARACTERS).map((key) => ({
        label: T(key),
        type: 'radio',
        checked: (s.character || 'blob') === key,
        click: () => setCharacter(key),
      })),
    },
    {
      label: T('language'),
      submenu: [['en', 'English'], ['ko', '한국어']].map(([code, label]) => ({
        label,
        type: 'radio',
        checked: currentLang() === code,
        click: () => setLanguage(code),
      })),
    },
    {
      label: T('size'),
      submenu: SCALES.map(([key, v]) => ({
        label: T(key),
        type: 'radio',
        checked: (s.scale || 1) === v,
        click: () => setScale(v),
      })),
    },
    { label: T('resetPosition'), click: () => { const p = defaultPosition(); if (win) win.setPosition(p.x, p.y); saveSettings({ position: p }); } },
    { type: 'separator' },
    { label: T('demo'), click: () => runDemo() },
    { label: T('copyHookCmd'), click: () => copyHookCommand() },
    { label: T('help'), click: () => shell.openExternal(README_URL) },
    { type: 'separator' },
    { label: T('quit'), click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function toggleWindow() {
  if (!win || win.isDestroyed()) return createWindow();
  if (win.isVisible()) win.hide();
  else win.show();
}

/** 설치된 훅 개수를 다시 읽어 트레이 메뉴 문구를 맞춘다 */
function refreshHookState() {
  try {
    hookState = hooks.status();
  } catch {
    hookState = { installed: 0, total: 0 };
  }
}

/**
 * 트레이에서 바로 Claude Code 훅을 설치/제거한다.
 * 일반 사용자가 터미널을 열지 않아도 되도록 하는 것이 이 앱 설치의 핵심이라,
 * 결과는 성공이든 실패든 대화상자로 분명히 알려 준다.
 */
function toggleHooks(remove) {
  const r = hooks.apply({ remove });
  refreshHookState();
  refreshTrayMenu();

  if (!r.ok) {
    dialog.showMessageBox({
      type: 'error',
      title: T('connectFailTitle'),
      message: T('connectFailTitle'),
      detail: `${r.error}\n\n${T('settingsFile', { file: r.file })}`,
      buttons: ['OK'],
    });
    return;
  }

  const lines = [T(remove ? 'connectOffBody' : 'connectOkBody')];
  if (!remove && r.runtime === 'electron') lines.push(T('hookedVia'));
  lines.push(T('settingsFile', { file: r.file }));

  dialog.showMessageBox({
    type: 'info',
    title: T(remove ? 'connectOffTitle' : 'connectOkTitle'),
    message: T(remove ? 'connectOffTitle' : 'connectOkTitle'),
    detail: lines.join('\n\n'),
    buttons: ['OK'],
  });
}

function openAtLogin() {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

function setOpenAtLogin(on) {
  try {
    app.setLoginItemSettings({ openAtLogin: !!on, args: [] });
  } catch { /* 일부 리눅스 환경에서는 지원하지 않는다 */ }
  refreshTrayMenu();
}

/** 개발자용 탈출구: 앱 밖에서 직접 돌릴 수 있는 설치 명령을 클립보드에 넣는다 */
function copyHookCommand() {
  clipboard.writeText(`node "${hooks.hookPath().replace(/hook\.js$/, 'install-hooks.js')}"`);
}

/**
 * 첫 실행이고 훅이 없으면 한 번만 연결을 권한다.
 * 설치 직후 "펫은 떴는데 아무 반응이 없다" 로 끝나지 않게 하는 안내다.
 */
function offerFirstRunConnect() {
  if (loadSettings().welcomed || hookState.installed > 0) return;
  saveSettings({ welcomed: true });

  // showMessageBoxSync 는 메인 프로세스를 통째로 멈춰서 펫과 이벤트 서버까지 함께 멎는다.
  dialog.showMessageBox({
    type: 'question',
    title: 'Claude Pet',
    message: T('firstRunTitle'),
    detail: T('firstRunBody'),
    buttons: [T('connect'), T('later')],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) toggleHooks(false);
  });
}

/** 상태 전환을 순서대로 재생해 동작을 눈으로 확인한다 */
function runDemo() {
  clearTimeout(demoTimer);
  const steps = [
    { delay: 0, evt: { event: 'prompt', prompt: '로그인 버그 고쳐줘', session_id: 'demo' } },
    { delay: 1600, evt: { event: 'tool_end', tool: 'Read', session_id: 'demo', todos: demoTodos(0) } },
    { delay: 3000, evt: { event: 'tool_end', tool: 'Grep', session_id: 'demo', todos: demoTodos(1) } },
    { delay: 4600, evt: { event: 'tool_end', tool: 'Edit', session_id: 'demo', todos: demoTodos(2) } },
    { delay: 6200, evt: { event: 'tool_end', tool: 'Bash', session_id: 'demo', todos: demoTodos(3) } },
    { delay: 7800, evt: { event: 'stop', session_id: 'demo', message: '로그인 세션 만료 버그 수정 완료 — 테스트 12개 통과' } },
  ];
  steps.forEach(({ delay, evt }) => {
    demoTimer = setTimeout(() => store.handle(evt), delay);
  });
}

function demoTodos(n) {
  const items = ['인증 코드 읽기', '만료 로직 찾기', '토큰 갱신 수정', '테스트 실행'];
  return items.map((content, i) => ({
    content,
    activeForm: content.replace(/기$|하기$/, '는 중') || content,
    status: i < n ? 'completed' : i === n ? 'in_progress' : 'pending',
  }));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

  app.whenReady().then(async () => {
    if (process.platform === 'darwin' && app.dock) app.dock.hide();

    store = createStore(push, currentLang);
    const res = await startServer({
      port: DEFAULT_PORT,
      onEvent: (evt) => store.handle(evt),
      getState: () => store.get(),
    });
    activePort = res.port;
    if (activePort) {
      // 훅 스크립트가 포트를 찾을 수 있도록 홈 디렉터리에 기록한다
      try {
        const dir = path.join(require('os').homedir(), '.claude-pet');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'port'), String(activePort));
      } catch { /* 포트 파일은 편의 기능일 뿐이다 */ }
    }

    refreshHookState();
    createWindow();
    buildTray();

    if (process.argv.includes('--demo')) setTimeout(runDemo, 1200);
    else setTimeout(offerFirstRunConnect, 1500);
  });

  app.on('window-all-closed', (e) => { e.preventDefault(); });
  app.on('activate', () => { if (!win) createWindow(); });
}

ipcMain.handle('pet:get', () => (store ? store.get() : null));
ipcMain.handle('pet:hide', () => { if (win) win.hide(); });
ipcMain.handle('pet:menu', () => { if (tray) tray.popUpContextMenu(); });
