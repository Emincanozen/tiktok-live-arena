---
name: tiktok-live-game-factory
description: Scaffolds, extends, and exports interactive TikTok LIVE Canvas overlay games and monetization suites built on TikTok Live Arena (6 archetypes: arena, balls, halay, music, boss, monster). Use when creating new TikTok LIVE game modes, tuning gift-to-action rules, or exporting a standalone interactive stream project.
---

# TikTok Live Game Factory

A reusable skill and CLI generator for building 60 FPS interactive **TikTok LIVE** overlay games (compatible with OBS Studio and TikTok LIVE Studio Browser Sources) powered by **Node.js**, **Express 5**, **Socket.IO 4**, and `tiktok-live-connector`.

Installable via `npx skills add Emincanozen/tiktok-live-arena` or by copying `skills/tiktok-live-game-factory/` into a global skills folder (`~/.gemini/config/skills/` or `~/.agents/skills/`).

---

## 1. System Architecture

Events flow through a single normalized pipeline regardless of whether they originate from a live TikTok stream, the built-in simulator, or manual dashboard test buttons:

```text
TikTok LIVE / Simulator / Manual Test
   │
   ▼  (src/tiktok.js | src/simulator.js)
Normalized Event: `tiktok:event`
   │  { id, type, source, ts, user: { uniqueId, nickname, avatar }, gift?, likeCount?, comment? }
   ▼
Rules Engine (src/rules.js -> data/rules.json)
   │  Matches gift/like/chat/follow/share/member/subscribe + cooldowns + templating
   ▼
Socket.IO Broadcast: `action`
   │  { id, ruleId, event, action: { type, ... } }
   ▼
Canvas Overlay (public/js/overlay.js + public/js/overlay-modes.js)
   └─► Dispatches to active `OverlayModes[mode]` (or built-in `arena` engine)
```

---

## 2. `E_SHARED` Overlay API (`public/js/overlay.js`)

Every custom mode registered on `window.OverlayModes.<slug>` receives `E` (`E_SHARED`) in `onAction(E, a, ev, u)`, `update(E, dt, roundTime)`, and `draw(E)`:

| Property / Method | Signature / Type | Purpose |
| :--- | :--- | :--- |
| `W`, `H` | `1920`, `1080` | Fixed 16:9 canvas coordinate space |
| `ctx` | `CanvasRenderingContext2D` | Main 2D rendering context |
| `txt` | `(s, x, y, font, fill, align, stroke)` | Outlined crisp HUD/label text |
| `rr` | `(x, y, w, h, r)` | Rounded rectangle path helper |
| `part` | `(x, y, vx, vy, col, life, size)` | Spawn single particle |
| `burst` | `(x, y, col, count, speed)` | Radial particle burst |
| `floatText` | `(x, y, text, col, size)` | Rising floating damage/callout text |
| `confetti` | `()` | Full-screen celebration confetti |
| `tone` | `(freq, dur, type, vol, slide)` | Zero-latency WebAudio oscillator note |
| `noise` | `(dur, vol)` | WebAudio percussive noise burst |
| `sfx` | `(name)` | Built-in SFX (`'coin'`, `'horn'`, `'boom'`, `'join'`) |
| `getAvatar` | `(url)` | Cached `HTMLImageElement` loader |
| `drawAvatar` | `(x, y, r, url, name, borderCol)` | Circular-clipped avatar with neon ring + initial badge fallback |
| `fmtTime` | `(seconds)` | Format `M:SS` countdown timer |
| `pushAlert` | `(text, style)` | Queue top-center alert banner (`'gift'`, `'follow'`, `'big'`) |
| `addShake` | `(amount)` | Trigger screen shake |
| `endRound` | `(winner, customMvp)` | End round, show MVP screen, emit `game:result`, auto-restart |

---

## 3. Six Built-In Game Archetypes

1. **`arena` — Castle Siege** (`frontline`, `lanes`, `tug`): Red vs. Blue armies with frontline barrier physics (`maxRedX` / `minBlueX`) and Y-homing so 300v300 armies clash head-on without slipping past.
2. **`balls` — Chaos Ball Ring**: Rotating neon ring with gap/obstacle physics; gifts scale ball size/trail and trigger harmonic WebAudio scale notes on bounce.
3. **`halay` — Live Halay & Dance Party**: Curved hand-holding avatar dance chain; top gifter becomes the crowned **Halay Leader** (`mendil`), raising BPM and accelerating a synthesized folk-synth loop.
4. **`music` — Synth Maestro & Note Rush**: Center-stage animated musician with a 48-bar radial visualizer; viewer events drop Lead/Bass/Arp/Beat orbs into target rings.
5. **`boss` — Titan Boss Raid**: Co-op battle against a multi-phase animated Titan Boss; gifts summon heroes and unleash Meteor Strikes, Lasers, and Team Shields.
6. **`monster` — Monster Hunt**: Psychological chase arena with proximity danger rings (`1–99💎` Turbo Dash + Shield / Revive), `100–499💎` **Become the Monster** takeover & dethroning, and `500+💎` **Targeted Snipe** via `@name` / `kill name` chat commands.

---

## 4. Psychological Gift-Ladder & EU/France Compliance

Design gift tiers as a **€0.01–€5+ engagement ladder**:
- **Micro-Tier (€0.01–€0.50 / 1–49💎) — Loss Aversion & Momentum:** Instant survival dashes, shields, revives, extra soldiers, or combo nudges.
- **Mid-Tier (€1–€3 / 100–499💎) — Power Fantasy & Status:** Crowned **Monster Takeover**, **Halay Leader**, or **Maestro Overdrive** with prominent circular avatar visibility.
- **Mega-Tier (€5+ / 500+💎) — Social Sniping & Room Dominance:** Targeted `@name` elimination strikes, Meteor/Laser finishers, TTS shoutouts, and confetti.
- **EU / France Compliance (ARCOM / ANJ / EU DSA):** Reward viewers exclusively with **in-game entertainment, visual status, and interactive power**—never cash prizes, raffles, or real-money payouts—to stay outside gambling/lottery regulations.

---

## 5. Step-by-Step Workflow

### List Built-In Archetypes
```bash
node skills/tiktok-live-game-factory/scripts/create-game-mode.js --list
```

### Scaffold a New Game Mode
```bash
node skills/tiktok-live-game-factory/scripts/create-game-mode.js --scaffold-mode laser-tag --title "Laser Tag Arena" --out public/js/mode-laser-tag.js
```
Then wire `<slug>` in `src/store.js` (`GAME_MODES`), `public/js/overlay.js` (`VALID_MODES`), `public/dashboard.html` (`#modeGrid`), and `public/overlay.html` (`<script>` tag). See `references/game-mode-blueprints.md` for the exact checklist.

### Export a Standalone Project
```bash
node skills/tiktok-live-game-factory/scripts/create-game-mode.js --export ../my-tiktok-game --modes arena,monster
```
Copies the core platform (`server.js`, `src/`, `public/`, `package.json`, `.env.example`, `.gitignore`, `LICENSE`, `start.bat`, `README.md`), excludes `node_modules/`, `.git/`, `data/*.json`, and `skills/`, sets the default `gameMode`, and customizes the exported `README.md`.
