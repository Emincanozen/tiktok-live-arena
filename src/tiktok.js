'use strict';
// TikTok LIVE connection manager (tiktok-live-connector 2.5.0).
const lib = require('tiktok-live-connector');
const { makeEvent } = require('./simulator');

const { TikTokLiveConnection, WebcastEvent, ControlEvent } = lib;

function str(v) { return v == null ? '' : String(v); }

function avatarOf(u) {
  const img = u && (u.avatarThumb || u.avatarMedium || u.avatarLarge);
  return (img && img.urlList && img.urlList[0]) || '';
}

function userOf(u) {
  u = u || {};
  const uniqueId = str(u.uniqueId || u.displayId || u.nickname || u.nickName || u.id);
  return { uniqueId, nickname: str(u.nickname || u.nickName || uniqueId), avatar: avatarOf(u) };
}

/** Translate a library/network error into a clean English message. Returns {message, retry, delayMs, code}. */
function describeError(err, username) {
  const name = (err && err.constructor && err.constructor.name) || '';
  const raw = str(err && (err.message || err.reason || err)).slice(0, 300);
  const low = raw.toLowerCase();
  const cause = err && err.exception ? str(err.exception.message || err.exception) : '';
  const full = low + ' ' + cause.toLowerCase();
  const has = (...k) => k.some((x) => full.includes(x));

  if (name === 'UserOfflineError' || has('offline', 'not live', 'is not currently live', 'user_not_found', "isn't online")) {
    return { message: `@${username} is currently offline. Waiting to auto-connect when live...`, retry: true, delayMs: 30000, code: 'offline' };
  }
  if (name === 'InvalidUniqueIdError' || has('invalid uniqueid', "'uniqueid'")) {
    return { message: 'Invalid username. Please check the TikTok username (without @).', retry: false, code: 'invalid' };
  }
  if (name === 'AlreadyConnectedError' || name === 'AlreadyConnectingError') {
    return { message: 'Already connected or connecting.', retry: false, code: 'already' };
  }
  if (name === 'SignatureRateLimitError' || has('rate limit', '429', 'too many requests')) {
    return { message: 'Signature server rate limit reached. Add an Euler Stream signApiKey in Settings or wait a few minutes.', retry: true, delayMs: 60000, code: 'ratelimit' };
  }
  if (name === 'PremiumFeatureError' || name === 'AuthenticatedWebSocketConnectionError') {
    return { message: 'This feature requires an Euler Stream (signApiKey) premium plan.', retry: false, code: 'premium' };
  }
  if (name === 'SignAPIError' || name === 'SignatureMissingTokensError' || has('sign server', 'signature', 'euler', 'api key', 'apikey', '401', '403')) {
    return { message: 'Signature server unreachable or rejected. Try adding a valid Euler Stream signApiKey in Settings.', retry: true, delayMs: 30000, code: 'sign' };
  }
  if (name === 'ConnectTimeoutError' || has('timeout', 'timed out', 'etimedout')) {
    return { message: 'Connection timed out. Please check your internet connection.', retry: true, delayMs: 10000, code: 'timeout' };
  }
  if (has('enotfound', 'econnrefused', 'econnreset', 'network', 'getaddrinfo', 'fetch failed')) {
    return { message: 'Network error: unable to reach TikTok. Please check your internet connection.', retry: true, delayMs: 10000, code: 'network' };
  }
  if (name === 'InvalidResponseCompositeError' || name === 'InvalidResponseError' || has('room id', 'roomid', 'invalid response')) {
    return { message: `@${username} room info could not be retrieved (user not found, offline, or request blocked).`, retry: true, delayMs: 30000, code: 'room' };
  }
  return { message: `Connection error: ${raw || 'unknown error'}`, retry: true, delayMs: 15000, code: 'unknown' };
}

class TikTokManager {
  /**
   * @param {object} o
   * @param {(ev:object)=>void} o.onEvent normalized event sink
   * @param {(patch:object)=>void} o.onStatus status patch sink
   * @param {()=>object} o.getSettings
   */
  constructor({ onEvent, onStatus, getSettings }) {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.getSettings = getSettings;
    this.conn = null;
    this.username = '';
    this.wantConnected = false;
    this.attempt = 0;
    this.retryTimer = null;
    this.gen = 0;
  }

  connect(username) {
    username = str(username).replace(/^https?:\/\/(www\.)?tiktok\.com\//, '').replace(/\/live.*$/, '').replace(/^@/, '').trim();
    if (!username) {
      this.onStatus({ mode: 'idle', error: 'Please enter a TikTok username.' });
      return;
    }
    this._teardown();
    this.username = username;
    this.wantConnected = true;
    this.attempt = 0;
    this._start();
  }

  disconnect() {
    this.wantConnected = false;
    this._teardown();
    this.onStatus({ mode: 'idle', roomId: '', viewerCount: 0, error: '' });
  }

  _teardown() {
    this.gen++;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const c = this.conn;
    this.conn = null;
    if (c) {
      try { c.removeAllListeners(); } catch (e) { /* ignore */ }
      c.on && c.on(ControlEvent.ERROR, () => {});
      try { c.disconnect(); } catch (e) { /* ignore */ }
    }
  }

  async _start() {
    const gen = ++this.gen;
    const username = this.username;
    const settings = this.getSettings();
    this.onStatus({ mode: 'connecting', username, roomId: '', viewerCount: 0, error: '' });

    const options = { processInitialData: false, enableExtendedGiftInfo: false };
    if (settings.signApiKey) options.signApiKey = settings.signApiKey;

    let conn;
    try {
      conn = new TikTokLiveConnection(username, options);
    } catch (e) {
      return this._fail(e, gen);
    }
    this.conn = conn;
    this._wire(conn, gen);

    try {
      const state = await conn.connect();
      if (gen !== this.gen) { try { conn.disconnect(); } catch (e) { /* ignore */ } return; }
      this.attempt = 0;
      const roomId = str((state && state.roomId) || conn.roomId);
      this.onStatus({ mode: 'live', username, roomId, error: '' });
    } catch (e) {
      if (gen !== this.gen) return;
      this._fail(e, gen);
    }
  }

  _fail(err, gen) {
    if (gen !== this.gen) return;
    const d = describeError(err, this.username);
    console.warn(`[tiktok] ${d.code}: ${str(err && err.message).slice(0, 200)}`);
    const c = this.conn;
    this.conn = null;
    if (c) { try { c.removeAllListeners(); c.on(ControlEvent.ERROR, () => {}); c.disconnect(); } catch (e) { /* ignore */ } }
    this._scheduleRetryOrIdle(d);
  }

  _scheduleRetryOrIdle(d) {
    const s = this.getSettings();
    if (this.wantConnected && s.autoReconnect && d.retry) {
      this.attempt++;
      const base = d.delayMs || 5000;
      const delay = Math.min(base * Math.min(this.attempt, 4), 120000);
      this.onStatus({ mode: 'connecting', error: `${d.message} (retrying in ${Math.round(delay / 1000)}s)`, viewerCount: 0 });
      this.retryTimer = setTimeout(() => this.wantConnected && this._start(), delay);
    } else {
      this.wantConnected = false;
      this.onStatus({ mode: 'idle', error: d.message, viewerCount: 0, roomId: '' });
    }
  }

  _wire(conn, gen) {
    const guard = (fn) => (data) => {
      if (gen !== this.gen) return;
      try { fn(data); } catch (e) { console.error('[tiktok] event error:', e); }
    };
    const emit = (partial) => this.onEvent(makeEvent('live', partial));

    conn.on(WebcastEvent.CHAT, guard((d) => emit({ type: 'chat', user: userOf(d.user), comment: str(d.comment || d.content) })));
    conn.on(WebcastEvent.LIKE, guard((d) => emit({ type: 'like', user: userOf(d.user), likeCount: Number(d.likeCount || d.count) || 1 })));
    conn.on(WebcastEvent.MEMBER, guard((d) => emit({ type: 'member', user: userOf(d.user) })));
    conn.on(WebcastEvent.FOLLOW, guard((d) => emit({ type: 'follow', user: userOf(d.user) })));
    conn.on(WebcastEvent.SHARE, guard((d) => emit({ type: 'share', user: userOf(d.user) })));
    if (WebcastEvent.SUB_NOTIFY) {
      conn.on(WebcastEvent.SUB_NOTIFY, guard((d) => emit({ type: 'subscribe', user: userOf(d.user) })));
    }

    conn.on(WebcastEvent.GIFT, guard((d) => {
      const g = d.giftDetails || d.gift || {};
      const streakable = (g.type === 1 || d.giftType === 1);
      if (streakable && !d.repeatEnd) return;
      const count = Math.max(1, Number(d.repeatCount || d.comboCount || d.groupCount) || 1);
      const image = (g.image && g.image.urlList && g.image.urlList[0]) || (g.icon && g.icon.urlList && g.icon.urlList[0]) || str(g.giftPictureUrl);
      emit({
        type: 'gift',
        user: userOf(d.user),
        gift: {
          id: Number(d.giftId || g.id) || 0,
          name: str(d.giftName || g.name || g.giftName || 'Gift'),
          diamonds: Number(g.diamondCount != null ? g.diamondCount : d.diamondCount) || 0,
          count,
          image,
        },
      });
    }));

    conn.on(WebcastEvent.ROOM_USER, guard((d) => {
      const n = Number(d.viewerCount != null ? d.viewerCount : d.totalUser != null ? d.totalUser : d.total);
      if (isFinite(n)) this.onStatus({ viewerCount: n });
    }));

    conn.on(WebcastEvent.STREAM_END, guard(() => {
      this.onStatus({ error: 'Stream ended.' });
      this._teardown();
      this._scheduleRetryOrIdle({ message: 'Stream ended.', retry: true, delayMs: 30000 });
    }));

    conn.on(ControlEvent.DISCONNECTED, guard((info) => {
      if (!this.wantConnected) return;
      const c = this.conn;
      this.conn = null;
      if (c) { try { c.removeAllListeners(); c.on(ControlEvent.ERROR, () => {}); } catch (e) { /* ignore */ } }
      this.gen++;
      this._scheduleRetryOrIdle({ message: 'Disconnected' + (info && info.reason ? ` (${info.reason})` : '') + '.', retry: true, delayMs: 5000 });
    }));

    conn.on(ControlEvent.ERROR, guard((e) => {
      console.warn('[tiktok] stream error:', str(e && (e.message || e.info || e.exception)).slice(0, 200));
    }));
  }
}

module.exports = { TikTokManager, describeError };
