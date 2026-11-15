# TikTok Live Arena — Interface Contract

Goal: An interactive TikTok LIVE streaming game suite & control platform (OBS / TikTok LIVE Studio Browser Source). Viewers send gifts, likes, comments, and follows; the server normalizes events, runs a configurable rules engine, and drives real-time multiplayer HTML5 Canvas overlay games.

Project layout: relative to repository root (no local filesystem paths or personal info anywhere in tracked files).
Stack: Node.js 18+ (CommonJS), Express 5, Socket.IO 4, `tiktok-live-connector` 2.5.0 (`TikTokLiveConnection`, `signApiKey`), vanilla HTML5 Canvas + CSS + JS (no external CDN dependencies; must work offline).
Default port: `3000` (`process.env.PORT` overrides).
- Control Dashboard: `http://localhost:3000/` (`dashboard.html`)
- Stream Overlay: `http://localhost:3000/overlay.html` (supports `?bg=1`, `?mode=arena|balls|halay|music|boss|monster`, `?submode=frontline|lanes|tug`)

UI & Documentation Language: **100% English** across dashboard, overlay HUD, alerts, server status/errors, default rules, simulator, and docs. (Chat team commands still accept both English `1`/`red`, `2`/`blue` and legacy `kırmızı`/`mavi`.)

## Files & Ownership
- Backend: `server.js`, `src/**`, `package.json`, `start.bat`, `.gitignore`, `.env.example`, `LICENSE`, `README.md`, `tests/smoke.js`, `data/.gitkeep` (`data/*.json` gitignored, auto-created on first run).
- Frontend: `public/**` (`dashboard.html`, `overlay.html`, `css/**`, `js/**`).
- Docs: `docs/GAME_MODES.md` (research summary by `@trends`, no local paths or PII).

## Normalized Event (Server -> Clients, `tiktok:event`)
```js
{
  id: string,
  type: 'gift' | 'like' | 'chat' | 'follow' | 'share' | 'member' | 'subscribe',
  source: 'live' | 'sim' | 'manual',
  ts: number,
  user: { uniqueId, nickname, avatar },
  gift?: { id, name, diamonds, count, image }, // final streak event only
  likeCount?: number,
  comment?: string
}
```

## Action Event (Server -> Clients, `action`)
```js
{
  id: string,
  ruleId: string,
  event: NormalizedEvent,
  action:
    | { type: 'spawn', units: number, team?: 'red' | 'blue' }
    | { type: 'join', team: 'red' | 'blue' | 'auto' }
    | { type: 'alert', text: string, style?: 'gift' | 'follow' | 'big' }
    | { type: 'tts', text: string }
    | { type: 'confetti' }
    | { type: 'boost', team?: 'red' | 'blue', power: number }
    | { type: 'sound', name: 'coin' | 'horn' | 'boom' }
}
```
Server-only `keypress` actions (`{ type: 'keypress', keys, holdMs }`) run only when `settings.allowKeypress === true` and are never broadcast.
Template placeholders: `{nickname} {uniqueId} {giftName} {count} {diamonds} {comment} {likeCount}`.

## Default Rules (English)
- Chat `1` or `red` (or `kırmızı`) -> `join` red
- Chat `2` or `blue` (or `mavi`) -> `join` blue
- Any gift -> `spawn` `units: 'diamonds'` (clamped 1..50), `alert` `"{nickname} sent {giftName} x{count} (+{diamonds}💎)!"`, `sound: 'coin'`
- Big gift (`minDiamonds >= 100`) -> `alert` (`style: 'big'`) `"{nickname} unleashed {giftName} x{count}!"`, `confetti`, `tts` `"{nickname} sent {giftName}!"`
- Mega gift (`minDiamonds >= 500`) -> `boost` (`power: 50`), `sound: 'horn'`
- Like (every `100` cumulative per user) -> `spawn` `1`
- Follow -> `spawn` `3`, `alert` (`style: 'follow'`) `"{nickname} joined the arena!"`
- Share -> `spawn` `2`
- Member join -> disabled by default (`enabled: false`)

## Settings (`data/settings.json`)
```js
{
  username: '',          // fallback: process.env.TIKTOK_USERNAME
  signApiKey: '',        // fallback: process.env.SIGN_API_KEY
  autoReconnect: true,
  ttsEnabled: true,
  ttsVoiceLang: 'en-US',
  allowKeypress: false,
  castleHp: 1000,
  roundSeconds: 300,
  gameMode: 'arena',     // 'arena' | 'balls' | 'halay' | 'music' | 'boss' | 'monster'
  arenaSubMode: 'frontline' // 'frontline' | 'lanes' | 'tug'
}
```

## Socket.IO Events
- Server -> Client:
  - `status`: `{ mode: 'idle'|'connecting'|'live'|'sim', username, roomId, viewerCount, error, simRunning }`
  - `leaderboard`: `[{ uniqueId, nickname, avatar, diamonds, gifts, likes }]` (top 20)
  - `rules`: `Rule[]`
  - `settings`: `Settings`
  - `game:mode`: `{ gameMode, arenaSubMode }`
  - `game:reset`: `{ clearLeaderboard?: boolean }`
  - `game:result`: `{ winner, mvp, gameMode? }`
  - `feed:history`: `NormalizedEvent[]` (last 100)
- Client -> Server:
  - `control:connect` `{ username }`
  - `control:disconnect`
  - `sim:start` `{ rate: 'low'|'mid'|'high' }`
  - `sim:stop`
  - `test:event` `{ type, giftName?, count?, nickname?, comment?, likeCount? }`
  - `rules:save` `Rule[]`
  - `settings:save` `Partial<Settings>`
  - `game:mode` `{ gameMode, arenaSubMode? }`
  - `game:reset` `{ clearLeaderboard?: boolean }`
  - `game:result` `{ winner, mvp, gameMode? }`

REST: `GET /api/state` (`{ status, leaderboard, settings }`), `GET /api/gifts` (`[{ name, diamonds, image? }]`).

## Overlay Game Modes (`public/overlay.html`)
Canvas `1920x1080`, 60fps, transparent by default (`?bg=1` dark stage), WebAudio SFX & music synthesis (no external files), `speechSynthesis` TTS (`en-US`), URL query `?mode=` and `?submode=` override initial state, live `game:mode` socket updates switch modes seamlessly.

1. **`arena` — Castle Siege** (3 sub-modes via `arenaSubMode`):
   - **Frontline Barrier & Y-Homing (Critical Physics Rule):** While opposing soldiers are alive on the battlefield (or within the same lane in `lanes` mode), soldiers CANNOT walk past the enemy's foremost frontline X (`maxRedX` / `minBlueX` minus a small clash buffer). Approaching soldiers steer vertically (Y-homing) toward the nearest opposing units so 300v300 armies collide in a solid frontline clash instead of slipping past at different Y positions! Only after breaking the opposing frontline can survivors march into the enemy castle.
   - Sub-modes:
     - `frontline` (*Frontline Clash*): Full-field single frontline war.
     - `lanes` (*3-Lane Siege*): Top / Mid / Bottom glowing bridge lanes, each with independent frontline barriers.
     - `tug` (*Tug-of-War Payload*): Center siege banner/cart pushed toward the enemy castle by frontline army superiority.
2. **`balls` — Chaos Ball Ring**:
   - Rotating neon circle arena with gap/obstacle barriers and bounce physics. Viewer interactions/gifts spawn named bouncing balls (gift size scales ball radius/mass/trail). Every collision triggers musical harmonic notes; ring speed, obstacles, and chaos intensity scale up as ball count rises.
3. **`halay` — Live Halay & Dance Party**:
   - Interactive curved dance chain where viewers join holding hands and dance synchronously! Top gifter becomes the crowned **Halay Leader** waving an animated glowing handkerchief (`mendil`). Gifts boost party BPM, trigger stage spotlights, money/confetti showers, and accelerate a WebAudio upbeat folk-synth rhythm!
4. **`music` — Synth Maestro & Note Rush**:
   - Center-stage animated musician character with live reactive audio visualizer. Viewer events drop named note/instrument orbs (Lead, Bass, Arp, Beat) into target rings, building dynamic WebAudio multi-track melodies; gifts increase BPM, harmony richness, combo multipliers, and difficulty speed.
5. **`boss` — Titan Boss Raid**:
   - All viewers co-op together against a multi-phase animated Titan Boss. Gifts/likes/follows summon named heroes and projectiles; big gifts unleash Meteor Strikes, Ultimate Lasers, and Team Shields; escalating boss phases fire shockwaves; defeating the boss crowns Raid MVP and levels up to a stronger Titan.
6. **`monster` — Monster Hunt (Chase, Takeover & Target Snipe)**:
   - Psychological survival & power-fantasy chase arena!
   - Viewers join via chat/follow/like/gift as named circular-avatar **Survivors** who earn survival score and dodge the **Monster**.
   - **Small Gifts (1–99 diamonds):** Grant **Turbo Dash + 4s Shield** (or **Instant Revive** if eliminated). Proximity warning rings (`DANGER!`) trigger loss-aversion urgency.
   - **High Gifts (100–499 diamonds) — Become the Monster:** Donor takes over as the giant crowned **Monster** (`MONSTER TAKEOVER`) displaying their huge circular avatar, horns/claws, and fiery aura, chasing survivors. Subsequent 100+ donors dethrone & steal the Monster crown!
   - **Mega Gifts (500+ diamonds / `boost`) — Targeted Snipe Elimination:** Eliminates the player named in the donor's recent chat command (`@name`, `kill name`, `hunt name`, `target name`) — or the #1 survivor if none named — with a red crosshair lock (`TARGET LOCKED`), claw/laser strike, screen shake, and knockout!
   - Note: Overlay also listens to `tiktok:event` (`chat`) to track per-user `@name` / `kill name` / `hunt name` / `target name` commands.

## Visual Polish Standards (All Modes)
- Circular-clipped neon-framed avatars (with crisp initial badges when avatar URL is missing/fails).
- Additive glow (`lighter`), sword slash arcs, frontline spark lines, textured castles, and glassmorphic HUD panels.
- Psychological call-to-action status banners showing live takeover/snipe thresholds.
