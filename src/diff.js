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
