/* TikTok Live Arena — Control Dashboard */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const MODE_LABELS = {
    arena: 'Castle Siege',
    balls: 'Chaos Ball Ring',
    halay: 'Live Halay Party',
    music: 'Synth Maestro',
    boss: 'Titan Siege ⭐',
    monster: 'Monster Hunt'
  };

  let currentSettings = {
    username: '',
    signApiKey: '',
    autoReconnect: true,
    ttsEnabled: true,
    ttsVoiceLang: 'en-US',
    allowKeypress: false,
    castleHp: 1000,
    roundSeconds: 300,
    gameMode: 'arena',
    arenaSubMode: 'frontline'
  };
  let rules = [];
  let expandedRuleIdx = -1;
  let feedItems = [];
  const MAX_FEED = 120;

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  function getBaseOverlayUrl() {
    return location.origin + '/overlay.html';
  }
  function getModeOverlayUrl() {
    const m = currentSettings.gameMode || 'arena';
    const sub = currentSettings.arenaSubMode || 'frontline';
    return `${location.origin}/overlay.html?mode=${encodeURIComponent(m)}${m === 'arena' ? '&submode=' + encodeURIComponent(sub) : ''}`;
  }
  function copyText(txt, label) {
    navigator.clipboard?.writeText(txt).then(
      () => toast(label + ' copied'),
      () => {
        $('overlayUrl').value = txt;
        $('overlayUrl').select();
        document.execCommand('copy');
        $('overlayUrl').value = getBaseOverlayUrl();
        toast(label + ' copied');
      }
    );
  }

  $('overlayUrl').value = getBaseOverlayUrl();
  $('btnCopyUrl').addEventListener('click', () => copyText(getBaseOverlayUrl(), 'Overlay URL'));
  $('btnCopyModeUrl').addEventListener('click', () => copyText(getModeOverlayUrl(), 'Mode URL'));

  function scalePreview() {
    const wrap = $('previewWrap');
    const frame = $('previewFrame');
    if (!wrap || !frame) return;
    const s = wrap.clientWidth / 1920;
    frame.style.transform = `scale(${s})`;
  }
  window.addEventListener('resize', scalePreview);
  scalePreview();

  function renderGameModeUI(updateIframe) {
    const m = currentSettings.gameMode || 'arena';
    const sub = currentSettings.arenaSubMode || 'frontline';
    $('activeModeBadge').textContent = MODE_LABELS[m] || m;
    document.querySelectorAll('#modeGrid .mode-card').forEach((c) => {
      c.classList.toggle('active', c.dataset.mode === m);
    });
    const subBar = $('submodeBar');
    subBar.style.display = m === 'arena' ? 'flex' : 'none';
    document.querySelectorAll('#submodeBar .submode-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.submode === sub);
    });
    const qs = `?bg=1&mode=${encodeURIComponent(m)}${m === 'arena' ? '&submode=' + encodeURIComponent(sub) : ''}`;
    $('linkOverlayOpen').href = '/overlay.html' + qs;
    if (updateIframe) {
      const frame = $('previewFrame');
      const target = '/overlay.html' + qs;
      if (frame.getAttribute('src') !== target) frame.setAttribute('src', target);
    }
  }

  // Tabs
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      $('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Socket connection
  const socket = typeof io !== 'undefined' ? io() : null;
  if (!socket) {
    toast('Failed to load Socket.IO');
    return;
  }

  // Mode Switcher events
  document.querySelectorAll('#modeGrid .mode-card').forEach((card) => {
    card.addEventListener('click', () => {
      currentSettings.gameMode = card.dataset.mode;
      renderGameModeUI(true);
      socket.emit('game:mode', { gameMode: currentSettings.gameMode, arenaSubMode: currentSettings.arenaSubMode });
      toast('Switched to ' + (MODE_LABELS[currentSettings.gameMode] || currentSettings.gameMode));
    });
  });
  document.querySelectorAll('#submodeBar .submode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentSettings.arenaSubMode = btn.dataset.submode;
      renderGameModeUI(true);
      socket.emit('game:mode', { gameMode: currentSettings.gameMode, arenaSubMode: currentSettings.arenaSubMode });
      toast('Arena style: ' + btn.textContent.trim());
    });
  });

  // Status
  const MODE_EN = {
    idle: 'Idle',
    connecting: 'Connecting...',
    live: 'LIVE',
    sim: 'Simulator Active'
  };

  function renderStatus(st) {
    if (!st) return;
    const mode = st.mode || 'idle';
    const badge = $('statusBadge');
    badge.className = 'badge ' + mode;
    $('statusText').textContent = (MODE_EN[mode] || mode) + (st.username ? ` (@${st.username})` : '');
    $('viewerCount').textContent = st.viewerCount ?? 0;

    if (st.roomId) {
      $('roomBadge').style.display = 'inline-flex';
      $('roomIdText').textContent = st.roomId;
    } else {
      $('roomBadge').style.display = 'none';
    }

    const errBox = $('errorBanner');
    if (st.error) {
      errBox.textContent = 'Error: ' + st.error;
      errBox.classList.add('show');
    } else {
      errBox.classList.remove('show');
    }

    const isConnected = mode === 'live' || mode === 'connecting';
    $('btnConnect').disabled = isConnected;
    $('btnDisconnect').disabled = !isConnected;
    if (st.username && !$('inpUsername').value) {
      $('inpUsername').value = st.username;
    }

    const simOn = !!st.simRunning;
    $('simBadge').className = 'badge ' + (simOn ? 'sim' : 'idle');
    $('simBadge').textContent = simOn ? 'Running' : 'Off';
    $('btnSimStart').disabled = simOn;
    $('btnSimStop').disabled = !simOn;
  }

  // Connect / Disconnect
  $('btnConnect').addEventListener('click', () => {
    const username = $('inpUsername').value.trim().replace(/^@+/, '');
    if (!username) {
      toast('Please enter a TikTok username');
      return;
    }
    socket.emit('control:connect', { username });
  });

  $('btnDisconnect').addEventListener('click', () => {
    socket.emit('control:disconnect');
  });

  // Simulator
  $('btnSimStart').addEventListener('click', () => {
    socket.emit('sim:start', { rate: $('simRate').value });
  });
  $('btnSimStop').addEventListener('click', () => {
    socket.emit('sim:stop');
  });

  // Reset
  $('btnResetGame').addEventListener('click', () => {
    socket.emit('game:reset', { clearLeaderboard: false });
    toast('Game reset');
  });
  $('btnResetAll').addEventListener('click', () => {
    socket.emit('game:reset', { clearLeaderboard: true });
    toast('Game and leaderboard reset');
  });

  // Manual Test
  function getTestNick() {
    return $('testNick').value.trim() || 'TestPlayer';
  }
  function getTestCount() {
    return Math.max(1, parseInt($('testCount').value, 10) || 1);
  }
  function sendTest(payload) {
    socket.emit('test:event', Object.assign({ nickname: getTestNick() }, payload));
  }

  $('btnTestChat1').addEventListener('click', () => sendTest({ type: 'chat', comment: '1' }));
  $('btnTestChat2').addEventListener('click', () => sendTest({ type: 'chat', comment: '2' }));
  $('btnTestLike').addEventListener('click', () => sendTest({ type: 'like', likeCount: 100 }));
  $('btnTestFollow').addEventListener('click', () => sendTest({ type: 'follow' }));
  $('btnTestShare').addEventListener('click', () => sendTest({ type: 'share' }));
  $('btnTestChatCustom').addEventListener('click', () => {
    const comment = $('testComment').value.trim();
    if (!comment) return;
    sendTest({ type: 'chat', comment });
    $('testComment').value = '';
  });
  $('btnTestTarget').addEventListener('click', () => {
    const t = $('testComment').value.trim() || '@TestPlayer';
    sendTest({ type: 'chat', comment: t.startsWith('@') || /^(kill|hunt|target)\s+/i.test(t) ? t : '@' + t });
    toast('Target chat sent: ' + t);
  });
  $('btnTestTakeover').addEventListener('click', () => {
    sendTest({ type: 'gift', giftName: 'Hand Hearts', count: 1 });
  });
  $('btnTestSnipe').addEventListener('click', () => {
    sendTest({ type: 'gift', giftName: 'Money Gun', count: 1 });
  });
  $('btnTestHeal').addEventListener('click', () => {
    sendTest({ type: 'chat', comment: 'heal' });
  });

  // Load gifts
  async function loadGifts() {
    const grid = $('giftGrid');
    try {
      const res = await fetch('/api/gifts');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const gifts = await res.json();
      grid.innerHTML = '';
      gifts.forEach((g) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'gift-btn';
        b.innerHTML = `<span class="gift-name">${esc(g.name)}</span><span class="gift-dia">💎 ${g.diamonds}</span>`;
        b.addEventListener('click', () => {
          sendTest({ type: 'gift', giftName: g.name, count: getTestCount() });
        });
        grid.appendChild(b);
      });
    } catch (e) {
      grid.innerHTML = '<div style="color:var(--muted);font-size:12px">Failed to load gift catalog.</div>';
    }
  }
  loadGifts();

  // Live Event Feed
  function formatFeedEvent(ev) {
    const u = ev.user?.nickname || ev.user?.uniqueId || 'Unknown';
    switch (ev.type) {
      case 'gift': {
        const g = ev.gift || {};
        const total = (g.diamonds || 0) * (g.count || 1);
        return `🎁 <b>${esc(u)}</b> → ${g.count || 1}x ${esc(g.name || 'Gift')} (💎${total})`;
      }
      case 'chat':
        return `💬 <b>${esc(u)}</b>: ${esc(ev.comment || '')}`;
      case 'like':
        return `❤️ <b>${esc(u)}</b> sent ${ev.likeCount || 1} likes`;
      case 'follow':
        return `➕ <b>${esc(u)}</b> followed`;
      case 'share':
        return `↗️ <b>${esc(u)}</b> shared the stream`;
      case 'member':
        return `👋 <b>${esc(u)}</b> joined`;
      case 'subscribe':
        return `⭐ <b>${esc(u)}</b> subscribed`;
      default:
        return `${esc(ev.type)}: <b>${esc(u)}</b>`;
    }
  }

  function renderFeed() {
    const list = $('feedList');
    list.innerHTML = '';
    for (let i = 0; i < feedItems.length; i++) {
      const ev = feedItems[i];
      const row = document.createElement('div');
      row.className = 'feed-item type-' + (ev.type || 'other');
      const d = new Date(ev.ts || Date.now());
      const tm = d.toTimeString().slice(0, 8);
      row.innerHTML = `<span>${formatFeedEvent(ev)}</span><span class="feed-time">${tm}</span>`;
      list.appendChild(row);
    }
  }

  $('btnClearFeed').addEventListener('click', () => {
    feedItems = [];
    renderFeed();
  });

  // Leaderboard
  function renderLeaderboard(lb) {
    const list = $('lbList');
    list.innerHTML = '';
    if (!Array.isArray(lb) || !lb.length) {
      list.innerHTML = '<div style="color:var(--muted);font-size:12px">No data yet.</div>';
      return;
    }
    lb.forEach((u, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML = `
        <span class="lb-rank">${i + 1}.</span>
        <span class="lb-name">${esc(u.nickname || u.uniqueId)}</span>
        <span class="lb-stats">💎 ${u.diamonds || 0} · ❤️ ${u.likes || 0}</span>
      `;
      list.appendChild(row);
    });
  }

  // Settings
  function renderSettings(s) {
    if (!s) return;
    currentSettings = Object.assign({}, currentSettings, s);
    $('setSignApiKey').value = currentSettings.signApiKey || '';
    $('setCastleHp').value = currentSettings.castleHp ?? 1000;
    $('setRoundSeconds').value = currentSettings.roundSeconds ?? 300;
    $('setTtsLang').value = currentSettings.ttsVoiceLang || 'en-US';
    $('setAutoReconnect').checked = !!currentSettings.autoReconnect;
    $('setTtsEnabled').checked = !!currentSettings.ttsEnabled;
    $('setAllowKeypress').checked = !!currentSettings.allowKeypress;
    if (currentSettings.username && !$('inpUsername').value) {
      $('inpUsername').value = currentSettings.username;
    }
    renderGameModeUI(false);
  }

  $('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const next = {
      username: $('inpUsername').value.trim().replace(/^@+/, '') || currentSettings.username || '',
      signApiKey: $('setSignApiKey').value.trim(),
      autoReconnect: $('setAutoReconnect').checked,
      ttsEnabled: $('setTtsEnabled').checked,
      ttsVoiceLang: $('setTtsLang').value.trim() || 'en-US',
      allowKeypress: $('setAllowKeypress').checked,
      castleHp: Math.max(100, parseInt($('setCastleHp').value, 10) || 1000),
      roundSeconds: Math.max(30, parseInt($('setRoundSeconds').value, 10) || 300),
      gameMode: currentSettings.gameMode || 'arena',
      arenaSubMode: currentSettings.arenaSubMode || 'frontline'
    };
    socket.emit('settings:save', next);
    toast('Settings saved');
  });

  // Rules Editor
  function describeTrigger(t) {
    if (!t) return '-';
    switch (t.type) {
      case 'gift': return `Gift (${t.giftName || '*'}, min 💎${t.minDiamonds || 0})`;
      case 'like': return `Like (every ${t.every || 100})`;
      case 'chat': return `Chat (${t.mode || 'equals'}: "${t.match || ''}")`;
      case 'follow': return 'Follow';
      case 'share': return 'Share';
      case 'member': return 'Member Join';
      case 'subscribe': return 'Subscribe';
      default: return t.type;
    }
  }

  function renderRules() {
    const list = $('rulesList');
    list.innerHTML = '';
    $('rulesRawJson').value = JSON.stringify(rules, null, 2);

    rules.forEach((rule, idx) => {
      const item = document.createElement('div');
      item.className = 'rule-item';

      const head = document.createElement('div');
      head.className = 'rule-head';

      const left = document.createElement('label');
      left.className = 'check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = rule.enabled !== false;
      cb.addEventListener('change', () => {
        rule.enabled = cb.checked;
        syncRawJson();
      });
      const title = document.createElement('strong');
      title.textContent = rule.name || rule.id || 'Rule';
      left.append(cb, title);

      const btns = document.createElement('div');
      btns.className = 'row';
      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'btn btn-sm';
      btnEdit.textContent = expandedRuleIdx === idx ? 'Close' : 'Edit';
      btnEdit.addEventListener('click', () => {
        expandedRuleIdx = expandedRuleIdx === idx ? -1 : idx;
        renderRules();
      });
      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'btn btn-danger btn-sm';
      btnDel.textContent = 'Delete';
      btnDel.addEventListener('click', () => {
        rules.splice(idx, 1);
        if (expandedRuleIdx === idx) expandedRuleIdx = -1;
        renderRules();
      });
      btns.append(btnEdit, btnDel);
      head.append(left, btns);

      const meta = document.createElement('div');
      meta.className = 'rule-meta';
      const actSummary = (rule.actions || []).map((a) => a.type).join(', ') || 'none';
      meta.textContent = `Trigger: ${describeTrigger(rule.trigger)} · Actions: ${actSummary}`;

      item.append(head, meta);
      if (expandedRuleIdx === idx) item.appendChild(buildRuleEditor(rule));
      list.appendChild(item);
    });
  }

  function syncRawJson() {
    $('rulesRawJson').value = JSON.stringify(rules, null, 2);
  }

  function buildRuleEditor(rule) {
    const ed = document.createElement('div');
    ed.className = 'rule-editor';
    const trig = rule.trigger || (rule.trigger = { type: 'gift', giftName: '*' });
    const acts = rule.actions || (rule.actions = []);

    const row1 = document.createElement('div');
    row1.className = 'row';
    row1.innerHTML = `
      <label class="field" style="flex:2">Rule Name<input type="text" class="r-name" value="${escAttr(rule.name || '')}"></label>
      <label class="field" style="flex:1">Cooldown (ms)<input type="number" min="0" class="r-cd" value="${rule.cooldownMs || 0}"></label>
    `;
    row1.querySelector('.r-name').addEventListener('input', (e) => { rule.name = e.target.value; syncRawJson(); });
    row1.querySelector('.r-cd').addEventListener('input', (e) => { rule.cooldownMs = parseInt(e.target.value, 10) || 0; syncRawJson(); });
    ed.appendChild(row1);

    const row2 = document.createElement('div');
    row2.className = 'row wrap';
    const trigTypes = ['gift', 'like', 'chat', 'follow', 'share', 'member', 'subscribe'];
    const selTrig = document.createElement('select');
    selTrig.style.width = '130px';
    trigTypes.forEach((t) => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      if (trig.type === t) o.selected = true;
      selTrig.appendChild(o);
    });
    selTrig.addEventListener('change', () => {
      rule.trigger = { type: selTrig.value };
      if (selTrig.value === 'gift') { rule.trigger.giftName = '*'; rule.trigger.minDiamonds = 0; }
      if (selTrig.value === 'like') { rule.trigger.every = 100; }
      if (selTrig.value === 'chat') { rule.trigger.match = '1'; rule.trigger.mode = 'equals'; }
      renderRules();
    });
    row2.appendChild(selTrig);

    if (trig.type === 'gift') {
      const gName = mkInput('text', trig.giftName ?? '*', 'Gift name or *', (v) => { trig.giftName = v; syncRawJson(); });
      const gMin = mkInput('number', trig.minDiamonds ?? 0, 'Min diamonds', (v) => { trig.minDiamonds = parseInt(v, 10) || 0; syncRawJson(); });
      gName.style.flex = '1'; gMin.style.width = '110px';
      row2.append(gName, gMin);
    } else if (trig.type === 'like') {
      const lEv = mkInput('number', trig.every ?? 100, 'Every N likes', (v) => { trig.every = Math.max(1, parseInt(v, 10) || 100); syncRawJson(); });
      lEv.style.width = '130px';
      row2.append(lEv);
    } else if (trig.type === 'chat') {
      const cMode = document.createElement('select');
      cMode.style.width = '120px';
      ['equals', 'contains', 'startsWith'].forEach((m) => {
        const o = document.createElement('option'); o.value = m; o.textContent = m;
        if (trig.mode === m) o.selected = true;
        cMode.appendChild(o);
      });
      cMode.addEventListener('change', () => { trig.mode = cMode.value; syncRawJson(); });
      const cMatch = mkInput('text', trig.match ?? '', 'Match text', (v) => { trig.match = v; syncRawJson(); });
      cMatch.style.flex = '1';
      row2.append(cMode, cMatch);
    }
    ed.appendChild(row2);

    const actTitle = document.createElement('div');
    actTitle.style.cssText = 'font-size:12px;color:var(--muted);margin-top:4px';
    actTitle.textContent = 'Actions (JSON params):';
    ed.appendChild(actTitle);

    acts.forEach((act, aIdx) => {
      const ar = document.createElement('div');
      ar.className = 'action-row';
      const selA = document.createElement('select');
      ['spawn', 'join', 'alert', 'tts', 'confetti', 'boost', 'sound', 'keypress'].forEach((tp) => {
        const o = document.createElement('option'); o.value = tp; o.textContent = tp;
        if (act.type === tp) o.selected = true;
        selA.appendChild(o);
      });
      const cloneParams = () => {
        const c = Object.assign({}, act);
        delete c.type;
        return JSON.stringify(c);
      };
      const inpP = document.createElement('input');
      inpP.type = 'text';
      inpP.value = cloneParams();
      inpP.placeholder = '{"units":1}';
      inpP.addEventListener('change', () => {
        try {
          const parsed = JSON.parse(inpP.value || '{}');
          acts[aIdx] = Object.assign({ type: selA.value }, parsed);
          syncRawJson();
        } catch (e) {
          toast('Invalid action JSON');
        }
      });
      selA.addEventListener('change', () => {
        act.type = selA.value;
        syncRawJson();
      });
      const btnRm = document.createElement('button');
      btnRm.type = 'button';
      btnRm.className = 'btn btn-danger btn-sm';
      btnRm.textContent = '×';
      btnRm.addEventListener('click', () => {
        acts.splice(aIdx, 1);
        renderRules();
      });
      ar.append(selA, inpP, btnRm);
      ed.appendChild(ar);
    });

    const btnAddAct = document.createElement('button');
    btnAddAct.type = 'button';
    btnAddAct.className = 'btn btn-sm';
    btnAddAct.style.alignSelf = 'flex-start';
    btnAddAct.textContent = '+ Add Action';
    btnAddAct.addEventListener('click', () => {
      acts.push({ type: 'spawn', units: 1 });
      renderRules();
    });
    ed.appendChild(btnAddAct);

    return ed;
  }

  function mkInput(type, val, placeholder, onChange) {
    const i = document.createElement('input');
    i.type = type;
    i.value = val;
    i.placeholder = placeholder;
    i.addEventListener('input', () => onChange(i.value));
    return i;
  }

  $('btnAddRule').addEventListener('click', () => {
    rules.push({
      id: 'rule_' + Date.now(),
      name: 'New Rule',
      enabled: true,
      cooldownMs: 0,
      trigger: { type: 'gift', giftName: '*', minDiamonds: 1 },
      actions: [{ type: 'spawn', units: 'diamonds' }]
    });
    expandedRuleIdx = rules.length - 1;
    renderRules();
  });

  $('btnToggleRawRules').addEventListener('click', () => {
    const w = $('rulesRawWrap');
    w.style.display = w.style.display === 'none' ? 'flex' : 'none';
    syncRawJson();
  });

  $('btnSaveRules').addEventListener('click', () => {
    socket.emit('rules:save', rules);
    toast('Rules saved');
  });

  $('btnApplyRawRules').addEventListener('click', () => {
    try {
      const parsed = JSON.parse($('rulesRawJson').value);
      if (!Array.isArray(parsed)) throw new Error('Must be an array');
      rules = parsed;
      socket.emit('rules:save', rules);
      renderRules();
      toast('Raw JSON rules saved');
    } catch (e) {
      toast('Invalid JSON: ' + e.message);
    }
  });

  // Socket listeners
  socket.on('status', renderStatus);
  socket.on('settings', renderSettings);
  socket.on('game:mode', (m) => {
    if (!m) return;
    if (m.gameMode) currentSettings.gameMode = m.gameMode;
    if (m.arenaSubMode) currentSettings.arenaSubMode = m.arenaSubMode;
    renderGameModeUI(true);
  });
  socket.on('rules', (r) => {
    if (Array.isArray(r)) {
      rules = r;
      renderRules();
    }
  });
  socket.on('leaderboard', renderLeaderboard);
  socket.on('feed:history', (hist) => {
    if (Array.isArray(hist)) {
      feedItems = hist.slice(-MAX_FEED).reverse();
      renderFeed();
    }
  });
  socket.on('tiktok:event', (ev) => {
    if (!ev) return;
    feedItems.unshift(ev);
    if (feedItems.length > MAX_FEED) feedItems.length = MAX_FEED;
    renderFeed();
  });

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escAttr(s) {
    return esc(s);
  }
})();
