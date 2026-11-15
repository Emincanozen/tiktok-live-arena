'use strict';
// Rules engine: event -> list of actions (with cooldowns, like thresholds, templating).
const crypto = require('crypto');

const DEFAULT_RULES = [
  { id: 'join-red', name: 'Join Red Team (1)', enabled: true, cooldownMs: 0,
    trigger: { type: 'chat', match: '1', mode: 'equals' },
    actions: [{ type: 'join', team: 'red' }] },
  { id: 'join-red-word', name: 'Join Red Team (red)', enabled: true, cooldownMs: 0,
    trigger: { type: 'chat', match: 'red', mode: 'equals' },
    actions: [{ type: 'join', team: 'red' }] },
  { id: 'join-red-tr', name: 'Join Red Team (kırmızı)', enabled: true, cooldownMs: 0,
    trigger: { type: 'chat', match: 'kırmızı', mode: 'equals' },
    actions: [{ type: 'join', team: 'red' }] },
  { id: 'join-blue', name: 'Join Blue Team (2)', enabled: true, cooldownMs: 0,
    trigger: { type: 'chat', match: '2', mode: 'equals' },
    actions: [{ type: 'join', team: 'blue' }] },
  { id: 'join-blue-word', name: 'Join Blue Team (blue)', enabled: true, cooldownMs: 0,
    trigger: { type: 'chat', match: 'blue', mode: 'equals' },
    actions: [{ type: 'join', team: 'blue' }] },
  { id: 'join-blue-tr', name: 'Join Blue Team (mavi)', enabled: true, cooldownMs: 0,
    trigger: { type: 'chat', match: 'mavi', mode: 'equals' },
    actions: [{ type: 'join', team: 'blue' }] },
  { id: 'gift-any', name: 'Any Gift = Spawn Units', enabled: true, cooldownMs: 0,
    trigger: { type: 'gift', giftName: '*', minDiamonds: 1 },
    actions: [
      { type: 'spawn', units: 'diamonds' },
      { type: 'alert', text: '{nickname} sent {giftName} x{count} (+{diamonds}💎)!', style: 'gift' },
      { type: 'sound', name: 'coin' },
    ] },
  { id: 'gift-100', name: 'Big Gift (100+ Diamonds)', enabled: true, cooldownMs: 0,
    trigger: { type: 'gift', giftName: '*', minDiamonds: 100 },
    actions: [
      { type: 'alert', text: '🔥 {nickname} unleashed {giftName} x{count}!', style: 'big' },
      { type: 'confetti' },
      { type: 'tts', text: '{nickname} sent {giftName}!' },
    ] },
  { id: 'gift-500', name: 'Mega Gift (500+ Diamonds)', enabled: true, cooldownMs: 0,
    trigger: { type: 'gift', giftName: '*', minDiamonds: 500 },
    actions: [
      { type: 'boost', power: 50 },
      { type: 'sound', name: 'horn' },
    ] },
  { id: 'like-100', name: 'Every 100 Likes = 1 Unit', enabled: true, cooldownMs: 0,
    trigger: { type: 'like', every: 100 },
    actions: [{ type: 'spawn', units: 1 }] },
  { id: 'follow', name: 'Follow = 3 Units', enabled: true, cooldownMs: 0,
    trigger: { type: 'follow' },
    actions: [
      { type: 'spawn', units: 3 },
      { type: 'alert', text: '{nickname} joined the arena!', style: 'follow' },
    ] },
  { id: 'share', name: 'Share = 2 Units', enabled: true, cooldownMs: 0,
    trigger: { type: 'share' },
    actions: [{ type: 'spawn', units: 2 }] },
  { id: 'member', name: 'Member Join (disabled)', enabled: false, cooldownMs: 0,
    trigger: { type: 'member' },
    actions: [] },
];

const TRIGGER_TYPES = ['gift', 'like', 'chat', 'follow', 'share', 'member', 'subscribe'];
const ACTION_TYPES = ['spawn', 'join', 'alert', 'tts', 'confetti', 'boost', 'sound', 'keypress'];

function uid() {
  return crypto.randomBytes(6).toString('hex');
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Validate/normalize rules coming from the dashboard. */
function sanitizeRules(input) {
  if (!Array.isArray(input)) return null;
  return input
    .filter((r) => r && r.trigger && TRIGGER_TYPES.includes(r.trigger.type))
    .map((r) => ({
      id: String(r.id || uid()),
      name: String(r.name || 'Rule'),
      enabled: r.enabled !== false,
      cooldownMs: Math.max(0, Number(r.cooldownMs) || 0),
      trigger: r.trigger,
      actions: (Array.isArray(r.actions) ? r.actions : []).filter((a) => a && ACTION_TYPES.includes(a.type)),
    }));
}

function template(text, ev) {
  const g = ev.gift || {};
  const vars = {
    nickname: ev.user.nickname,
    uniqueId: ev.user.uniqueId,
    giftName: g.name || '',
    count: g.count != null ? g.count : '',
    diamonds: g.diamonds != null ? g.diamonds * (g.count || 1) : '',
    comment: ev.comment || '',
    likeCount: ev.likeCount != null ? ev.likeCount : '',
  };
  return String(text == null ? '' : text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function chatMatches(trigger, comment) {
  const m = String(trigger.match == null ? '' : trigger.match).trim().toLowerCase();
  const c = String(comment || '').trim().toLowerCase();
  if (!m) return false;
  switch (trigger.mode) {
    case 'contains': return c.includes(m);
    case 'startsWith': return c.startsWith(m);
    default: return c === m;
  }
}

class RulesEngine {
  /** @param {() => object[]} getRules */
  constructor(getRules) {
    this.getRules = getRules;
    this.lastFired = new Map(); // ruleId -> ts
    this.likeTotals = new Map(); // uniqueId -> cumulative likes
  }

  reset() {
    this.lastFired.clear();
    this.likeTotals.clear();
  }

  /** @returns {{ruleId:string, action:object}[]} resolved, templated actions */
  process(ev) {
    let likeBefore = 0;
    let likeAfter = 0;
    if (ev.type === 'like') {
      likeBefore = this.likeTotals.get(ev.user.uniqueId) || 0;
      likeAfter = likeBefore + (ev.likeCount || 1);
      this.likeTotals.set(ev.user.uniqueId, likeAfter);
    }

    const out = [];
    for (const rule of this.getRules()) {
      if (!rule.enabled || !rule.trigger || rule.trigger.type !== ev.type) continue;
      let times = 1;
      if (!this._matches(rule.trigger, ev)) {
        if (ev.type !== 'like') continue;
      }
      if (ev.type === 'like') {
        const every = Math.max(1, Number(rule.trigger.every) || 100);
        times = clamp(Math.floor(likeAfter / every) - Math.floor(likeBefore / every), 0, 5);
        if (!times) continue;
      }
      const now = Date.now();
      if (rule.cooldownMs > 0 && now - (this.lastFired.get(rule.id) || 0) < rule.cooldownMs) continue;
      this.lastFired.set(rule.id, now);
      for (let i = 0; i < times; i++) {
        for (const a of rule.actions || []) out.push({ ruleId: rule.id, action: this._resolve(a, ev) });
      }
    }
    return out;
  }

  _matches(t, ev) {
    switch (t.type) {
      case 'gift': {
        if (!ev.gift) return false;
        if (t.giftName && t.giftName !== '*' && t.giftName.toLowerCase() !== String(ev.gift.name).toLowerCase()) return false;
        return ev.gift.diamonds * ev.gift.count >= (Number(t.minDiamonds) || 0);
      }
      case 'chat': return chatMatches(t, ev.comment);
      default: return true;
    }
  }

  _resolve(a, ev) {
    const r = Object.assign({}, a);
    if (a.type === 'spawn') {
      if (a.units === 'diamonds') {
        const g = ev.gift;
        r.units = clamp(g ? g.diamonds * g.count : 1, 1, 50);
      } else r.units = clamp(Math.round(Number(a.units) || 1), 1, 50);
    }
    if (a.type === 'alert' || a.type === 'tts') r.text = template(a.text, ev);
    if (a.type === 'boost') r.power = Number(a.power) || 10;
    if (a.type === 'keypress') r.keys = template(a.keys, ev);
    return r;
  }
}

module.exports = { RulesEngine, DEFAULT_RULES, sanitizeRules, template };
