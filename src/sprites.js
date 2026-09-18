/*
 * 픽셀 스프라이트 정의.
 * 문자 1개 = 도트 1개. PALETTE 의 키와 매칭된다.
 * 메인 프로세스(트레이 아이콘 생성)와 렌더러(캔버스) 양쪽에서 쓰인다.
 *
 * 캐릭터를 추가하려면 CHARACTERS 에 21 x 13 짜리 BODY 한 벌을 더 넣으면 된다.
 * 노트북·앞발 위치(LAYOUT)와 그리드는 공유하므로 애니메이션 코드는 손댈 필요가 없다.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPRITES = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const PALETTE = {
    '.': null,                 // 투명
    O: '#2b1c17',              // 외곽선
    B: '#d97757',              // 블롭 몸통 (Claude clay)
    b: '#b45c3f',              // 블롭 몸통 그림자
    W: '#ffffff',              // 눈 하이라이트
    E: '#2b1c17',              // 눈동자
    A: '#ffd66b',              // 안테나 / 상태등
    K: '#23232e',              // 펭귄 검은 깃
    w: '#f4f1e8',             // 펭귄 배·얼굴
    Y: '#f0a13c',              // 펭귄 부리
    C: '#c9884e',              // 고양이 털
    N: '#e0707f',              // 고양이 코
    L: '#3a3a44',              // 노트북 외곽
    l: '#575766',              // 노트북 면
    S: '#8fe3d0',              // 노트북 로고 (발광)
  };

  // ── 블롭 (기본) ────────────────────────────────────────────
  const BLOB = [
    '..........A..........',
    '..........O..........',
    '......OOOOOOOOO......',
    '....OOBBBBBBBBBOO....',
    '...OBBBBBBBBBBBBBO...',
    '...OBBBWEBBBWEBBBO...',
    '...OBBBEEBBBEEBBBO...',
    '...OBBBBBBBBBBBBBO...',
    '...OBBBBOBBBOBBBBO...',
    '...OBBBBBOOOBBBBBO...',
    '...OBBBBBBBBBBBBBO...',
    '....OOBBBBBBBBBOO....',
    '..OOBBBBBBBBBBBBBOO..',
  ];
  const blobBlink = BLOB.slice();
  blobBlink[5] = '...OBBBBBBBBBBBBBO...';
  blobBlink[6] = '...OBBBOOBBBOOBBBO...';
  const blobUp = BLOB.slice();
  blobUp[5] = '...OBBBEEBBBEEBBBO...';
  blobUp[6] = '...OBBBWEBBBWEBBBO...';
  const blobHappy = BLOB.slice();
  blobHappy[5] = '...OBBBOBBBBBOBBBO...';   // ^ ^ 꼭짓점
  blobHappy[6] = '...OBBOBOBBBOBOBBO...';   // ^ ^ 양쪽 획
  blobHappy[8] = '...OBBBBOOOOOBBBBO...';
  blobHappy[9] = '...OBBBBBOOOBBBBBO...';

  // ── 펭귄 ───────────────────────────────────────────────────
  // 안테나 대신 머리 위에 상태등이 떠 있다 (발광 위치는 블롭과 같은 칸).
  const PENGUIN = [
    '..........A..........',
    '.....................',
    '......OOOOOOOOO......',
    '....OOKKKKKKKKKOO....',
    '...OKKKKKKKKKKKKKO...',
    '...OKKwwwwwwwwwKKO...',
    '...OKKwEwwwwwEwKKO...',
    '...OKKwwwYYYwwwKKO...',
    '...OKKwwwwYwwwwKKO...',
    '...OKKwwwwwwwwwKKO...',
    '...OKKKKKKKKKKKKKO...',
    '....OOKKwwwwwKKOO....',
    '..OOKKKwwwwwwwKKKOO..',
  ];
  const pgBlink = PENGUIN.slice();
  pgBlink[6] = '...OKKwwwwwwwwwKKO...';
  pgBlink[7] = '...OKKwOwYYYwOwKKO...';
  const pgUp = PENGUIN.slice();
  pgUp[5] = '...OKKwEwwwwwEwKKO...';
  pgUp[6] = '...OKKwwwwwwwwwKKO...';
  const pgHappy = PENGUIN.slice();
  pgHappy[5] = '...OKKwOwwwwwOwKKO...';
  pgHappy[6] = '...OKKOwOwwwOwOKKO...';

  // ── 고양이 ─────────────────────────────────────────────────
  // 귀 끝은 외곽선만 남겨 어둡게 처리했다.
  const CAT = [
    '..........A..........',
    '.....................',
    '....OO.........OO....',
    '...OCCO.......OCCO...',
    '...OCCCOOOOOOOCCCO...',
    '...OCCCCCCCCCCCCCO...',
    '...OCCCCCCCCCCCCCO...',
    '...OCCCWECCCWECCCO...',
    '...OCCCEECCCEECCCO...',
    '...OCCCCwwNwwCCCCO...',
    '...OCCCCwOwOwCCCCO...',
    '....OOCCCCCCCCCOO....',
    '..OOCCCCwwwwwCCCCOO..',
  ];
  const catBlink = CAT.slice();
  catBlink[7] = '...OCCCCCCCCCCCCCO...';
  catBlink[8] = '...OCCCOOCCCOOCCCO...';
  const catUp = CAT.slice();
  catUp[7] = '...OCCCEECCCEECCCO...';
  catUp[8] = '...OCCCWECCCWECCCO...';
  const catHappy = CAT.slice();
  catHappy[7] = '...OCCCOCCCCCOCCCO...';
  catHappy[8] = '...OCCOCOCCCOCOCCO...';
  catHappy[10] = '...OCCCCwOOOwCCCCO...';

  const CHARACTERS = {
    blob: {
      label: '블롭',
      BODY: BLOB, BLINK: blobBlink, UP: blobUp, HAPPY: blobHappy,
      PAW: ['.OO.', 'OBBO', 'ObbO', '.OO.'],
    },
    cat: {
      label: '고양이',
      BODY: CAT, BLINK: catBlink, UP: catUp, HAPPY: catHappy,
      PAW: ['.OO.', 'OCCO', 'OwwO', '.OO.'],
    },
    penguin: {
      label: '펭귄',
      BODY: PENGUIN, BLINK: pgBlink, UP: pgUp, HAPPY: pgHappy,
      // 든 자세에서도 보이도록 날개 윗면은 흰 배 색을 쓴다
      PAW: ['.OO.', 'OwwO', 'OKKO', '.OO.'],
    },
  };

  // 노트북 (뚜껑 뒷면 + 힌지 + 바닥) 21 x 6
  const LAPTOP = [
    '.OOOOOOOOOOOOOOOOOOO.',
    '.OllllllllSllllllllO.',
    '.OlllllllSSSlllllllO.',
    '.OllllllllSllllllllO.',
    '.OOOOOOOOOOOOOOOOOOO.',
    'OOOOOOOOOOOOOOOOOOOOO',
  ];

  const GRID_W = 21;
  const GRID_H = 23; // 위 여유 4행 + 몸통(y=4~16) + 노트북(y=17~22)

  const LAYOUT = {
    bodyY: 4,
    laptopY: 17,
    // 상태별 앞발 위치 [x, y] (그리드 좌표)
    paws: {
      rest: [[3, 14], [14, 14]],   // 노트북 위에 얹은 상태
      type: [[3, 13], [14, 13]],   // 타이핑 시 위로 튀는 프레임
      hold: [[0, 4], [17, 4]],     // 머리 옆으로 번쩍 든 상태 (메시지 판을 받쳐 든다)
    },
  };

  const get = (name) => CHARACTERS[name] || CHARACTERS.blob;

  return { PALETTE, CHARACTERS, get, LAPTOP, GRID_W, GRID_H, LAYOUT };
});
