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
