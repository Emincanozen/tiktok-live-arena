/* TikTok Live Arena — Flagship Mode: Titan Siege (Endless Wave Co-op vs AI Horde & Boss) */
(function () {
  'use strict';

  const COLORS = ['#ff3b5c', '#2f8cff', '#ffd23f', '#2ecc71', '#a855f7', '#00e5ff', '#ff7b00', '#ff66b2'];
  function colorFor(id) {
    let h = 0;
    const s = String(id || 'x');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return COLORS[Math.abs(h) % COLORS.length];
  }

  const BOSS_TYPES = [
    { name: 'CYBER GOLEM',   col: '#00e5ff', accent: '#a855f7', shape: 'golem' },
    { name: 'INFERNO DRAKE', col: '#ff7b00', accent: '#ffd23f', shape: 'drake' },
    { name: 'VOID REAPER',   col: '#c77dff', accent: '#ff3b5c', shape: 'reaper' }
  ];

  const CITADEL_X = 50, CITADEL_W = 165, CITADEL_Y = 530, CITADEL_H = 380;
  const FIELD_MIN_X = 250, FIELD_MAX_X = 1360, FIELD_MIN_Y = 470, FIELD_MAX_Y = 930;
  const BOSS_X = 1580, BOSS_Y = 670;

  let wave = 1, streakTime = 0, celebrateT = 0;
  let citadel = { hp: 2500, dispHp: 2500, pauseT: 0, max: 2500, flash: 0, turretCd: 0 };
  let boss = null;
  let heroes = new Map(); // uid -> hero
  let minions = [];
  let shots = [];
  let telegraphs = []; // { kind: 'laser'|'meteor', ... }
  let shockwaves = []; // { x, y, r, maxR, col }
  let megaEffects = []; // { kind: 'meteor_storm'|'orbital_cannon', t, maxT, donor }
  let crownedDonor = null;
  let minionSpawnTimer = 0, bossAttackTimer = 4;

  function citadelMaxHp() {
    const base = (window.__arenaSettings && window.__arenaSettings.castleHp) || 1000;
    return Math.round(base * 2.5);
  }

  function heroTier(lv) {
    if (lv >= 10) return { title: 'Mecha Titan', drones: 3, col: '#ffd23f', aura: true };
    if (lv >= 6)  return { title: 'Paladin',     drones: lv >= 8 ? 2 : 1, col: '#00e5ff', aura: false };
    if (lv >= 3)  return { title: 'Neon Knight', drones: 0, col: '#a855f7', aura: false };
    return { title: 'Squire', drones: 0, col: '#9cc9ff', aura: false };
  }

  function xpForLevel(lv) { return lv * 25; }

  function spawnBossForWave(w) {
    const isMega = w % 3 === 0;
    const arch = BOSS_TYPES[(w - 1) % BOSS_TYPES.length];
    const baseHp = (window.__arenaSettings && window.__arenaSettings.castleHp) || 1000;
    const hp = Math.round(baseHp * (3.5 + w * 1.45) * (isMega ? 1.45 : 1));
    boss = {
      wave: w,
      isMega,
      name: (isMega ? 'MEGA ' : '') + arch.name,
      col: arch.col,
      accent: arch.accent,
      shape: arch.shape,
      hp, dispHp: hp, pauseT: 0, max: hp,
      shield: 0, maxShield: Math.round(hp * 0.16),
      trig66: false, trig33: false,
      flash: 0,
      x: BOSS_X, y: BOSS_Y
    };
    bossAttackTimer = 3.5;
  }

  function ensureHero(u, dm) {
    let h = heroes.get(u.uniqueId);
    if (!h) {
      if (heroes.size >= 110) {
        let rm = null;
        heroes.forEach((v, k) => { if (!v.alive && !rm) rm = k; });
        if (!rm) {
          let low = Infinity;
          heroes.forEach((v, k) => { if (v.xpTotal < low) { low = v.xpTotal; rm = k; } });
        }
        if (rm) heroes.delete(rm);
      }
      h = {
        uid: u.uniqueId,
        name: u.nickname || u.uniqueId,
        avatar: u.avatar || '',
        color: colorFor(u.uniqueId),
        x: 280 + Math.random() * 240,
        y: FIELD_MIN_Y + 40 + Math.random() * (FIELD_MAX_Y - FIELD_MIN_Y - 80),
        vx: 0, vy: 0,
        hp: 100, max: 100,
        lv: 1, xp: 0, xpTotal: 0, dmg: 0,
        alive: true, deadTimer: 25,
        shield: 2, cd: Math.random() * 0.6,
        droneAngle: Math.random() * 6.28, droneCd: 0.4,
        atkAnim: 0
      };
      heroes.set(u.uniqueId, h);
    } else {
      if (u.nickname) h.name = u.nickname;
      if (u.avatar) h.avatar = u.avatar;
    }

    // Revive or Heal on gift / action
    if (!h.alive) {
      if (dm > 0) {
        h.alive = true;
        h.hp = h.max;
        h.shield = 5;
        h.deadTimer = 25;
      }
    } else if (dm > 0) {
      h.hp = Math.min(h.max, h.hp + 45 + dm * 2);
      h.shield = Math.max(h.shield, 5);
    }

    if (dm > 0) addHeroXp(h, dm * 5 + 10);
    else addHeroXp(h, 2);

    return h;
  }

  function addHeroXp(h, amount) {
    h.xp += amount;
    h.xpTotal += amount;
    while (h.xp >= xpForLevel(h.lv)) {
      h.xp -= xpForLevel(h.lv);
      h.lv++;
      h.max = 100 + (h.lv - 1) * 18;
      h.hp = h.max;
    }
  }

  function damageBoss(E, uid, name, amount, col) {
    if (!boss || boss.hp <= 0) return;
    let dealt = amount;
    if (boss.shield > 0) {
      const absorbed = Math.min(boss.shield, dealt * 0.75);
      boss.shield -= absorbed;
      dealt = Math.max(1, dealt * 0.25);
    }
    boss.hp = Math.max(0, boss.hp - dealt);
    boss.flash = 0.08;
    boss.pauseT = 0.25;
    const h = heroes.get(uid);
    if (h) h.dmg += Math.round(dealt);
    if (Math.random() < 0.65 || amount >= 40) {
      E.floatText(boss.x + (Math.random() - 0.5) * 140, boss.y - 120 + (Math.random() - 0.5) * 70, '-' + Math.round(dealt), col || '#ffe066', amount >= 80 ? 30 : 21);
    }
  }

  function spawnMinion(kind) {
    if (minions.length >= 90) return;
    const scale = 1 + (wave - 1) * 0.22;
    const cfg = kind === 'brute'
      ? { hp: 110 * scale, sp: 58, dmg: 18 * scale, r: 24, col: '#ff7b00' }
      : kind === 'exploder'
      ? { hp: 45 * scale, sp: 115, dmg: 38 * scale, r: 17, col: '#ff3b5c' }
      : { hp: 55 * scale, sp: 86, dmg: 10 * scale, r: 16, col: '#a855f7' };
    minions.push({
      kind,
      x: 1460 + Math.random() * 140,
      y: FIELD_MIN_Y + 25 + Math.random() * (FIELD_MAX_Y - FIELD_MIN_Y - 50),
      hp: cfg.hp, max: cfg.hp,
      sp: cfg.sp, dmg: cfg.dmg, r: cfg.r, col: cfg.col,
      cd: Math.random() * 0.7
    });
  }

  function triggerBossAttack(E) {
    if (!boss || boss.hp <= 0) return;
    const aliveList = [];
    heroes.forEach((h) => { if (h.alive) aliveList.push(h); });
    const roll = Math.random();

    if (roll < 0.38 && aliveList.length > 0) {
      // 1. Telegraphed Red Laser Sweep (1.8s warning)
      const target = aliveList[Math.floor(Math.random() * aliveList.length)];
      telegraphs.push({
        kind: 'laser',
        x1: boss.x - 40, y1: boss.y - 20,
        x2: 180, y2: target.y,
        t: 0, warn: 1.8, fired: false
      });
    } else if (roll < 0.76) {
      // 2. Telegraphed Meteor AoE Circles (2.0s warning)
      const count = Math.min(4, 2 + Math.floor(wave / 3));
      for (let i = 0; i < count; i++) {
        const tgt = aliveList.length && i === 0
          ? aliveList[Math.floor(Math.random() * aliveList.length)]
          : { x: FIELD_MIN_X + 120 + Math.random() * (FIELD_MAX_X - FIELD_MIN_X - 240), y: FIELD_MIN_Y + 40 + Math.random() * (FIELD_MAX_Y - FIELD_MIN_Y - 80) };
        telegraphs.push({
          kind: 'meteor',
          x: tgt.x, y: tgt.y, r: 105,
          t: 0, warn: 2.0, fired: false
        });
      }
    } else {
      // 3. Shockwave + Minion Summon
      shockwaves.push({ x: boss.x, y: boss.y, r: 40, maxR: 1350, col: boss.col });
      const count = Math.min(8, 3 + wave);
      for (let i = 0; i < count; i++) {
        const k = i % 5 === 0 ? 'brute' : (i % 4 === 0 ? 'exploder' : 'minion');
        spawnMinion(k);
      }
      E.sfx('horn');
    }
  }

  function triggerMeteorStorm(E, donorHero, dm) {
    megaEffects.push({ kind: 'meteor_storm', t: 0, maxT: 2.2, donor: donorHero.name });
    E.pushAlert(`⚡ ${donorHero.name} UNLEASHED METEOR STORM!`, 'big');
    E.hitStop(0.05);
    E.addShake(16);
    E.sfx('boom');
    E.confetti();
    addHeroXp(donorHero, 80 + dm);
    const dmg = 350 + dm * 1.6;
    damageBoss(E, donorHero.uid, donorHero.name, dmg, '#ff7b00');
    for (let i = minions.length - 1; i >= 0; i--) {
      minions[i].hp -= dmg * 0.8;
      E.burst(minions[i].x, minions[i].y, 8, '#ff7b00', 200);
      if (minions[i].hp <= 0) minions.splice(i, 1);
    }
  }

  function triggerOrbitalCannon(E, donorHero, dm) {
    megaEffects.push({ kind: 'orbital_cannon', t: 0, maxT: 2.8, donor: donorHero.name });
    crownedDonor = { name: donorHero.name, avatar: donorHero.avatar, dm };
    citadel.hp = Math.min(citadel.max, citadel.hp + Math.round(citadel.max * 0.25));
    E.pushAlert(`🐉 ${donorHero.name} FIRED ORBITAL DRAGON CANNON!`, 'big');
    E.tts(`${donorHero.name} unleashed the Orbital Dragon Cannon!`);
    E.hitStop(0.06);
    E.addShake(24);
    E.sfx('boom');
    E.confetti();
    addHeroXp(donorHero, 250 + dm);
    const dmg = 950 + dm * 2.4;
    damageBoss(E, donorHero.uid, donorHero.name, dmg, '#00e5ff');
    for (let i = minions.length - 1; i >= 0; i--) {
      E.burst(minions[i].x, minions[i].y, 12, '#00e5ff', 260);
    }
    minions.length = 0;
  }

  function getMvp() {
    let mvp = null;
    heroes.forEach((h) => {
      if (!mvp || h.dmg > mvp.diamonds) mvp = { uniqueId: h.uid, nickname: h.name, diamonds: h.dmg, avatar: h.avatar };
    });
    return mvp;
  }

  window.OverlayModes = window.OverlayModes || {};
  window.OverlayModes.boss = {
    reset(clear) {
      wave = 1; streakTime = 0; celebrateT = 0;
      citadel.max = citadelMaxHp();
      citadel.hp = citadel.dispHp = citadel.max;
      citadel.pauseT = 0;
      citadel.flash = 0; citadel.turretCd = 0;
      minions = []; shots = []; telegraphs = []; shockwaves = []; megaEffects = [];
      minionSpawnTimer = 1.5;
      if (clear) { heroes.clear(); crownedDonor = null; }
      else heroes.forEach((h) => { h.alive = true; h.hp = h.max; h.shield = 3; });
      spawnBossForWave(1);
    },

    onAction(E, a, ev, u) {
      if (!u) return;
      const dm = ev.gift ? (ev.gift.diamonds || 1) * (ev.gift.count || 1) : 0;

      if (a.type === 'boost' || dm >= 500) {
        const h = ensureHero(u, Math.max(dm, 500));
        triggerOrbitalCannon(E, h, Math.max(dm, 500));
        return;
      }

      if (dm >= 100) {
        const h = ensureHero(u, dm);
        triggerMeteorStorm(E, h, dm);
        return;
      }

      if (a.type === 'join' || a.type === 'spawn') {
        const wasDead = heroes.has(u.uniqueId) && !heroes.get(u.uniqueId).alive;
        const h = ensureHero(u, dm);
        if (dm > 0) {
          citadel.hp = Math.min(citadel.max, citadel.hp + Math.min(80, 6 + dm));
          E.floatText(h.x, h.y - 46, wasDead ? `✨ REVIVED + SHIELD!` : `🛡️ HEAL + XP!`, '#2ecc71', 21);
          E.burst(h.x, h.y, 10, '#2ecc71', 150);
        } else if (ev.type === 'chat' && /heal/i.test(ev.comment || '')) {
          citadel.hp = Math.min(citadel.max, citadel.hp + 15);
          E.floatText(CITADEL_X + CITADEL_W / 2, CITADEL_Y - 10, '+15 HP', '#2ecc71', 20);
        } else if (ev.type === 'like') {
          citadel.hp = Math.min(citadel.max, citadel.hp + 10);
        }
      }
    },

    update(E, dt) {
      streakTime += dt;
      if (citadel.flash > 0) citadel.flash -= dt;
      if (citadel.dispHp > citadel.hp) {
        if (citadel.pauseT > 0) citadel.pauseT -= dt;
        else citadel.dispHp = Math.max(citadel.hp, citadel.dispHp - Math.max(120, (citadel.dispHp - citadel.hp) * 4) * dt);
      } else citadel.dispHp = citadel.hp;
      if (boss) {
        if (boss.flash > 0) boss.flash -= dt;
        if (boss.dispHp > boss.hp) {
          if (boss.pauseT > 0) boss.pauseT -= dt;
          else boss.dispHp = Math.max(boss.hp, boss.dispHp - Math.max(180, (boss.dispHp - boss.hp) * 4) * dt);
        } else boss.dispHp = boss.hp;
      }
      if (citadel.hp / citadel.max < 0.35 || telegraphs.length > 0) {
        E.vignette(0.28 + 0.14 * Math.sin(performance.now() / 150), '180,0,0');
      }

      // Victory celebration between waves (8s)
      if (celebrateT > 0) {
        celebrateT -= dt;
        if (celebrateT <= 0) {
          wave++;
          citadel.hp = Math.min(citadel.max, citadel.hp + Math.round(citadel.max * 0.15));
          heroes.forEach((h) => { h.alive = true; h.hp = h.max; h.shield = 3; });
          spawnBossForWave(wave);
          E.pushAlert(`⚔️ WAVE ${wave}: ${boss.name} APPROACHES!`, 'big');
        }
        return;
      }

      // Periodic AI Minion wave spawning
      minionSpawnTimer -= dt;
      if (minionSpawnTimer <= 0) {
        minionSpawnTimer = Math.max(2.2, 5.2 - wave * 0.25);
        spawnMinion(Math.random() < 0.25 ? 'brute' : (Math.random() < 0.3 ? 'exploder' : 'minion'));
      }

      // Boss shield phases at 66% & 33%
      if (boss && boss.hp > 0) {
        const r = boss.hp / boss.max;
        if (!boss.trig66 && r <= 0.66) {
          boss.trig66 = true; boss.shield = boss.maxShield;
          E.pushAlert(`🛡️ ${boss.name} ACTIVATED ENERGY SHIELD!`, 'gift');
          E.sfx('horn');
        } else if (!boss.trig33 && r <= 0.33) {
          boss.trig33 = true; boss.shield = boss.maxShield;
          E.pushAlert(`🔥 ${boss.name} ENRAGED + SHIELD!`, 'big');
          E.sfx('horn');
        }
        bossAttackTimer -= dt;
        if (bossAttackTimer <= 0) {
          bossAttackTimer = Math.max(3.2, 6.5 - wave * 0.3);
          triggerBossAttack(E);
        }
      }

      // Telegraphs
      for (let i = telegraphs.length - 1; i >= 0; i--) {
        const tg = telegraphs[i];
        tg.t += dt;
        if (!tg.fired && tg.t >= tg.warn) {
          tg.fired = true;
          E.addShake(10);
          E.sfx('boom');
          if (tg.kind === 'laser') {
            heroes.forEach((h) => {
              if (!h.alive || h.shield > 0) return;
              if (Math.abs(h.y - tg.y2) < 55) {
                h.hp -= 55 + wave * 6;
                E.burst(h.x, h.y, 10, '#ff3b5c', 180);
                if (h.hp <= 0) { h.alive = false; h.deadTimer = 25; }
              }
            });
          } else if (tg.kind === 'meteor') {
            E.burst(tg.x, tg.y, 20, '#ff7b00', 250);
            heroes.forEach((h) => {
              if (!h.alive || h.shield > 0) return;
              if (Math.hypot(h.x - tg.x, h.y - tg.y) <= tg.r) {
                h.hp -= 65 + wave * 8;
                h.x = Math.max(FIELD_MIN_X, h.x - 60);
                if (h.hp <= 0) { h.alive = false; h.deadTimer = 25; }
              }
            });
          }
        }
        if (tg.t >= tg.warn + 0.45) telegraphs.splice(i, 1);
      }

      // Shockwaves
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.r += 540 * dt;
        if (sw.r >= sw.maxR) shockwaves.splice(i, 1);
      }

      // Mega FX
      for (let i = megaEffects.length - 1; i >= 0; i--) {
        megaEffects[i].t += dt;
        if (megaEffects[i].t >= megaEffects[i].maxT) megaEffects.splice(i, 1);
      }

      // Citadel auto-turret
      citadel.turretCd -= dt;
      if (citadel.turretCd <= 0) {
        citadel.turretCd = 0.75;
        const tgt = minions[0] || boss;
        if (tgt) {
          const dx = tgt.x - (CITADEL_X + CITADEL_W), dy = tgt.y - (CITADEL_Y + 60);
          const d = Math.hypot(dx, dy) || 1;
          shots.push({
            x: CITADEL_X + CITADEL_W, y: CITADEL_Y + 60,
            vx: (dx / d) * 820, vy: (dy / d) * 820,
            dmg: 20 + wave * 3, col: '#00e5ff', uid: '_citadel', name: 'Citadel'
          });
        }
      }

      // Heroes update
      heroes.forEach((h, uid) => {
        if (!h.alive) {
          h.deadTimer -= dt;
          if (h.deadTimer <= 0) heroes.delete(uid);
          return;
        }
        if (h.shield > 0) h.shield -= dt;
        if (h.atkAnim > 0) h.atkAnim -= dt * 4;

        const tier = heroTier(h.lv);
        // Move toward front / nearest minion
        let targetX = 760 + (h.lv * 18) % 300;
        let targetY = h.y;
        let nearestM = null, md = Infinity;
        for (let i = 0; i < minions.length; i++) {
          const d = Math.hypot(minions[i].x - h.x, minions[i].y - h.y);
          if (d < md) { md = d; nearestM = minions[i]; }
        }
        if (nearestM && md < 280) {
          targetX = Math.max(FIELD_MIN_X, nearestM.x - 45);
          targetY = nearestM.y;
        }
        const dx = targetX - h.x, dy = targetY - h.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 14) {
          h.x += (dx / dist) * 110 * dt;
          h.y += (dy / dist) * 110 * dt;
        }
        h.x = Math.max(FIELD_MIN_X, Math.min(FIELD_MAX_X, h.x));
        h.y = Math.max(FIELD_MIN_Y, Math.min(FIELD_MAX_Y, h.y));

        // Hero main attack
        h.cd -= dt;
        if (h.cd <= 0) {
          h.cd = Math.max(0.35, 0.85 - h.lv * 0.03);
          h.atkAnim = 1;
          const tgt = nearestM || boss;
          if (tgt) {
            const sdx = tgt.x - h.x, sdy = tgt.y - h.y;
            const sd = Math.hypot(sdx, sdy) || 1;
            shots.push({
              x: h.x + 16, y: h.y - 16,
              vx: (sdx / sd) * 780, vy: (sdy / sd) * 780,
              dmg: 14 + h.lv * 5, col: tier.col, uid: h.uid, name: h.name
            });
          }
        }

        // Orbiting drones
        if (tier.drones > 0) {
          h.droneAngle += dt * 3.2;
          h.droneCd -= dt;
          if (h.droneCd <= 0) {
            h.droneCd = 0.65;
            const tgt = nearestM || boss;
            if (tgt) {
              for (let d = 0; d < tier.drones; d++) {
                const a = h.droneAngle + (d * Math.PI * 2) / tier.drones;
                const ox = h.x + Math.cos(a) * 34, oy = h.y - 20 + Math.sin(a) * 20;
                const sdx = tgt.x - ox, sdy = tgt.y - oy;
                const sdist = Math.hypot(sdx, sdy) || 1;
                shots.push({
                  x: ox, y: oy,
                  vx: (sdx / sdist) * 860, vy: (sdy / sdist) * 860,
                  dmg: 9 + h.lv * 2, col: '#00e5ff', uid: h.uid, name: h.name
                });
              }
            }
          }
        }
      });

      // Minions march & attack Heroes or Citadel
      for (let i = minions.length - 1; i >= 0; i--) {
        const m = minions[i];
        m.cd -= dt;
        let hitHero = null;
        heroes.forEach((h) => {
          if (!hitHero && h.alive && Math.hypot(h.x - m.x, h.y - m.y) < m.r + 24) hitHero = h;
        });

        if (hitHero) {
          if (m.kind === 'exploder') {
            if (hitHero.shield <= 0) hitHero.hp -= m.dmg;
            E.burst(m.x, m.y, 16, '#ff3b5c', 220);
            if (hitHero.hp <= 0) { hitHero.alive = false; hitHero.deadTimer = 25; }
            minions.splice(i, 1);
            continue;
          }
          if (m.cd <= 0) {
            m.cd = 0.9;
            if (hitHero.shield <= 0) {
              hitHero.hp -= m.dmg;
              if (hitHero.hp <= 0) { hitHero.alive = false; hitHero.deadTimer = 25; }
            }
          }
          continue;
        }

        if (m.x <= CITADEL_X + CITADEL_W + m.r) {
          if (m.kind === 'exploder') {
            citadel.hp -= m.dmg * 1.5; citadel.flash = 0.15;
            E.burst(m.x, m.y, 16, '#ff3b5c', 220);
            minions.splice(i, 1);
            continue;
          }
          if (m.cd <= 0) {
            m.cd = 0.9;
            citadel.hp -= m.dmg;
            citadel.flash = 0.12; citadel.pauseT = 0.25;
            E.floatText(CITADEL_X + CITADEL_W / 2, CITADEL_Y + 40, '-' + Math.round(m.dmg), '#ff5964', 20);
          }
          continue;
        }
        m.x -= m.sp * dt;
      }

      // Projectiles
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.x += s.vx * dt; s.y += s.vy * dt;
        let hit = false;
        for (let k = minions.length - 1; k >= 0; k--) {
          const m = minions[k];
          if (Math.hypot(s.x - m.x, s.y - m.y) <= m.r + 10) {
            m.hp -= s.dmg;
            const hr = heroes.get(s.uid); if (hr) hr.dmg += Math.round(s.dmg);
            E.burst(s.x, s.y, 3, s.col, 90);
            if (m.hp <= 0) {
              E.burst(m.x, m.y, 10, m.col, 160);
              if (hr) addHeroXp(hr, 6);
              minions.splice(k, 1);
            }
            hit = true; break;
          }
        }
        if (!hit && boss && boss.hp > 0 && Math.hypot(s.x - boss.x, s.y - boss.y) < 125) {
          damageBoss(E, s.uid, s.name, s.dmg, s.col);
          E.burst(s.x, s.y, 3, s.col, 110);
          hit = true;
        }
        if (hit || s.x > E.W || s.x < 0 || s.y < 0 || s.y > E.H) shots.splice(i, 1);
      }

      // Boss defeated -> 8s Victory Loot & Heal celebration!
      if (boss && boss.hp <= 0 && celebrateT <= 0) {
        celebrateT = 8;
        minions.length = 0; telegraphs.length = 0;
        E.confetti(); E.sfx('win'); E.addShake(18);
        E.pushAlert(`🏆 WAVE ${wave} CLEARED! NEXT WAVE IN 8s!`, 'big');
      }

      // Citadel fallen -> Game Over
      if (citadel.hp <= 0) {
        citadel.hp = 0;
        E.endRound(`CITADEL FALLEN AT WAVE ${wave}`, getMvp());
      }
    },

    draw(E) {
      const ctx = E.ctx;
      const now = performance.now();

      // Atmospheric cyber/arcane battlefield floor
      const fg = ctx.createLinearGradient(0, FIELD_MIN_Y - 40, 0, E.H);
      fg.addColorStop(0, 'rgba(15,24,48,0)');
      fg.addColorStop(0.2, 'rgba(20,30,62,0.52)');
      fg.addColorStop(1, 'rgba(10,14,30,0.82)');
      ctx.fillStyle = fg; ctx.fillRect(0, FIELD_MIN_Y - 40, E.W, E.H - FIELD_MIN_Y + 40);

      ctx.strokeStyle = 'rgba(47, 140, 255, 0.14)';
      ctx.lineWidth = 2;
      for (let gx = 240; gx <= 1680; gx += 120) {
        ctx.beginPath(); ctx.moveTo(gx, FIELD_MIN_Y - 10); ctx.lineTo(gx - 80, FIELD_MAX_Y + 30); ctx.stroke();
      }
      for (let gy = FIELD_MIN_Y; gy <= FIELD_MAX_Y; gy += 90) {
        ctx.beginPath(); ctx.moveTo(200, gy); ctx.lineTo(1720, gy); ctx.stroke();
      }

      // Player Citadel (left)
      ctx.save();
      if (citadel.flash > 0) ctx.globalAlpha = 0.72;
      ctx.fillStyle = '#182449'; E.rr(CITADEL_X, CITADEL_Y + 50, CITADEL_W, CITADEL_H - 50, 8); ctx.fill();
      ctx.fillStyle = '#2f8cff'; E.rr(CITADEL_X - 8, CITADEL_Y, 52, CITADEL_H, 6); ctx.fill();
      E.rr(CITADEL_X + CITADEL_W - 44, CITADEL_Y + 20, 52, CITADEL_H - 20, 6); ctx.fill();
      ctx.fillStyle = '#00e5ff';
      ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(CITADEL_X + CITADEL_W / 2, CITADEL_Y + 135, 22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Telegraphed floor warnings
      telegraphs.forEach((tg) => {
        const p = 0.5 + 0.5 * Math.sin(now / 70);
        if (tg.kind === 'laser') {
          if (!tg.fired) {
            ctx.save();
            ctx.strokeStyle = `rgba(255, 59, 92, ${0.4 + p * 0.55})`;
            ctx.lineWidth = 4; ctx.setLineDash([16, 12]);
            ctx.beginPath(); ctx.moveTo(tg.x1, tg.y1); ctx.lineTo(tg.x2, tg.y2); ctx.stroke();
            ctx.restore();
          } else {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 34;
            ctx.beginPath(); ctx.moveTo(tg.x1, tg.y1); ctx.lineTo(tg.x2, tg.y2); ctx.stroke();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.stroke();
            ctx.restore();
          }
        } else if (tg.kind === 'meteor') {
          ctx.save();
          ctx.strokeStyle = `rgba(255, 59, 92, ${0.5 + p * 0.5})`;
          ctx.fillStyle = `rgba(255, 59, 92, ${0.12 + (tg.t / tg.warn) * 0.22})`;
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          E.txt('☄️ METEOR!', tg.x, tg.y + 6, '800 18px Segoe UI, Arial', '#ff5964', 'center');
          ctx.restore();
        }
      });

      // Shockwaves
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      shockwaves.forEach((sw) => {
        ctx.strokeStyle = sw.col; ctx.lineWidth = 6; ctx.globalAlpha = Math.max(0, 1 - sw.r / sw.maxR);
        ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.restore();

      // Boss (Multi-part animated silhouettes + glow sprite)
      if (boss && boss.hp > 0) {
        const bob = Math.sin(now / 320) * 14;
        const rot = now / 900;
        const glowKey = boss.shape === 'golem' ? 'cyan' : (boss.shape === 'drake' ? 'gold' : 'purple');
        E.glow(boss.x, boss.y + bob, boss.isMega ? 210 : 180, glowKey);
        ctx.save();
        ctx.translate(boss.x, boss.y + bob);

        if (boss.shape === 'golem') {
          // Orbiting monoliths + gauntlets
          for (let k = 0; k < 4; k++) {
            const a = rot + k * (Math.PI / 2);
            ctx.fillStyle = '#252f4d'; E.rr(Math.cos(a) * 138 - 16, Math.sin(a) * 138 - 22, 32, 44, 6); ctx.fill();
            ctx.strokeStyle = boss.col; ctx.lineWidth = 2; ctx.stroke();
          }
          ctx.rotate(rot * 0.4);
          ctx.fillStyle = boss.flash > 0 ? '#fff' : '#18203c';
          ctx.strokeStyle = boss.col; ctx.lineWidth = 6;
          ctx.beginPath();
          for (let s = 0; s < 6; s++) {
            const a = (s * Math.PI) / 3;
            const px = Math.cos(a) * 105, py = Math.sin(a) * 105;
            if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.rotate(-rot * 0.4);
        } else if (boss.shape === 'drake') {
          // Flapping layered flame wings + horned crest
          const flap = Math.sin(now / 160) * 28;
          ctx.fillStyle = boss.flash > 0 ? '#fff' : '#8a1c1c';
          ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(170, -110 + flap); ctx.lineTo(130, 40); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-170, -110 + flap); ctx.lineTo(-130, 40); ctx.closePath(); ctx.fill();
          ctx.fillStyle = boss.flash > 0 ? '#fff' : '#2a1218';
          ctx.beginPath(); ctx.arc(0, 0, 96, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = boss.col; ctx.lineWidth = 5; ctx.stroke();
          // Horns
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath(); ctx.moveTo(-40, -76); ctx.lineTo(-82, -140); ctx.lineTo(-15, -90); ctx.fill();
          ctx.beginPath(); ctx.moveTo(40, -76); ctx.lineTo(82, -140); ctx.lineTo(15, -90); ctx.fill();
        } else {
          // Void Reaper: orbiting rune rings + crescent scythe
          ctx.strokeStyle = boss.col; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.ellipse(0, 0, 145, 55, rot, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(0, 0, 145, 55, -rot, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = boss.flash > 0 ? '#fff' : '#140f24';
          ctx.beginPath(); ctx.arc(0, 0, 92, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = boss.accent; ctx.lineWidth = 5; ctx.stroke();
          // Scythe arc
          ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 10;
          ctx.beginPath(); ctx.arc(-50, 0, 110, Math.PI * 0.65, Math.PI * 1.35); ctx.stroke();
        }

        // Glowing eyes
        ctx.fillStyle = boss.flash > 0 ? '#fff' : boss.accent;
        ctx.beginPath(); ctx.arc(-30, -16, 13, 0, Math.PI * 2); ctx.arc(30, -16, 13, 0, Math.PI * 2); ctx.fill();
        if (boss.shield > 0) {
          ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(0, 0, 144, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }

      // Minions
      for (let i = 0; i < minions.length; i++) {
        const m = minions[i];
        ctx.fillStyle = m.col;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        if (m.hp < m.max) {
          ctx.fillStyle = '#000a'; ctx.fillRect(m.x - 16, m.y - m.r - 10, 32, 4);
          ctx.fillStyle = '#ff3b5c'; ctx.fillRect(m.x - 16, m.y - m.r - 10, 32 * Math.max(0, m.hp / m.max), 4);
        }
      }

      // Heroes
      heroes.forEach((h) => {
        if (!h.alive) {
          // Downed Tombstone / Ghost -> Revive Loop
          const p = 0.5 + 0.5 * Math.sin(now / 150);
          ctx.save(); ctx.globalAlpha = 0.55 + p * 0.35;
          ctx.fillStyle = '#252f4d'; E.rr(h.x - 16, h.y - 34, 32, 34, 8); ctx.fill();
          E.txt('💀', h.x, h.y - 10, '20px Segoe UI, Arial', '#fff', 'center', false);
          E.txt(`REVIVE (${Math.ceil(h.deadTimer)}s)`, h.x, h.y - 42, '800 12px Segoe UI, Arial', '#ffd23f', 'center');
          ctx.restore();
          return;
        }
        const tier = heroTier(h.lv);
        const sc = h.lv >= 10 ? 1.3 : (h.lv >= 6 ? 1.15 : 1);
        // 1. Ground contact shadow
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath(); ctx.ellipse(h.x, h.y + 3, 18 * sc, 6 * sc, 0, 0, Math.PI * 2); ctx.fill();

        // 2. Back-layer silhouettes (behind avatar & sword)
        if (tier.aura) {
          E.glow(h.x, h.y - 22, 54, 'gold');
          // Mecha shoulder thrusters
          ctx.fillStyle = '#00e5ff';
          E.rr(h.x - 22 * sc, h.y - 34 * sc, 8, 16, 3); ctx.fill();
          E.rr(h.x + 14 * sc, h.y - 34 * sc, 8, 16, 3); ctx.fill();
        }
        if (h.lv >= 6) {
          // Paladin radiant wings behind body
          const wf = Math.sin(now / 180 + h.x) * 4;
          ctx.fillStyle = 'rgba(0, 229, 255, 0.36)';
          ctx.beginPath(); ctx.moveTo(h.x - 6, h.y - 22 * sc); ctx.lineTo(h.x - 32 * sc, h.y - 46 * sc + wf); ctx.lineTo(h.x - 16 * sc, h.y - 10 * sc); ctx.fill();
          ctx.beginPath(); ctx.moveTo(h.x + 6, h.y - 22 * sc); ctx.lineTo(h.x + 32 * sc, h.y - 46 * sc + wf); ctx.lineTo(h.x + 16 * sc, h.y - 10 * sc); ctx.fill();
        }
        if (h.lv >= 3) {
          // Animated sine-wave cape behind body
          const cw = Math.sin(now / 150 + h.y) * 6;
          ctx.fillStyle = 'rgba(168, 85, 247, 0.55)';
          ctx.beginPath(); ctx.moveTo(h.x - 4, h.y - 26 * sc); ctx.lineTo(h.x - 22 * sc + cw, h.y + 2); ctx.lineTo(h.x - 2, h.y); ctx.fill();
        }
        if (h.shield > 0) {
          ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(h.x, h.y - 20, 29 * sc, 0, Math.PI * 2); ctx.stroke();
        }

        // 3. Foreground body + circular avatar + glowing plasma sword
        ctx.fillStyle = h.color; E.rr(h.x - 11 * sc, h.y - 28 * sc, 22 * sc, 28 * sc, 6); ctx.fill();
        E.drawAvatar(h.x, h.y - 40 * sc, 13 * sc, h.avatar, h.name, tier.col);
        ctx.save();
        ctx.translate(h.x + 13 * sc, h.y - 18 * sc);
        ctx.rotate(h.atkAnim > 0 ? (1 - h.atkAnim) * 1.4 - 0.5 : -0.4);
        ctx.fillStyle = tier.col; ctx.fillRect(0, -2, 22 * sc, 4);
        ctx.restore();

        // Orbiting drones
        for (let d = 0; d < tier.drones; d++) {
          const a = h.droneAngle + (d * Math.PI * 2) / tier.drones;
          const ox = h.x + Math.cos(a) * 34, oy = h.y - 20 + Math.sin(a) * 20;
          ctx.fillStyle = '#00e5ff'; ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.fill();
        }

        // HP bar + Low HP danger callout
        ctx.fillStyle = '#000a'; ctx.fillRect(h.x - 18, h.y - 60 * sc, 36, 4);
        ctx.fillStyle = h.hp / h.max < 0.3 ? '#ff3b5c' : '#2ecc71';
        ctx.fillRect(h.x - 18, h.y - 60 * sc, 36 * Math.max(0, h.hp / h.max), 4);
        if (h.hp / h.max < 0.3 && h.shield <= 0) {
          E.txt('⚠️ LOW HP! Gift=HEAL', h.x, h.y - 78 * sc, '800 12px Segoe UI, Arial', '#ff5964', 'center');
        }
        if (heroes.size < 65 || h.lv >= 3) {
          const nm = h.name.length > 10 ? h.name.slice(0, 9) + '…' : h.name;
          E.txt(`Lv.${h.lv} ${nm}`, h.x, h.y - 66 * sc, '700 12px Segoe UI, Arial', '#fff', 'center');
        }
      });

      // Projectiles (additive glow)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i];
        ctx.fillStyle = s.col;
        ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // Mega Spectacle Beams
      megaEffects.forEach((fx) => {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (fx.kind === 'orbital_cannon') {
          const alpha = Math.sin((fx.t / fx.maxT) * Math.PI);
          ctx.globalAlpha = Math.max(0, alpha);
          const g = ctx.createLinearGradient(0, 560, E.W, 740);
          g.addColorStop(0, '#00e5ff'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#ff3b5c');
          ctx.fillStyle = g; ctx.fillRect(200, 540, E.W - 200, 220);
          E.txt('🐉', 400 + (fx.t / fx.maxT) * 1100, 665, '140px Segoe UI, Arial', '#ffd23f', 'center', false);
        }
        ctx.restore();
      });

      // HUD: Citadel Delayed-Drain HP (Left), Wave & Streak (Center), Boss Delayed-Drain HP + Phase Dividers (Right)
      const cRatio = Math.max(0, citadel.hp / citadel.max);
      const cDisp = Math.max(cRatio, Math.min(1, citadel.dispHp / citadel.max));
      E.glassBox(30, 26, 680, 38, 10, '#2f8cff');
      ctx.save(); E.rr(33, 29, 674, 32, 8); ctx.clip();
      ctx.fillStyle = 'rgba(255,220,150,0.85)'; ctx.fillRect(33, 29, 674 * cDisp, 32);
      ctx.fillStyle = citadel.flash > 0 ? '#fff' : '#2f8cff'; ctx.fillRect(33, 29, 674 * cRatio, 32);
      ctx.restore();
      E.txt(`🏰 CITADEL: ${Math.ceil(citadel.hp)} / ${citadel.max}`, 370, 52, '700 19px Segoe UI, Arial', '#fff', 'center');

      E.glassBox(E.W / 2 - 150, 18, 300, 64, 14, '#ffd23f');
      E.txt(`WAVE ${wave}`, E.W / 2, 50, '900 28px Segoe UI, Arial', '#ffd23f', 'center');
      E.txt(`🔥 Streak ${E.fmtTime(streakTime)}`, E.W / 2, 73, '700 15px Segoe UI, Arial', '#cbd5f5', 'center', false);

      if (boss) {
        const bRatio = Math.max(0, boss.hp / boss.max);
        const bDisp = Math.max(bRatio, Math.min(1, boss.dispHp / boss.max));
        E.glassBox(E.W - 710, 26, 680, 38, 10, boss.col);
        ctx.save(); E.rr(E.W - 707, 29, 674, 32, 8); ctx.clip();
        ctx.fillStyle = 'rgba(255,220,150,0.85)'; ctx.fillRect(E.W - 707, 29, 674 * bDisp, 32);
        ctx.fillStyle = boss.flash > 0 ? '#fff' : boss.col; ctx.fillRect(E.W - 707, 29, 674 * bRatio, 32);
        // 66% & 33% Phase divider ticks
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillRect(E.W - 707 + 674 * 0.33, 29, 2, 32);
        ctx.fillRect(E.W - 707 + 674 * 0.66, 29, 2, 32);
        ctx.restore();
        E.txt(`👹 ${boss.name}: ${Math.ceil(boss.hp)} / ${boss.max}${boss.shield > 0 ? ' [SHIELD]' : ''}`, E.W - 370, 52, '700 18px Segoe UI, Arial', '#fff', 'center');
      }

      if (crownedDonor) {
        E.txt(`🐉 CANNON HERO: ${crownedDonor.name}`, 36, 94, '800 18px Segoe UI, Arial', '#ffd23f', 'left');
      }

      // Top 3 Damage
      const top = Array.from(heroes.values()).sort((a, b) => b.dmg - a.dmg).slice(0, 3);
      E.glassBox(E.W / 2 - 175, 96, 350, 32 + 28 * Math.max(1, top.length), 12, 'rgba(255,210,63,0.45)');
      E.txt('⚔️ TOP RAID DAMAGE', E.W / 2, 119, '700 16px Segoe UI, Arial', '#ffd23f', 'center', false);
      if (!top.length) E.txt('None yet', E.W / 2, 148, '500 15px Segoe UI, Arial', '#9aa3c0', 'center', false);
      top.forEach((h, i) => {
        const nm = h.name.length > 14 ? h.name.slice(0, 13) + '…' : h.name;
        E.txt(`${i + 1}. Lv.${h.lv} ${nm}`, E.W / 2 - 155, 148 + i * 28, '600 16px Segoe UI, Arial', h.color, 'left', false);
        E.txt('💥 ' + h.dmg, E.W / 2 + 155, 148 + i * 28, '700 16px Segoe UI, Arial', '#ffd23f', 'right', false);
      });

      // Bottom CTA Bar
      E.glassBox(E.W / 2 - 540, E.H - 68, 1080, 46, 23, 'rgba(0,229,255,0.4)');
      E.txt('Like/Chat = Join • 1-99💎 = Revive/Heal/Drones • 100💎 = Meteor • 500💎 = Orbital Cannon!', E.W / 2, E.H - 36, '700 22px Segoe UI, Arial', '#fff', 'center', false);
    }
  };
})();
