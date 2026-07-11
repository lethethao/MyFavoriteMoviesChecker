// test/state.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadState, saveState } = require('../src/state');

test('loadState trả về {} khi file chưa tồn tại', async () => {
  const filePath = path.join(os.tmpdir(), `state-test-missing-${Date.now()}.json`);
  const state = await loadState(filePath);
  assert.deepEqual(state, {});
});

test('saveState rồi loadState trả về đúng dữ liệu đã ghi', async () => {
  const filePath = path.join(os.tmpdir(), `state-test-roundtrip-${Date.now()}.json`);
  await saveState(filePath, { 'Tiên Nghịch': 148, 'Già Thiên': 170 });
  const state = await loadState(filePath);
  assert.deepEqual(state, { 'Tiên Nghịch': 148, 'Già Thiên': 170 });
  await fs.unlink(filePath);
});
