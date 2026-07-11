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
