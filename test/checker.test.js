const test = require('node:test');
const assert = require('node:assert/strict');
const fetcher = require('../src/fetcher');
const { checkMovie } = require('../src/checker');

test('checkMovie trả về episode đúng cho phim nguồn hhkungfu', async (t) => {
  t.mock.method(fetcher, 'fetchHtml', async () => '<span class="new-ep">Tập 148/180 [4K]</span>');
  const result = await checkMovie({ name: 'Tiên Nghịch', url: 'https://hhkungfu.ee/tien-nghich', source: 'hhkungfu' });
  assert.deepEqual(result, { name: 'Tiên Nghịch', url: 'https://hhkungfu.ee/tien-nghich', episode: 148 });
});

test('checkMovie trả về episode đúng cho phim nguồn hoathinh3d', async (t) => {
  t.mock.method(fetcher, 'fetchHtml', async () => '<title>Tiêu Nhân Next Tập 22 [Việt Sub] | HH3D</title>');
  const result = await checkMovie({ name: 'Tiêu Nhân', url: 'https://hoathinh3d.st/tieu-nhan', source: 'hoathinh3d' });
  assert.deepEqual(result, { name: 'Tiêu Nhân', url: 'https://hoathinh3d.st/tieu-nhan', episode: 22 });
});

test('checkMovie trả về episode null khi fetch lỗi, không throw', async (t) => {
  t.mock.method(fetcher, 'fetchHtml', async () => { throw new Error('network fail'); });
  const result = await checkMovie({ name: 'X', url: 'https://x.example', source: 'hhkungfu' });
  assert.deepEqual(result, { name: 'X', url: 'https://x.example', episode: null });
});
