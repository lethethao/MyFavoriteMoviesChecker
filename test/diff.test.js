// test/diff.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeUpdates } = require('../src/diff');

test('phát hiện phim có tập mới khi episode > số cũ', () => {
  const oldState = { 'Tiên Nghịch': 147, 'Già Thiên': 170 };
  const results = [
    { name: 'Tiên Nghịch', url: 'https://hhkungfu.ee/tien-nghich', episode: 148 },
    { name: 'Già Thiên', url: 'https://hhkungfu.ee/gia-thien', episode: 170 },
  ];
  const { newState, newEpisodes } = computeUpdates(oldState, results);
  assert.deepEqual(newState, { 'Tiên Nghịch': 148, 'Già Thiên': 170 });
  assert.deepEqual(newEpisodes, [
    { name: 'Tiên Nghịch', oldEp: 147, newEp: 148, url: 'https://hhkungfu.ee/tien-nghich' },
  ]);
});

test('phim mới xuất hiện lần đầu (chưa có trong state cũ) được coi là oldEp = 0', () => {
  const { newState, newEpisodes } = computeUpdates({}, [
    { name: 'Tiêu Nhân', url: 'https://hoathinh3d.st/tieu-nhan', episode: 22 },
  ]);
  assert.deepEqual(newState, { 'Tiêu Nhân': 22 });
  assert.deepEqual(newEpisodes, [{ name: 'Tiêu Nhân', oldEp: 0, newEp: 22, url: 'https://hoathinh3d.st/tieu-nhan' }]);
});

test('episode null (không xác định) giữ nguyên state cũ và không báo có tập mới', () => {
  const oldState = { 'Tiên Nghịch': 148 };
  const { newState, newEpisodes } = computeUpdates(oldState, [
    { name: 'Tiên Nghịch', url: 'https://hhkungfu.ee/tien-nghich', episode: null },
  ]);
  assert.deepEqual(newState, { 'Tiên Nghịch': 148 });
  assert.deepEqual(newEpisodes, []);
});
