// test/movies.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { MOVIES } = require('../src/movies');

test('MOVIES có đúng 9 phim, mỗi phim có name/url/source hợp lệ', () => {
  assert.equal(MOVIES.length, 9);
  for (const m of MOVIES) {
    assert.equal(typeof m.name, 'string');
    assert.ok(m.name.length > 0);
    assert.match(m.url, /^https:\/\//);
    assert.ok(['hhkungfu', 'hoathinh3d'].includes(m.source));
  }
});

test('Tiêu Nhân dùng nguồn hoathinh3d, các phim còn lại dùng hhkungfu', () => {
  const tieuNhan = MOVIES.find((m) => m.name === 'Tiêu Nhân');
  assert.ok(tieuNhan);
  assert.equal(tieuNhan.source, 'hoathinh3d');
  const others = MOVIES.filter((m) => m.name !== 'Tiêu Nhân');
  assert.equal(others.length, 8);
  assert.ok(others.every((m) => m.source === 'hhkungfu'));
});
