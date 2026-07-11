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
