/*
 * 스프라이트와 문자열은 한 칸·한 키만 어긋나도 티가 잘 안 나고,
 * 캐릭터를 새로 그려 넣을 때 조용히 깨지기 좋은 자리다.
 * README 에 손으로 돌리라고 적어 둔 검사들을 여기로 옮겨 CI 에서 돌린다.
 */
const test = require('node:test');
const assert = require('node:assert');

const S = require('../src/sprites');
const I = require('../src/i18n');

const BODY_KEYS = ['BODY', 'BLINK', 'UP', 'HAPPY'];
const characters = Object.entries(S.CHARACTERS);

test('모든 캐릭터의 몸통이 같은 격자 크기다', () => {
  assert.ok(characters.length > 0);
  for (const [name, c] of characters) {
    for (const key of BODY_KEYS) {
      const rows = c[key];
      assert.ok(Array.isArray(rows), `${name}.${key} 가 없다`);
      rows.forEach((row, i) => {
        assert.strictEqual(row.length, S.GRID_W, `${name}.${key} ${i}행 폭이 ${row.length} (기대 ${S.GRID_W})`);
      });
      assert.strictEqual(rows.length, c.BODY.length, `${name}.${key} 행 수가 BODY 와 다르다`);
    }
  }
});

test('팔레트에 없는 문자를 쓰지 않는다', () => {
  // 모르는 문자는 오류 없이 그냥 안 그려져서 눈으로는 잡기 어렵다
  const known = new Set(Object.keys(S.PALETTE));
  for (const [name, c] of characters) {
    for (const key of [...BODY_KEYS, 'PAW']) {
      c[key].forEach((row, y) => {
        [...row].forEach((ch, x) => {
          assert.ok(known.has(ch), `${name}.${key} (${y},${x}) 의 '${ch}' 가 팔레트에 없다`);
        });
      });
    }
  }
});

test('상태등은 캐릭터마다 같은 자리에 있다', () => {
  // 렌더러가 이 칸에 발광을 그린다. 옮기면 불빛이 엉뚱한 데서 난다.
  for (const [name, c] of characters) {
    assert.strictEqual(c.BODY[0][10], 'A', `${name} 의 상태등이 (0,10) 에 없다`);
  }
});

test('눈 변형은 BODY 에서 눈 줄만 바꾼 것이다', () => {
  // BLINK/UP/HAPPY 는 BODY.slice() 로 만들기 때문에 몸 전체가 달라지면 실수다
  for (const [name, c] of characters) {
    for (const key of ['BLINK', 'UP', 'HAPPY']) {
      const changed = c.BODY.filter((row, i) => row !== c[key][i]).length;
      assert.ok(changed > 0, `${name}.${key} 가 BODY 와 완전히 같다`);
      assert.ok(changed <= 4, `${name}.${key} 가 ${changed}줄이나 다르다 — 눈 줄만 바꾸는 게 맞나?`);
    }
  }
});

test('get() 은 모르는 캐릭터를 받아도 기본값으로 버틴다', () => {
  assert.ok(S.get('blob').BODY);
  assert.ok(S.get('없는캐릭터').BODY, '설정이 낡아 있어도 앱이 뜨긴 해야 한다');
  assert.ok(S.get(undefined).BODY);
});

test('언어별 문자열 키가 서로 어긋나지 않는다', () => {
  const langs = Object.keys(I.STRINGS);
  assert.ok(langs.length >= 2);

  const base = Object.keys(I.STRINGS.en).sort();
  for (const lang of langs) {
    assert.deepStrictEqual(Object.keys(I.STRINGS[lang]).sort(), base, `${lang} 의 키가 en 과 다르다`);
  }
});

test('번역문에 빈 값이 없다', () => {
  for (const [lang, strings] of Object.entries(I.STRINGS)) {
    for (const [key, value] of Object.entries(strings)) {
      assert.strictEqual(typeof value, 'string', `${lang}.${key} 가 문자열이 아니다`);
      assert.ok(value.trim().length > 0, `${lang}.${key} 가 비어 있다`);
    }
  }
});

test('치환 자리표시자가 언어마다 같다', () => {
  // '{done}/{total}' 같은 자리표시자를 번역하면서 빠뜨리면 숫자가 안 나온다
  const holders = (s) => (s.match(/\{(\w+)\}/g) || []).sort();
  for (const key of Object.keys(I.STRINGS.en)) {
    const expected = holders(I.STRINGS.en[key]);
    for (const lang of Object.keys(I.STRINGS)) {
      assert.deepStrictEqual(holders(I.STRINGS[lang][key]), expected, `${lang}.${key} 의 자리표시자가 en 과 다르다`);
    }
  }
});

test('t() 는 값을 채워 넣고, 모르는 언어는 영어로 떨어진다', () => {
  assert.strictEqual(I.t('en', 'tasksDone', { done: 2, total: 4 }), '2/4 done');
  assert.strictEqual(I.t('ko', 'tasksDone', { done: 2, total: 4 }), '2/4 완료');
  assert.strictEqual(I.t('fr', 'done'), I.STRINGS.en.done, '지원하지 않는 언어는 영어');
  assert.strictEqual(I.t('en', '없는키'), '없는키', '없는 키는 키를 그대로 돌려준다');
});

test('OS 로케일에서 언어를 고른다', () => {
  assert.strictEqual(I.fromLocale('ko-KR'), 'ko');
  assert.strictEqual(I.fromLocale('en-US'), 'en');
  assert.strictEqual(I.fromLocale('ja-JP'), 'en', '모르는 로케일은 영어');
  assert.strictEqual(I.fromLocale(undefined), 'en');
});
