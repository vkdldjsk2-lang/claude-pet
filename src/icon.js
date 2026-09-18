/*
 * 의존성 없이 트레이/앱 아이콘 PNG 를 런타임에 생성한다.
 * (Electron 메인 프로세스에는 canvas 가 없으므로 최소 PNG 인코더를 직접 둔다)
 */
const zlib = require('zlib');
const S = require('./sprites');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgba: Buffer(width*height*4) → PNG Buffer */
function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRGB(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * 펫 얼굴만 잘라 정사각 아이콘으로 만든다.
 * @param {number} size 한 변 픽셀 수 (스프라이트 셀 배수로 반올림됨)
 * @param {string} character CHARACTERS 의 키
 */
function makeIconPNG(size = 32, character = 'blob') {
  // 얼굴 영역: 몸통 스프라이트의 2~11행, 3~17열
  const src = S.get(character).BODY;
  const x0 = 3, x1 = 17, y0 = 2, y1 = 11;
  const cols = x1 - x0 + 1;   // 15
  const rows = y1 - y0 + 1;   // 10
  const cell = Math.max(1, Math.floor(size / Math.max(cols, rows)));
  const W = cols * cell;
  const H = rows * cell;
  const buf = Buffer.alloc(W * H * 4, 0);

  for (let ry = 0; ry < rows; ry++) {
    const line = src[y0 + ry];
    for (let rx = 0; rx < cols; rx++) {
      const color = S.PALETTE[line[x0 + rx]];
      if (!color) continue;
      const [r, g, b] = hexToRGB(color);
      for (let dy = 0; dy < cell; dy++) {
        const py = ry * cell + dy;
        for (let dx = 0; dx < cell; dx++) {
          const o = (py * W + rx * cell + dx) * 4;
          buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
        }
      }
    }
  }
  return encodePNG(W, H, buf);
}

module.exports = { encodePNG, makeIconPNG };
