# my-favorite-movies-checker — Design

Date: 2026-07-11

## Purpose

Chuyển logic của Claude cloud routine "Kiểm tra tập mới phim yêu thích (HH3D)" (trig_01GcRZory2ZWAykweUup2m7E) thành một ứng dụng Node.js tự chủ, chạy định kỳ trên server riêng (thay vì cloud agent), tự phát hiện tập phim mới của 9 bộ phim hoạt hình 3D và báo qua Telegram khi có tập mới.

## Scope

- Trong phạm vi: viết app Node.js, đóng gói gọn, deploy qua git lên server GCP (35.211.51.185), chạy định kỳ bằng **crontab** của Linux, lập lịch 30 phút/lần.
- Ngoài phạm vi: không giữ lại phần "cloud routine" gốc trên claude.ai (không xoá, nhưng không còn là nguồn chạy chính); không xây dashboard/UI theo dõi.

## Target server

- Host: `35.211.51.185`, user: `lethethao95`, SSH key: `ssh/instance-20260710-170332` (đã test kết nối thành công).
- OS: Debian GNU/Linux 13 (trixie), timezone `Etc/UTC`.
- Chưa có Node.js — cần cài qua `nvm` (không cần sudo). Không cần pm2 — lịch chạy do `crontab` của hệ thống đảm nhiệm, mỗi lần chạy là một tiến trình Node ngắn (chạy xong tự thoát).
- Thư mục deploy trên server: `~/apps/my-favorite-movies-checker`.

## Danh sách phim theo dõi (9 phim)

| # | Tên phim | Nguồn | URL |
|---|----------|-------|-----|
| 1 | Tiên Nghịch | hhkungfu.ee | https://hhkungfu.ee/tien-nghich |
| 2 | Thôn Phệ Tinh Không | hhkungfu.ee | https://hhkungfu.ee/thon-phe-tinh-khong |
| 3 | Già Thiên | hhkungfu.ee | https://hhkungfu.ee/gia-thien |
| 4 | Tiêu Nhân | hoathinh3d.st | https://hoathinh3d.st/tieu-nhan |
| 5 | Thế Giới Hoàn Mỹ | hhkungfu.ee | https://hhkungfu.ee/the-gioi-hoan-my |
| 6 | Đấu La Đại Lục 2 | hhkungfu.ee | https://hhkungfu.ee/dau-la-dai-luc-2-tuyet-the-duong-mon |
| 7 | Trạch Thiên Ký | hhkungfu.ee | https://hhkungfu.ee/trach-thien-ky |
| 8 | Phàm Nhân Tu Tiên | hhkungfu.ee | https://hhkungfu.ee/pham-nhan-tu-tien |
| 9 | Đấu Phá Thương Khung | hhkungfu.ee | https://hhkungfu.ee/dau-pha-thuong-khung-phan-5 |

## Architecture

```
my-favorite-movies-checker/
├── .git/
├── .gitignore            # node_modules, .env, state.json, ssh/
├── package.json          # name: my-favorite-movies-checker
├── .env.example
├── src/
│   ├── index.js          # entrypoint: dotenv, chạy 1 lượt kiểm tra rồi thoát
│   ├── movies.js         # danh sách 9 phim + loại parser (hhkungfu | hoathinh3d)
│   ├── checker.js        # fetch + parse + so sánh + tổng hợp kết quả
│   ├── telegram.js       # gửi tin nhắn qua Telegram Bot API
│   └── state.js          # đọc/ghi state.json
└── ssh/                  # key hiện có, KHÔNG commit
```

Mỗi module có một trách nhiệm rõ ràng, không phụ thuộc chéo ngoài import trực tiếp:
- `movies.js`: dữ liệu tĩnh, không có logic.
- `checker.js`: nhận danh sách phim + state cũ, trả về `{results, hasNewEpisode, newState}`. Không tự đọc/ghi file, không tự gửi Telegram — nhận state qua tham số, trả state mới ra ngoài để `index.js` quyết định ghi file & gửi tin.
- `state.js`: chỉ đọc/ghi JSON, không biết gì về Telegram hay HTTP.
- `telegram.js`: chỉ gửi text tới 1 chat_id, không biết gì về logic phim.
- `index.js`: điều phối — đọc state, gọi checker, ghi state, gửi Telegram nếu cần, rồi thoát. Không tự lặp lại — lịch lặp do `crontab` của server đảm nhiệm (mỗi lần cron kích hoạt là một tiến trình Node độc lập, chạy xong thì thoát).

## Parsing logic (đã verify bằng curl thực tế trên cả 9 trang)

### hhkungfu.ee (8 phim)
- Fetch HTML bằng `axios` với header `User-Agent` giả Chrome desktop.
- Dùng `cheerio` lấy **phần tử `.new-ep` đầu tiên** trong DOM (phần tử thứ 2 trở đi là số lượt xem, không phải số tập).
- Regex `Tập\s+(\d+)` trên text đó để lấy số tập hiện tại.
- Đã test thực tế cả 8 URL, tất cả trả HTTP 200 và match đúng định dạng (VD: "Tập 148/180 [4K]" → 148; "Tập 182 [4K]" → 182 khi phim đã hoàn thành không còn mẫu số).

### hoathinh3d.st (Tiêu Nhân)
- Trước đây bị chặn 403 khi Claude WebFetch trực tiếp (không có header phù hợp). Đã test lại bằng curl với `User-Agent` Chrome + `Referer: https://www.google.com/` → nhận HTTP 200 bình thường, **không cần dùng Google Search API**.
- Lấy số tập từ thẻ `<title>`, regex `Next Tập\s+(\d+)` (VD title thực tế: "Tiêu Nhân Next Tập 22 [Việt Sub] | HH3D" → 22).

### Error handling
- Nếu fetch lỗi (network, timeout, status != 200) hoặc regex không match: log cảnh báo kèm tên phim + lỗi cụ thể, đánh dấu phim đó "không xác định" trong kết quả, **giữ nguyên số tập cũ trong state**, và tiếp tục xử lý các phim còn lại — một phim lỗi không được làm dừng cả lượt chạy.
- Tất cả request phim chạy song song (`Promise.allSettled`), không tuần tự, để một request chậm/treo không kéo dài toàn bộ job (mỗi request có timeout riêng, ví dụ 15s).

## State & Telegram

- `state.json` (tại thư mục gốc app trên server, không commit git): `{ "Tên phim": số_tập, ... }`.
- Luôn ghi đè `state.json` sau mỗi lần chạy (dù có tập mới hay không), trừ các phim "không xác định" thì giữ số cũ.
- `.env` (không commit, tạo tay trên server) chứa `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. `.env.example` commit làm template.
- Chỉ gọi Telegram `sendMessage` khi có ≥1 phim có số tập mới > số tập cũ. Nội dung: dòng đầu "🎬 CÓ TẬP MỚI:", sau đó mỗi phim một dòng "Tên phim: cũ→mới — link trang phim". Nếu gọi Telegram API lỗi, log rõ lỗi (không throw làm crash tiến trình).

## Lịch chạy & vận hành

- Lập lịch bằng **crontab** của Linux trên server, biểu thức `*/30 * * * *`. Server đã ở timezone `Etc/UTC` nên không cần chuyển đổi.
- Mỗi lần cron kích hoạt chạy `node src/index.js` — một tiến trình ngắn, chạy xong tự thoát (exit code 0 khi thành công). Không dùng pm2, không dùng node-cron, không có tiến trình nền thường trực.
- crontab không kế thừa PATH đầy đủ của shell đăng nhập, nên dòng crontab phải dùng đường dẫn tuyệt đối tới binary `node` (từ nvm, ví dụ `~/.nvm/versions/node/<version>/bin/node`) và set `cwd` bằng `cd <thư mục app> &&` trước khi chạy.
- Output (stdout/stderr) của mỗi lần chạy được redirect vào file log (`logs/cron.log`, append) vì crontab không giữ lại output ở đâu khác — dùng để debug khi cần.
- Chế độ test thủ công: `node src/index.js` chạy một lượt rồi thoát — dùng lệnh y hệt lúc dev/test cục bộ và lúc cron gọi, không có mode/flag riêng.

## Deploy flow (git)

1. Local: `git init` (đã làm), commit theo từng giai đoạn nhỏ khi code xong từng phần (scaffold → movies.js → state.js → telegram.js → checker.js → index.js → docs).
2. Server: tạo repo tại `~/apps/my-favorite-movies-checker` bằng `git init` + `git config receive.denyCurrentBranch updateInstead`, để `git push` cập nhật thẳng working directory, không cần pull tay.
3. Local: thêm remote `prod` trỏ tới `ssh://lethethao95@35.211.51.185/home/lethethao95/apps/my-favorite-movies-checker`, `git push prod master`.
4. Server (qua SSH, chạy tay lần đầu): cài `nvm` + Node LTS, `npm install --production`, tạo `.env` thật, chạy thử `node src/index.js` một lần để xác nhận, rồi thêm dòng vào crontab (`crontab -e` hoặc `(crontab -l; echo "...") | crontab -`) trỏ tới đường dẫn Node tuyệt đối.
5. Các lần cập nhật sau: `git push prod master` rồi SSH vào chạy `npm install --production` — không cần đụng vào crontab trừ khi lịch chạy thay đổi.

## Testing

- Test parser cục bộ (không cần deploy): chạy `node src/index.js` trên máy local trước, xác nhận lấy đúng số tập cho cả 9 phim và không crash khi 1 nguồn lỗi giả lập.
- Sau khi deploy: chạy `node src/index.js` thủ công trên server để xác nhận state.json được tạo đúng, rồi mới thêm dòng crontab.
- Test gửi Telegram: tạm sửa state.json giảm 1 số tập của 1 phim để giả lập "có tập mới", chạy `node src/index.js`, xác nhận nhận được tin nhắn Telegram, rồi khôi phục state.json.
- Sau khi bật crontab: đợi 1 chu kỳ (tối đa 30 phút) rồi kiểm tra `logs/cron.log` và `state.json` đã được cập nhật đúng giờ.

## Out of scope / not doing

- Không dùng Puppeteer/headless browser (không cần thiết vì header giả browser đã đủ).
- Không dùng Google Custom Search API (không cần thiết, fetch trực tiếp hoathinh3d.st đã hoạt động).
- Không xây cơ chế retry phức tạp — lỗi thì bỏ qua phim đó, chờ lượt chạy kế tiếp (30 phút sau) tự thử lại.
- Không dùng pm2/node-cron — đã thay bằng crontab của hệ thống theo yêu cầu.
