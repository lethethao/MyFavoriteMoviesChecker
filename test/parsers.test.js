// test/parsers.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHhkungfuEpisode, parseHoathinh3dEpisode } = require('../src/parsers');

test('parseHhkungfuEpisode lấy đúng số tập từ .new-ep đầu tiên (có mẫu số)', () => {
  const html = '<div class="hh3d-info"><span class="new-ep">Tập 148/180 [4K]</span></div><div class="hh3d-info"><span class="new-ep">2M</span></div>';
  assert.equal(parseHhkungfuEpisode(html), 148);
});

test('parseHhkungfuEpisode lấy đúng số tập khi không có mẫu số (phim đã hoàn thành)', () => {
  const html = '<span class="new-ep">Tập 182 [4K]</span>';
  assert.equal(parseHhkungfuEpisode(html), 182);
});

test('parseHhkungfuEpisode trả về null khi không có phần tử .new-ep', () => {
  const html = '<div>không có gì liên quan</div>';
  assert.equal(parseHhkungfuEpisode(html), null);
});

test('parseHoathinh3dEpisode lấy đúng số tập từ title', () => {
  const html = '<html><head><title>Tiêu Nhân Next Tập 22 [Việt Sub] | HH3D</title></head><body></body></html>';
  assert.equal(parseHoathinh3dEpisode(html), 22);
});

test('parseHoathinh3dEpisode trả về null khi title không khớp mẫu', () => {
  const html = '<html><head><title>Trang không tìm thấy | HH3D</title></head></html>';
  assert.equal(parseHoathinh3dEpisode(html), null);
});
