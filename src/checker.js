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
