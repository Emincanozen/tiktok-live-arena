'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = Number(process.env.TEST_PORT) || 3099;
const URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${URL}/api/state`);
      if (res.ok) return;
    } catch (_) { /* retry */ }
    await sleep(150);
  }
  throw new Error('Server did not become ready in time');
}

async function main() {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktok-live-arena-test-'));
  const serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: tempDataDir }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProc.stdout.on('data', () => {});
  serverProc.stderr.on('data', () => {});

  let socket;
  try {
    await waitForServer();
    console.log('[smoke] Server ready on', URL);

    // 1. REST endpoints & HTML pages
    const rootRes = await fetch(`${URL}/`);
    assert.strictEqual(rootRes.status, 200, 'GET / should return 200');
    const overlayRes = await fetch(`${URL}/overlay.html`);
    assert.strictEqual(overlayRes.status, 200, 'GET /overlay.html should return 200');

    const stateRes = await fetch(`${URL}/api/state`);
    assert.strictEqual(stateRes.status, 200);
    const stateJson = await stateRes.json();
    assert.ok(stateJson.status && Array.isArray(stateJson.leaderboard) && stateJson.settings);

    const giftsRes = await fetch(`${URL}/api/gifts`);
    assert.strictEqual(giftsRes.status, 200);
    const giftsJson = await giftsRes.json();
    assert.ok(Array.isArray(giftsJson) && giftsJson.some((g) => g.name === 'Rose'));
    console.log('[smoke] REST /api/state & /api/gifts & HTML OK');

    // 2. Socket connect & initial events
    const initial = { status: null, rules: null, settings: null, mode: null, leaderboard: null, feed: null };
    const events = [];
    const actions = [];
    const lbUpdates = [];
    const statusUpdates = [];
    const modeUpdates = [];
    let resetSeen = false;

    socket = io(URL, { transports: ['websocket'] });
    socket.on('status', (d) => { initial.status = initial.status || d; statusUpdates.push(d); });
    socket.on('rules', (d) => { initial.rules = d; });
    socket.on('settings', (d) => { initial.settings = d; });
    socket.on('game:mode', (d) => { initial.mode = initial.mode || d; modeUpdates.push(d); });
    socket.on('leaderboard', (d) => { initial.leaderboard = initial.leaderboard || d; lbUpdates.push(d); });
    socket.on('feed:history', (d) => { initial.feed = d; });
    socket.on('tiktok:event', (d) => events.push(d));
    socket.on('action', (d) => actions.push(d));
    socket.on('game:reset', () => { resetSeen = true; });

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
      socket.on('connect', () => { clearTimeout(t); resolve(); });
    });
    await sleep(300);

    assert.ok(initial.status && initial.status.mode === 'idle', 'initial status');
    assert.ok(Array.isArray(initial.rules) && initial.rules.length >= 10, 'initial rules');
    assert.ok(initial.rules.some((r) => r.name === 'Any Gift = Spawn Units'), 'English default rules');
    assert.ok(initial.settings && initial.settings.ttsVoiceLang === 'en-US', 'English TTS default');
    assert.strictEqual(initial.settings.gameMode, 'arena', 'default gameMode');
    assert.strictEqual(initial.settings.arenaSubMode, 'frontline', 'default arenaSubMode');
    assert.deepStrictEqual(initial.mode, { gameMode: 'arena', arenaSubMode: 'frontline' }, 'initial game:mode');
    assert.ok(Array.isArray(initial.leaderboard), 'initial leaderboard');
    assert.ok(Array.isArray(initial.feed), 'initial feed:history');
    console.log('[smoke] Initial socket payloads OK');

    // 3. game:mode switching across all 6 modes & 3 Arena sub-modes
    const modeCases = [
      { gameMode: 'arena', arenaSubMode: 'lanes' },
      { gameMode: 'arena', arenaSubMode: 'tug' },
      { gameMode: 'balls' },
      { gameMode: 'halay' },
      { gameMode: 'music' },
      { gameMode: 'boss' },
      { gameMode: 'monster' },
      { gameMode: 'arena', arenaSubMode: 'frontline' },
    ];
    for (const mc of modeCases) {
      const before = modeUpdates.length;
      socket.emit('game:mode', mc);
      await sleep(80);
      assert.ok(modeUpdates.length > before, `expected game:mode update for ${JSON.stringify(mc)}`);
      const last = modeUpdates[modeUpdates.length - 1];
      assert.strictEqual(last.gameMode, mc.gameMode);
      if (mc.arenaSubMode) assert.strictEqual(last.arenaSubMode, mc.arenaSubMode);
    }
    console.log('[smoke] game:mode switching across 6 modes & 3 Arena sub-modes OK');

    // 4. test:event -> tiktok:event + English action + leaderboard (including legacy chat command)
    socket.emit('test:event', { type: 'chat', nickname: 'TestPlayer', comment: 'red' });
    socket.emit('test:event', { type: 'chat', nickname: 'LegacyPlayer', comment: 'mavi' });
    socket.emit('test:event', { type: 'gift', nickname: 'TestPlayer', giftName: 'Rose', count: 3 });
    socket.emit('test:event', { type: 'like', nickname: 'TestPlayer', likeCount: 150 });
    await sleep(400);

    assert.ok(events.some((e) => e.source === 'manual' && e.type === 'gift' && e.gift.count === 3), 'manual gift event');
    assert.ok(actions.some((a) => a.action.type === 'join' && a.action.team === 'red'), 'join red action');
    assert.ok(actions.some((a) => a.action.type === 'join' && a.action.team === 'blue'), 'legacy join blue action');
    assert.ok(actions.some((a) => a.action.type === 'spawn' && a.action.units === 3), 'spawn 3 action');
    assert.ok(actions.some((a) => a.action.type === 'alert' && a.action.text.includes('sent Rose x3')), 'English alert text');
    assert.ok(actions.some((a) => a.action.type === 'spawn' && a.action.units === 1 && a.event.type === 'like'), 'like every 100 spawn');
    assert.ok(lbUpdates.some((lb) => lb.some((u) => u.nickname === 'TestPlayer' && u.diamonds === 3)), 'leaderboard updated');
    console.log('[smoke] test:event -> tiktok:event / English action / leaderboard OK');

    // 5. Simulator start + stop
    const beforeSim = events.length;
    socket.emit('sim:start', { rate: 'high' });
    await sleep(1200);
    socket.emit('sim:stop');
    await sleep(200);
    const simEvents = events.slice(beforeSim).filter((e) => e.source === 'sim');
    assert.ok(simEvents.length >= 2, `expected >=2 sim events, got ${simEvents.length}`);
    console.log(`[smoke] Simulator produced ${simEvents.length} events in ~1.2s OK`);

    // 6. Real control:connect to an offline/nonexistent user -> clean English error
    const statusBeforeConn = statusUpdates.length;
    socket.emit('control:connect', { username: 'nonexistent_offline_test_user_xyz_99' });
    let errStatus = null;
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      errStatus = statusUpdates.slice(statusBeforeConn).find((s) => s.error && s.error.length > 0);
      if (errStatus) break;
    }
    socket.emit('control:disconnect');
    assert.ok(errStatus, 'expected English error status from control:connect');
    assert.ok(!/[çğıöşüÇĞİÖŞÜ]/.test(errStatus.error), `expected English error, got: ${errStatus.error}`);
    console.log('[smoke] control:connect English error status:', errStatus.error);

    // 7. game:reset
    socket.emit('game:reset', { clearLeaderboard: true });
    await sleep(200);
    assert.ok(resetSeen, 'game:reset rebroadcast');
    assert.strictEqual(lbUpdates[lbUpdates.length - 1].length, 0, 'leaderboard cleared');
    console.log('[smoke] game:reset OK');

    // 8. Skill & CLI generator check
    const skillPath = path.join(__dirname, '..', 'skills', 'tiktok-live-game-factory', 'SKILL.md');
    const cliPath = path.join(__dirname, '..', 'skills', 'tiktok-live-game-factory', 'scripts', 'create-game-mode.js');
    assert.ok(fs.existsSync(skillPath), 'SKILL.md exists');
    const cliOut = execFileSync(process.execPath, [cliPath, '--list'], { encoding: 'utf8' });
    for (const m of ['arena', 'balls', 'halay', 'music', 'boss', 'monster']) {
      assert.ok(cliOut.includes(m), `create-game-mode.js --list includes ${m}`);
    }
    console.log('[smoke] Skill SKILL.md & create-game-mode.js --list OK');

    console.log('[smoke] ALL TESTS PASSED');
  } finally {
    if (socket) socket.disconnect();
    serverProc.kill('SIGTERM');
    await sleep(300);
    if (!serverProc.killed) serverProc.kill('SIGKILL');
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
});
