'use strict';
// JSON persistence in data/ with defaults created on first run.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');

const GAME_MODES = ['arena', 'balls', 'halay', 'music', 'boss', 'monster'];
const ARENA_SUB_MODES = ['frontline', 'lanes', 'tug'];

const DEFAULT_SETTINGS = {
  username: '',
  signApiKey: '',
  autoReconnect: true,
  ttsEnabled: true,
  ttsVoiceLang: 'en-US',
  allowKeypress: false,
  castleHp: 1000,
  roundSeconds: 300,
  gameMode: 'arena',
  arenaSubMode: 'frontline',
};

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(name, fallback) {
  ensureDir();
  const file = path.join(DATA_DIR, name);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    writeJson(name, fallback);
    return JSON.parse(JSON.stringify(fallback));
  }
}

function writeJson(name, value) {
  ensureDir();
  const file = path.join(DATA_DIR, name);
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error('[store] write failed:', name, e.message);
  }
}

function loadSettings() {
  const saved = readJson('settings.json', DEFAULT_SETTINGS);
  const s = sanitizeSettings(saved, DEFAULT_SETTINGS);
  // Apply env fallbacks in memory only (do not persist env secrets back to disk)
  if (!s.signApiKey && process.env.SIGN_API_KEY) {
    s.signApiKey = String(process.env.SIGN_API_KEY).trim();
  }
  if (!s.username && process.env.TIKTOK_USERNAME) {
    s.username = String(process.env.TIKTOK_USERNAME).trim();
  }
  return s;
}

function saveSettings(settings) {
  const toSave = Object.assign({}, settings);
  if (process.env.SIGN_API_KEY && toSave.signApiKey === String(process.env.SIGN_API_KEY).trim()) {
    toSave.signApiKey = '';
  }
  if (process.env.TIKTOK_USERNAME && toSave.username === String(process.env.TIKTOK_USERNAME).trim()) {
    toSave.username = '';
  }
  writeJson('settings.json', toSave);
}

function sanitizeSettings(input, current) {
  const s = Object.assign({}, current);
  const src = input && typeof input === 'object' ? input : {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in src)) continue;
    const def = DEFAULT_SETTINGS[key];
    let v = src[key];
    if (key === 'gameMode') {
      v = GAME_MODES.includes(v) ? v : s.gameMode || def;
    } else if (key === 'arenaSubMode') {
      v = ARENA_SUB_MODES.includes(v) ? v : s.arenaSubMode || def;
    } else if (typeof def === 'boolean') {
      v = !!v;
    } else if (typeof def === 'number') {
      v = Number(v);
      if (!isFinite(v) || v <= 0) v = def;
    } else {
      v = String(v == null ? '' : v).trim();
    }
    s[key] = v;
  }
  return s;
}

module.exports = {
  DATA_DIR,
  GAME_MODES,
  ARENA_SUB_MODES,
  DEFAULT_SETTINGS,
  readJson,
  writeJson,
  loadSettings,
  saveSettings,
  sanitizeSettings,
};
