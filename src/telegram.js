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
