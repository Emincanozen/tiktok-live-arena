/* TikTok Live Arena — Overlay Engine (1920x1080 Canvas, 60fps) */
(function () {
'use strict';
const Q = new URLSearchParams(location.search);
const IS_BG = Q.get('bg') === '1';
if (IS_BG) document.body.classList.add('bg');
const MOCK = Q.get('mock') === '1';
const URL_MODE = Q.get('mode');
const URL_SUBMODE = Q.get('submode');

const W = 1920, H = 1080;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  cv.style.width = (W * s) + 'px'; cv.style.height = (H * s) + 'px';
  cv.style.left = ((innerWidth - W * s) / 2) + 'px'; cv.style.top = ((innerHeight - H * s) / 2) + 'px';
}
addEventListener('resize', fit); fit();

/* ---------- settings & constants ---------- */
const VALID_MODES = ['arena', 'balls', 'halay', 'music', 'boss', 'monster'];
const VALID_SUBMODES = ['frontline', 'lanes', 'tug'];
const TEAMS = {
  red:  { name: 'RED',  color: '#ff3b4e', dark: '#9c1424', light: '#ff9aa4', dir: 1,  castleX: 40 },
  blue: { name: 'BLUE', color: '#2f8cff', dark: '#103f8f', light: '#9cc9ff', dir: -1, castleX: W - 40 - 190 }
};
const CASTLE_W = 190, CASTLE_H = 300, GROUND_TOP = 640, GROUND_BOT = 990;
const LANES = [
  { name: 'TOP', yMin: 615, yMax: 715 },
  { name: 'MID', yMin: 745, yMax: 845 },
  { name: 'BOT', yMin: 875, yMax: 975 }
];
const MAX_UNITS = 800, UNIT_HP = 40, UNIT_DMG = 6, UNIT_RANGE = 34, UNIT_CD = 0.7, UNIT_SPEED = 75;

let settings = {
  castleHp: 1000,
  roundSeconds: 300,
  ttsEnabled: true,
  ttsVoiceLang: 'en-US',
  gameMode: VALID_MODES.includes(URL_MODE) ? URL_MODE : 'arena',
  arenaSubMode: VALID_SUBMODES.includes(URL_SUBMODE) ? URL_SUBMODE : 'frontline'
};
window.__arenaSettings = settings;

/* ---------- state ---------- */
const users = new Map();           // uniqueId -> {uniqueId,nickname,avatar,team,lane,diamonds}
const units = [];
let unitCount = 0;
const castle = {
  red:  { hp: 1000, dispHp: 1000, pauseT: 0, max: 1000, flash: 0, buff: 0 },
  blue: { hp: 1000, dispHp: 1000, pauseT: 0, max: 1000, flash: 0, buff: 0 }
};
let tugPos = 0; // -1 (red castle) .. +1 (blue castle)
let roundTime = 300, phase = 'play', phaseT = 0, winner = null, mvp = null, roundDiamonds = {};
const spawnQ = [];
let shake = 0, hitStopT = 0, vigInt = 0, vigCol = '180,0,0';
const counts = { red: 0, blue: 0 };

/* ---------- pre-rendered glow sprite cache & ambient embers ---------- */
const GLOW_SPRITES = {};
[
  ['cyan',   '0,229,255'],
  ['gold',   '255,210,63'],
  ['red',    '255,59,92'],
  ['purple', '168,85,247']
].forEach(([k, rgb]) => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  rad.addColorStop(0, `rgba(${rgb},0.85)`);
  rad.addColorStop(0.35, `rgba(${rgb},0.35)`);
  rad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = rad; g.fillRect(0, 0, 128, 128);
  GLOW_SPRITES[k] = c;
});
function glow(x, y, r, key) {
  const sp = GLOW_SPRITES[key] || GLOW_SPRITES.cyan;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(sp, x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
function glassBox(x, y, w, h, r, borderCol) {
  ctx.fillStyle = 'rgba(12,16,28,0.68)';
  rr(x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = borderCol || 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5; ctx.stroke();
  const c = 12, b = borderCol || '#00e5ff';
  ctx.strokeStyle = b; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
  ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c);
  ctx.moveTo(x, y + h - c); ctx.lineTo(x, y + h); ctx.lineTo(x + c, y + h);
  ctx.moveTo(x + w - c, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - c);
  ctx.stroke();
}
const EMBERS = Array.from({ length: 35 }, () => ({
  x: Math.random() * W, y: Math.random() * H,
  vx: (Math.random() - 0.5) * 18, vy: -12 - Math.random() * 24,
  s: 1.5 + Math.random() * 2.5, a: 0.18 + Math.random() * 0.35,
  c: Math.random() < 0.5 ? '#00e5ff' : '#ffd23f'
}));

/* ---------- avatar cache ---------- */
const avatars = new Map();
function getAvatar(url) {
  if (!url) return null;
  let a = avatars.get(url);
  if (a === undefined) {
    avatars.set(url, null);
    const im = new Image();
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const x = c.getContext('2d');
        x.beginPath(); x.arc(16, 16, 16, 0, 6.3); x.clip();
        x.drawImage(im, 0, 0, 32, 32);
        avatars.set(url, c);
      } catch (e) {}
    };
    im.onerror = () => {};
    im.src = url;
    return null;
  }
  return a;
}

/* ---------- WebAudio ---------- */
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
  return AC;
}
addEventListener('click', audio); addEventListener('keydown', audio);
function tone(freq, dur, type, vol, when, slideTo) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + (when || 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, lp) {
  const a = audio(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(); s.buffer = b;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp || 800;
  const g = a.createGain(); g.gain.value = vol || 0.3;
  s.connect(f); f.connect(g); g.connect(a.destination); s.start();
}
let lastHit = 0;
const SFX = {
  coin() { tone(988, 0.08, 'square', 0.08); tone(1319, 0.25, 'square', 0.08, 0.08); },
  horn() { tone(220, 0.7, 'sawtooth', 0.14, 0, 330); tone(277, 0.7, 'sawtooth', 0.1, 0, 415); },
  boom() { noise(0.7, 0.5, 400); tone(90, 0.5, 'sine', 0.3, 0, 30); },
  spawn() { tone(400, 0.06, 'triangle', 0.05, 0, 700); },
  hit() { const n = performance.now(); if (n - lastHit < 70) return; lastHit = n; noise(0.05, 0.06, 2500); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.14, i * 0.14)); },
  join() { tone(600, 0.1, 'sine', 0.1); tone(900, 0.15, 'sine', 0.1, 0.1); }
};
function sfx(n) { try { SFX[n] && SFX[n](); } catch (e) {} }

/* ---------- TTS ---------- */
const ttsQ = []; let ttsBusy = false;
function tts(text) {
  if (!settings.ttsEnabled || !('speechSynthesis' in window) || !text) return;
  if (ttsQ.length < 8) ttsQ.push(text);
  nextTts();
}
function nextTts() {
  if (ttsBusy || !ttsQ.length) return;
  ttsBusy = true;
  const u = new SpeechSynthesisUtterance(ttsQ.shift());
  u.lang = settings.ttsVoiceLang || 'en-US';
  const done = () => { ttsBusy = false; setTimeout(nextTts, 200); };
  u.onend = done; u.onerror = done;
  try { speechSynthesis.speak(u); } catch (e) { done(); }
  setTimeout(() => { if (ttsBusy && !speechSynthesis.speaking) done(); }, 15000);
}

/* ---------- particles & floating text ---------- */
const P = []; for (let i = 0; i < 900; i++) P.push({ a: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: '#fff', s: 3, g: 0, kind: 0, rot: 0, vr: 0 });
let pi = 0;
function part(x, y, vx, vy, life, c, s, g, kind) {
  const p = P[pi]; pi = (pi + 1) % P.length;
  p.a = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = p.max = life; p.c = c; p.s = s; p.g = g || 0; p.kind = kind || 0;
  p.rot = Math.random() * 6; p.vr = (Math.random() - 0.5) * 12;
}
function burst(x, y, n, c, sp) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = (0.3 + Math.random()) * sp;
    part(x, y, Math.cos(a) * v, Math.sin(a) * v - 30, 0.4 + Math.random() * 0.4, c, 2 + Math.random() * 2, 300, 0);
  }
}
const FT = []; for (let i = 0; i < 120; i++) FT.push({ a: false, x: 0, y: 0, t: 0, txt: '', c: '#fff', sz: 22 });
let fi = 0;
function floatText(x, y, txtStr, c, sz) {
  const f = FT[fi]; fi = (fi + 1) % FT.length;
  f.a = true; f.x = x; f.y = y; f.t = 0; f.txt = txtStr; f.c = c; f.sz = sz || 22;
}
function confetti() {
  const cols = ['#ff3b4e', '#2f8cff', '#ffd23f', '#3ddc84', '#c77dff', '#fff'];
  for (let i = 0; i < 220; i++) {
    part(Math.random() * W, -20 - Math.random() * 300, (Math.random() - 0.5) * 160, 120 + Math.random() * 200,
      4 + Math.random() * 3, cols[i % cols.length], 7 + Math.random() * 6, 60, 1);
  }
}

/* ---------- arena units & lanes ---------- */
let laneCounter = 0;
function pickLane(user) {
  if (user && typeof user.lane === 'number') return user.lane;
  return (laneCounter++) % 3;
}
function allocUnit() {
  for (let i = 0; i < units.length; i++) if (!units[i].alive) return units[i];
  if (units.length >= MAX_UNITS) return null;
  const u = { alive: false }; units.push(u); return u;
}
function spawnUnit(user, team) {
  const u = allocUnit(); if (!u) return false;
  const T = TEAMS[team];
  const isLanes = settings.arenaSubMode === 'lanes';
  const lane = isLanes ? pickLane(user) : 0;
  const yMin = isLanes ? LANES[lane].yMin + 12 : GROUND_TOP + 20;
  const yMax = isLanes ? LANES[lane].yMax - 12 : GROUND_BOT - 20;
  u.alive = true; u.team = team; u.dir = T.dir; u.lane = lane;
  u.x = T.dir > 0 ? T.castleX + CASTLE_W - 10 : T.castleX + 10;
  u.y = yMin + Math.random() * (yMax - yMin);
  u.hp = u.max = UNIT_HP; u.cd = Math.random() * UNIT_CD; u.name = user.nickname || user.uniqueId || '?';
  u.uid = user.uniqueId; u.avatar = user.avatar || ''; u.age = 0; u.atk = 0; u.ph = Math.random() * 6;
  u.speed = UNIT_SPEED * (0.85 + Math.random() * 0.3); u.big = !!user._big;
  u.fighting = false;
  return true;
}

const BADGE_COLS = ['#ff3b5c', '#2f8cff', '#a855f7', '#00c48c', '#ff7b00', '#00b4d8'];
function badgeColor(name) {
  let h = 0; const s = String(name || 'A');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return BADGE_COLS[Math.abs(h) % BADGE_COLS.length];
}
function drawAvatar(x, y, r, url, name, borderCol) {
  const av = getAvatar(url);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
  if (av) {
    ctx.save(); ctx.clip();
    ctx.drawImage(av, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = badgeColor(name);
    ctx.fill();
    const ch = String(name || '?').trim().slice(0, 2).toUpperCase();
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.max(10, Math.round(r * 0.9))}px Segoe UI, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, y + 1);
  }
  if (borderCol) {
    ctx.lineWidth = Math.max(2, r * 0.16);
    ctx.strokeStyle = borderCol;
    ctx.shadowColor = borderCol;
    ctx.shadowBlur = 8;
    ctx.stroke();
  }
  ctx.restore();
}

function parseTarget(comment) {
  if (!comment) return null;
  const s = String(comment).trim();
  let m = s.match(/^@([a-zA-Z0-9_.\-]{2,32})/);
  if (m) return m[1];
  m = s.match(/^(?:kill|hunt|target|snipe)\s+@?([a-zA-Z0-9_.\-]{2,32})/i);
  if (m) return m[1];
  m = s.match(/@([a-zA-Z0-9_.\-]{2,32})/);
  return m ? m[1] : null;
}

function getUser(ev) {
  const id = ev.user.uniqueId || ev.user.nickname || 'anon';
  let u = users.get(id);
  if (!u) { u = { uniqueId: id, nickname: ev.user.nickname || id, avatar: ev.user.avatar || '', team: null, lane: null, targetName: null, diamonds: 0 }; users.set(id, u); }
  else { if (ev.user.nickname) u.nickname = ev.user.nickname; if (ev.user.avatar) u.avatar = ev.user.avatar; }
  if (ev.type === 'chat' && ev.comment) {
    const c = ev.comment.trim().toLowerCase();
    if (c === 'top') u.lane = 0;
    else if (c === 'mid') u.lane = 1;
    else if (c === 'bot') u.lane = 2;
    const tgt = parseTarget(ev.comment);
    if (tgt) u.targetName = tgt;
  }
  return u;
}
function memberCount(team) { let n = 0; users.forEach(u => { if (u.team === team) n++; }); return n; }
function assign(u, team) {
  if (team === 'auto' || !TEAMS[team]) team = null;
  if (!team) { let r = 0, b = 0; users.forEach(x => { if (x.team === 'red') r++; else if (x.team === 'blue') b++; }); team = r <= b ? 'red' : 'blue'; }
  const first = !u.team;
  u.team = team; return first;
}

/* ---------- shared helpers for modes ---------- */
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function txt(s, x, y, font, fill, align, stroke) {
  ctx.font = font; ctx.textAlign = align || 'left';
  if (stroke !== false) { ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = fill || '#fff'; ctx.fillText(s, x, y);
}
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

const E_SHARED = {
  W, H, ctx, txt, rr, part, burst, floatText, confetti, tone, noise, sfx, getAvatar, drawAvatar, fmtTime,
  glow, glassBox,
  hitStop(sec) { hitStopT = Math.max(hitStopT, sec || 0.05); },
  vignette(intensity, rgb) { vigInt = Math.max(vigInt, intensity || 0); if (rgb) vigCol = rgb; },
  tts(t) { tts(t); },
  pushAlert(t, s) { pushAlert(t, s); },
  addShake(v) { shake = Math.max(shake, v || 10); },
  endRound(w, customMvp) { endRound(w, customMvp); }
};

/* ---------- actions ---------- */
const alertQ = []; let curAlert = null;
function pushAlert(text, style) { if (alertQ.length < 6) alertQ.push({ text, style: style || 'gift', t: 0 }); }

function handleAction(msg) {
  if (!msg || !msg.action) return;
  const a = msg.action, ev = msg.event || { user: {} };
  const hasUser = ev.user && (ev.user.uniqueId || ev.user.nickname);
  const u = hasUser ? getUser(ev) : null;

  if (a.type === 'alert') { pushAlert(a.text, a.style); return; }
  if (a.type === 'tts') { tts(a.text); return; }
  if (a.type === 'confetti') { confetti(); return; }
  if (a.type === 'sound') { sfx(a.name); return; }

  const mode = settings.gameMode || 'arena';
  if (mode !== 'arena' && window.OverlayModes && window.OverlayModes[mode]) {
    if (u && ev.gift) {
      const dm = (ev.gift.diamonds || 0) * (ev.gift.count || 1);
      if (dm) { u.diamonds += dm; roundDiamonds[u.uniqueId] = (roundDiamonds[u.uniqueId] || 0) + dm; }
    }
    if (phase === 'play') window.OverlayModes[mode].onAction(E_SHARED, a, ev, u);
    return;
  }

  // Arena actions
  switch (a.type) {
    case 'join': {
      if (!u) break;
      assign(u, a.team);
      sfx('join');
      floatText(TEAMS[u.team].castleX + CASTLE_W / 2, 600, u.nickname + ' → ' + TEAMS[u.team].name, TEAMS[u.team].color, 28);
      break;
    }
    case 'spawn': {
      if (!u) break;
      let team = a.team && TEAMS[a.team] ? a.team : u.team;
      if (!team) { assign(u, 'auto'); team = u.team; }
      else if (!u.team) u.team = team;
      const n = Math.max(1, Math.min(50, Math.round(+a.units || 1)));
      const dm = ev.gift ? (ev.gift.diamonds || 0) * (ev.gift.count || 1) : 0;
      if (dm) { u.diamonds += dm; roundDiamonds[u.uniqueId] = (roundDiamonds[u.uniqueId] || 0) + dm; }
      if (phase === 'play') spawnQ.push({ u, team, n, big: dm >= 100 });
      break;
    }
    case 'boost': {
      const p = +a.power || 20;
      const teams = a.team && TEAMS[a.team] ? [a.team] : ['red', 'blue'];
      teams.forEach(t => {
        const c = castle[t];
        c.hp = Math.min(c.max, c.hp + p * 4); c.buff = 10;
        const T = TEAMS[t];
        floatText(T.castleX + CASTLE_W / 2, 560, '+' + (p * 4) + ' HP', '#3ddc84', 40);
        for (let i = 0; i < 30; i++) part(T.castleX + Math.random() * CASTLE_W, 800 - Math.random() * 200, 0, -60 - Math.random() * 80, 1.2, '#3ddc84', 4, 0, 0);
      });
      break;
    }
  }
}

/* ---------- round management ---------- */
let socket = null;
function resetRound(clear) {
  units.length = 0; spawnQ.length = 0;
  castle.red.max = castle.blue.max = settings.castleHp || 1000;
  castle.red.hp = castle.blue.hp = castle.red.dispHp = castle.blue.dispHp = castle.red.max;
  castle.red.pauseT = castle.blue.pauseT = 0;
  castle.red.buff = castle.blue.buff = 0;
  tugPos = 0;
  roundTime = settings.roundSeconds || 300; roundDiamonds = {};
  phase = 'play'; phaseT = 0; winner = null; mvp = null;
  P.forEach(p => p.a = false); FT.forEach(f => f.a = false);
  if (clear) users.forEach(u => { u.team = null; u.lane = null; u.diamonds = 0; });
  const m = settings.gameMode || 'arena';
  if (m !== 'arena' && window.OverlayModes && window.OverlayModes[m]) {
    window.OverlayModes[m].reset(clear);
  }
}

function endRound(w, customMvp) {
  if (phase === 'end') return;
  phase = 'end'; phaseT = 0; winner = w;
  if (customMvp !== undefined) {
    mvp = customMvp;
  } else {
    let best = null, bd = -1;
    users.forEach(u => {
      if (w !== 'draw' && u.team !== w) return;
      const d = roundDiamonds[u.uniqueId] || 0;
      if (d > bd) { bd = d; best = u; }
    });
    mvp = best ? { nickname: best.nickname, uniqueId: best.uniqueId, diamonds: Math.max(0, bd), avatar: best.avatar } : null;
  }
  sfx('win'); confetti(); shake = 20;
  if (socket) socket.emit('game:result', { winner: w, mvp, gameMode: settings.gameMode });
}

/* ---------- update ---------- */
const GC = 50, GW = Math.ceil(W / GC) + 2;
const grid = { red: [], blue: [] };
for (let i = 0; i < GW; i++) { grid.red.push([]); grid.blue.push([]); }

function updateArena(dt) {
  // Spawn budget
  let budget = Math.max(2, Math.ceil(spawnQ.length * 0.15));
  while (budget > 0 && spawnQ.length) {
    const q = spawnQ[0];
    q.u._big = q.big;
    if (spawnUnit(q.u, q.team)) { burst(TEAMS[q.team].castleX + (q.team === 'red' ? CASTLE_W : 0), 760, 3, TEAMS[q.team].light, 80); }
    q.u._big = false;
    if (--q.n <= 0) spawnQ.shift();
    budget--;
  }
  if (spawnQ.length && Math.random() < 0.1) sfx('spawn');

  if (castle.red.hp <= 0 && castle.blue.hp <= 0) { endRound('draw'); return; }
  if (castle.red.hp <= 0) { endRound('blue'); return; }
  if (castle.blue.hp <= 0) { endRound('red'); return; }
  if (roundTime <= 0) {
    roundTime = 0;
    const r = castle.red.hp, b = castle.blue.hp;
    endRound(r === b ? 'draw' : (r > b ? 'red' : 'blue'));
    return;
  }

  // Spatial grid + Frontline barrier calculation
  for (let i = 0; i < GW; i++) { grid.red[i].length = 0; grid.blue[i].length = 0; }
  counts.red = counts.blue = 0; let alive = 0;

  const isLanes = settings.arenaSubMode === 'lanes';
  const maxRedX = [-Infinity, -Infinity, -Infinity];
  const minBlueX = [Infinity, Infinity, Infinity];
  const laneCounts = [{ r: 0, b: 0 }, { r: 0, b: 0 }, { r: 0, b: 0 }];

  for (let i = 0; i < units.length; i++) {
    const u = units[i]; if (!u.alive) continue;
    alive++; counts[u.team]++;
    const gx = Math.max(0, Math.min(GW - 1, (u.x / GC) | 0));
    grid[u.team][gx].push(u);
    const li = isLanes ? u.lane : 0;
    if (u.team === 'red') {
      laneCounts[li].r++;
      if (u.x > maxRedX[li]) maxRedX[li] = u.x;
    } else {
      laneCounts[li].b++;
      if (u.x < minBlueX[li]) minBlueX[li] = u.x;
    }
  }
  unitCount = alive;

  // Tug-of-War payload push
  if (settings.arenaSubMode === 'tug') {
    const diff = counts.red - counts.blue;
    tugPos = Math.max(-1, Math.min(1, tugPos + Math.max(-0.22, Math.min(0.22, diff * 0.008)) * dt));
    if (tugPos >= 0.95) {
      castle.blue.hp -= 90 * dt; castle.blue.flash = 0.1;
    } else if (tugPos <= -0.95) {
      castle.red.hp -= 90 * dt; castle.red.flash = 0.1;
    }
  }

  const redCastleEdge = TEAMS.red.castleX + CASTLE_W, blueCastleEdge = TEAMS.blue.castleX;

  for (let i = 0; i < units.length; i++) {
    const u = units[i]; if (!u.alive) continue;
    u.age += dt; u.ph += dt * 9;
    const enemyTeam = u.team === 'red' ? 'blue' : 'red';
    const gx = Math.max(0, Math.min(GW - 1, (u.x / GC) | 0));
    const li = isLanes ? u.lane : 0;

    // Nearest enemy in melee range + nearest enemy for Y-homing
    let tgt = null, bd = UNIT_RANGE * UNIT_RANGE;
    let steerTgt = null, steerDist = Infinity;
    for (let g = gx - 3; g <= gx + 3; g++) {
      if (g < 0 || g >= GW) continue;
      const arr = grid[enemyTeam][g];
      for (let k = 0; k < arr.length; k++) {
        const e = arr[k]; if (!e.alive) continue;
        if (isLanes && e.lane !== u.lane) continue;
        const dx = e.x - u.x, dy = (e.y - u.y) * 1.6;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; tgt = e; }
        if (d < steerDist) { steerDist = d; steerTgt = e; }
      }
    }

    u.cd -= dt; if (u.atk > 0) u.atk -= dt * 5;
    const buff = castle[u.team].buff > 0 ? 1.6 : 1;
    const dmg = UNIT_DMG * buff * (u.big ? 1.5 : 1);

    if (tgt) {
      u.fighting = true;
      if (u.cd <= 0) {
        u.cd = UNIT_CD; u.atk = 1; tgt.hp -= dmg;
        floatText(tgt.x, tgt.y - 40, '' + Math.round(dmg), '#ffe066', 18);
        burst(tgt.x, tgt.y - 20, 4, '#fff6b0', 120); sfx('hit');
        if (tgt.hp <= 0) { tgt.alive = false; burst(tgt.x, tgt.y - 15, 12, TEAMS[tgt.team].color, 180); }
      }
      continue;
    }

    // Castle siege only if opposing frontline is cleared (or reached castle)
    const hasEnemy = isLanes ? (u.team === 'red' ? laneCounts[li].b > 0 : laneCounts[li].r > 0) : (counts[enemyTeam] > 0);
    const atCastle = u.team === 'red' ? u.x >= blueCastleEdge - 10 : u.x <= redCastleEdge + 10;
    if (atCastle && !hasEnemy) {
      u.fighting = true;
      if (u.cd <= 0) {
        u.cd = UNIT_CD; u.atk = 1;
        const c = castle[enemyTeam]; c.hp -= dmg; c.flash = 0.15; c.pauseT = 0.25; shake = Math.max(shake, 2);
        floatText(TEAMS[enemyTeam].castleX + CASTLE_W / 2 + (Math.random() - 0.5) * 120, 560 + Math.random() * 100, '-' + Math.round(dmg), '#ff5964', 24);
        burst(u.x + u.dir * 10, u.y - 20, 3, '#ffd9a0', 150); sfx('hit');
      }
      continue;
    }

    u.fighting = false;
    let nextX = u.x + u.dir * u.speed * dt;

    // FRONTLINE BARRIER: prevent 300v300 armies from slipping past each other
    if (hasEnemy) {
      if (u.team === 'red' && minBlueX[li] < Infinity) {
        const barrier = minBlueX[li] - 18;
        if (nextX > barrier) nextX = Math.min(u.x, barrier);
      } else if (u.team === 'blue' && maxRedX[li] > -Infinity) {
        const barrier = maxRedX[li] + 18;
        if (nextX < barrier) nextX = Math.max(u.x, barrier);
      }
    }
    u.x = nextX;

    // Y-HOMING: steer smoothly toward nearest opposing unit near frontline
    if (steerTgt) {
      const dy = steerTgt.y - u.y;
      const steerSpeed = Math.abs(u.x - steerTgt.x) < 160 ? 68 : 28;
      if (Math.abs(dy) > 4) u.y += Math.sign(dy) * Math.min(Math.abs(dy), steerSpeed * dt);
    } else {
      u.y += Math.sin(u.ph * 0.3) * 6 * dt;
    }
    const yMin = isLanes ? LANES[li].yMin + 10 : GROUND_TOP + 14;
    const yMax = isLanes ? LANES[li].yMax - 10 : GROUND_BOT - 14;
    if (u.y < yMin) u.y = yMin;
    if (u.y > yMax) u.y = yMax;
  }
}

function update(dt) {
  if (vigInt > 0) vigInt = Math.max(0, vigInt - dt * 1.6);
  for (let i = 0; i < EMBERS.length; i++) {
    const e = EMBERS[i];
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (e.y < -10) { e.y = H + 10; e.x = Math.random() * W; }
    if (e.x < 0) e.x = W; else if (e.x > W) e.x = 0;
  }
  if (hitStopT > 0) { hitStopT -= dt; return; }
  phaseT += dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 40);
  ['red', 'blue'].forEach(t => {
    const c = castle[t];
    if (c.flash > 0) c.flash -= dt;
    if (c.buff > 0) c.buff -= dt;
    if (c.dispHp > c.hp) {
      if (c.pauseT > 0) c.pauseT -= dt;
      else c.dispHp = Math.max(c.hp, c.dispHp - Math.max(60, (c.dispHp - c.hp) * 4) * dt);
    } else c.dispHp = c.hp;
  });

  if (phase === 'end') {
    if (phaseT > 10) { resetRound(false); users.forEach(u => { u.team = null; u.lane = null; }); }
  } else {
    const mode = settings.gameMode || 'arena';
    if (mode !== 'boss') roundTime -= dt;
    if (mode === 'arena') updateArena(dt);
    else if (window.OverlayModes && window.OverlayModes[mode]) window.OverlayModes[mode].update(E_SHARED, dt, roundTime);
  }

  for (let i = 0; i < P.length; i++) {
    const p = P[i]; if (!p.a) continue;
    p.life -= dt; if (p.life <= 0 || p.y > H + 40) { p.a = false; continue; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.kind === 1) p.vx += Math.sin(p.rot) * 20 * dt;
  }
  for (let i = 0; i < FT.length; i++) { const f = FT[i]; if (f.a) { f.t += dt; f.y -= 40 * dt; if (f.t > 1) f.a = false; } }
  if (!curAlert && alertQ.length) curAlert = alertQ.shift();
  if (curAlert) { curAlert.t += dt; if (curAlert.t > 4) curAlert = null; }
}

/* ---------- draw (arena) ---------- */
function drawCastle(team) {
  const T = TEAMS[team], c = castle[team], x = T.castleX, y = GROUND_BOT - CASTLE_H + 20;
  const dmgRatio = 1 - Math.max(0, c.hp) / c.max;
  ctx.save();
  if (c.flash > 0) ctx.globalAlpha = 0.75;
  // Main keep + stone highlight
  ctx.fillStyle = T.dark; rr(x, y + 70, CASTLE_W, CASTLE_H - 70, 6); ctx.fill();
  ctx.fillStyle = '#262e4b'; rr(x + 12, y + 80, CASTLE_W - 24, CASTLE_H - 90, 4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(x + 12, y + 80, CASTLE_W - 24, 10);
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; ctx.beginPath();
  for (let r = 0; r < 7; r++) { const yy = y + 100 + r * 30; ctx.moveTo(x + 12, yy); ctx.lineTo(x + CASTLE_W - 12, yy); }
  ctx.stroke();
  const tw = 56;
  const flicker = Math.sin(performance.now() / 85) * 4;
  [x - 8, x + CASTLE_W - tw + 8].forEach(tx => {
    ctx.fillStyle = T.color; rr(tx, y, tw, CASTLE_H, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.16)'; rr(tx + 3, y + 3, 10, CASTLE_H - 6, 4); ctx.fill();
    ctx.fillStyle = T.dark; for (let k = 0; k < 3; k++) ctx.fillRect(tx + 4 + k * 19, y - 18, 14, 22);
    ctx.fillStyle = '#0b0f1d'; rr(tx + tw / 2 - 6, y + 50, 12, 30, 5); ctx.fill();
    // Tower torch flame
    glow(tx + tw / 2, y - 28 + flicker * 0.4, 26, team === 'red' ? 'gold' : 'cyan');
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(tx + tw / 2, y - 26, 6 + flicker * 0.2, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = T.color; for (let k = 0; k < 4; k++) ctx.fillRect(x + 54 + k * 26, y + 55, 16, 22);
  ctx.fillStyle = '#1a1208'; rr(x + CASTLE_W / 2 - 30, y + CASTLE_H - 100, 60, 100, 28); ctx.fill();
  ctx.fillStyle = '#5b3a1a'; rr(x + CASTLE_W / 2 - 24, y + CASTLE_H - 94, 48, 94, 22); ctx.fill();
  // Glowing waving banner
  const fx = x + CASTLE_W / 2, fy = y - 8, wv = Math.sin(performance.now() / 200) * 5;
  ctx.fillStyle = '#dfe6ff'; ctx.fillRect(fx - 2, fy - 72, 4, 78);
  ctx.save();
  ctx.shadowColor = T.color; ctx.shadowBlur = 14;
  ctx.fillStyle = T.color; ctx.beginPath();
  const d = T.dir; ctx.moveTo(fx + d * 2, fy - 72); ctx.lineTo(fx + d * 56, fy - 58 + wv); ctx.lineTo(fx + d * 2, fy - 42); ctx.fill();
  ctx.restore();
  if (dmgRatio > 0.3) { ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(x + 40, y + 120); ctx.lineTo(x + 70, y + 160); ctx.lineTo(x + 55, y + 200);
    if (dmgRatio > 0.6) { ctx.moveTo(x + 120, y + 100); ctx.lineTo(x + 100, y + 150); ctx.lineTo(x + 130, y + 210); }
    ctx.stroke(); }
  if (c.buff > 0) { ctx.globalAlpha = 0.25 + 0.15 * Math.sin(performance.now() / 120); ctx.strokeStyle = '#3ddc84'; ctx.lineWidth = 6;
    rr(x - 14, y - 22, CASTLE_W + 28, CASTLE_H + 30, 12); ctx.stroke(); }
  ctx.restore();
  if (dmgRatio > 0.5 && phase === 'play' && Math.random() < 0.2)
    part(x + Math.random() * CASTLE_W, y + 40, 0, -50, 1, '#555', 6, -10, 0);
}

function drawUnit(u, showLabel) {
  const T = TEAMS[u.team], x = u.x, y = u.y;
  const bob = u.fighting ? 0 : Math.abs(Math.sin(u.ph)) * 3;
  const sc = u.big ? 1.25 : 1;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x - 9 * sc, y - 1, 18 * sc, 3);
  const leg = u.fighting ? 0 : Math.sin(u.ph) * 4;
  ctx.fillStyle = T.dark; ctx.fillRect(x - 6 * sc + leg, y - 10 * sc, 4 * sc, 10 * sc); ctx.fillRect(x + 2 * sc - leg, y - 10 * sc, 4 * sc, 10 * sc);
  ctx.fillStyle = T.color; rr(x - 8 * sc, y - 26 * sc - bob, 16 * sc, 17 * sc, 4); ctx.fill();
  ctx.fillStyle = T.light; ctx.fillRect(x - u.dir * 10 * sc - 3, y - 24 * sc - bob, 6, 11 * sc);
  drawAvatar(x, y - 35 * sc - bob, 9 * sc, u.avatar, u.name, T.light);
  const sw = u.atk > 0 ? (1 - u.atk) * 2.2 - 1.1 : -0.4;
  ctx.save(); ctx.translate(x + u.dir * 9 * sc, y - 20 * sc - bob); ctx.scale(u.dir, 1); ctx.rotate(sw - 0.8);
  ctx.fillStyle = '#e8ecf5'; ctx.fillRect(0, -2, 20 * sc, 3); ctx.fillStyle = '#c9a227'; ctx.fillRect(-2, -4, 4, 7);
  if (u.atk > 0.35) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = T.light; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 21 * sc, -0.7, 0.7); ctx.stroke();
  }
  ctx.restore();
  if (u.hp < u.max) { ctx.fillStyle = '#000a'; ctx.fillRect(x - 10, y - 52 * sc - bob, 20, 3); ctx.fillStyle = '#3ddc84'; ctx.fillRect(x - 10, y - 52 * sc - bob, 20 * Math.max(0, u.hp / u.max), 3); }
  if (showLabel) {
    ctx.font = '600 13px Segoe UI, Arial'; ctx.textAlign = 'center';
    const n = u.name.length > 14 ? u.name.slice(0, 13) + '…' : u.name;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(n, x, y - 56 * sc - bob);
    ctx.fillStyle = '#fff'; ctx.fillText(n, x, y - 56 * sc - bob);
  }
}

function hpBar(team, x, w, rev) {
  const T = TEAMS[team], c = castle[team], y = 26, h = 36;
  const r = Math.max(0, c.hp / c.max), dr = Math.max(r, Math.min(1, c.dispHp / c.max));
  glassBox(x, y, w, h, 10, T.color);
  ctx.save(); rr(x + 3, y + 3, w - 6, h - 6, 8); ctx.clip();
  // Delayed-drain ghost trail
  const dw = (w - 6) * dr;
  ctx.fillStyle = 'rgba(255, 220, 150, 0.85)';
  if (rev) ctx.fillRect(x + 3 + (w - 6) - dw, y + 3, dw, h - 6); else ctx.fillRect(x + 3, y + 3, dw, h - 6);
  // Instant HP fill
  const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, T.dark); g.addColorStop(1, T.color);
  ctx.fillStyle = c.flash > 0 ? '#fff' : g; const bw = (w - 6) * r;
  if (rev) ctx.fillRect(x + 3 + (w - 6) - bw, y + 3, bw, h - 6); else ctx.fillRect(x + 3, y + 3, bw, h - 6);
  ctx.restore();
  txt(Math.max(0, Math.ceil(c.hp)) + ' / ' + c.max, x + w / 2, y + 25, '700 20px Segoe UI, Arial', '#fff', 'center');
  txt(T.name + ' CASTLE • ' + memberCount(team) + ' players • ' + counts[team] + ' troops', rev ? x + w : x, y + 62, '700 17px Segoe UI, Arial', T.light, rev ? 'right' : 'left');
}

function topGifters() {
  const arr = Object.keys(roundDiamonds).map(id => ({ id, d: roundDiamonds[id] })).sort((a, b) => b.d - a.d).slice(0, 3);
  return arr.map(a => ({ n: (users.get(a.id) || {}).nickname || a.id, d: a.d, t: (users.get(a.id) || {}).team }));
}

function drawArenaHUD() {
  hpBar('red', 30, 760, false); hpBar('blue', W - 30 - 760, 760, true);
  const top = topGifters();
  glassBox(W / 2 - 170, 98, 340, 32 + 30 * Math.max(1, top.length), 12, 'rgba(255,210,63,0.45)');
  txt('🏆 TOP GIFTERS', W / 2, 122, '700 16px Segoe UI, Arial', '#ffd23f', 'center', false);
  if (!top.length) txt('None yet', W / 2, 152, '500 16px Segoe UI, Arial', '#9aa3c0', 'center', false);
  top.forEach((t, i) => {
    const col = t.t && TEAMS[t.t] ? TEAMS[t.t].light : '#fff';
    const nm = t.n.length > 16 ? t.n.slice(0, 15) + '…' : t.n;
    txt((i + 1) + '. ' + nm, W / 2 - 150, 152 + i * 30, '600 18px Segoe UI, Arial', col, 'left', false);
    txt('💎' + t.d, W / 2 + 150, 152 + i * 30, '600 18px Segoe UI, Arial', '#fff', 'right', false);
  });

  const sub = settings.arenaSubMode;
  const hint = sub === 'lanes'
    ? 'Type 1/2 (red/blue) + top/mid/bot! Send gifts = troops!'
    : 'Type 1 or 2 (red/blue) to join! Send gifts = troops!';
  glassBox(W / 2 - 440, H - 70, 880, 48, 24, 'rgba(255,255,255,0.22)');
  txt(hint, W / 2, H - 37, '700 25px Segoe UI, Arial', '#fff', 'center', false);
  txt('1 = RED', W / 2 - 560, H - 37, '800 24px Segoe UI, Arial', TEAMS.red.color, 'center');
  txt('2 = BLUE', W / 2 + 560, H - 37, '800 24px Segoe UI, Arial', TEAMS.blue.color, 'center');
}

function drawArenaScene() {
  const g = ctx.createLinearGradient(0, GROUND_TOP - 20, 0, H);
  g.addColorStop(0, 'rgba(30,60,35,0)'); g.addColorStop(0.15, 'rgba(34,72,40,.55)'); g.addColorStop(1, 'rgba(18,40,24,.82)');
  ctx.fillStyle = g; ctx.fillRect(0, GROUND_TOP - 20, W, H - GROUND_TOP + 20);

  if (settings.arenaSubMode === 'lanes') {
    LANES.forEach((ln) => {
      ctx.fillStyle = 'rgba(47, 140, 255, 0.10)';
      rr(230, ln.yMin, W - 460, ln.yMax - ln.yMin, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2; ctx.stroke();
      txt(ln.name, W / 2, ln.yMin + 24, '700 15px Segoe UI, Arial', 'rgba(255,255,255,0.35)', 'center', false);
    });
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.setLineDash([16, 14]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W / 2, GROUND_TOP); ctx.lineTo(W / 2, GROUND_BOT + 20); ctx.stroke(); ctx.setLineDash([]);
  }

  if (settings.arenaSubMode === 'tug') {
    const cx = W / 2 + tugPos * 620;
    ctx.strokeStyle = 'rgba(255,210,63,0.4)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(260, 810); ctx.lineTo(W - 260, 810); ctx.stroke();
    ctx.fillStyle = '#ffd23f'; rr(cx - 26, 760, 52, 52, 10); ctx.fill();
    txt('🚩', cx, 796, '30px Segoe UI, Arial', '#fff', 'center', false);
  }

  drawCastle('red'); drawCastle('blue');

  const live = [];
  let fRed = -Infinity, fBlue = Infinity;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u.alive) continue;
    live.push(u);
    if (u.team === 'red' && u.x > fRed) fRed = u.x;
    if (u.team === 'blue' && u.x < fBlue) fBlue = u.x;
  }
  if (fRed > -Infinity && fBlue < Infinity && Math.abs(fBlue - fRed) < 60) {
    const fx = (fRed + fBlue) / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,210,63,0.45)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(fx, GROUND_TOP); ctx.lineTo(fx, GROUND_BOT); ctx.stroke();
    ctx.restore();
  }
  live.sort((a, b) => a.y - b.y);
  const many = live.length > 160;
  for (let i = 0; i < live.length; i++) {
    const u = live[i];
    drawUnit(u, many ? (u.age < 4 || u.big) : true);
  }
  drawArenaHUD();
}

function drawTimer() {
  ctx.fillStyle = 'rgba(8,10,20,.8)'; rr(W / 2 - 80, 20, 160, 60, 14); ctx.fill();
  txt(fmtTime(roundTime), W / 2, 65, '800 42px Segoe UI, Arial', roundTime < 30 ? '#ff5964' : '#fff', 'center');
}

function drawAlert() {
  if (!curAlert) return;
  const a = curAlert, t = a.t;
  const k = t < 0.35 ? t / 0.35 : (t > 3.6 ? Math.max(0, (4 - t) / 0.4) : 1);
  const ease = 1 - Math.pow(1 - k, 3);
  const cols = { gift: ['#ff9f1c', '#ff4d6d'], follow: ['#3ddc84', '#1fa2ff'], big: ['#c77dff', '#ff3b8d'] }[a.style] || ['#ff9f1c', '#ff4d6d'];
  ctx.save(); ctx.globalAlpha = ease; ctx.translate(W / 2, 330 + (1 - ease) * -80);
  ctx.font = '800 44px Segoe UI, Arial'; const w = Math.min(1500, ctx.measureText(a.text).width + 120);
  const sc = a.style === 'big' ? 1 + Math.sin(t * 8) * 0.03 : 1; ctx.scale(sc, sc);
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
  ctx.fillStyle = g; rr(-w / 2, -45, w, 90, 45); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke();
  txt(a.text, 0, 15, '800 44px Segoe UI, Arial', '#fff', 'center');
  ctx.restore();
}

function drawEnd() {
  ctx.fillStyle = 'rgba(5,7,15,.74)'; ctx.fillRect(0, 0, W, H);
  const T = TEAMS[winner];
  const pulse = 1 + Math.sin(phaseT * 5) * 0.03;
  ctx.save(); ctx.translate(W / 2, 360); ctx.scale(pulse, pulse);
  const title = winner === 'draw' ? 'DRAW!' : (T ? T.name + ' TEAM WINS!' : (String(winner).includes('WAVE') ? winner : winner + ' COMPLETE!'));
  const col = winner === 'draw' ? '#fff' : (T ? T.color : '#ffd23f');
  txt(title, 0, 0, '900 92px Segoe UI, Arial', col, 'center');
  ctx.restore();
  if (mvp) {
    txt('⭐ MVP ⭐', W / 2, 480, '800 44px Segoe UI, Arial', '#ffd23f', 'center');
    txt(mvp.nickname, W / 2, 550, '800 64px Segoe UI, Arial', '#fff', 'center');
    txt('💎 ' + mvp.diamonds + ' pts', W / 2, 610, '600 34px Segoe UI, Arial', '#9cc9ff', 'center');
  }
  txt('Next round starts in ' + Math.max(0, Math.ceil(10 - phaseT)) + 's...', W / 2, 720, '600 30px Segoe UI, Arial', '#c8cfe8', 'center');
}

function drawBackdrop25D() {
  if (!IS_BG) return;
  // 2-layer distant silhouette spires/mountains
  ctx.fillStyle = 'rgba(14, 20, 42, 0.72)';
  ctx.beginPath(); ctx.moveTo(0, 620);
  for (let x = 0; x <= W; x += 160) ctx.lineTo(x, 470 + Math.sin(x * 0.008) * 70 + Math.cos(x * 0.02) * 35);
  ctx.lineTo(W, 650); ctx.lineTo(0, 650); ctx.closePath(); ctx.fill();

  // Exponential 2.5D perspective grid floor
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.11)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 8; i++) {
    const p = Math.pow(i / 8, 2);
    const y = 630 + p * (H - 630);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let gx = -4; gx <= 12; gx++) {
    const xTop = W / 2 + (gx - 4) * 140;
    const xBot = W / 2 + (gx - 4) * 360;
    ctx.beginPath(); ctx.moveTo(xTop, 630); ctx.lineTo(xBot, H); ctx.stroke();
  }
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  drawBackdrop25D();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  const mode = settings.gameMode || 'arena';
  if (mode === 'arena') drawArenaScene();
  else if (window.OverlayModes && window.OverlayModes[mode]) window.OverlayModes[mode].draw(E_SHARED);

  // Ambient drifting embers
  for (let i = 0; i < EMBERS.length; i++) {
    const e = EMBERS[i];
    ctx.globalAlpha = e.a; ctx.fillStyle = e.c;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (let i = 0; i < P.length; i++) {
    const p = P[i]; if (!p.a) continue;
    ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); ctx.fillStyle = p.c;
    if (p.kind === 1) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
    else ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < FT.length; i++) {
    const f = FT[i]; if (!f.a) continue;
    ctx.globalAlpha = Math.min(1, (1 - f.t) * 2);
    const s = f.t < 0.15 ? 0.6 + f.t / 0.15 * 0.6 : 1.2 - Math.min(0.2, (f.t - 0.15) * 0.3);
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(s, s);
    txt(f.txt, 0, 0, '800 ' + f.sz + 'px Segoe UI, Arial', f.c, 'center'); ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (vigInt > 0.01) {
    const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.65);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(${vigCol},${Math.min(0.65, vigInt)})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  if (mode !== 'boss') drawTimer();
  drawAlert();
  if (phase === 'end') drawEnd();
  if (Q.get('debug') === '1') txt('units: ' + unitCount + ' mode: ' + mode + ' fps: ' + fps, 10, H - 10, '600 16px monospace', '#0f0', 'left');
}

let last = performance.now(), fps = 0, fc = 0, ft = 0;
function loop(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1;
  fc++; ft += dt; if (ft >= 1) { fps = fc; fc = 0; ft = 0; }
  update(dt); draw();
  requestAnimationFrame(loop);
}

/* ---------- socket ---------- */
function applySettings(s) {
  if (!s) return;
  const hpChanged = s.castleHp && s.castleHp !== settings.castleHp;
  const nextMode = VALID_MODES.includes(URL_MODE) ? URL_MODE : (VALID_MODES.includes(s.gameMode) ? s.gameMode : settings.gameMode);
  const nextSub = VALID_SUBMODES.includes(URL_SUBMODE) ? URL_SUBMODE : (VALID_SUBMODES.includes(s.arenaSubMode) ? s.arenaSubMode : settings.arenaSubMode);
  const modeChanged = nextMode !== settings.gameMode || nextSub !== settings.arenaSubMode;
  settings = Object.assign(settings, s, { gameMode: nextMode, arenaSubMode: nextSub });
  window.__arenaSettings = settings;
  if (modeChanged || (hpChanged && phase === 'play' && unitCount === 0)) resetRound(false);
}

if (typeof io !== 'undefined' && !MOCK) {
  socket = io();
  socket.on('settings', applySettings);
  socket.on('game:mode', (m) => {
    if (!m) return;
    if (!URL_MODE && VALID_MODES.includes(m.gameMode)) settings.gameMode = m.gameMode;
    if (!URL_SUBMODE && VALID_SUBMODES.includes(m.arenaSubMode)) settings.arenaSubMode = m.arenaSubMode;
    resetRound(false);
  });
  socket.on('action', handleAction);
  socket.on('tiktok:event', (ev) => {
    if (ev && ev.user && ev.type === 'chat') getUser(ev);
  });
  socket.on('game:reset', () => { resetRound(true); });
}
resetRound(false);

/* ---------- mock (?mock=1) ---------- */
if (MOCK) {
  const names = ['Alex', 'Maya', 'Liam', 'Zoe', 'Noah', 'Aria', 'Leo', 'Chloe', 'Kai', 'Nora', 'Ezra', 'Ivy'];
  let n = 0;
  function fireMock() {
    const nm = names[n++ % names.length] + (n % 5 ? (n % 5) : '');
    const dm = n % 12 === 0 ? 500 : (n % 7 === 0 ? 120 : (n % 3 === 0 ? 20 : 5));
    const ev = { user: { uniqueId: nm.toLowerCase(), nickname: nm, avatar: '' }, gift: { name: dm >= 500 ? 'Money Gun' : (dm >= 100 ? 'Hand Hearts' : 'Rose'), diamonds: dm, count: 1 } };
    if (n % 2 === 0) handleAction({ event: ev, action: { type: 'join', team: 'auto' } });
    handleAction({ event: ev, action: { type: 'spawn', units: Math.min(50, 3 + (n * 7) % 15) } });
    if (n % 6 === 0) handleAction({ event: ev, action: { type: 'alert', text: nm + ' sent ' + ev.gift.name + '!', style: dm >= 100 ? 'big' : 'gift' } });
    if (n % 12 === 0) { handleAction({ event: ev, action: { type: 'confetti' } }); handleAction({ event: ev, action: { type: 'boost', power: 50, team: 'red' } }); }
  }
  for (let i = 0; i < 10; i++) fireMock();
  setInterval(fireMock, 320);
}
requestAnimationFrame(loop);
window.__game = { units, castle, handleAction };
})();
