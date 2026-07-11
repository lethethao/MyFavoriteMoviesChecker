// test/telegram.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatMessage } = require('../src/telegram');

test('formatMessage tạo đúng định dạng với 1 phim có tập mới', () => {
  const msg = formatMessage([
    { name: 'Tiên Nghịch', oldEp: 147, newEp: 148, url: 'https://hhkungfu.ee/tien-nghich' },
  ]);
  assert.equal(msg, '🎬 CÓ TẬP MỚI:\nTiên Nghịch: 147→148 — https://hhkungfu.ee/tien-nghich');
});

test('formatMessage liệt kê nhiều phim, mỗi phim một dòng', () => {
  const msg = formatMessage([
    { name: 'Tiên Nghịch', oldEp: 147, newEp: 148, url: 'https://hhkungfu.ee/tien-nghich' },
    { name: 'Tiêu Nhân', oldEp: 21, newEp: 22, url: 'https://hoathinh3d.st/tieu-nhan' },
  ]);
  const lines = msg.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '🎬 CÓ TẬP MỚI:');
  assert.equal(lines[1], 'Tiên Nghịch: 147→148 — https://hhkungfu.ee/tien-nghich');
  assert.equal(lines[2], 'Tiêu Nhân: 21→22 — https://hoathinh3d.st/tieu-nhan');
});
