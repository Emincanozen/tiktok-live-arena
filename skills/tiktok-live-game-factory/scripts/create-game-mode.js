#!/usr/bin/env node
'use strict';
/**
 * TikTok Live Game Factory CLI
 * Zero-dependency generator for listing archetypes, scaffolding new OverlayModes,
 * and exporting standalone TikTok Live Arena projects.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const ARCHETYPES = [
  {
    slug: 'arena',
    title: 'Castle Siege',
    submodes: 'frontline, lanes, tug',
    hooks: '1/red & 2/blue join teams; gifts spawn soldiers (1-50); 500+💎 boosts castle & horn.',
  },
  {
    slug: 'balls',
    title: 'Chaos Ball Ring',
    submodes: 'none',
    hooks: 'Likes/chat/gifts spawn named bouncing balls; gift value scales radius/trail; bounce triggers harmonic notes.',
  },
  {
    slug: 'halay',
    title: 'Live Halay & Dance Party',
    submodes: 'none',
    hooks: 'Viewers join curved dance chain; top gifter becomes crowned Halay Leader; gifts raise BPM & folk-synth tempo.',
  },
  {
    slug: 'music',
    title: 'Synth Maestro & Note Rush',
    submodes: 'none',
    hooks: 'Viewer events drop Lead/Bass/Arp/Beat orbs into target rings; gifts boost BPM, harmony & combo multiplier.',
  },
  {
    slug: 'boss',
    title: 'Titan Boss Raid',
    submodes: 'none',
    hooks: 'Co-op heroes attack multi-phase Titan Boss; 100-499💎 & 500+💎 trigger Meteor/Laser/Shield finishers.',
  },
  {
    slug: 'monster',
    title: 'Monster Hunt',
    submodes: 'none',
    hooks: '1-99💎 = Turbo Dash + 4s Shield / Revive; 100-499💎 = Become the Monster takeover; 500+💎 + @name = Targeted Snipe.',
  },
];

function printHelp() {
  console.log(`TikTok Live Game Factory CLI

Usage:
  node create-game-mode.js --list
  node create-game-mode.js --scaffold-mode <slug> [--title "<Title>"] [--out <file>]
  node create-game-mode.js --export <target-dir> [--modes arena,monster,...]
  node create-game-mode.js --help

Options:
  --list                     Print all 6 built-in game archetypes and monetization hooks
  --scaffold-mode <slug>     Generate an OverlayModes.<slug> JS skeleton using E_SHARED
  --title "<Title>"          Human-readable title for the scaffolded mode
  --out <file>               Write scaffolded JS to <file> (prints to stdout if omitted)
  --export <target-dir>      Export a clean standalone project to <target-dir>
  --modes <m1,m2,...>        Comma-separated modes for --export (sets first as default)
  --help, -h                 Show this help message`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--list') args.list = true;
    else if (a === '--scaffold-mode') args.scaffoldMode = argv[++i];
    else if (a === '--title') args.title = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--export') args.exportDir = argv[++i];
    else if (a === '--modes') args.modes = argv[++i];
  }
  return args;
}

function sanitizeSlug(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '') || 'custom_mode';
}

function listArchetypes() {
  console.log('Built-in TikTok Live Arena Archetypes (6 modes):\n');
  for (const m of ARCHETYPES) {
    console.log(`- ${m.slug} (${m.title}) [submodes: ${m.submodes}]`);
    console.log(`  Hooks: ${m.hooks}`);
  }
}

function buildScaffold(slug, title) {
  const safeVar = slug.replace(/-/g, '_');
  const displayTitle = title || slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const code = `/* TikTok Live Arena — Custom Mode: ${displayTitle} (${slug}) */
(function () {
  'use strict';

  window.OverlayModes = window.OverlayModes || {};

  window.OverlayModes['${safeVar}'] = (function () {
    let actors = [];
    let score = 0;
    let pulse = 0;

    function reset(clear) {
      actors = [];
      pulse = 0;
      if (clear) score = 0;
    }

    function onAction(E, a, ev, u) {
      const dm = (ev.gift && ev.gift.diamonds ? ev.gift.diamonds : 0) * (ev.gift && ev.gift.count ? ev.gift.count : 1);
      const name = (u && u.nickname) || 'Viewer';
      const avatar = (u && u.avatar) || '';

      if (a.type === 'join' || a.type === 'spawn') {
        actors.push({
          x: 240 + Math.random() * (E.W - 480),
          y: 240 + Math.random() * (E.H - 440),
          vx: (Math.random() - 0.5) * 140,
          vy: (Math.random() - 0.5) * 140,
          r: dm >= 100 ? 36 : 22,
          name,
          avatar,
          col: dm >= 100 ? '#ffd23f' : '#00e5ff',
        });
        if (actors.length > 150) actors.shift();
        score += Math.max(1, dm || a.units || 1);
        E.tone(440 + Math.min(440, dm * 4), 0.09, 'triangle', 0.12);
      } else if (a.type === 'boost') {
        pulse = 1;
        score += a.power || 50;
        E.addShake(14);
        E.confetti();
        E.pushAlert('${displayTitle}: ' + name + ' triggered a MEGA BOOST!', 'big');
      }
    }

    function update(E, dt) {
      if (pulse > 0) pulse = Math.max(0, pulse - dt * 1.5);
      for (const p of actors) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 120 || p.x > E.W - 120) p.vx *= -1;
        if (p.y < 160 || p.y > E.H - 140) p.vy *= -1;
      }
    }

    function draw(E) {
      const ctx = E.ctx;
      if (pulse > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255, 210, 63, ' + (pulse * 0.18).toFixed(3) + ')';
        ctx.fillRect(0, 0, E.W, E.H);
        ctx.restore();
      }
      for (const p of actors) {
        E.drawAvatar(p.x, p.y, p.r, p.avatar, p.name, p.col);
        E.txt(p.name, p.x, p.y + p.r + 22, '700 16px Segoe UI, Arial', '#fff', 'center');
      }
      E.txt('${displayTitle.toUpperCase()} • SCORE: ' + score, E.W / 2, 68, '800 30px Segoe UI, Arial', '#ffd23f', 'center');
    }

    return { reset, onAction, update, draw };
  })();
})();
`;
  const checklist = `Wiring checklist for '${safeVar}':
1. src/store.js        -> Add '${safeVar}' to GAME_MODES
2. public/js/overlay.js -> Add '${safeVar}' to VALID_MODES
3. public/overlay.html  -> Include this script after overlay-modes.js
4. public/dashboard.html-> Add <button type="button" class="mode-card" data-mode="${safeVar}"> inside #modeGrid
5. tests/smoke.js       -> Add { gameMode: '${safeVar}' } to modeCases and run npm test`;

  return { code, checklist };
}

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'skills') continue;
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

function exportProject(targetDir, modesCsv) {
  const dest = path.resolve(targetDir);
  if (dest === REPO_ROOT) {
    throw new Error('Export target directory cannot be the source repository root.');
  }
  const copyItems = [
    'server.js',
    'src',
    'public',
    'package.json',
    '.env.example',
    '.gitignore',
    'LICENSE',
    'start.bat',
    'README.md',
  ];

  fs.mkdirSync(dest, { recursive: true });
  for (const item of copyItems) {
    const srcPath = path.join(REPO_ROOT, item);
    if (fs.existsSync(srcPath)) {
      copyRecursive(srcPath, path.join(dest, item));
    }
  }

  const dataDir = path.join(dest, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, '.gitkeep'), '', 'utf8');

  if (modesCsv) {
    const known = new Set(ARCHETYPES.map((a) => a.slug));
    const selected = modesCsv
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => known.has(s));
    if (selected.length) {
      const storeFile = path.join(dest, 'src', 'store.js');
      let storeSrc = fs.readFileSync(storeFile, 'utf8');
      storeSrc = storeSrc.replace(/gameMode:\s*'arena'/, `gameMode: '${selected[0]}'`);
      fs.writeFileSync(storeFile, storeSrc, 'utf8');

      const readmeFile = path.join(dest, 'README.md');
      let readme = fs.readFileSync(readmeFile, 'utf8');
      readme = `> Standalone export configured with default mode **\`${selected[0]}\`** (enabled modes: ${selected.map((m) => `\`${m}\``).join(', ')}).\n\n` + readme;
      fs.writeFileSync(readmeFile, readme, 'utf8');
    }
  }

  console.log(`Exported standalone project to: ${dest}`);
  console.log('Next steps: cd into target directory, run `npm install`, then `npm start`.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.list && !args.scaffoldMode && !args.exportDir)) {
    printHelp();
    return;
  }
  if (args.list) {
    listArchetypes();
  }
  if (args.scaffoldMode) {
    const slug = sanitizeSlug(args.scaffoldMode);
    const { code, checklist } = buildScaffold(slug, args.title);
    if (args.out) {
      const outPath = path.resolve(args.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, code, 'utf8');
      console.log(`Scaffolded mode '${slug}' to ${outPath}\n\n${checklist}`);
    } else {
      console.log(code);
      console.error('\n' + checklist);
    }
  }
  if (args.exportDir) {
    exportProject(args.exportDir, args.modes);
  }
}

try {
  main();
} catch (err) {
  console.error('[create-game-mode] Error:', err.message);
  process.exit(1);
}
