# Claude Pet 🐾

Claude Code 의 작업 상태를 따라 움직이는 데스크톱 펫. Windows / macOS 공용 Electron 앱.

- **머리 위 도트 진행률** — 10개 도트 + 퍼센트. `TodoWrite` 의 todo 목록에서 실제 진행률을 계산한다 (todo 가 없으면 도구 호출 수로 추정).
- **코딩 중엔 노트북을 두들긴다** — 앞발이 엇갈리며 타이핑, 노트북 로고가 깜빡인다.
- **완료되면 메시지를 머리 위로 들어올린다** — Claude 의 마지막 응답 첫 줄을 판에 띄우고, 판이 민트색으로 맥동하며 빛난다.
- **사용량 표시** — 펫 아래 게이지 두 줄. `CTX 19% · 193k` (컨텍스트) / `5H 34% · 주 5% · 12분 전` (요금제 한도). 65%부터 노랑, 85%부터 빨강.
- **캐릭터 · 크기 선택** — 블롭/고양이/펭귄, ×0.75~×1.6. 트레이 메뉴에서 바꾸고 설정은 저장된다.
- 배경 투명 · 항상 위 · 드래그로 위치 이동 · 트레이 상주.

## 상태

| 모드 | 언제 | 모습 |
|---|---|---|
| `idle` | 대기 | 느린 호흡, 안테나 희미하게 깜빡 |
| `thinking` | 프롬프트 입력 직후 | 위를 올려다봄, 안테나 빠르게 맥동 |
| `coding` | 도구 실행 중 | 노트북 타이핑 + 도트 진행률 + 도구 이름 |
| `waiting` | 권한/입력 대기 (Notification) | 판을 들고 노란색 발광 `?` |
| `done` | 응답 완료 (Stop) | 웃는 얼굴, 100%, 민트색 발광 메시지 판 + 반짝임 |
| `error` | 수동 이벤트 | 빨간색 발광 판 |

## 설치

```bash
git clone https://github.com/vkdldjsk2-lang/claude-pet.git
cd claude-pet
npm install
```

> Windows 에서 `Electron failed to install correctly` 가 뜨면 바이너리 압축 해제가 중간에 끊긴 것이다.
> `node_modules/electron/dist` 를 지우고 `node node_modules/electron/install.js` 를 다시 실행하면 된다.

## 실행

```bash
npm start
```

동작을 먼저 눈으로 보고 싶으면 데모 모드로 실행한다 (프롬프트 → 코딩 → 완료 시퀀스를 자동 재생).

```bash
npm run demo
```

앱은 트레이(Windows 알림 영역 / macOS 메뉴바)에 상주한다. 트레이 아이콘을 누르면 보이기/숨기기, 우클릭 메뉴에서 항상 위·클릭 통과·위치 초기화·종료를 고를 수 있다. 펫 자체를 드래그해 원하는 자리에 두면 위치가 저장된다.

## Claude Code 와 연결

펫은 `127.0.0.1:4577` 에서 이벤트를 기다린다. 훅을 설치하면 Claude Code 가 상태를 밀어준다.

```bash
npm run install-hooks
```

`~/.claude/settings.json` 에 아래 7개 훅이 추가된다 (기존 설정은 `.claude-pet.bak` 로 백업되고, 다른 훅은 건드리지 않는다).

| Claude Code 훅 | 펫 이벤트 |
|---|---|
| `SessionStart` | `session_start` |
| `UserPromptSubmit` | `prompt` |
| `PreToolUse` | `tool_start` |
| `PostToolUse` | `tool_end` (여기서 `TodoWrite` 의 todos 를 읽어 진행률 계산) |
| `Notification` | `notification` |
| `Stop` | `stop` (트랜스크립트에서 마지막 응답을 읽어 메시지 판에 표시) |
| `SessionEnd` | `session_end` |

사용량은 모든 이벤트에 같이 실려 온다. 트랜스크립트 마지막 어시스턴트 메시지의 `usage`(input + cache_read + cache_creation)가 곧 현재 컨텍스트 점유량이다. 한도는 200k 기본, `CLAUDE_PET_CONTEXT_MAX` 로 변경. 훅 파싱이 맞는지는 `node scripts/hook.js --selftest` 로 확인한다.

### 요금제 한도(5시간·주간)

이 값은 **Claude Code 세션 안에서만** 읽을 수 있다. 훅 페이로드·트랜스크립트·`~/.claude/sessions`·`session-env` 어디에도 없고 (`rateLimits` 문자열은 429 에러 메시지일 뿐), `claude` CLI 에도 해당 서브커맨드가 없다. 자동 폴링 경로가 없어서 push 전용이다.

```bash
node scripts/plan.js 34 5 "2h 41m" 1000000   # 5시간% 주간% 리셋까지 컨텍스트윈도우
```

데스크톱 앱의 usage 카드(또는 세션 안에서 `get_usage`)에 뜨는 값을 그대로 넣으면 된다. 컨텍스트 윈도우도 같이 밀어넣으면 이후 훅 이벤트가 덮어쓰지 않는다 — `CLAUDE_PET_CONTEXT_MAX` 를 명시하지 않는 한 훅은 한도를 보내지 않는다. 기본값은 200k.

값이 묵으면 옆에 `12분 전` 이 붙고, 30분이 넘으면 노란색으로 바뀐다. 오래된 숫자를 최신인 줄 알고 보는 일이 없게 하려는 것이다.

누적 토큰·비용은 전체 트랜스크립트 스캔이 필요해 지금은 뺐다.

현재 프로젝트에만 적용하려면 `node scripts/install-hooks.js --project`, 제거는 `npm run uninstall-hooks`.

설치 후 Claude Code 를 새로 실행하면 적용된다. 펫이 꺼져 있어도 훅은 조용히 통과하므로 Claude Code 동작에 영향을 주지 않는다.

## 캐릭터 바꾸기

트레이 우클릭 → **캐릭터** 에서 블롭 / 고양이 / 펭귄. 트레이 아이콘도 같이 바뀌고 설정은 저장된다.

캐릭터를 추가하려면 `src/sprites.js` 의 `CHARACTERS` 에 한 벌 더 넣으면 된다. 노트북·앞발 위치·애니메이션은 전부 공유하므로 그릴 것만 그리면 된다.

```js
const CHARACTERS = {
  blob:    { label: '블롭', BODY, BLINK, UP, HAPPY, PAW },
  cat:     { label: '고양이', ... },
  penguin: { label: '펭귄', ... },
};
```

- `BODY` 21 x 13, 문자 1개 = 도트 1개, 색은 `PALETTE` 가 정한다
- `BLINK`(눈 감음) / `UP`(위 봄) / `HAPPY`(완료) 는 `BODY.slice()` 후 눈 행만 교체하면 된다
- 0행 10열의 `A` 는 상태등이다. 렌더러가 이 칸에 발광을 얹으므로 위치를 옮기지 말 것
- `PAW` 는 든 자세에서 어두운 배경 위에 올라가므로 너무 어둡게 칠하지 말 것

행 폭·미등록 색 문자는 이걸로 확인한다:

```bash
node -e "const S=require('./src/sprites');for(const[n,c]of Object.entries(S.CHARACTERS))for(const k of['BODY','BLINK','UP','HAPPY'])c[k].forEach((r,i)=>{if(r.length!==S.GRID_W)throw Error(n+'.'+k+' '+i)});console.log('ok')"
```

## 크기 조절

트레이 우클릭 → **크기** 에서 작게(×0.75) / 보통 / 크게(×1.3) / 아주 크게(×1.6). 창과 내용이 같이 커지고 아래쪽 가운데를 기준으로 확대되므로 펫 발밑 위치는 그대로다. 설정은 저장된다.

## 직접 상태 밀어넣기

다른 도구(CI, 빌드 스크립트 등)에서도 쓸 수 있다.

```bash
node scripts/say.js coding 42 "테스트 실행 중"
node scripts/say.js done 100 "빌드 성공!"
```

또는 HTTP 로 직접:

```bash
curl -X POST http://127.0.0.1:4577/event -H "Content-Type: application/json" \
  -d '{"event":"set","mode":"done","percent":100,"message":"배포 완료"}'
```

`GET /health` 로 현재 상태를 확인할 수 있다. 포트는 `CLAUDE_PET_PORT` 로 바꿀 수 있고, 실제 사용 포트는 `~/.claude-pet/port` 에 기록된다 (4577 이 사용 중이면 자동으로 다음 포트를 잡는다).

## 모양 고치기

픽셀 아트는 전부 `src/sprites.js` 안의 문자열이다. 문자 1개 = 도트 1개, `PALETTE` 가 문자 → 색을 정한다. 눈·입·노트북·앞발 위치를 그 파일에서 바로 고칠 수 있다.

브라우저에서 바로 확인하려면:

```bash
node dev/serve.js
```

`http://localhost:5188` 에서 상태 버튼으로 모든 모드를 눌러볼 수 있다.

## 배포용 빌드

```bash
npm run dist:win   # NSIS 설치본 + 포터블 exe
npm run dist:mac   # dmg + zip
```

## 구조

```
src/main.js              Electron 메인 — 창/트레이/설정/데모
src/server.js            127.0.0.1 이벤트 수신 서버
src/state.js             훅 이벤트 → 펫 상태 환원 (진행률 계산 포함)
src/sprites.js           픽셀 스프라이트(캐릭터별) + 팔레트 + 레이아웃
src/icon.js              의존성 없는 PNG 인코더 (트레이 아이콘 런타임 생성)
src/preload.js           contextBridge (window.claudePet)
src/renderer/            캔버스 렌더링 + 도트 진행률 + 발광 메시지 판
scripts/hook.js          Claude Code 훅 → 펫 브리지
scripts/install-hooks.js 훅 설치/제거
scripts/say.js           수동 상태 주입 CLI
scripts/plan.js          요금제 한도 사용량 주입 CLI
dev/preview.html         브라우저 미리보기
```
