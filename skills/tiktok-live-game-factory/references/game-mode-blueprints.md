# Game Mode Technical Blueprints & Wiring Guide

## 1. Archetype Blueprints

| Mode | Core State | Primary `onAction` Hooks | Win / Round Loop |
| :--- | :--- | :--- | :--- |
| `arena` | `soldiers[]`, `TEAMS.red/blue` HP, `maxRedX`/`minBlueX` barriers | `join` -> assign team; `spawn` -> spawn units; `boost` -> heal/buff | Castle HP reaches 0 or `roundSeconds` expires |
| `balls` | `balls[]`, `ringAngle`, `gapAngle`, `obstacles[]` | `spawn`/`join` -> spawn named ball; `boost` -> Mega Ball + shatter | Continuous or timer round; tracks escapes & score |
| `halay` | `dancers[]`, `leaderId`, `bpm`, `stepPhase` | `join`/`spawn` -> join chain + raise BPM; `boost` -> fireworks/leader | Continuous party energy & top gifter crown |
| `music` | `orbs[]`, `tracks` (Lead/Bass/Arp/Beat), `combo`, `bpm` | `spawn` -> drop instrument orbs; `boost` -> Maestro Overdrive | Continuous track + combo multiplier |
| `boss` | `boss` (HP, phase, shield), `heroes[]`, `projectiles[]` | `spawn` -> summon hero; `boost` -> Meteor/Laser/Shield | Boss HP = 0 -> crowns Raid MVP & levels up Titan |
| `monster` | `survivors[]`, `monster` (owner, rage, trail), `snipes[]` | `1-99💎` -> Dash+Shield/Revive; `100+💎` -> Monster Takeover; `500+💎`/`boost` -> `@name` Snipe | Survival score + bounty MVP |

---

## 2. Custom `OverlayModes.<slug>` Boilerplate

```js
(function () {
  'use strict';
  window.OverlayModes = window.OverlayModes || {};

  window.OverlayModes.my_mode = (function () {
    let entities = [];
    let score = 0;

    function reset(clear) {
      entities = [];
      if (clear) score = 0;
    }

    function onAction(E, a, ev, u) {
      const dm = (ev.gift && ev.gift.diamonds ? ev.gift.diamonds : 0) * (ev.gift && ev.gift.count ? ev.gift.count : 1);
      if (a.type === 'spawn' || a.type === 'join') {
        const name = (u && u.nickname) || 'Viewer';
        entities.push({
          x: 200 + Math.random() * (E.W - 400),
          y: 220 + Math.random() * (E.H - 420),
          r: dm >= 100 ? 34 : 20,
          name,
          avatar: (u && u.avatar) || '',
          col: '#00e5ff',
        });
        E.tone(523.25, 0.08, 'triangle', 0.12);
      } else if (a.type === 'boost') {
        score += a.power || 50;
        E.addShake(12);
        E.confetti();
      }
    }

    function update(E, dt, roundTime) {
      // 60 FPS state updates
    }

    function draw(E) {
      const ctx = E.ctx;
      for (const e of entities) {
        E.drawAvatar(e.x, e.y, e.r, e.avatar, e.name, e.col);
        E.txt(e.name, e.x, e.y + e.r + 22, '700 16px Segoe UI, Arial', '#fff', 'center');
      }
      E.txt('SCORE: ' + score, E.W / 2, 70, '800 32px Segoe UI, Arial', '#ffd23f', 'center');
    }

    return { reset, onAction, update, draw };
  })();
})();
```

---

## 3. Wiring Checklist for a New Mode (`<slug>`)

1. **Backend (`src/store.js`):** Add `'<slug>'` to `GAME_MODES`.
2. **Overlay Engine (`public/js/overlay.js`):** Add `'<slug>'` to `VALID_MODES`.
3. **Overlay HTML (`public/overlay.html`):** Include `<script src="/js/mode-<slug>.js"></script>` after `overlay-modes.js` (or add the module inside `overlay-modes.js`).
4. **Dashboard HTML (`public/dashboard.html`):** Add a `<button type="button" class="mode-card" data-mode="<slug>">` inside `#modeGrid`.
5. **Smoke Test (`tests/smoke.js`):** Add `{ gameMode: '<slug>' }` to `modeCases` and run `npm test`.
