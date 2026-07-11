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
