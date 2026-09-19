<div align="center">

# Claude Pet 🐾

**Claude Code 의 작업 상태를 따라 움직이는 데스크톱 펫.**

머리 위에 도트로 진행률을, 도구가 도는 동안엔 노트북을 두들기고,
답변이 끝나면 결과를 적은 판을 머리 위로 들어 빛낸다.

<img src="docs/demo.gif" alt="Claude Pet 데모 — 생각하고, 타이핑하고, 결과를 들어올린다" width="320">

Windows · macOS · [English](README.md)

</div>

---

## 무엇을 보여주나

| | |
|---|---|
| <img src="docs/state-coding.png" width="200"> | **스피너가 아니라 진짜 진행률.** 도트는 `TodoWrite` 목록에서 계산한다 — 완료/전체, 진행 중 항목은 절반으로 셈해서 바가 멈춰 보이지 않게. todo 가 없으면 도구 호출 수로 추정한다. 펫 아래 라벨은 지금 돌고 있는 도구다. |
| <img src="docs/state-done.png" width="240"> | **결과를 들어올리고 빛난다.** `Stop` 때 트랜스크립트에서 Claude 의 마지막 응답 첫 줄을 읽어 머리 위 판에 띄운다. |
| <img src="docs/state-waiting.png" width="220"> | **부를 때는 노란색.** 권한 요청이나 `Notification` 이 오면 대기 상태가 되어, 자리에서 떨어져 있어도 눈에 띈다. |

펫 아래에는 **컨텍스트 사용량**(`CTX 19% · 193k`)과 **요금제 한도**(`5H 34% · 주 5%`). 65% 아래는 민트, 85% 까지 노랑, 그 위는 빨강.

## 상태

| 모드 | 언제 | 모습 |
|---|---|---|
| `idle` | 대기 | 느린 호흡, 상태등 희미 |
| `thinking` | 프롬프트 입력 직후 | 위를 올려다봄, 상태등 빠르게 맥동 |
| `coding` | 도구 실행 중 | 노트북 타이핑, 도트 + 도구 이름 |
| `waiting` | 권한·입력 대기 (`Notification`) | 노란 `?` 판을 듦 |
| `done` | 응답 완료 (`Stop`) | 웃는 얼굴, 100%, 민트색 발광 판 |
| `error` | 수동 이벤트 | 빨간 발광 판 |

## 캐릭터

<div align="center">
<img src="docs/char-blob.png" width="140"> <img src="docs/char-cat.png" width="140"> <img src="docs/char-penguin.png" width="140">
</div>

트레이 메뉴 → **캐릭터**. 크기(×0.75~×1.6)와 언어(English / 한국어)도 같은 메뉴에 있고, 언어는 기본적으로 OS 로케일을 따른다. 설정은 모두 저장된다.

## 설치

**[⬇ 최신 릴리스 내려받기](https://github.com/vkdldjsk2-lang/claude-pet/releases/latest)** — Node 도 터미널도 필요 없다.

| | |
|---|---|
| **Windows** | `ClaudePet-Setup-x.y.z.exe` (설치형) 또는 `ClaudePet-x.y.z-portable.exe` (설치 없이 실행) |
| **macOS** | `ClaudePet-x.y.z-mac-arm64.dmg` (애플 실리콘) 또는 `-x64.dmg` (인텔) |

그다음: **실행 → 펫이 뜸 → 물어보면 *Claude Code 에 연결* 누르기.** 설정은 이게 전부다.

> 코드 서명을 하지 않아서 첫 실행 때 운영체제가 한 번 경고한다.
> **Windows:** SmartScreen → *추가 정보* → *실행*.
> **macOS:** 앱을 우클릭 → *열기* → *열기*. "손상되었다" 고 하면 `xattr -cr "/Applications/Claude Pet.app"` 를 한 번 실행한다.

<details>
<summary>소스에서 직접 실행하기</summary>

```bash
git clone https://github.com/vkdldjsk2-lang/claude-pet.git
cd claude-pet
npm install
npm start
```

연결하기 전에 움직이는 걸 먼저 보고 싶다면:

```bash
npm run demo
```

> **Windows:** `Electron failed to install correctly` 가 뜨면 바이너리 압축 해제가 중간에 끊긴 것이다. `node_modules/electron/dist` 를 지우고 `node node_modules/electron/install.js` 를 다시 실행하면 된다.

</details>

앱은 트레이(Windows 알림 영역 / macOS 메뉴바)에 상주한다. 아이콘을 누르면 보이기/숨기기, 우클릭하면 항상 위·클릭 통과·캐릭터·크기·언어·로그인 시 자동 실행·종료가 나온다. 펫을 드래그해 원하는 자리에 두면 위치가 저장된다.

## Claude Code 와 연결

펫은 `127.0.0.1:4577` 에서 기다리고, Claude Code 가 훅을 통해 상태를 밀어준다.

**트레이 메뉴 → *Claude Code 에 연결*.** 첫 실행 때 앱이 먼저 물어보고, 지금 연결돼 있는지는 트레이에 표시된다(`● Claude Code 따라가는 중`). *Claude Code 연결 해제* 로 되돌린다. 소스로 받았다면 `npm run install-hooks` 도 된다(`npm run uninstall-hooks`, `npm run hook-status`).

어느 쪽이든 `~/.claude/settings.json` 에 훅 7개가 추가된다. 기존 파일은 `settings.json.claude-pet.bak` 로 백업되고, 다른 훅은 건드리지 않는다.

| Claude Code 훅 | 펫 이벤트 |
|---|---|
| `SessionStart` | `session_start` |
| `UserPromptSubmit` | `prompt` |
| `PreToolUse` | `tool_start` |
| `PostToolUse` | `tool_end` — `TodoWrite` 의 todos 를 읽어 진행률 계산 |
| `Notification` | `notification` |
| `Stop` | `stop` — 트랜스크립트에서 마지막 응답을 읽어 판에 표시 |
| `SessionEnd` | `session_end` |

현재 프로젝트에만: `node scripts/install-hooks.js --project`. 제거: `npm run uninstall-hooks`.

Claude Code 를 새로 실행하면 적용된다. 펫이 꺼져 있으면 훅은 조용히 통과하므로 Claude Code 동작을 막지 않는다.

### 컨텍스트 사용량

모든 훅 이벤트에 같이 실려 온다. 트랜스크립트 마지막 어시스턴트 메시지의 `usage`(`input + cache_read + cache_creation`)가 곧 지금 컨텍스트를 채우고 있는 양이다. 기본 한도는 200k — `CLAUDE_PET_CONTEXT_MAX` 로 바꾸거나, 아래처럼 실제 값을 밀어넣으면 된다. 파싱 확인은 `node scripts/hook.js --selftest`.

### 요금제 한도 (5시간 / 주간)

**이 값은 Claude Code 세션 안에서만 읽을 수 있다.** 훅 페이로드에도, 트랜스크립트에도, `~/.claude/sessions` 나 `session-env` 에도 없다 — 거기서 보이는 `rateLimits` 문자열은 429 에러 메시지일 뿐이고, `claude` CLI 에도 해당 서브커맨드가 없다. 폴링할 방법이 없어서 push 로만 받는다.

```bash
node scripts/plan.js 34 5 "2h 41m" 1000000   # 5시간% 주간% 리셋까지 컨텍스트윈도우
```

데스크톱 앱의 usage 카드(또는 세션 안에서 `get_usage`)에 뜨는 값을 그대로 넣으면 된다. 컨텍스트 윈도우도 같이 밀어넣으면 이후 훅 이벤트가 덮어쓰지 않는다.

이 숫자는 묵기 때문에 옆에 나이(`12분 전`)를 붙이고 30분이 넘으면 노란색으로 바꾼다. 최신처럼 보이는 틀린 값보다 눈에 띄게 오래된 값이 낫다.

누적 토큰·비용은 전체 트랜스크립트 스캔이 필요해서 뺐다.

## 아무 데서나 상태 밀어넣기

CI, 빌드 스크립트, 오래 도는 작업에서 쓸 수 있다.

```bash
node scripts/say.js coding 42 "테스트 실행 중"
node scripts/say.js done 100 "배포 완료"
```

```bash
curl -X POST http://127.0.0.1:4577/event -H "Content-Type: application/json" \
  -d '{"event":"set","mode":"done","percent":100,"message":"배포 완료"}'
```

`GET /health` 로 현재 상태를 확인할 수 있다. 포트는 `CLAUDE_PET_PORT` 로 바꾸고, 실제 사용 포트는 `~/.claude-pet/port` 에 기록된다(4577 이 쓰이고 있으면 다음 포트를 잡는다).

## 캐릭터 직접 그리기

스프라이트는 전부 [`src/sprites.js`](src/sprites.js) 안의 문자열이다. 문자 1개 = 도트 1개, `PALETTE` 가 문자 → 색을 정한다. `CHARACTERS` 에 한 벌 추가하면 끝이다 — 노트북·앞발·애니메이션·발광·타이핑은 모두 공유한다.

```js
const CHARACTERS = {
  blob:    { BODY, BLINK, UP, HAPPY, PAW },
  cat:     { ... },
  penguin: { ... },
};
```

- `BODY` 는 21 x 13
- `BLINK`(눈 감음) / `UP`(위 봄) / `HAPPY`(완료) 는 `BODY.slice()` 후 눈 행만 교체
- 0행 10열의 `A` 는 상태등이다. 렌더러가 이 칸에 발광을 얹으므로 옮기지 말 것
- `PAW` 는 든 자세에서 어두운 배경 위에 올라가므로 너무 어둡게 칠하지 말 것

Electron 없이 브라우저에서 확인하려면:

```bash
node dev/serve.js
```

`http://localhost:5188` 에 모든 상태·캐릭터·크기 버튼이 있다.

행 폭과 미등록 색 문자 검사 — 한 칸만 어긋나도 얼굴 전체가 밀리는데 눈으로는 잘 안 보인다:

```bash
node -e "const S=require('./src/sprites');for(const[n,c]of Object.entries(S.CHARACTERS))for(const k of['BODY','BLINK','UP','HAPPY'])c[k].forEach((r,i)=>{if(r.length!==S.GRID_W)throw Error(n+'.'+k+' '+i)});console.log('ok')"
```

## 번역 추가

[`src/i18n.js`](src/i18n.js) 에 모든 문자열이 `{ en: {...}, ko: {...} }` 로 들어 있다. 여기에 언어를 추가하고 `src/main.js` 의 트레이 서브메뉴에 넣으면 끝이다. 언어끼리 키가 일치해야 한다:

```bash
node -e "const I=require('./src/i18n'),a=require('assert');a.deepStrictEqual(Object.keys(I.STRINGS.en).sort(),Object.keys(I.STRINGS.ko).sort());console.log('ok')"
```

## 배포용 빌드

```bash
npm run dist:win   # NSIS 설치본 + 포터블 exe
npm run dist:mac   # dmg + zip (arm64 + x64)
```

둘 다 빌드 전에 스프라이트에서 `build/icon.png` 를 다시 만든다(`npm run make-icon` — 캐릭터 이름을 넘기면 다른 얼굴로 뽑힌다).

릴리스는 CI 가 만든다. `v*` 태그를 밀면 [`.github/workflows/release.yml`](.github/workflows/release.yml) 이 Windows·macOS 러너에서 빌드해 GitHub 릴리스에 올린다.

```bash
npm version patch && git push --follow-tags
```

인증서가 없어서 코드 서명은 하지 않는다. 그래서 첫 실행 때 SmartScreen·Gatekeeper 경고가 한 번 뜬다. 인증서를 넣는다면 워크플로에서 `CSC_IDENTITY_AUTO_DISCOVERY: false` 를 빼고 `CSC_LINK` / `CSC_KEY_PASSWORD` 시크릿을 설정하면 된다.

## 구조

```
src/main.js              Electron 메인 - 창, 트레이, 설정, 데모
src/server.js            127.0.0.1 이벤트 수신 서버
src/state.js             훅 이벤트 -> 펫 상태 (진행률 계산이 여기 있다)
src/sprites.js           캐릭터별 픽셀 스프라이트 + 팔레트 + 레이아웃
src/i18n.js              UI 문자열 전부
src/icon.js              의존성 없는 PNG 인코더 (트레이 아이콘 런타임 생성)
src/preload.js           contextBridge (window.claudePet)
src/renderer/            캔버스 렌더링, 도트 진행률, 발광 판, 게이지
scripts/hook.js          Claude Code 훅 -> 펫 브리지
scripts/install-hooks.js 훅 설치 / 제거 (CLI + 트레이 메뉴가 호출)
scripts/make-icon.js     스프라이트에서 build/icon.png 생성 (설치 파일 아이콘)
scripts/say.js           상태 수동 주입
scripts/plan.js          요금제 한도 사용량 주입
dev/preview.html         브라우저 미리보기
dev/shots.js             README 이미지 재생성 (Electron + ffmpeg)
.github/workflows/       태그 -> Windows + macOS 빌드 -> GitHub 릴리스
```

## 라이선스

MIT
