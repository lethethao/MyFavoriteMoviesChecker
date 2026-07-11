const test = require('node:test');
const assert = require('node:assert/strict');
const fetcher = require('../src/fetcher');
const { checkMovie, checkAllMovies } = require('../src/checker');

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

test('checkAllMovies trả về kết quả cho 9 phim với isolation lỗi từng phim', async (t) => {
  // Mock fetcher để fail cho Tiêu Nhân nhưng thành công cho phim khác
  t.mock.method(fetcher, 'fetchHtml', async (url) => {
    if (url === 'https://hoathinh3d.st/tieu-nhan') {
      throw new Error('network error');
    }
    // Trả về valid HTML cho phim hhkungfu
    return '<span class="new-ep">Tập 12/180 [4K]</span>';
  });

  const result = await checkAllMovies();

  // Assert result là array có độ dài 9
  assert.strictEqual(Array.isArray(result), true);
  assert.strictEqual(result.length, 9);

  // Verify phim Tiêu Nhân (fetch failed) có episode: null
  const tieuNhanResult = result.find(r => r.name === 'Tiêu Nhân');
  assert.strictEqual(tieuNhanResult.episode, null);
  assert.strictEqual(tieuNhanResult.url, 'https://hoathinh3d.st/tieu-nhan');

  // Verify ít nhất một phim khác (fetch succeeded) có episode không null
  const successfulResults = result.filter(r => r.episode !== null);
  assert.strictEqual(successfulResults.length > 0, true);
  assert.strictEqual(successfulResults[0].episode, 12); // Match mock return value
});
