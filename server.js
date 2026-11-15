'use strict';
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const store = require('./src/store');
const { GIFTS } = require('./src/gifts');
const Leaderboard = require('./src/leaderboard');
const { RulesEngine, DEFAULT_RULES, sanitizeRules } = require('./src/rules');
const { Simulator, fromTestPayload } = require('./src/simulator');
const { TikTokManager } = require('./src/tiktok');
const keypress = require('./src/keypress');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_FEED = 100;

let settings = store.loadSettings();
let rules = (() => {
  const saved = store.readJson('rules.json', DEFAULT_RULES);
  const clean = sanitizeRules(saved);
  return clean && clean.length ? clean : DEFAULT_RULES;
})();

const leaderboard = new Leaderboard();
const rulesEngine = new RulesEngine(() => rules);
const feedHistory = [];

const status = {
  mode: 'idle',
  username: settings.username || '',
  roomId: '',
  viewerCount: 0,
  error: '',
  simRunning: false,
};

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile('dashboard.html', { root: PUBLIC_DIR });
});

app.use(express.static(PUBLIC_DIR));

app.get('/api/state', (req, res) => {
  res.json({
    status: getStatus(),
    leaderboard: leaderboard.top(20),
    settings,
  });
});

app.get('/api/gifts', (req, res) => {
  res.json(GIFTS);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

function getStatus() {
  return Object.assign({}, status, {
    simRunning: simulator.running,
  });
}

function broadcastStatus(patch) {
  if (patch) Object.assign(status, patch);
  if (!simulator.running && status.mode === 'sim') {
    status.mode = 'idle';
  } else if (simulator.running && status.mode === 'idle') {
    status.mode = 'sim';
  }
  status.simRunning = simulator.running;
  io.emit('status', getStatus());
}

function handleEvent(ev) {
  if (!ev || !ev.type) return;

  feedHistory.push(ev);
  if (feedHistory.length > MAX_FEED) feedHistory.shift();

  io.emit('tiktok:event', ev);

  if (leaderboard.add(ev)) {
    io.emit('leaderboard', leaderboard.top(20));
  }

  const produced = rulesEngine.process(ev);
  for (const item of produced) {
    if (item.action.type === 'keypress') {
      if (settings.allowKeypress) {
        keypress.send(item.action.keys, item.action.holdMs);
      }
      continue;
    }
    io.emit('action', {
      id: crypto.randomBytes(6).toString('hex'),
      ruleId: item.ruleId,
      event: ev,
      action: item.action,
    });
  }
}

const simulator = new Simulator(handleEvent);
const tiktok = new TikTokManager({
  onEvent: handleEvent,
  onStatus: (patch) => broadcastStatus(patch),
  getSettings: () => settings,
});

io.on('connection', (socket) => {
  socket.emit('status', getStatus());
  socket.emit('rules', rules);
  socket.emit('settings', settings);
  socket.emit('game:mode', { gameMode: settings.gameMode, arenaSubMode: settings.arenaSubMode });
  socket.emit('leaderboard', leaderboard.top(20));
  socket.emit('feed:history', feedHistory);

  socket.on('control:connect', (payload = {}) => {
    const username = String((payload && payload.username) || settings.username || '').trim();
    if (username && username !== settings.username) {
      settings = store.sanitizeSettings({ username }, settings);
      store.saveSettings(settings);
      io.emit('settings', settings);
    }
    if (simulator.running) {
      simulator.stop();
    }
    tiktok.connect(username);
  });

  socket.on('control:disconnect', () => {
    tiktok.disconnect();
  });

  socket.on('sim:start', (payload = {}) => {
    const rate = payload && payload.rate ? payload.rate : 'mid';
    simulator.start(rate);
    const mode = status.mode === 'live' || status.mode === 'connecting' ? status.mode : 'sim';
    broadcastStatus({ mode, simRunning: true, error: '' });
  });

  socket.on('sim:stop', () => {
    simulator.stop();
    const mode = status.mode === 'sim' ? 'idle' : status.mode;
    broadcastStatus({ mode, simRunning: false });
  });

  socket.on('test:event', (payload = {}) => {
    const ev = fromTestPayload(payload);
    handleEvent(ev);
  });

  socket.on('rules:save', (newRules) => {
    const clean = sanitizeRules(newRules);
    if (!clean) return;
    rules = clean;
    store.writeJson('rules.json', rules);
    io.emit('rules', rules);
  });

  socket.on('settings:save', (newSettings) => {
    settings = store.sanitizeSettings(newSettings, settings);
    store.saveSettings(settings);
    io.emit('settings', settings);
  });

  socket.on('game:mode', (payload = {}) => {
    const patch = {};
    if (payload && typeof payload.gameMode === 'string' && store.GAME_MODES.includes(payload.gameMode)) {
      patch.gameMode = payload.gameMode;
    }
    if (payload && typeof payload.arenaSubMode === 'string' && store.ARENA_SUB_MODES.includes(payload.arenaSubMode)) {
      patch.arenaSubMode = payload.arenaSubMode;
    }
    if (!Object.keys(patch).length) return;
    settings = store.sanitizeSettings(patch, settings);
    store.saveSettings(settings);
    io.emit('game:mode', { gameMode: settings.gameMode, arenaSubMode: settings.arenaSubMode });
    io.emit('settings', settings);
  });

  socket.on('game:reset', (payload = {}) => {
    if (payload && payload.clearLeaderboard) {
      leaderboard.clear();
      io.emit('leaderboard', leaderboard.top(20));
    }
    io.emit('game:reset', payload || {});
  });

  socket.on('game:result', (payload = {}) => {
    console.log('[game:result]', JSON.stringify(payload));
    io.emit('game:result', payload || {});
  });
});

function shutdown() {
  simulator.stop();
  tiktok.disconnect();
  leaderboard.flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`TikTok Live Arena running at http://localhost:${PORT}`);
});
