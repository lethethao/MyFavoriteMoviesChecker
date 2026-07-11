# my-favorite-movies-checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted Node.js app that checks 9 favorite 3D-animation shows for new episodes every 30 minutes and sends a Telegram alert only when a new episode is found, then deploy it via git to a remote GCP server and run it via the server's crontab.

**Architecture:** Small CommonJS modules with single responsibilities (movie list, HTML fetch, HTML parse, state persistence, diffing, Telegram send) composed by one orchestrator (`src/index.js`) that runs one check-and-notify pass end-to-end and exits — it does not schedule itself; the Linux `crontab` on the server invokes it every 30 minutes. Pure logic (parsing, diffing, message formatting) is unit-tested with Node's built-in `node:test`; network calls (`fetcher.js`, `telegram.js` send) are verified manually against the real sites/server per the spec's testing plan, not mocked at the axios level beyond what's needed for `checker.js` tests.

**Tech Stack:** Node.js (v20+, tested against v24.18.0 locally), `axios`, `cheerio`, `dotenv`, built-in `node:test` + `node:assert/strict` for tests, the server's own `crontab` for scheduling (no process manager), `git` for deploy.

## Global Constraints

- Project/package name: `my-favorite-movies-checker` (package.json `name`, server directory name).
- Schedule: `*/30 * * * *` via the server's **crontab** (not node-cron, not pm2). Server timezone is already `Etc/UTC`, so no explicit timezone handling is needed in code.
- `src/index.js` runs one pass and exits (no persistent process, no in-process scheduler).
- crontab does not inherit a login shell's PATH, so the crontab line must use the absolute path to the nvm-installed `node` binary and `cd` into the app directory first. Each run's stdout/stderr is appended to `logs/cron.log`.
- Target server: host `35.211.51.185`, user `lethethao95`, SSH key `ssh/instance-20260710-170332` (already in repo, already gitignored).
- Server deploy directory: `~/apps/my-favorite-movies-checker`.
- `.env`, `state.json`, `node_modules/`, `ssh/`, `logs/*.log` must never be committed to git (already in `.gitignore`).
- No Puppeteer/headless browser. No Google Custom Search API. Direct HTTP fetch with a browser-like `User-Agent` is sufficient for both `hhkungfu.ee` and `hoathinh3d.st` (verified: both return HTTP 200 with `User-Agent` + `Referer` headers).
- hhkungfu.ee parsing: first `.new-ep` element's text, regex `Tập\s+(\d+)`.
- hoathinh3d.st (Tiêu Nhân) parsing: `<title>` text, regex `Next Tập\s+(\d+)`.
- A single movie failing to fetch/parse must never crash the run or block other movies (`Promise.allSettled`, per-request timeout 15s).
- Telegram is only notified when at least one movie's episode count increased vs. stored state; `state.json` is always overwritten after a run (undetermined movies keep their old count).

---

### Task 1: Project scaffold — package.json, folders, dependencies

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `src/` (empty dir, populated in later tasks)
- Create: `test/` (empty dir, populated in later tasks)

**Interfaces:**
- Produces: npm scripts `start`, `test` that later tasks and the deploy flow rely on by name. `start` runs one check-and-notify pass and exits (the server's crontab is what makes it recurring — there is no separate "once" mode because there is only one mode).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "my-favorite-movies-checker",
  "version": "1.0.0",
  "description": "Theo doi tap moi cua cac phim hoat hinh 3D yeu thich va bao qua Telegram",
  "main": "src/index.js",
  "private": true,
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "cheerio": "^1.0.0",
    "dotenv": "^16.4.5"
  }
}
```

- [ ] **Step 2: Create `.env.example`**

```
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` created, no error output.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: scaffold my-favorite-movies-checker project"
```

---

### Task 2: Movie list config

**Files:**
- Create: `src/movies.js`
- Test: `test/movies.test.js`

**Interfaces:**
- Produces: `MOVIES` — `Array<{ name: string, url: string, source: 'hhkungfu' | 'hoathinh3d' }>`, exactly 9 entries, consumed by `src/checker.js` (Task 8).

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/movies.test.js`
Expected: FAIL with "Cannot find module '../src/movies'"

- [ ] **Step 3: Write `src/movies.js`**

```js
const MOVIES = [
  { name: 'Tiên Nghịch', url: 'https://hhkungfu.ee/tien-nghich', source: 'hhkungfu' },
  { name: 'Thôn Phệ Tinh Không', url: 'https://hhkungfu.ee/thon-phe-tinh-khong', source: 'hhkungfu' },
  { name: 'Già Thiên', url: 'https://hhkungfu.ee/gia-thien', source: 'hhkungfu' },
  { name: 'Tiêu Nhân', url: 'https://hoathinh3d.st/tieu-nhan', source: 'hoathinh3d' },
  { name: 'Thế Giới Hoàn Mỹ', url: 'https://hhkungfu.ee/the-gioi-hoan-my', source: 'hhkungfu' },
  { name: 'Đấu La Đại Lục 2', url: 'https://hhkungfu.ee/dau-la-dai-luc-2-tuyet-the-duong-mon', source: 'hhkungfu' },
  { name: 'Trạch Thiên Ký', url: 'https://hhkungfu.ee/trach-thien-ky', source: 'hhkungfu' },
  { name: 'Phàm Nhân Tu Tiên', url: 'https://hhkungfu.ee/pham-nhan-tu-tien', source: 'hhkungfu' },
  { name: 'Đấu Phá Thương Khung', url: 'https://hhkungfu.ee/dau-pha-thuong-khung-phan-5', source: 'hhkungfu' },
];

module.exports = { MOVIES };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/movies.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/movies.js test/movies.test.js
git commit -m "feat: add tracked movie list"
```

---

### Task 3: HTML parsers (pure logic)

**Files:**
- Create: `src/parsers.js`
- Test: `test/parsers.test.js`

**Interfaces:**
- Produces: `parseHhkungfuEpisode(html: string): number | null`, `parseHoathinh3dEpisode(html: string): number | null`, consumed by `src/checker.js` (Task 8).
- Consumes: `cheerio` (from Task 1's dependencies).

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/parsers.test.js`
Expected: FAIL with "Cannot find module '../src/parsers'"

- [ ] **Step 3: Write `src/parsers.js`**

```js
const cheerio = require('cheerio');

function parseHhkungfuEpisode(html) {
  const $ = cheerio.load(html);
  const text = $('.new-ep').first().text();
  const match = text.match(/Tập\s+(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function parseHoathinh3dEpisode(html) {
  const $ = cheerio.load(html);
  const title = $('title').first().text();
  const match = title.match(/Next Tập\s+(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

module.exports = { parseHhkungfuEpisode, parseHoathinh3dEpisode };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/parsers.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/parsers.js test/parsers.test.js
git commit -m "feat: add episode parsers for hhkungfu.ee and hoathinh3d.st"
```

---

### Task 4: HTML fetcher (network I/O)

**Files:**
- Create: `src/fetcher.js`

**Interfaces:**
- Produces: `fetchHtml(url: string): Promise<string>`, consumed by `src/checker.js` (Task 8) and mocked in `test/checker.test.js` (Task 8).
- Consumes: `axios` (from Task 1's dependencies).

No automated test for this task — it is a thin network wrapper; correctness is verified manually via Task 8's checker tests (which mock this module) and the manual `node src/index.js` run in Task 9/13. This matches the spec's testing plan (parsing verified against real sites, network wrapper kept trivial).

- [ ] **Step 1: Write `src/fetcher.js`**

```js
const axios = require('axios');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchHtml(url) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      Referer: 'https://www.google.com/',
    },
    timeout: 15000,
  });
  return response.data;
}

module.exports = { fetchHtml, USER_AGENT };
```

- [ ] **Step 2: Manual smoke check against a real site**

Run: `node -e "require('./src/fetcher').fetchHtml('https://hhkungfu.ee/tien-nghich').then(html => console.log('OK, length:', html.length)).catch(e => console.error('FAIL:', e.message))"`
Expected: `OK, length: <some number > 1000>` (no `FAIL:` line)

- [ ] **Step 3: Commit**

```bash
git add src/fetcher.js
git commit -m "feat: add HTML fetcher with browser-like headers"
```

---

### Task 5: State persistence

**Files:**
- Create: `src/state.js`
- Test: `test/state.test.js`

**Interfaces:**
- Produces: `loadState(filePath: string): Promise<Record<string, number>>`, `saveState(filePath: string, state: Record<string, number>): Promise<void>`, consumed by `src/index.js` (Task 9).

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/state.test.js`
Expected: FAIL with "Cannot find module '../src/state'"

- [ ] **Step 3: Write `src/state.js`**

```js
const fs = require('fs/promises');

async function loadState(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function saveState(filePath, state) {
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
}

module.exports = { loadState, saveState };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/state.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/state.js test/state.test.js
git commit -m "feat: add JSON state persistence"
```

---

### Task 6: Diff / update computation (pure logic)

**Files:**
- Create: `src/diff.js`
- Test: `test/diff.test.js`

**Interfaces:**
- Consumes: nothing beyond plain objects/arrays.
- Produces: `computeUpdates(oldState: Record<string, number>, results: Array<{ name: string, url: string, episode: number | null }>): { newState: Record<string, number>, newEpisodes: Array<{ name: string, oldEp: number, newEp: number, url: string }> }`, consumed by `src/index.js` (Task 9).

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/diff.test.js`
Expected: FAIL with "Cannot find module '../src/diff'"

- [ ] **Step 3: Write `src/diff.js`**

```js
function computeUpdates(oldState, results) {
  const newState = { ...oldState };
  const newEpisodes = [];

  for (const r of results) {
    if (r.episode == null) continue;
    const oldEp = oldState[r.name] ?? 0;
    if (r.episode > oldEp) {
      newEpisodes.push({ name: r.name, oldEp, newEp: r.episode, url: r.url });
    }
    newState[r.name] = r.episode;
  }

  return { newState, newEpisodes };
}

module.exports = { computeUpdates };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/diff.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/diff.js test/diff.test.js
git commit -m "feat: add state diff computation"
```

---

### Task 7: Telegram messaging

**Files:**
- Create: `src/telegram.js`
- Test: `test/telegram.test.js`

**Interfaces:**
- Produces: `formatMessage(newEpisodes: Array<{ name: string, oldEp: number, newEp: number, url: string }>): string` (unit-tested), `sendTelegramMessage(token: string, chatId: string, text: string): Promise<void>` (network call, not unit-tested — thin `axios.post` wrapper), consumed by `src/index.js` (Task 9).

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/telegram.test.js`
Expected: FAIL with "Cannot find module '../src/telegram'"

- [ ] **Step 3: Write `src/telegram.js`**

```js
const axios = require('axios');

function formatMessage(newEpisodes) {
  const lines = ['🎬 CÓ TẬP MỚI:'];
  for (const ep of newEpisodes) {
    lines.push(`${ep.name}: ${ep.oldEp}→${ep.newEp} — ${ep.url}`);
  }
  return lines.join('\n');
}

async function sendTelegramMessage(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await axios.post(url, { chat_id: chatId, text });
}

module.exports = { formatMessage, sendTelegramMessage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/telegram.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/telegram.js test/telegram.test.js
git commit -m "feat: add Telegram message formatting and sending"
```

---

### Task 8: Checker orchestration (fetch + parse per movie, resilient to failures)

**Files:**
- Create: `src/checker.js`
- Test: `test/checker.test.js`

**Interfaces:**
- Consumes: `fetcher.fetchHtml` (Task 4), `parseHhkungfuEpisode`/`parseHoathinh3dEpisode` (Task 3), `MOVIES` (Task 2).
- Produces: `checkMovie(movie: {name, url, source}): Promise<{name: string, url: string, episode: number | null}>`, `checkAllMovies(): Promise<Array<{name, url, episode}>>`, consumed by `src/index.js` (Task 9).

- [ ] **Step 1: Write the failing test**

```js
// test/checker.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/checker.test.js`
Expected: FAIL with "Cannot find module '../src/checker'"

- [ ] **Step 3: Write `src/checker.js`**

```js
const { MOVIES } = require('./movies');
const fetcher = require('./fetcher');
const { parseHhkungfuEpisode, parseHoathinh3dEpisode } = require('./parsers');

async function checkMovie(movie) {
  try {
    const html = await fetcher.fetchHtml(movie.url);
    const episode = movie.source === 'hhkungfu'
      ? parseHhkungfuEpisode(html)
      : parseHoathinh3dEpisode(html);
    if (episode == null) {
      console.warn(`[checker] Không xác định được số tập cho "${movie.name}" (không match regex)`);
    }
    return { name: movie.name, url: movie.url, episode };
  } catch (err) {
    console.warn(`[checker] Lỗi khi kiểm tra "${movie.name}": ${err.message}`);
    return { name: movie.name, url: movie.url, episode: null };
  }
}

async function checkAllMovies() {
  const settled = await Promise.allSettled(MOVIES.map(checkMovie));
  return settled.map((s, i) => (s.status === 'fulfilled' ? s.value : { name: MOVIES[i].name, url: MOVIES[i].url, episode: null }));
}

module.exports = { checkMovie, checkAllMovies };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/checker.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/checker.js test/checker.test.js
git commit -m "feat: add resilient per-movie checker orchestration"
```

---

### Task 9: Entrypoint — orchestration, single run-and-exit pass

**Files:**
- Create: `src/index.js`

**Interfaces:**
- Consumes: `checkAllMovies` (Task 8), `loadState`/`saveState` (Task 5), `computeUpdates` (Task 6), `formatMessage`/`sendTelegramMessage` (Task 7), env vars `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (via `dotenv`).
- Produces: process entrypoint run via `node src/index.js`; runs exactly one check-and-notify pass then exits (exit code 0 on success). No other module depends on this file's exports. Recurrence is provided entirely by the server's crontab (Task 13), not by this file.

No automated test for this task (it wires already-tested pure logic to real network/filesystem); verified manually in Step 2 below and again after deploy (Task 13).

- [ ] **Step 1: Write `src/index.js`**

```js
require('dotenv').config();
const path = require('path');
const { checkAllMovies } = require('./checker');
const { loadState, saveState } = require('./state');
const { computeUpdates } = require('./diff');
const { formatMessage, sendTelegramMessage } = require('./telegram');

const STATE_PATH = path.join(__dirname, '..', 'state.json');

async function runCheck() {
  console.log(`[index] Bắt đầu kiểm tra lúc ${new Date().toISOString()}`);
  const oldState = await loadState(STATE_PATH);
  const results = await checkAllMovies();
  const { newState, newEpisodes } = computeUpdates(oldState, results);
  await saveState(STATE_PATH, newState);

  for (const r of results) {
    console.log(`  - ${r.name}: ${r.episode ?? 'không xác định'}`);
  }

  if (newEpisodes.length === 0) {
    console.log('[index] Không có phim nào có tập mới');
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[index] Thiếu TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID, bỏ qua gửi Telegram');
    return;
  }

  try {
    await sendTelegramMessage(token, chatId, formatMessage(newEpisodes));
    console.log(`[index] Đã gửi Telegram cho ${newEpisodes.length} phim có tập mới`);
  } catch (err) {
    console.error(`[index] Lỗi gửi Telegram: ${err.message}`);
  }
}

runCheck()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[index] Lỗi không mong muốn: ${err.stack}`);
    process.exit(1);
  });
```

- [ ] **Step 2: Manual run to verify end-to-end behavior**

Run: `node src/index.js`
Expected: log lines for all 9 movies with episode numbers (or "không xác định"), a `state.json` file created at the project root with 9 entries, and either "Không có phim nào có tập mới" or a Telegram send confirmation (first run: no `.env` yet means the Telegram warning is expected — that's fine, `.env` is added in Task 11). Process exits on its own (check with `echo $?` → `0`).

- [ ] **Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: add entrypoint that runs one check-and-notify pass and exits"
```

---

### Task 10: Logs directory and crontab line template

**Files:**
- Create: `logs/.gitkeep`
- Modify: `.gitignore` (add `logs/*.log`)
- Create: `crontab.txt`

**Interfaces:**
- Produces: `logs/` directory (tracked via `.gitkeep`, log files themselves gitignored) and a documented crontab line template, both consumed by the server deploy steps in Task 13.

- [ ] **Step 1: Create `logs/.gitkeep`**

Create an empty file at `logs/.gitkeep` (git does not track empty directories, so this placeholder keeps `logs/` present after clone/push).

- [ ] **Step 2: Add `logs/*.log` to `.gitignore`**

Add this line to the existing `.gitignore` (append, don't remove existing entries):

```
logs/*.log
```

- [ ] **Step 3: Create `crontab.txt`**

```
# Dòng crontab cho my-favorite-movies-checker (chạy mỗi 30 phút, server đã ở UTC).
# Thay <NODE_BIN> bằng đường dẫn tuyệt đối tới node do nvm cài (vd: /home/lethethao95/.nvm/versions/node/v22.x.x/bin/node),
# lấy bằng lệnh `which node` sau khi `nvm use --lts` trên server.
# Thay <APP_DIR> bằng thư mục deploy thực tế, mặc định: /home/lethethao95/apps/my-favorite-movies-checker

*/30 * * * * cd <APP_DIR> && <NODE_BIN> src/index.js >> logs/cron.log 2>&1
```

- [ ] **Step 4: Verify the files**

Run: `cat logs/.gitkeep crontab.txt && grep -n "logs" .gitignore`
Expected: `logs/.gitkeep` prints empty, `crontab.txt` prints the template above, `.gitignore` shows a line containing `logs/*.log`.

- [ ] **Step 5: Commit**

```bash
git add logs/.gitkeep .gitignore crontab.txt
git commit -m "chore: add logs directory and crontab line template"
```

---

### Task 11: Local `.env` for development + full local test suite

**Files:**
- Create: `.env` (local only — already gitignored, never committed)

**Interfaces:**
- Consumes: `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` values from the existing Claude routine's Telegram bot (same bot can be reused, or a new one — user's choice).

- [ ] **Step 1: Create local `.env`**

Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
```

Then edit `.env` with the real `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

- [ ] **Step 2: Run the full automated test suite**

Run: `npm test`
Expected: all tests across `test/movies.test.js`, `test/parsers.test.js`, `test/state.test.js`, `test/diff.test.js`, `test/telegram.test.js`, `test/checker.test.js` pass (17 tests total), 0 failures.

- [ ] **Step 3: Manual run with real Telegram credentials**

Run: `node src/index.js`
Expected: same as Task 9 Step 2, but no more "Thiếu TELEGRAM_BOT_TOKEN" warning (unless there happen to be no new episodes, in which case the Telegram send is correctly skipped — that's still correct behavior, not an error).

- [ ] **Step 4: Simulate a new episode to verify the Telegram path fires**

Manually edit `state.json`, decrement one movie's stored count by 1 (e.g. if `"Tiên Nghịch": 148`, change to `147`), then run:

Run: `node src/index.js`
Expected: log line `[index] Đã gửi Telegram cho 1 phim có tập mới`, and a real Telegram message arrives in the target chat starting with "🎬 CÓ TẬP MỚI:". Verify the count in `state.json` is back to the real current value after this run (the checker re-fetches and overwrites it).

No commit needed for this task (`.env` is gitignored and `state.json` is runtime data, also gitignored).

---

### Task 12: Server preparation — Node.js and git receive setup

**Files:** none in this repo — this task runs commands on the remote server via SSH.

**Interfaces:** none (infrastructure setup only).

- [ ] **Step 1: Install nvm and Node.js LTS on the server (no sudo required)**

Run:
```bash
ssh -i "ssh/instance-20260710-170332" lethethao95@35.211.51.185 \
  'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash'
```
Expected: nvm install script completes without error, prints instructions to source `nvm.sh`.

- [ ] **Step 2: Install Node LTS on the server**

Run:
```bash
ssh -i "ssh/instance-20260710-170332" lethethao95@35.211.51.185 \
  'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; nvm install --lts && node -v && which node'
```
Expected: prints a Node version (v20.x or newer) and the absolute path to the `node` binary (e.g. `/home/lethethao95/.nvm/versions/node/v22.x.x/bin/node`) — record this path, it is needed verbatim for the crontab line in Task 13.

- [ ] **Step 3: Create the deploy directory as a git-receivable working repo**

Run:
```bash
ssh -i "ssh/instance-20260710-170332" lethethao95@35.211.51.185 \
  'mkdir -p ~/apps/my-favorite-movies-checker && cd ~/apps/my-favorite-movies-checker && git init && git config receive.denyCurrentBranch updateInstead'
```
Expected: `Initialized empty Git repository in /home/lethethao95/apps/my-favorite-movies-checker/.git/`, no error from the `git config` line.

No commit needed (server-side infra only).

---

### Task 13: Deploy — git push, install, configure, add crontab entry

**Files:**
- Modify: local git config (add a remote) — not a repo file, but recorded here for completeness.

**Interfaces:** none new — this task deploys everything built in Tasks 1–10.

- [ ] **Step 1: Add the `prod` git remote locally**

Run:
```bash
git remote add prod ssh://lethethao95@35.211.51.185/home/lethethao95/apps/my-favorite-movies-checker
```
Expected: no output, `git remote -v` now lists `prod`.

- [ ] **Step 2: Push to the server**

The work was developed on `feature/nodejs-movie-checker`, not `master` — push that branch's content to the server's `master` (the branch `receive.denyCurrentBranch=updateInstead` applies to in Task 12) using a refspec. The default `ssh://` git transport does not pick up the `-i` key file the way raw `ssh` commands do, so `GIT_SSH_COMMAND` must specify it explicitly:

Run:
```bash
GIT_SSH_COMMAND='ssh -i "ssh/instance-20260710-170332" -o StrictHostKeyChecking=accept-new' git push prod feature/nodejs-movie-checker:master
```
Expected: `* [new branch] feature/nodejs-movie-checker -> master`; on the server, `~/apps/my-favorite-movies-checker` now contains `src/`, `package.json`, `crontab.txt`, `logs/.gitkeep`, `.env.example`, `.gitignore`, `docs/` (working tree updated because of `receive.denyCurrentBranch=updateInstead` from Task 12).

- [ ] **Step 3: Install dependencies on the server**

Run:
```bash
ssh -i "ssh/instance-20260710-170332" lethethao95@35.211.51.185 \
  'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; cd ~/apps/my-favorite-movies-checker && npm install --omit=dev'
```
Expected: `node_modules/` created on the server, no error.

- [ ] **Step 4: Create the real `.env` on the server**

Run:
```bash
ssh -i "ssh/instance-20260710-170332" lethethao95@35.211.51.185 \
  'cat > ~/apps/my-favorite-movies-checker/.env <<EOF
TELEGRAM_BOT_TOKEN=<real token from local .env>
TELEGRAM_CHAT_ID=<real chat id from local .env>
EOF'
```
Expected: no output; `.env` exists on the server with real values (use the exact same values verified working in Task 11).

- [ ] **Step 5: Manual run on the server before enabling the schedule**

Run:
```bash
ssh -i "ssh/instance-20260710-170332" lethethao95@35.211.51.185 \
  'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; cd ~/apps/my-favorite-movies-checker && node src/index.js'
```
Expected: same 9-movie log output as Task 9 Step 2, `state.json` created on the server, process exits (`echo $?` → `0`).

- [ ] **Step 6: Add the crontab entry**

Run (this resolves the absolute node path recorded in Task 12 Step 2, then installs the crontab line without clobbering any existing entries):
```bash
ssh -i "ssh/instance-20260710-170332" lethethao95@35.211.51.185 \
  'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; NODE_BIN=$(which node); APP_DIR=~/apps/my-favorite-movies-checker; (crontab -l 2>/dev/null; echo "*/30 * * * * cd $APP_DIR && $NODE_BIN src/index.js >> logs/cron.log 2>&1") | crontab -; crontab -l'
```
Expected: the final `crontab -l` output includes exactly one line starting with `*/30 * * * *` that references `my-favorite-movies-checker` and ends with `>> logs/cron.log 2>&1`.

- [ ] **Step 7: Verify the crontab entry fires**

Wait up to 30 minutes for the next `:00` or `:30` UTC tick, then run:
```bash
ssh -i "ssh/instance-20260710-170332" lethethao95@35.211.51.185 \
  'cd ~/apps/my-favorite-movies-checker && cat logs/cron.log && cat state.json'
```
Expected: `logs/cron.log` contains a new run's output (starting with `[index] Bắt đầu kiểm tra lúc ...`) with a timestamp after the entry was added in Step 6, and `state.json` is present and valid JSON with 9 entries.

No further commit needed — the deployed state is exactly what was pushed; the local repo remains the source of truth.

---

## After This Plan

- The old Claude cloud routine (`trig_01GcRZory2ZWAykweUup2m7E`) can be disabled once the server-hosted checker has run successfully for a full day, to avoid duplicate Telegram notifications. Disabling it is a manual follow-up via `RemoteTrigger` (`action: update`, `enabled: false`) or https://claude.ai/code/routines — not part of this plan.
- Future code changes: edit locally, run `npm test`, commit, `GIT_SSH_COMMAND='ssh -i "ssh/instance-20260710-170332"' git push prod <your-branch>:master`, then re-run Task 13 Step 3 (skip Steps 1, 4, 6 — dependencies may need reinstalling but `.env` and the crontab entry stay as-is) to redeploy.
