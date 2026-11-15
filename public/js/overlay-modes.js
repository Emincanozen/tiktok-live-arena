/* TikTok Live Arena — Interactive Game Modes: balls, halay, music, boss */
(function () {
  'use strict';

  const M = {};
  const COLORS = ['#ff3b5c', '#2f8cff', '#ffd23f', '#2ecc71', '#a855f7', '#00e5ff', '#ff7b00', '#ff66b2'];
  const PENTA = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];

  function colorFor(id) {
    let h = 0;
    const s = String(id || 'x');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return COLORS[Math.abs(h) % COLORS.length];
  }

  function drawTopPanel(E, title, entries, valuePrefix) {
    E.glassBox(E.W / 2 - 175, 92, 350, 32 + 28 * Math.max(1, entries.length), 12, 'rgba(255,210,63,0.45)');
    E.txt(title, E.W / 2, 115, '700 16px Segoe UI, Arial', '#ffd23f', 'center', false);
    if (!entries.length) {
      E.txt('None yet', E.W / 2, 144, '500 15px Segoe UI, Arial', '#9aa3c0', 'center', false);
      return;
    }
    entries.forEach((e, i) => {
      const nm = e.name.length > 15 ? e.name.slice(0, 14) + '…' : e.name;
      E.txt((i + 1) + '. ' + nm, E.W / 2 - 155, 144 + i * 28, '600 17px Segoe UI, Arial', e.color || '#fff', 'left', false);
      E.txt(valuePrefix + e.val, E.W / 2 + 155, 144 + i * 28, '700 17px Segoe UI, Arial', '#ffd23f', 'right', false);
    });
  }

  function drawBottomHint(E, text) {
    E.glassBox(E.W / 2 - 470, E.H - 68, 940, 46, 23, 'rgba(0,229,255,0.4)');
    E.txt(text, E.W / 2, E.H - 36, '700 24px Segoe UI, Arial', '#fff', 'center', false);
  }

  /* =========================================================
     1. CHAOS BALL RING (balls)
     ========================================================= */
  M.balls = (function () {
    const CX = 960, CY = 555, RING_R = 390;
    let balls = [];
    let scores = new Map(); // uid -> { name, score, color, avatar }
    let ringAngle = 0, ringSpeed = 0.55, gapSize = 0.42;
    let lastNote = 0, escapedCount = 0;

    function addBall(user, diamonds, boost) {
      if (balls.length >= 280) balls.shift();
      const col = colorFor(user.uniqueId);
      const r = Math.max(14, Math.min(44, 14 + Math.sqrt(diamonds || 1) * 2.1 + (boost ? 6 : 0)));
      const a = Math.random() * Math.PI * 2;
      const dist = Math.random() * 110;
      balls.push({
        x: CX + Math.cos(a) * dist,
        y: CY - 80 + Math.sin(a) * dist,
        vx: (Math.random() - 0.5) * 380,
        vy: -120 - Math.random() * 200,
        r,
        mass: r * r,
        col,
        name: user.nickname || user.uniqueId || 'Player',
        uid: user.uniqueId || 'anon',
        avatar: user.avatar || '',
        trail: [],
        bounces: 0
      });
      if (!scores.has(user.uniqueId)) {
        scores.set(user.uniqueId, { name: user.nickname || user.uniqueId, score: 0, color: col, avatar: user.avatar || '' });
      }
      const sc = scores.get(user.uniqueId);
      sc.score += Math.max(1, diamonds || 1);
    }

    return {
      reset(clear) {
        balls = [];
        ringAngle = 0;
        ringSpeed = 0.55;
        escapedCount = 0;
        if (clear) scores.clear();
      },
      onAction(E, a, ev, u) {
        if (!u) return;
        const dm = ev.gift ? (ev.gift.diamonds || 1) * (ev.gift.count || 1) : 1;
        if (a.type === 'spawn' || a.type === 'join') {
          const n = a.type === 'spawn' ? Math.max(1, Math.min(8, Math.ceil((+a.units || 1) / 4))) : 1;
          for (let i = 0; i < n; i++) addBall(u, dm, false);
        } else if (a.type === 'boost') {
          addBall(u, 50, true);
          ringSpeed += 0.35;
        }
      },
      update(E, dt, roundTime) {
        const difficulty = 1 + Math.min(2.2, balls.length / 45);
        ringAngle = (ringAngle + ringSpeed * difficulty * dt) % (Math.PI * 2);
        ringSpeed = Math.max(0.55, ringSpeed - dt * 0.05);

        const grav = 680 * (1 + Math.min(0.4, balls.length / 120));
        const now = performance.now();

        for (let i = balls.length - 1; i >= 0; i--) {
          const b = balls[i];
          b.vy += grav * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;

          b.trail.push({ x: b.x, y: b.y });
          if (b.trail.length > 7) b.trail.shift();

          const dx = b.x - CX, dy = b.y - CY;
          const dist = Math.hypot(dx, dy);

          // Inner obstacle bar when >= 15 balls
          if (balls.length >= 15) {
            const barA = -ringAngle * 1.4;
            const bx = Math.cos(barA), by = Math.sin(barA);
            const proj = dx * bx + dy * by;
            if (Math.abs(proj) < 150) {
              const perp = -dx * by + dy * bx;
              if (Math.abs(perp) < b.r + 7) {
                const sign = perp >= 0 ? 1 : -1;
                const nx = -by * sign, ny = bx * sign;
                b.x += nx * (b.r + 8 - Math.abs(perp));
                b.y += ny * (b.r + 8 - Math.abs(perp));
                const dot = b.vx * nx + b.vy * ny;
                if (dot < 0) {
                  b.vx -= 1.85 * dot * nx;
                  b.vy -= 1.85 * dot * ny;
                }
              }
            }
          }

          // Ring collision
          if (dist + b.r >= RING_R && dist - b.r <= RING_R + 22) {
            let ang = Math.atan2(dy, dx);
            if (ang < 0) ang += Math.PI * 2;
            let diff = Math.abs(ang - ringAngle);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;

            if (diff > gapSize) {
              const nx = -dx / (dist || 1), ny = -dy / (dist || 1);
              b.x = CX - nx * (RING_R - b.r - 1);
              b.y = CY - ny * (RING_R - b.r - 1);
              const dot = b.vx * nx + b.vy * ny;
              if (dot < 0) {
                b.vx = (b.vx - 1.92 * dot * nx) * 0.99;
                b.vy = (b.vy - 1.92 * dot * ny) * 0.99;
                b.vx += (Math.random() - 0.5) * 40;
                b.bounces++;
                if (now - lastNote > 55) {
                  lastNote = now;
                  const f = PENTA[(b.bounces + i) % PENTA.length];
                  E.tone(f, 0.14, 'triangle', 0.06);
                }
                E.burst(b.x - nx * b.r, b.y - ny * b.r, 3, b.col, 90);
              }
            }
          }

          // Escaped through gap!
          if (dist > RING_R + 90) {
            escapedCount++;
            const sc = scores.get(b.uid);
            if (sc) sc.score += 25;
            E.burst(b.x, b.y, 14, b.col, 220);
            E.floatText(Math.max(120, Math.min(E.W - 120, b.x)), Math.max(140, Math.min(E.H - 120, b.y)), `${b.name} +25!`, '#ffd23f', 24);
            E.sfx('coin');
            // Respawn back inside for continuous chaos
            b.x = CX + (Math.random() - 0.5) * 80;
            b.y = CY - 100;
            b.vx = (Math.random() - 0.5) * 320;
            b.vy = -150;
          }
        }

        // Ball-to-ball elastic collisions (cap checks for 60fps)
        const n = balls.length;
        for (let i = 0; i < n; i++) {
          const a = balls[i];
          for (let j = i + 1; j < n; j++) {
            const b = balls[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const minD = a.r + b.r;
            const d2 = dx * dx + dy * dy;
            if (d2 > 0 && d2 < minD * minD) {
              const d = Math.sqrt(d2);
              const nx = dx / d, ny = dy / d;
              const overlap = (minD - d) * 0.5;
              a.x -= nx * overlap; a.y -= ny * overlap;
              b.x += nx * overlap; b.y += ny * overlap;
              const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
              const p = (dvx * nx + dvy * ny);
              if (p > 0) {
                const m1 = a.mass, m2 = b.mass, tot = m1 + m2;
                const imp = (2 * p) / tot;
                a.vx -= imp * m2 * nx; a.vy -= imp * m2 * ny;
                b.vx += imp * m1 * nx; b.vy += imp * m1 * ny;
              }
            }
          }
        }

        if (roundTime <= 0) {
          let top = null;
          scores.forEach((v, k) => { if (!top || v.score > top.score) top = { uniqueId: k, nickname: v.name, diamonds: v.score, avatar: v.avatar }; });
          E.endRound('CHAOS RING', top);
        }
      },
      draw(E) {
        const ctx = E.ctx;
        // Arena glow
        const grad = ctx.createRadialGradient(CX, CY, RING_R * 0.6, CX, CY, RING_R + 40);
        grad.addColorStop(0, 'rgba(47,140,255,0.03)');
        grad.addColorStop(1, 'rgba(168,85,247,0.16)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(CX, CY, RING_R + 30, 0, Math.PI * 2); ctx.fill();

        // Rotating neon ring with gap
        ctx.save();
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(CX, CY, RING_R, ringAngle + gapSize, ringAngle + Math.PI * 2 - gapSize);
        ctx.stroke();

        // Inner bumper bar if >= 15 balls
        if (balls.length >= 15) {
          const barA = -ringAngle * 1.4;
          ctx.strokeStyle = '#ff3b5c';
          ctx.shadowColor = '#ff3b5c';
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(CX - Math.cos(barA) * 145, CY - Math.sin(barA) * 145);
          ctx.lineTo(CX + Math.cos(barA) * 145, CY + Math.sin(barA) * 145);
          ctx.stroke();
        }
        ctx.restore();

        // Balls & trails (additive glow + circular neon avatar)
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          if (b.trail.length > 1) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = b.col;
            ctx.lineWidth = b.r * 0.6;
            ctx.globalAlpha = 0.28;
            ctx.beginPath();
            ctx.moveTo(b.trail[0].x, b.trail[0].y);
            for (let k = 1; k < b.trail.length; k++) ctx.lineTo(b.trail[k].x, b.trail[k].y);
            ctx.stroke();
            ctx.restore();
          }
          E.drawAvatar(b.x, b.y, b.r, b.avatar, b.name, '#fff');
          if (balls.length < 90 || b.r >= 22) {
            const nm = b.name.length > 10 ? b.name.slice(0, 9) + '…' : b.name;
            E.txt(nm, b.x, b.y - b.r - 6, '700 13px Segoe UI, Arial', '#fff', 'center');
          }
        }

        // HUD
        E.txt(`🔮 CHAOS BALL RING`, 40, 56, '800 32px Segoe UI, Arial', '#00e5ff', 'left');
        E.txt(`Balls: ${balls.length} • Escaped: ${escapedCount}`, 40, 90, '600 18px Segoe UI, Arial', '#cbd5f5', 'left');

        const top = Array.from(scores.values()).sort((a, b) => b.score - a.score).slice(0, 3)
          .map((s) => ({ name: s.name, val: s.score, color: s.color }));
        drawTopPanel(E, '🏆 RING LEADERS', top, '⚡ ');
        drawBottomHint(E, 'Send gifts, likes, or chat to drop your ball! Escape the gap for +25 pts!');
      }
    };
  })();

  /* =========================================================
     2. LIVE HALAY & DANCE PARTY (halay)
     ========================================================= */
  M.halay = (function () {
    let dancers = new Map(); // uid -> { uid, name, avatar, color, diamonds, phaseOffset, hype }
    let bpm = 105, beatPhase = 0, lastBeatIdx = -1, partyHype = 20, spotlights = 0;
    const FOLK_MELODY = [440, 493.88, 523.25, 587.33, 523.25, 493.88, 440, 392, 440, 523.25, 659.25, 587.33, 523.25, 493.88, 440, 440];

    function addDancer(u, dm) {
      let d = dancers.get(u.uniqueId);
      if (!d) {
        if (dancers.size >= 48) {
          // Remove lowest diamond non-leader
          let minK = null, minV = Infinity;
          dancers.forEach((v, k) => { if (v.diamonds < minV) { minV = v.diamonds; minK = k; } });
          if (minK) dancers.delete(minK);
        }
        d = {
          uid: u.uniqueId,
          name: u.nickname || u.uniqueId,
          avatar: u.avatar || '',
          color: colorFor(u.uniqueId),
          diamonds: 0,
          hype: 1
        };
        dancers.set(u.uniqueId, d);
      }
      d.diamonds += dm;
      d.hype = 1.5;
    }

    return {
      reset(clear) {
        bpm = 105; partyHype = 20; spotlights = 0; beatPhase = 0; lastBeatIdx = -1;
        if (clear) dancers.clear();
      },
      onAction(E, a, ev, u) {
        if (!u) return;
        const dm = ev.gift ? (ev.gift.diamonds || 1) * (ev.gift.count || 1) : 1;
        if (a.type === 'spawn' || a.type === 'join' || a.type === 'boost') {
          addDancer(u, ev.gift ? dm : 1);
          bpm = Math.min(180, bpm + (ev.gift ? Math.min(18, 2 + Math.sqrt(dm)) : 1.5));
          partyHype = Math.min(100, partyHype + (ev.gift ? Math.min(30, 5 + dm * 0.2) : 3));
          if (ev.gift && dm >= 20) spotlights = 5;
        }
      },
      update(E, dt, roundTime) {
        bpm = Math.max(100, bpm - dt * 1.4);
        partyHype = Math.max(10, partyHype - dt * 2.5);
        if (spotlights > 0) spotlights -= dt;

        beatPhase += (bpm / 60) * dt * 2; // 8th-note grid
        const idx = Math.floor(beatPhase);
        if (idx !== lastBeatIdx) {
          lastBeatIdx = idx;
          if (dancers.size > 0) {
            if (idx % 2 === 0) E.tone(95, 0.09, 'sine', 0.14, 0, 42); // Davul kick
            else E.noise(0.05, 0.06, 2200); // Darbuka rim
            if (partyHype > 35 || idx % 2 === 0) {
              const note = FOLK_MELODY[idx % FOLK_MELODY.length];
              E.tone(note, 0.16, 'sawtooth', 0.035);
            }
          }
        }
        dancers.forEach((d) => { if (d.hype > 0) d.hype = Math.max(0, d.hype - dt * 1.2); });

        if (roundTime <= 0) {
          let leader = null;
          dancers.forEach((d) => { if (!leader || d.diamonds > leader.diamonds) leader = d; });
          E.endRound('HALAY PARTY', leader ? { uniqueId: leader.uid, nickname: leader.name, diamonds: leader.diamonds, avatar: leader.avatar } : null);
        }
      },
      draw(E) {
        const ctx = E.ctx;
        const list = Array.from(dancers.values()).sort((a, b) => b.diamonds - a.diamonds);

        // Stage spotlights
        if (spotlights > 0 || partyHype > 50) {
          const t = performance.now() / 600;
          for (let s = 0; s < 3; s++) {
            const sx = E.W * (0.25 + s * 0.25) + Math.sin(t + s * 2) * 140;
            const g = ctx.createLinearGradient(sx, 0, sx, E.H);
            g.addColorStop(0, s % 2 === 0 ? 'rgba(255,210,63,0.18)' : 'rgba(168,85,247,0.18)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(sx - 40, 0); ctx.lineTo(sx + 40, 0); ctx.lineTo(sx + 220, E.H); ctx.lineTo(sx - 220, E.H); ctx.closePath(); ctx.fill();
          }
        }

        // Dance floor glow
        const fg = ctx.createLinearGradient(0, 740, 0, E.H);
        fg.addColorStop(0, 'rgba(168,85,247,0)');
        fg.addColorStop(0.3, 'rgba(168,85,247,0.28)');
        fg.addColorStop(1, 'rgba(15,18,38,0.85)');
        ctx.fillStyle = fg; ctx.fillRect(0, 740, E.W, E.H - 740);

        // Draw curved Halay chain
        const count = list.length;
        const maxShow = Math.min(count, 26);
        const startX = E.W / 2 - ((maxShow - 1) * 66) / 2;
        const bounce = Math.abs(Math.sin(beatPhase * Math.PI * 0.5)) * (14 + partyHype * 0.18);
        const sway = Math.sin(beatPhase * Math.PI * 0.25) * 16;

        // Holding hands line first
        if (maxShow > 1) {
          ctx.strokeStyle = '#ffd23f';
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i = 0; i < maxShow; i++) {
            const uNorm = maxShow > 1 ? (i / (maxShow - 1)) * 2 - 1 : 0;
            const dx = startX + i * 66 + sway;
            const dy = 780 - Math.cos(uNorm * 1.2) * 55 - bounce * (i % 2 === 0 ? 1 : 0.8);
            if (i === 0) ctx.moveTo(dx, dy - 28);
            else ctx.lineTo(dx, dy - 28);
          }
          ctx.stroke();
        }

        for (let i = maxShow - 1; i >= 0; i--) {
          const d = list[i];
          const isLeader = i === 0;
          const uNorm = maxShow > 1 ? (i / (maxShow - 1)) * 2 - 1 : 0;
          const dx = startX + i * 66 + sway;
          const dy = 780 - Math.cos(uNorm * 1.2) * 55 - bounce * (i % 2 === 0 ? 1 : 0.8);

          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.ellipse(dx, 800 - Math.cos(uNorm * 1.2) * 55, 22, 7, 0, 0, Math.PI * 2); ctx.fill();

          // Legs
          const leg = Math.sin(beatPhase * Math.PI * 0.5 + i) * 9;
          ctx.strokeStyle = '#1e2640'; ctx.lineWidth = 7;
          ctx.beginPath(); ctx.moveTo(dx - 7, dy - 16); ctx.lineTo(dx - 10 + leg, dy + 8); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(dx + 7, dy - 16); ctx.lineTo(dx + 10 - leg, dy + 8); ctx.stroke();

          // Torso
          ctx.fillStyle = d.color;
          E.rr(dx - 15, dy - 52, 30, 38, 8); ctx.fill();

          // Head / Circular Avatar
          E.drawAvatar(dx, dy - 72, 18, d.avatar, d.name, isLeader ? '#ffd23f' : '#fff');

          // Leader crown + waving handkerchief (mendil)
          if (isLeader) {
            E.txt('👑', dx, dy - 96, '28px Segoe UI, Arial', '#ffd23f', 'center', false);
            const wx = dx - 32 + Math.sin(beatPhase * 2) * 14;
            const wy = dy - 75 + Math.cos(beatPhase * 2) * 12;
            ctx.fillStyle = '#fff';
            ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(dx - 18, dy - 42);
            ctx.quadraticCurveTo(wx, wy - 20, wx - 18, wy + 10);
            ctx.quadraticCurveTo(wx - 2, wy + 18, dx - 18, dy - 42);
            ctx.fill();
            ctx.shadowBlur = 0;
          }

          const nm = d.name.length > 10 ? d.name.slice(0, 9) + '…' : d.name;
          E.txt(nm, dx, dy + 30, '700 13px Segoe UI, Arial', isLeader ? '#ffd23f' : '#fff', 'center');
        }

        // HUD
        E.txt('💃 LIVE HALAY PARTY', 40, 56, '800 32px Segoe UI, Arial', '#ffd23f', 'left');
        E.txt(`BPM: ${Math.round(bpm)} • Dancers: ${dancers.size} • Hype: ${Math.round(partyHype)}%`, 40, 90, '600 18px Segoe UI, Arial', '#cbd5f5', 'left');

        const top = list.slice(0, 3).map((d) => ({ name: (d === list[0] ? '👑 ' : '') + d.name, val: d.diamonds, color: d.color }));
        drawTopPanel(E, '👑 HALAY LEADERS', top, '💎 ');
        drawBottomHint(E, 'Send gifts or chat to join the Halay chain! Top gifter waves the Mendil!');
      }
    };
  })();

  /* =========================================================
     3. SYNTH MAESTRO & NOTE RUSH (music)
     ========================================================= */
  M.music = (function () {
    const CX = 960, CY = 540;
    const TRACKS = [
      { name: 'Lead', color: '#00e5ff', r: 170, notes: [523.25, 587.33, 659.25, 783.99, 880, 1046.5] },
      { name: 'Arp',  color: '#a855f7', r: 240, notes: [392.00, 440.00, 523.25, 659.25, 783.99] },
      { name: 'Bass', color: '#ff3b5c', r: 310, notes: [130.81, 146.83, 164.81, 196.00, 220.00] },
      { name: 'Beat', color: '#ffd23f', r: 380, notes: [80, 110, 140] }
    ];
    let orbs = [], composers = new Map();
    let bpm = 110, combo = 1, notesPlayed = 0, pulse = 0;
    const bars = new Float32Array(48);

    function spawnOrb(u, dm) {
      if (orbs.length >= 160) orbs.shift();
      const ti = Math.floor(Math.random() * TRACKS.length);
      const tr = TRACKS[ti];
      const ang = Math.random() * Math.PI * 2;
      orbs.push({
        ti,
        ang,
        dist: 620 + Math.random() * 140,
        speed: 210 + Math.min(240, bpm * 1.1) + Math.sqrt(dm) * 8,
        col: tr.color,
        name: u.nickname || u.uniqueId,
        uid: u.uniqueId,
        dm
      });
      if (!composers.has(u.uniqueId)) composers.set(u.uniqueId, { name: u.nickname || u.uniqueId, score: 0, color: tr.color, avatar: u.avatar || '' });
      composers.get(u.uniqueId).score += Math.max(1, dm);
    }

    return {
      reset(clear) {
        orbs = []; bpm = 110; combo = 1; notesPlayed = 0; pulse = 0;
        bars.fill(0);
        if (clear) composers.clear();
      },
      onAction(E, a, ev, u) {
        if (!u) return;
        const dm = ev.gift ? (ev.gift.diamonds || 1) * (ev.gift.count || 1) : 1;
        if (a.type === 'spawn' || a.type === 'join' || a.type === 'boost') {
          const cnt = Math.min(6, a.type === 'boost' ? 6 : Math.max(1, Math.ceil((+a.units || 1) / 5)));
          for (let i = 0; i < cnt; i++) spawnOrb(u, dm);
          bpm = Math.min(185, bpm + (ev.gift ? Math.min(12, 1 + Math.sqrt(dm) * 0.8) : 0.8));
          combo = Math.min(16, combo + (ev.gift ? 1 : 0.25));
        }
      },
      update(E, dt, roundTime) {
        bpm = Math.max(105, bpm - dt * 1.2);
        combo = Math.max(1, combo - dt * 0.2);
        pulse = Math.max(0, pulse - dt * 4);
        for (let i = 0; i < bars.length; i++) bars[i] = Math.max(0, bars[i] - dt * 2.8);

        for (let i = orbs.length - 1; i >= 0; i--) {
          const o = orbs[i];
          o.dist -= o.speed * dt;
          const tr = TRACKS[o.ti];
          if (o.dist <= tr.r) {
            notesPlayed++;
            pulse = 1;
            const bi = Math.floor(((o.ang % (Math.PI * 2)) / (Math.PI * 2)) * bars.length);
            bars[(bi + bars.length) % bars.length] = 1;
            const x = CX + Math.cos(o.ang) * tr.r;
            const y = CY + Math.sin(o.ang) * tr.r;
            E.burst(x, y, 6, tr.color, 130);
            const freq = tr.notes[notesPlayed % tr.notes.length];
            if (tr.name === 'Beat') E.tone(freq, 0.1, 'sine', 0.14, 0, 38);
            else E.tone(freq, 0.22, tr.name === 'Bass' ? 'sawtooth' : 'triangle', 0.06);
            orbs.splice(i, 1);
          }
        }

        if (roundTime <= 0) {
          let top = null;
          composers.forEach((v, k) => { if (!top || v.score > top.score) top = { uniqueId: k, nickname: v.name, diamonds: v.score, avatar: v.avatar }; });
          E.endRound('SYNTH MAESTRO', top);
        }
      },
      draw(E) {
        const ctx = E.ctx;
        // Target rings
        TRACKS.forEach((tr) => {
          ctx.strokeStyle = tr.color;
          ctx.globalAlpha = 0.28 + pulse * 0.2;
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(CX, CY, tr.r, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.globalAlpha = 1;

        // Radial audio visualizer bars around maestro (additive glow)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < bars.length; i++) {
          const a = (i / bars.length) * Math.PI * 2;
          const len = 18 + bars[i] * 58;
          ctx.strokeStyle = COLORS[i % COLORS.length];
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(CX + Math.cos(a) * 95, CY + Math.sin(a) * 95);
          ctx.lineTo(CX + Math.cos(a) * (95 + len), CY + Math.sin(a) * (95 + len));
          ctx.stroke();
        }
        ctx.restore();

        // Center Synth Maestro avatar/deck
        ctx.fillStyle = '#151c36';
        ctx.beginPath(); ctx.arc(CX, CY, 88 + pulse * 6, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#00e5ff'; ctx.stroke();
        E.txt('🎧', CX, CY + 12, '58px Segoe UI, Arial', '#fff', 'center', false);
        E.txt(`${Math.round(bpm)} BPM`, CX, CY + 54, '800 18px Segoe UI, Arial', '#ffd23f', 'center', false);

        // Flying note orbs
        for (let i = 0; i < orbs.length; i++) {
          const o = orbs[i];
          const x = CX + Math.cos(o.ang) * o.dist;
          const y = CY + Math.sin(o.ang) * o.dist;
          ctx.fillStyle = o.col;
          ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
          E.txt('♪', x, y + 5, '700 14px Segoe UI, Arial', '#fff', 'center', false);
          if (orbs.length < 40) {
            const nm = o.name.length > 10 ? o.name.slice(0, 9) + '…' : o.name;
            E.txt(nm, x, y - 16, '600 12px Segoe UI, Arial', '#e8ecf8', 'center');
          }
        }

        // HUD
        E.txt('🎹 SYNTH MAESTRO', 40, 56, '800 32px Segoe UI, Arial', '#a855f7', 'left');
        E.txt(`Combo: x${combo.toFixed(1)} • Notes: ${notesPlayed}`, 40, 90, '600 18px Segoe UI, Arial', '#cbd5f5', 'left');

        const top = Array.from(composers.values()).sort((a, b) => b.score - a.score).slice(0, 3)
          .map((c) => ({ name: c.name, val: c.score, color: c.color }));
        drawTopPanel(E, '🎵 TOP COMPOSERS', top, '♪ ');
        drawBottomHint(E, 'Send gifts, likes, or comments to drop synth notes and raise the BPM!');
      }
    };
  })();

  /* =========================================================
     4. TITAN BOSS RAID (boss)
     ========================================================= */
  M.boss = (function () {
    const BOSS_X = 1480, BOSS_Y = 580;
    let level = 1, bossHp = 5000, bossMax = 5000, bossFlash = 0, shockwave = 0;
    let heroes = [], shots = [], damageByUser = new Map(), shieldTimer = 0;

    function spawnHero(u, big) {
      if (heroes.length >= 160) heroes.shift();
      heroes.push({
        x: 160 + Math.random() * 240,
        y: 360 + Math.random() * 520,
        hp: big ? 120 : 40,
        cd: Math.random() * 0.6,
        col: colorFor(u.uniqueId),
        name: u.nickname || u.uniqueId,
        uid: u.uniqueId,
        avatar: u.avatar || '',
        big: !!big
      });
      if (!damageByUser.has(u.uniqueId)) {
        damageByUser.set(u.uniqueId, { name: u.nickname || u.uniqueId, dmg: 0, color: colorFor(u.uniqueId), avatar: u.avatar || '' });
      }
    }

    function dealBossDamage(E, uid, name, dmg, col) {
      bossHp -= dmg;
      bossFlash = 0.12;
      const rec = damageByUser.get(uid);
      if (rec) rec.dmg += Math.round(dmg);
      E.floatText(BOSS_X + (Math.random() - 0.5) * 140, BOSS_Y - 110 + (Math.random() - 0.5) * 80, '-' + Math.round(dmg), col || '#ffe066', 24);
    }

    return {
      reset(clear) {
        const base = (E_castleHp() || 1000) * 5;
        if (clear) { level = 1; damageByUser.clear(); }
        bossMax = base * level;
        bossHp = bossMax;
        bossFlash = 0; shockwave = 0; shieldTimer = 0;
        heroes = []; shots = [];
      },
      onAction(E, a, ev, u) {
        if (!u) return;
        const dm = ev.gift ? (ev.gift.diamonds || 1) * (ev.gift.count || 1) : 1;
        if (a.type === 'spawn' || a.type === 'join') {
          const cnt = a.type === 'spawn' ? Math.max(1, Math.min(12, Math.ceil((+a.units || 1) / 3))) : 1;
          for (let i = 0; i < cnt; i++) spawnHero(u, dm >= 100);
          if (dm >= 100) {
            // Meteor strike
            dealBossDamage(E, u.uniqueId, u.nickname, 120 + dm * 0.5, '#ff7b00');
            E.burst(BOSS_X, BOSS_Y, 24, '#ff7b00', 280);
            E.sfx('boom');
          }
        } else if (a.type === 'boost') {
          shieldTimer = 8;
          dealBossDamage(E, u.uniqueId, u.nickname, 300, '#00e5ff');
          E.burst(BOSS_X, BOSS_Y, 30, '#00e5ff', 320);
          E.sfx('horn');
        }
      },
      update(E, dt, roundTime) {
        if (bossFlash > 0) bossFlash -= dt;
        if (shieldTimer > 0) shieldTimer -= dt;
        shockwave += dt;

        // Boss periodic shockwave every 9s
        if (shockwave >= 9) {
          shockwave = 0;
          if (shieldTimer <= 0 && heroes.length > 0) {
            E.burst(BOSS_X, BOSS_Y, 20, '#ff3b5c', 360);
            for (let i = heroes.length - 1; i >= 0; i--) {
              heroes[i].hp -= 15;
              if (heroes[i].hp <= 0) heroes.splice(i, 1);
            }
          }
        }

        // Heroes march & shoot
        for (let i = 0; i < heroes.length; i++) {
          const h = heroes[i];
          if (h.x < 980) h.x += 55 * dt;
          h.cd -= dt;
          if (h.cd <= 0) {
            h.cd = h.big ? 0.55 : 0.9;
            shots.push({
              x: h.x + 18, y: h.y - 16,
              vx: 720, vy: (BOSS_Y - h.y) * 0.55,
              dmg: h.big ? 28 : 12,
              col: h.col, uid: h.uid, name: h.name
            });
          }
        }

        for (let i = shots.length - 1; i >= 0; i--) {
          const s = shots[i];
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (Math.hypot(s.x - BOSS_X, s.y - BOSS_Y) < 120) {
            dealBossDamage(E, s.uid, s.name, s.dmg, s.col);
            E.burst(s.x, s.y, 4, s.col, 110);
            shots.splice(i, 1);
          } else if (s.x > E.W) {
            shots.splice(i, 1);
          }
        }

        if (bossHp <= 0) {
          bossHp = 0;
          let mvp = null;
          damageByUser.forEach((v, k) => { if (!mvp || v.dmg > mvp.diamonds) mvp = { uniqueId: k, nickname: v.name, diamonds: v.dmg, avatar: v.avatar }; });
          level++;
          E.endRound('HEROES', mvp);
        } else if (roundTime <= 0) {
          let mvp = null;
          damageByUser.forEach((v, k) => { if (!mvp || v.dmg > mvp.diamonds) mvp = { uniqueId: k, nickname: v.name, diamonds: v.dmg, avatar: v.avatar }; });
          E.endRound('TITAN', mvp);
        }
      },
      draw(E) {
        const ctx = E.ctx;
        const hpRatio = Math.max(0, bossHp / bossMax);
        const phase = hpRatio > 0.66 ? 1 : (hpRatio > 0.33 ? 2 : 3);
        const bossCol = phase === 1 ? '#a855f7' : (phase === 2 ? '#ff7b00' : '#ff3b5c');
        const bob = Math.sin(performance.now() / 320) * 14;

        // Titan Boss
        ctx.save();
        ctx.translate(BOSS_X, BOSS_Y + bob);
        if (bossFlash > 0) ctx.globalAlpha = 0.72;
        ctx.fillStyle = bossCol;
        ctx.shadowColor = bossCol; ctx.shadowBlur = 28;
        ctx.beginPath(); ctx.arc(0, 0, 128, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#15182c';
        ctx.beginPath(); ctx.arc(0, 0, 102, 0, Math.PI * 2); ctx.fill();
        // Eyes
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.arc(-36, -20, 16, 0, Math.PI * 2); ctx.arc(36, -20, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff3b5c';
        ctx.beginPath(); ctx.arc(-36, -20, 7, 0, Math.PI * 2); ctx.arc(36, -20, 7, 0, Math.PI * 2); ctx.fill();
        E.txt(`TITAN LV.${level}`, 0, 165, '800 28px Segoe UI, Arial', bossCol, 'center');
        ctx.restore();

        // Boss HP Bar
        const bx = 460, bw = 1000, by = 30, bh = 34;
        ctx.fillStyle = 'rgba(8,10,20,0.8)'; E.rr(bx, by, bw, bh, 10); ctx.fill();
        ctx.fillStyle = bossCol; E.rr(bx + 3, by + 3, (bw - 6) * hpRatio, bh - 6, 8); ctx.fill();
        E.txt(`👹 TITAN LV.${level} — ${Math.ceil(bossHp)} / ${bossMax}`, E.W / 2, by + 24, '700 20px Segoe UI, Arial', '#fff', 'center');

        // Heroes
        for (let i = 0; i < heroes.length; i++) {
          const h = heroes[i];
          const sc = h.big ? 1.3 : 1;
          ctx.fillStyle = h.col;
          E.rr(h.x - 10 * sc, h.y - 28 * sc, 20 * sc, 28 * sc, 6); ctx.fill();
          E.drawAvatar(h.x, h.y - 40 * sc, 12 * sc, h.avatar, h.name, h.big ? '#ffd23f' : '#fff');
          if (heroes.length < 70 || h.big) {
            const nm = h.name.length > 10 ? h.name.slice(0, 9) + '…' : h.name;
            E.txt(nm, h.x, h.y - 58 * sc, '600 12px Segoe UI, Arial', '#fff', 'center');
          }
        }
        // Projectiles (additive glow)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < shots.length; i++) {
          const s = shots[i];
          ctx.fillStyle = s.col;
          ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();

        if (shieldTimer > 0) {
          E.txt(`🛡️ TEAM SHIELD ACTIVE (${Math.ceil(shieldTimer)}s)`, 40, 92, '700 20px Segoe UI, Arial', '#00e5ff', 'left');
        }
        const top = Array.from(damageByUser.values()).sort((a, b) => b.dmg - a.dmg).slice(0, 3)
          .map((d) => ({ name: d.name, val: d.dmg, color: d.color }));
        drawTopPanel(E, '⚔️ TOP RAID DAMAGE', top, '💥 ');
        drawBottomHint(E, 'Co-op Raid! Send gifts & likes to summon heroes and defeat the Titan!');
      }
    };
  })();

  /* =========================================================
     5. MONSTER HUNT — CHASE, TAKEOVER & TARGETED SNIPE (monster)
     ========================================================= */
  M.monster = (function () {
    const MIN_X = 110, MAX_X = 1810, MIN_Y = 175, MAX_Y = 955;
    let survivors = new Map(); // uid -> survivor
    let monster = {
      x: 960, y: 540, vx: 120, vy: 80, r: 58,
      uid: '_ai', name: 'SHADOW BEAST', avatar: '', diamonds: 0,
      isPlayer: false, slashT: 0, trail: []
    };
    let snipeBeam = null; // { x1,y1,x2,y2,t,victimName }
    let eliminations = 0;

    function ensureSurvivor(u) {
      let s = survivors.get(u.uniqueId);
      if (!s) {
        if (survivors.size >= 80) {
          let deadK = null;
          survivors.forEach((v, k) => { if (!v.alive && !deadK) deadK = k; });
          if (deadK) survivors.delete(deadK);
        }
        s = {
          uid: u.uniqueId,
          name: u.nickname || u.uniqueId,
          avatar: u.avatar || '',
          color: colorFor(u.uniqueId),
          x: MIN_X + 100 + Math.random() * (MAX_X - MIN_X - 200),
          y: MIN_Y + 60 + Math.random() * (MAX_Y - MIN_Y - 120),
          vx: (Math.random() - 0.5) * 180,
          vy: (Math.random() - 0.5) * 180,
          alive: true,
          score: 10,
          shield: 2.5,
          dash: 0,
          danger: false
        };
        survivors.set(u.uniqueId, s);
      } else {
        if (u.nickname) s.name = u.nickname;
        if (u.avatar) s.avatar = u.avatar;
      }
      return s;
    }

    function findTargetSurvivor(targetName, excludeUid) {
      const list = Array.from(survivors.values()).filter((s) => s.alive && s.uid !== excludeUid);
      if (!list.length) return null;
      if (targetName) {
        const q = targetName.toLowerCase();
        const exact = list.find((s) => s.name.toLowerCase() === q || s.uid.toLowerCase() === q);
        if (exact) return exact;
        const partial = list.find((s) => s.name.toLowerCase().includes(q) || s.uid.toLowerCase().includes(q));
        if (partial) return partial;
      }
      list.sort((a, b) => b.score - a.score);
      return list[0];
    }

    return {
      reset(clear) {
        monster = {
          x: 960, y: 540, vx: 120, vy: 80, r: 58,
          uid: '_ai', name: 'SHADOW BEAST', avatar: '', diamonds: 0,
          isPlayer: false, slashT: 0, trail: []
        };
        snipeBeam = null;
        eliminations = 0;
        if (clear) survivors.clear();
        else survivors.forEach((s) => { s.alive = true; s.shield = 2; s.dash = 0; s.score = 10; });
      },
      onAction(E, a, ev, u) {
        if (!u) return;
        const dm = ev.gift ? (ev.gift.diamonds || 1) * (ev.gift.count || 1) : 0;

        // 500+ diamonds or boost -> TARGETED SNIPE ELIMINATION
        if (a.type === 'boost' || dm >= 500) {
          const victim = findTargetSurvivor(u.targetName, u.uniqueId);
          if (victim) {
            victim.alive = false;
            victim.shield = 0;
            eliminations++;
            snipeBeam = { x1: monster.x, y1: monster.y, x2: victim.x, y2: victim.y, t: 0.9, victimName: victim.name };
            E.burst(victim.x, victim.y, 35, '#ff3b5c', 360);
            E.floatText(victim.x, victim.y - 40, `🎯 TARGET LOCKED: ${victim.name}`, '#ff3b5c', 28);
            E.pushAlert(`💥 ${u.nickname} ELIMINATED ${victim.name}!`, 'big');
            E.addShake(18);
            E.sfx('boom');
            E.confetti();
          } else {
            E.pushAlert(`🎯 ${u.nickname} fired a Snipe Strike!`, 'big');
            E.sfx('boom');
          }
          return;
        }

        // 100-499 diamonds -> BECOME THE MONSTER (Takeover)
        if (dm >= 100) {
          monster.uid = u.uniqueId;
          monster.name = u.nickname || u.uniqueId;
          monster.avatar = u.avatar || '';
          monster.diamonds = dm;
          monster.isPlayer = true;
          monster.slashT = 0.5;
          const own = survivors.get(u.uniqueId);
          if (own) own.alive = false;
          E.burst(monster.x, monster.y, 32, '#ff7b00', 300);
          E.floatText(monster.x, monster.y - 80, `👑 MONSTER TAKEOVER: ${monster.name}!`, '#ffd23f', 32);
          E.pushAlert(`👹 ${monster.name} BECAME THE MONSTER!`, 'big');
          E.sfx('horn');
          E.confetti();
          return;
        }

        // Regular join/spawn/small gift -> Survivor + Dash/Shield/Revive
        if (a.type === 'join' || a.type === 'spawn') {
          if (monster.isPlayer && monster.uid === u.uniqueId && dm === 0) return;
          const s = ensureSurvivor(u);
          if (!s.alive) {
            s.alive = true;
            s.shield = 4;
            s.dash = 1.4;
            E.floatText(s.x, s.y - 30, `⚡ ${s.name} REVIVED!`, '#2ecc71', 22);
            E.burst(s.x, s.y, 12, '#2ecc71', 160);
          } else if (dm > 0) {
            s.shield = Math.max(s.shield, 4);
            s.dash = 1.5;
            s.score += dm * 5;
            // Knock monster back if nearby
            const dx = monster.x - s.x, dy = monster.y - s.y;
            const d = Math.hypot(dx, dy);
            if (d < 260 && d > 1) {
              monster.x += (dx / d) * 110;
              monster.y += (dy / d) * 110;
            }
            E.floatText(s.x, s.y - 34, '⚡ TURBO DASH!', '#00e5ff', 22);
            E.burst(s.x, s.y, 10, '#00e5ff', 150);
          }
        }
      },
      update(E, dt, roundTime) {
        if (monster.slashT > 0) monster.slashT -= dt;
        if (snipeBeam) { snipeBeam.t -= dt; if (snipeBeam.t <= 0) snipeBeam = null; }

        // Find nearest alive survivor for monster to chase
        let nearest = null, bestD = Infinity;
        survivors.forEach((s) => {
          if (!s.alive) return;
          s.score += dt * 2;
          if (s.shield > 0) s.shield -= dt;
          if (s.dash > 0) s.dash -= dt;

          const d = Math.hypot(s.x - monster.x, s.y - monster.y);
          s.danger = d < 210 && s.shield <= 0;
          if (d < bestD) { bestD = d; nearest = s; }

          // Survivor AI: flee monster + wander
          const sp = s.dash > 0 ? 340 : 145;
          if (d < 340 && d > 1) {
            s.vx += ((s.x - monster.x) / d) * 520 * dt;
            s.vy += ((s.y - monster.y) / d) * 520 * dt;
          } else {
            s.vx += (Math.random() - 0.5) * 260 * dt;
            s.vy += (Math.random() - 0.5) * 260 * dt;
          }
          const vMag = Math.hypot(s.vx, s.vy) || 1;
          s.vx = (s.vx / vMag) * sp;
          s.vy = (s.vy / vMag) * sp;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (s.x < MIN_X) { s.x = MIN_X; s.vx = Math.abs(s.vx); }
          if (s.x > MAX_X) { s.x = MAX_X; s.vx = -Math.abs(s.vx); }
          if (s.y < MIN_Y) { s.y = MIN_Y; s.vy = Math.abs(s.vy); }
          if (s.y > MAX_Y) { s.y = MAX_Y; s.vy = -Math.abs(s.vy); }

          // Catch check
          if (d < monster.r + 22 && s.shield <= 0) {
            s.alive = false;
            eliminations++;
            monster.slashT = 0.4;
            E.burst(s.x, s.y, 18, '#ff3b5c', 240);
            E.floatText(s.x, s.y - 30, `💀 ${s.name} KO!`, '#ff3b5c', 24);
            E.sfx('hit');
          }
        });

        // Monster movement
        const mSpeed = monster.isPlayer ? 225 : 185;
        if (nearest) {
          const dx = nearest.x - monster.x, dy = nearest.y - monster.y;
          const d = Math.hypot(dx, dy) || 1;
          monster.vx = (dx / d) * mSpeed;
          monster.vy = (dy / d) * mSpeed;
        }
        monster.x = Math.max(MIN_X, Math.min(MAX_X, monster.x + monster.vx * dt));
        monster.y = Math.max(MIN_Y, Math.min(MAX_Y, monster.y + monster.vy * dt));
        monster.trail.push({ x: monster.x, y: monster.y });
        if (monster.trail.length > 10) monster.trail.shift();

        if (roundTime <= 0) {
          let top = null;
          survivors.forEach((s) => {
            if (!top || s.score > top.diamonds) top = { uniqueId: s.uid, nickname: s.name, diamonds: Math.round(s.score), avatar: s.avatar };
          });
          if (monster.isPlayer && (!top || monster.diamonds > top.diamonds)) {
            top = { uniqueId: monster.uid, nickname: monster.name, diamonds: monster.diamonds, avatar: monster.avatar };
          }
          E.endRound('MONSTER HUNT', top);
        }
      },
      draw(E) {
        const ctx = E.ctx;
        const now = performance.now();

        // Arena border
        ctx.strokeStyle = 'rgba(255, 59, 92, 0.25)';
        ctx.lineWidth = 4;
        E.rr(MIN_X - 30, MIN_Y - 30, MAX_X - MIN_X + 60, MAX_Y - MIN_Y + 60, 20);
        ctx.stroke();

        // Monster fiery trail (additive)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < monster.trail.length; i++) {
          const t = monster.trail[i];
          const a = (i / monster.trail.length) * 0.28;
          ctx.fillStyle = monster.isPlayer ? `rgba(255,123,0,${a})` : `rgba(168,85,247,${a})`;
          ctx.beginPath(); ctx.arc(t.x, t.y, monster.r * (0.4 + 0.5 * (i / monster.trail.length)), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();

        // Survivors
        let aliveCount = 0;
        survivors.forEach((s) => {
          if (!s.alive) return;
          aliveCount++;
          if (s.danger) {
            const p = 0.5 + 0.5 * Math.sin(now / 90);
            ctx.strokeStyle = `rgba(255,59,92,${0.4 + p * 0.6})`;
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(s.x, s.y, 32 + p * 8, 0, Math.PI * 2); ctx.stroke();
            E.txt('⚠️ DANGER! Gift = DASH!', s.x, s.y - 42, '800 14px Segoe UI, Arial', '#ff5964', 'center');
          } else if (s.shield > 0) {
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(s.x, s.y, 29, 0, Math.PI * 2); ctx.stroke();
          }
          E.drawAvatar(s.x, s.y, 22, s.avatar, s.name, s.shield > 0 ? '#00e5ff' : '#fff');
          const nm = s.name.length > 11 ? s.name.slice(0, 10) + '…' : s.name;
          E.txt(nm, s.x, s.y + 36, '700 13px Segoe UI, Arial', '#fff', 'center');
        });

        // Monster body + horns + circular avatar + glow sprite
        const auraKey = monster.isPlayer ? 'gold' : 'purple';
        E.glow(monster.x, monster.y, monster.r * 2.1, auraKey);
        ctx.save();
        ctx.translate(monster.x, monster.y);
        // Horns
        ctx.fillStyle = '#ff3b5c';
        ctx.beginPath(); ctx.moveTo(-36, -34); ctx.lineTo(-56, -78); ctx.lineTo(-14, -50); ctx.fill();
        ctx.beginPath(); ctx.moveTo(36, -34); ctx.lineTo(56, -78); ctx.lineTo(14, -50); ctx.fill();
        ctx.restore();

        E.drawAvatar(monster.x, monster.y, monster.r, monster.avatar, monster.name, monster.isPlayer ? '#ffd23f' : '#ff3b5c');
        E.txt(`👹 MONSTER: ${monster.name}`, monster.x, monster.y - monster.r - 18, '800 20px Segoe UI, Arial', '#ffd23f', 'center');

        // Claw slash arc
        if (monster.slashT > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = '#ff3b5c';
          ctx.lineWidth = 8;
          for (let k = -1; k <= 1; k++) {
            ctx.beginPath();
            ctx.arc(monster.x, monster.y, monster.r + 28 + k * 10, -0.8, 0.8);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Snipe laser & crosshair
        if (snipeBeam) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = '#ff3b5c';
          ctx.lineWidth = 12 * snipeBeam.t;
          ctx.beginPath(); ctx.moveTo(snipeBeam.x1, snipeBeam.y1); ctx.lineTo(snipeBeam.x2, snipeBeam.y2); ctx.stroke();
          ctx.strokeStyle = '#ffd23f';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(snipeBeam.x2, snipeBeam.y2, 46, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }

        // HUD
        E.txt('👾 MONSTER HUNT', 40, 56, '800 32px Segoe UI, Arial', '#ff3b5c', 'left');
        E.txt(`Alive: ${aliveCount} • Eliminations: ${eliminations}`, 40, 90, '600 18px Segoe UI, Arial', '#cbd5f5', 'left');

        const top = Array.from(survivors.values()).filter((s) => s.alive).sort((a, b) => b.score - a.score).slice(0, 3)
          .map((s) => ({ name: s.name, val: Math.round(s.score), color: s.color }));
        drawTopPanel(E, '🏃 TOP SURVIVORS', top, '⚡ ');
        drawBottomHint(E, '1-99💎 = DASH/SHIELD • 100💎 = BECOME MONSTER! • 500💎 + @name = SNIPE A FRIEND!');
      }
    };
  })();

  function E_castleHp() {
    return (window.__arenaSettings && window.__arenaSettings.castleHp) || 1000;
  }

  window.OverlayModes = M;
})();
