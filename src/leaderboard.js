'use strict';
const store = require('./store');

class Leaderboard {
  constructor() {
    this.users = new Map();
    const saved = store.readJson('leaderboard.json', []);
    for (const u of Array.isArray(saved) ? saved : []) if (u && u.uniqueId) this.users.set(u.uniqueId, u);
    this._timer = null;
  }

  add(event) {
    const u = event.user;
    if (!u || !u.uniqueId) return;
    let row = this.users.get(u.uniqueId);
    if (!row) {
      row = { uniqueId: u.uniqueId, nickname: u.nickname || u.uniqueId, avatar: u.avatar || '', diamonds: 0, gifts: 0, likes: 0 };
      this.users.set(u.uniqueId, row);
    }
    if (u.nickname) row.nickname = u.nickname;
    if (u.avatar) row.avatar = u.avatar;
    if (event.type === 'gift' && event.gift) {
      row.diamonds += event.gift.diamonds * event.gift.count;
      row.gifts += event.gift.count;
    } else if (event.type === 'like') {
      row.likes += event.likeCount || 1;
    } else return false;
    this._scheduleSave();
    return true;
  }

  top(n = 20) {
    return [...this.users.values()]
      .filter((r) => r.diamonds > 0 || r.likes > 0)
      .sort((a, b) => b.diamonds - a.diamonds || b.likes - a.likes)
      .slice(0, n);
  }

  clear() {
    this.users.clear();
    this._scheduleSave();
  }

  _scheduleSave() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.flush();
    }, 2000);
    this._timer.unref();
  }

  flush() {
    store.writeJson('leaderboard.json', [...this.users.values()]);
  }
}

module.exports = Leaderboard;
