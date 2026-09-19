#!/usr/bin/env node
/*
 * 앱/설치 파일 아이콘(build/icon.png, 1024x1024)을 스프라이트에서 만들어 둔다.
 * electron-builder 가 이걸 받아 win 의 .ico 와 mac 의 .icns 로 변환한다.
 *
 *   node scripts/make-icon.js [character]
 *
 * src/icon.js 의 makeIconPNG 는 트레이용이라 얼굴 비율(15x10)로 잘려 나온다.
 * 앱 아이콘은 정사각이어야 하므로 여기서 배경을 깔고 가운데에 앉힌다.
 */
const fs = require('fs');
const path = require('path');

const S = require('../src/sprites');
const { encodePNG } = require('../src/icon');

const SIZE = 1024;
const RADIUS = Math.round(SIZE * 0.22);      // macOS 스타일 둥근 사각
const BG = [0x1f, 0x1b, 0x19];               // 펫 외곽선과 같은 계열의 진한 갈색
const CHARACTER = process.argv[2] || 'blob';

// 머리 전체 + 안테나. 트레이 아이콘(얼굴만)보다 넓게 잡아야 실루엣이 살아난다.
const X0 = 2, X1 = 18, Y0 = 0, Y1 = 12;

const hexToRGB = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** (x, y) 가 둥근 사각 안쪽인지 */
function inRoundedRect(x, y) {
  const r = RADIUS;
  const cx = x < r ? r : x > SIZE - 1 - r ? SIZE - 1 - r : x;
  const cy = y < r ? r : y > SIZE - 1 - r ? SIZE - 1 - r : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function main() {
  const src = S.get(CHARACTER).BODY;
  const cols = X1 - X0 + 1;                  // 15
  const rows = Y1 - Y0 + 1;                  // 10
  const buf = Buffer.alloc(SIZE * SIZE * 4, 0);

  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const o = (y * SIZE + x) * 4;
    buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
  };

  // 배경
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (inRoundedRect(x, y)) put(x, y, BG[0], BG[1], BG[2]);
    }
  }

  // 여백 안에 가로·세로 모두 들어가는 최대 도트 크기로 앉힌다
  const pad = Math.round(SIZE * 0.12);
  const cell = Math.floor(Math.min((SIZE - pad * 2) / cols, (SIZE - pad * 2) / rows));
  const drawW = cols * cell;
  const drawH = rows * cell;
  const offX = Math.round((SIZE - drawW) / 2);
  const offY = Math.round((SIZE - drawH) / 2);

  for (let ry = 0; ry < rows; ry++) {
    const line = src[Y0 + ry];
    for (let rx = 0; rx < cols; rx++) {
      const color = S.PALETTE[line[X0 + rx]];
      if (!color) continue;
      const [r, g, b] = hexToRGB(color);
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          put(offX + rx * cell + dx, offY + ry * cell + dy, r, g, b);
        }
      }
    }
  }

  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePNG(SIZE, SIZE, buf));
  console.log(`✓ ${out} (${SIZE}x${SIZE}, ${CHARACTER})`);
}

main();
