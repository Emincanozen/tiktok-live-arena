# Viral TikTok LIVE Interactive Game Modes — Design Guide

This guide summarizes proven viral TikTok LIVE interactive game mechanics for **TikTok Live Arena** across all five game modes, focusing on retention hooks, gift-to-action scaling, difficulty progression, and audio/visual feedback.

---

## 1. Chaos Ball Ring (`balls` — Bouncing Balls & Rotating Ring Physics)

### Viral Hooks
- **Tension & Release Loop:** Viewers stay glued to the screen waiting for a bouncing ball to thread through the rotating ring's narrow gap.
- **Multiplication & Chaos:** Escaping or hitting special triggers spawns additional balls, turning a simple 1-ball puzzle into a hypnotic full-screen swarm.
- **Named Viewer Ownership:** Each ball displays the viewer's nickname/avatar, creating instant personal investment.

### Gift-to-Action Scaling
- **Likes / Chat / Follows:** Spawn a standard-sized viewer ball or nudge ring rotation speed.
- **Low-Tier Gifts (e.g., Rose):** Spawn a larger, faster ball with a glowing trail.
- **Mid-Tier Gifts (e.g., Finger Heart / Doughnut):** Spawn multiple balls (2x–5x) or trigger a temporary speed boost.
- **High-Tier Gifts (e.g., Galaxy / Lion / Universe):** Spawn a giant "Mega Ball" that shatters obstacles, widens/shifts the gap, or triggers a screen-wide gravity flip.

### Difficulty Progression
- As active ball count rises, gradually increase **ring rotation speed**, shrink the **escape gap**, or introduce **rotating inner obstacles/bumpers** to keep rounds exciting.

### Audio / Visual Feedback
- **Harmonic Bounce Notes:** Map every wall/ring collision to the next sequential note in a musical scale (e.g., pentatonic or synth arpeggio) via WebAudio so chaotic bounces sound like a living melody.
- **Visual Trails & Flashes:** Add neon motion trails, impact sparks, and a brief ring flash on every escape or milestone.

---

## 2. Live Halay Party (`halay` — Dance Chain & Avatar Party)

### Viral Hooks
- **Instant Community Inclusion:** Typing a keyword or sending a like adds the viewer's avatar directly into a curved, hand-holding dance chain.
- **Status & Crown Mechanics:** The top gifter becomes the crowned **Halay Leader** waving a glowing handkerchief (`mendil`), creating friendly status competition.

### Gift-to-Action Scaling
- **Likes / Chat:** Join the dance chain and incrementally raise the party **BPM** (Slow → Steady → Fast → WILD!).
- **Low-Tier Gifts:** Add dance bounce energy, glowing auras, or mini confetti bursts around the sender's avatar.
- **Mid-Tier Gifts:** Trigger spotlight beams, virtual money/gold rain, and temporary speed-up combos.
- **High-Tier Gifts:** Crown the sender as **Halay Leader**, fire full-screen fireworks, and trigger a peak-BPM celebration drop.

### Difficulty / Energy Progression
- Tie **BPM** and **dance amplitude** to recent interaction density. If chat slows down, tempo gradually eases; sustained likes/gifts push the party into high-energy **WILD** mode.

### Audio / Visual Feedback
- **Beat-Synced Folk-Synth Rhythm:** Synthesize an upbeat WebAudio percussion + synth lead loop whose tempo scales dynamically with the current BPM.
- **Stage Lighting:** Beat-synced spotlights, pulsing floor rings, and floating gift callouts.

---

## 3. Synth Maestro (`music` — Note Rhythm & Beat-Reactive)

### Viral Hooks
- **Collaborative Live Track:** Viewers feel like they are co-producing a live electronic track—every action drops a named musical note or instrument orb into the stage.
- **Pattern Interrupts:** Frequent visual/audio shifts every 3–5 seconds prevent scroll-past habituation.

### Gift-to-Action Scaling
- **Likes / Chat:** Drop basic **Beat / Arp** notes into the outer ring.
- **Low-Tier Gifts:** Drop **Bass** or **Lead** instrument orbs with higher combo value.
- **Mid-Tier Gifts:** Trigger multi-note bursts, chord progressions, and combo multipliers.
- **High-Tier Gifts:** Trigger a **Maestro Overdrive** (bass drop + radial laser shockwave + temporary 2x–3x combo multiplier).

### Difficulty Progression
- As the combo meter climbs, increase **BPM**, **note fall/orbit speed**, and **target ring rotation**, requiring faster collective chat momentum to sustain the streak.

### Audio / Visual Feedback
- **Zero-Latency WebAudio Synthesis:** Trigger crisp synth/bass/drum notes the millisecond a note hits the target ring.
- **Reactive Radial Visualizer:** Center-stage Maestro character surrounded by a beat-reactive spectrum ring, particle bursts, and floating combo counters.

---

## 4. Castle Siege (`arena`) & Titan Boss Raid (`boss`)

### Viral Hooks
- **Factions & Rivalries (`arena`):** Splitting chat into Red vs. Blue (or Top/Mid/Bot lanes, or Tug-of-War War Cart) sparks tribal loyalty and "snipe" battles in the final seconds.
- **Shared Enemy (`boss`):** Uniting the entire chat against a massive multi-phase Titan Boss builds cooperative urgency.

### Gift-to-Action Scaling
- **Likes / Chat / Follows:** Charge a collective team strike bar or spawn baseline foot soldiers.
- **Low/Mid-Tier Gifts:** Spawn stronger units (Brutes, Knights, Giants) or deal proportional burst damage.
- **High-Tier Gifts:** Trigger **Meteors, Lasers, or Shield-Breakers** that shatter boss defenses or wipe enemy frontlines.

### Difficulty Progression
- **Castle Siege (`arena`):** Enforced **frontline barriers** prevent armies from slipping past each other; the winning push reaches the enemy castle.
- **Titan Boss Raid (`boss`):** Trigger **Shield Phases** at 75%, 50%, and 25% HP (requiring burst gifts to stun the boss for 2x damage) and periodic **Rage / Regen** timers if chat slows down.

### Audio / Visual Feedback
- **Hierarchical SFX:** Light pops for likes, arcade power-ups for mid gifts, and heavy bass drops + screen-shake + TTS shoutouts for big gifts and MVP announcements.

---

## 6. Monster Hunt (`monster` — Chase, Takeover & Targeted Snipe)

### Viral Hooks
- **Survival Tension & Loss Aversion:** Viewers spawn as **Survivors** (circular avatar + live survival score) dodging a prowling **Monster**. When the Monster gets close, a pulsing red danger ring (`"⚠️ DANGER! Gift = DASH!"`) triggers urgency.
- **Become the Monster (Power Fantasy):** Sending **100–499 diamonds** lets the donor take over the giant Monster body with their avatar, horns, and fiery trail. New 100+ donors dethrone the current Monster (`"👑 MONSTER TAKEOVER!"`).
- **Targeted Friend Snipe:** Sending **500+ diamonds** (or `boost`) locks onto the donor's chat target (`@name`, `kill name`, `target name`) with a red crosshair (`"🎯 TARGET LOCKED"`), blasting them off-screen for a massive bounty.

### Gift-to-Action Scaling
- **Likes / Chat / Follows:** Spawn as a Survivor or set a chat target (`@name`).
- **Small Gifts (1–99💎):** Trigger **Turbo Dash + 4s Shield** (knocks Monster back) or **Instant Revive** if eliminated.
- **Mid/High Gifts (100–499💎):** **Become the Monster** takeover.
- **Mega Gifts (500+💎):** **Targeted Snipe** elimination against a named friend (or #1 Survivor if none named).

### Audio / Visual Feedback
- **Glow & Impact:** Additive-glow claw slashes, laser strike beams, screen shake on eliminations, and clear top/bottom CTA banners (`"100💎 = BECOME THE MONSTER! • 500💎 + @name = SNIPE A FRIEND!"`).

---

## 7. Psychological Monetization Triggers

- **Loss Aversion:** Near-death danger rings and survival score streaks push viewers to send low-cost gifts (1–99💎) to avoid losing progress.
- **Power Fantasy & Dethroning:** Letting donors become the Monster, Halay Leader, or top leaderboard MVP turns passive viewers into the center of attention.
- **Targeted Social Play (Sniping):** Allowing viewers to target friends by `@name` turns gifting into hilarious, shareable banter.
- **Pricing Ladder (€0.01–€5+):** Frictionless micro-gifts start commitment ("foot-in-the-door"), while mid/mega tiers sell status, visibility, and room-wide dominance—purely as in-game entertainment (no cash prizes or lotteries).

