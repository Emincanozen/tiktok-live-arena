'use strict';
// Event factory + simulator. Events go through the SAME pipeline as live ones (via the emit callback).
const crypto = require('crypto');
const { GIFTS, findGift } = require('./gifts');

const FIRST = [
  'Alex', 'Liam', 'Sophia', 'Maya', 'Noah', 'Aria', 'Kai', 'Luna', 'Leo', 'Zoe',
  'Milo', 'Chloe', 'Ethan', 'Nora', 'Owen', 'Ivy', 'Lucas', 'Ruby', 'Mason', 'Ella',
  'Eli', 'Hazel', 'Ezra', 'Nova', 'Caleb', 'Jade', 'Max', 'Iris', 'Finn', 'Aura',
  'Axel', 'Skye', 'Julian', 'Clara', 'Roman', 'Freya', 'Soren', 'Mila', 'Dante', 'Kira',
];
const TAGS = ['', '', '_gg', '_tv', '99', '_live', 'official', '_pro', 'xx', '01', '777', '_', '.play', '42', 'king', 'queen', 'fx'];
const COMMENTS = [
  'hello everyone!', 'let\'s go!!', 'how is everyone?', 'so cool', 'awesome stream 🔥',
  'who is winning?', 'red team!', 'blue team is strong', 'just sent a gift', 'gg wp',
  'keep it up 👏', 'just joined!', 'amazing', 'followed!', 'when does round end?',
  'hahaha', 'epic game', 'push forward!', '❤️❤️❤️',
];

function rnd(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rnd(arr.length)]; }
function id() { return crypto.randomBytes(8).toString('hex'); }

function toAscii(s) {
  return s.toLowerCase().replace(/[^a-z0-9._]/g, '');
}

function randomUser() {
  const name = pick(FIRST);
  const tag = pick(TAGS);
  const uniqueId = toAscii(name) + tag.toLowerCase() + (rnd(3) === 0 ? rnd(99) : '');
  const nickname = rnd(3) === 0 ? name + ' ' + pick(['🔥', '👑', '⚡', '🦁', '🐺', '⭐']) : name + tag.replace(/^_/, ' ').trim();
  return { uniqueId, nickname: nickname.trim(), avatar: '' };
}

/** Build a normalized event. `partial` may hold type, user, gift, likeCount, comment. */
function makeEvent(source, partial) {
  const type = partial.type;
  const user = Object.assign({ uniqueId: '', nickname: '', avatar: '' }, partial.user || {});
  if (!user.uniqueId) user.uniqueId = toAscii(user.nickname) || 'guest';
  if (!user.nickname) user.nickname = user.uniqueId;
  const ev = { id: id(), type, source, ts: Date.now(), user };
  if (type === 'gift') ev.gift = Object.assign({ id: 0, name: 'Rose', diamonds: 1, count: 1, image: '' }, partial.gift);
  if (type === 'like') ev.likeCount = Math.max(1, Number(partial.likeCount) || 1);
  if (type === 'chat') ev.comment = String(partial.comment == null ? '' : partial.comment);
  return ev;
}

/** From a `test:event` payload. */
function fromTestPayload(p = {}) {
  const type = ['gift', 'like', 'chat', 'follow', 'share', 'member', 'subscribe'].includes(p.type) ? p.type : 'chat';
  const partial = { type, user: { nickname: p.nickname || undefined, uniqueId: p.uniqueId || undefined } };
  if (!partial.user.nickname && !partial.user.uniqueId) partial.user = randomUser();
  if (type === 'gift') {
    const g = findGift(p.giftName) || { name: p.giftName || 'Rose', diamonds: Number(p.diamonds) || 1 };
    partial.gift = { id: GIFTS.indexOf(g) + 1, name: g.name, diamonds: g.diamonds, count: Math.max(1, Number(p.count) || 1), image: g.image || '' };
  }
  if (type === 'like') partial.likeCount = Number(p.likeCount) || 1;
  if (type === 'chat') partial.comment = p.comment || '';
  return makeEvent('manual', partial);
}

const RATES = { low: 2500, mid: 800, high: 200 }; // avg ms between events

function randomEvent(pool) {
  const user = pick(pool);
  const r = Math.random();
  if (r < 0.38) {
    const c = rnd(10);
    const comment = c < 3 ? '1' : c < 5 ? '2' : c === 5 ? 'red' : c === 6 ? 'blue' : pick(COMMENTS);
    return makeEvent('sim', { type: 'chat', user, comment });
  }
  if (r < 0.68) return makeEvent('sim', { type: 'like', user, likeCount: 1 + rnd(25) });
  if (r < 0.84) {
    const idx = Math.min(GIFTS.length - 1, Math.floor(Math.pow(Math.random(), 2.2) * GIFTS.length));
    const g = GIFTS[idx];
    const count = g.diamonds <= 5 ? 1 + rnd(10) : g.diamonds <= 30 ? 1 + rnd(3) : 1;
    return makeEvent('sim', { type: 'gift', user, gift: { id: idx + 1, name: g.name, diamonds: g.diamonds, count, image: '' } });
  }
  if (r < 0.90) return makeEvent('sim', { type: 'follow', user });
  if (r < 0.94) return makeEvent('sim', { type: 'share', user });
  return makeEvent('sim', { type: 'member', user });
}

class Simulator {
  constructor(emit) {
    this.emit = emit;
    this.timer = null;
    this.rate = null;
    this.pool = [];
  }

  get running() { return !!this.timer; }

  start(rate) {
    this.stop();
    this.rate = RATES[rate] ? rate : 'mid';
    const seen = new Set();
    this.pool = [];
    while (this.pool.length < 60) {
      const u = randomUser();
      if (!seen.has(u.uniqueId)) { seen.add(u.uniqueId); this.pool.push(u); }
    }
    const tick = () => {
      try { this.emit(randomEvent(this.pool)); } catch (e) { console.error('[sim]', e); }
      const avg = RATES[this.rate];
      this.timer = setTimeout(tick, avg * (0.5 + Math.random()));
    };
    this.timer = setTimeout(tick, 200);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = { Simulator, makeEvent, fromTestPayload, randomUser, RATES };
