window.App = window.App || {};

App.pitchSequence = [];  // Current pitch sequence for cell editor

App.init = async function() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Set today's date
  const today = new Date();
  document.getElementById('today-date').textContent = today.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // --- View management ---
  function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // --- Game picker ---
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  async function loadGames() {
    const list = document.getElementById('games-list');
    list.innerHTML = '<div class="loading">Loading today\'s games...</div>';
    try {
      const games = await App.Gameday.getTodaysGames();
      if (!games.length) {
        list.innerHTML = '<div class="no-games">No games scheduled today</div>';
        return;
      }
      list.innerHTML = '';
      games.forEach(g => {
        const card = document.createElement('button');
        card.className = 'game-card';
        card.innerHTML = `
          <div class="game-matchup">
            <div class="game-team">
              <span class="team-abbr">${esc(g.away.abbr)}</span>
              <span class="team-record">${esc(g.away.record)}</span>
            </div>
            <span class="game-at">@</span>
            <div class="game-team">
              <span class="team-abbr">${esc(g.home.abbr)}</span>
              <span class="team-record">${esc(g.home.record)}</span>
            </div>
          </div>
          <div class="game-detail">
            <span class="game-time">${esc(g.time)}</span>
            <span class="game-venue">${esc(g.venue)}</span>
          </div>
          <div class="game-pitchers">${esc(g.away.pitcher)} vs ${esc(g.home.pitcher)}</div>
        `;
        card.addEventListener('click', () => startFromGame(g));
        list.appendChild(card);
      });
    } catch (e) {
      list.innerHTML = `<div class="error">Couldn't load games. <button id="btn-retry">Retry</button></div>`;
      document.getElementById('btn-retry')?.addEventListener('click', loadGames);
    }
  }

  async function startFromGame(game) {
    showView('view-scorecard');
    const grid = document.getElementById('scorecard-grid');
    grid.innerHTML = '<div class="loading">Loading lineup...</div>';

    let lineup;
    try {
      lineup = await App.Gameday.getLineup(game.gamePk);
    } catch {
      lineup = {
        away: { name: game.away.name, abbr: game.away.abbr, batters: [] },
        home: { name: game.home.name, abbr: game.home.abbr, batters: [] },
        venue: game.venue,
        date: App.Gameday.todayStr(),
      };
    }

    App.Scorecard.createCard(game, lineup);
    App.Scorecard.refresh();
  }

  function startManual() {
    const away = prompt('Away team name:', 'Away') || 'Away';
    const home = prompt('Home team name:', 'Home') || 'Home';
    const lineup = {
      away: { name: away, abbr: away.slice(0,3).toUpperCase(), batters: [] },
      home: { name: home, abbr: home.slice(0,3).toUpperCase(), batters: [] },
      venue: '',
      date: App.Gameday.todayStr(),
    };
    App.Scorecard.createCard({}, lineup);
    showView('view-scorecard');
    App.Scorecard.refresh();
  }

  // --- Cell editor setup ---
  function setupEditor() {
    // Play buttons
    const playGrid = document.getElementById('play-buttons');
    App.PLAY_CATEGORIES.forEach(cat => {
      const group = document.createElement('div');
      group.className = 'play-group';
      group.innerHTML = `<div class="play-group-label">${cat.label}</div>`;
      const btns = document.createElement('div');
      btns.className = 'play-group-btns';
      cat.keys.forEach(key => {
        const play = App.PLAYS[key];
        const btn = document.createElement('button');
        btn.className = `play-btn play-${play.cat}`;
        btn.dataset.play = key;
        btn.innerHTML = `<span class="play-label">${play.label}</span><span class="play-name">${play.name}</span>`;
        btn.addEventListener('click', () => selectPlay(key, btn));
        btns.appendChild(btn);
      });
      group.appendChild(btns);
      playGrid.appendChild(group);
    });

    // Hit type buttons
    const hitTypeContainer = document.getElementById('hit-type-buttons');
    App.HIT_TYPES.forEach(ht => {
      const btn = document.createElement('button');
      btn.dataset.hittype = ht.key;
      btn.textContent = ht.label;
      btn.title = ht.name;
      btn.addEventListener('click', () => {
        const wasActive = btn.classList.contains('active');
        hitTypeContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        if (!wasActive) btn.classList.add('active');
      });
      hitTypeContainer.appendChild(btn);
    });

    // Direction / field zone buttons
    const dirContainer = document.getElementById('direction-buttons');
    App.FIELD_ZONES.forEach(z => {
      const btn = document.createElement('button');
      btn.dataset.zone = z.key;
      btn.textContent = z.label;
      btn.title = z.name;
      if (z.infield) btn.classList.add('infield-zone');
      btn.addEventListener('click', () => {
        const wasActive = btn.classList.contains('active');
        dirContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        if (!wasActive) btn.classList.add('active');
      });
      dirContainer.appendChild(btn);
    });

    // Out number buttons
    document.querySelectorAll('.out-num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wasActive = btn.classList.contains('active');
        document.querySelectorAll('.out-num-btn').forEach(b => b.classList.remove('active'));
        if (!wasActive) btn.classList.add('active');
      });
    });

    // Pitch-by-pitch buttons
    const pitchContainer = document.getElementById('pitch-result-buttons');
    App.PITCH_RESULTS.forEach(pr => {
      const btn = document.createElement('button');
      btn.dataset.pitch = pr.key;
      btn.textContent = pr.label;
      btn.title = pr.name;
      btn.style.color = pr.color;
      btn.style.borderColor = pr.color;
      btn.addEventListener('click', () => addPitch(pr));
      pitchContainer.appendChild(btn);
    });
  }

  function selectPlay(key, btn) {
    document.querySelectorAll('.play-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const play = App.PLAYS[key];

    // Show/hide contextual fields
    document.getElementById('fielding-group').style.display = play.fielding ? 'flex' : 'none';
    document.getElementById('hit-type-group').style.display = play.hitType ? 'flex' : 'none';
    document.getElementById('direction-group').style.display = play.direction ? 'flex' : 'none';
    // Show out # for out plays
    document.getElementById('out-number-group').style.display = play.cat === 'out' ? 'flex' : 'none';

    // Auto-draw base path
    App.Drawing.clear();
    setTimeout(() => {
      App.Drawing.resize();
      App.Drawing.drawBasePath(play.bases, 200);
    }, 10);
  }

  // Pitch-by-pitch tracking
  function addPitch(pr) {
    App.pitchSequence.push(pr);
    renderPitchSequence();
    // Auto-update ball/strike count
    // Walk sequence pitch-by-pitch for correct ball/strike count
    let balls = 0, strikeCount = 0;
    for (const p of App.pitchSequence) {
      if (['B','I','P','D','V'].includes(p.key)) balls++;
      else if (['C','S','M','Q'].includes(p.key)) strikeCount++;
      else if (p.key === 'T') strikeCount++;  // Foul tip is always a strike (including 0-2)
      else if (['F','L','O','R'].includes(p.key) && strikeCount < 2) strikeCount++;
      // Fouls with 2 strikes don't add a strike (but foul tips do)
    }
    document.getElementById('balls-display').textContent = Math.min(balls, 4);
    document.getElementById('strikes-display').textContent = Math.min(strikeCount, 3);
  }

  function renderPitchSequence() {
    const display = document.getElementById('pitch-sequence-display');
    display.innerHTML = App.pitchSequence.map(p =>
      `<span style="background:${p.color}20;color:${p.color}">${p.key}</span>`
    ).join('');
  }

  // Pitch count controls
  function setupCounters() {
    document.getElementById('btn-ball-up').addEventListener('click', () => {
      const el = document.getElementById('balls-display');
      el.textContent = Math.min(4, parseInt(el.textContent) + 1);
    });
    document.getElementById('btn-ball-dn').addEventListener('click', () => {
      const el = document.getElementById('balls-display');
      el.textContent = Math.max(0, parseInt(el.textContent) - 1);
    });
    document.getElementById('btn-strike-up').addEventListener('click', () => {
      const el = document.getElementById('strikes-display');
      el.textContent = Math.min(3, parseInt(el.textContent) + 1);
    });
    document.getElementById('btn-strike-dn').addEventListener('click', () => {
      const el = document.getElementById('strikes-display');
      el.textContent = Math.max(0, parseInt(el.textContent) - 1);
    });
    document.getElementById('btn-rbi-up').addEventListener('click', () => {
      const el = document.getElementById('rbi-display');
      el.textContent = Math.min(4, parseInt(el.textContent) + 1);
    });
    document.getElementById('btn-rbi-dn').addEventListener('click', () => {
      const el = document.getElementById('rbi-display');
      el.textContent = Math.max(0, parseInt(el.textContent) - 1);
    });
  }

  // --- Event bindings ---
  document.getElementById('btn-manual').addEventListener('click', startManual);
  document.getElementById('btn-back').addEventListener('click', () => showView('view-games'));
  document.getElementById('btn-history').addEventListener('click', () => { loadHistory(); showView('view-saved'); });
  document.getElementById('btn-history-back').addEventListener('click', () => showView('view-games'));

  // Team tabs
  document.querySelectorAll('.team-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      App.Scorecard.refresh();
    });
  });

  // Cell editor controls
  document.getElementById('btn-done').addEventListener('click', () => App.Scorecard.saveCurrentCell());
  document.getElementById('btn-clear-play').addEventListener('click', () => {
    document.querySelectorAll('.play-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('fielding-input').value = '';
    document.getElementById('balls-display').textContent = '0';
    document.getElementById('strikes-display').textContent = '0';
    document.getElementById('rbi-display').textContent = '0';
    document.getElementById('btn-scored').classList.remove('active');
    document.querySelectorAll('.out-num-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#hit-type-buttons button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#direction-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById('hit-type-group').style.display = 'none';
    document.getElementById('direction-group').style.display = 'none';
    document.getElementById('out-number-group').style.display = 'none';
    App.pitchSequence = [];
    renderPitchSequence();
    App.Drawing.clear();
  });

  document.getElementById('btn-draw-toggle').addEventListener('click', function() {
    this.classList.toggle('active');
    App.Drawing.setEnabled(this.classList.contains('active'));
  });
  document.getElementById('btn-draw-undo').addEventListener('click', () => App.Drawing.undo());
  document.getElementById('btn-pitch-undo').addEventListener('click', () => {
    App.pitchSequence.pop();
    renderPitchSequence();
  });

  document.getElementById('btn-scored').addEventListener('click', function() {
    this.classList.toggle('active');
  });

  // Auto-fill toggle
  document.getElementById('btn-autofill').addEventListener('click', () => App.LiveFeed.toggle());

  // Pitch tracking toggle
  const pitchPref = localStorage.getItem('scorecard_pitchTracking') !== 'false'; // default ON
  App.pitchTrackingEnabled = pitchPref;
  updatePitchToggleUI();

  document.getElementById('btn-pitch-toggle').addEventListener('click', () => {
    App.pitchTrackingEnabled = !App.pitchTrackingEnabled;
    localStorage.setItem('scorecard_pitchTracking', App.pitchTrackingEnabled);
    updatePitchToggleUI();
  });

  function updatePitchToggleUI() {
    const btn = document.getElementById('btn-pitch-toggle');
    const section = document.getElementById('pitch-tracking');
    btn.textContent = `Pitches: ${App.pitchTrackingEnabled ? 'ON' : 'OFF'}`;
    btn.classList.toggle('active', App.pitchTrackingEnabled);
    section.style.display = App.pitchTrackingEnabled ? 'block' : 'none';
  }

  // Add inning
  document.getElementById('btn-add-inning').addEventListener('click', () => App.Scorecard.addInning());

  // Print — render both teams into the print container
  document.getElementById('btn-print').addEventListener('click', () => {
    const card = App.Scorecard.getCard();
    if (!card) return;
    const pc = document.getElementById('print-container');
    pc.innerHTML = '';
    ['away', 'home'].forEach(teamKey => {
      const label = document.createElement('div');
      label.className = 'print-team-label';
      label.textContent = card[teamKey].name;
      pc.appendChild(label);
      const grid = document.createElement('div');
      App.Scorecard.renderGrid(teamKey, grid);
      pc.appendChild(grid);
    });
    window.print();
  });

  // Save / complete
  document.getElementById('btn-save').addEventListener('click', async () => {
    const card = App.Scorecard.getCard();
    if (!card) return;
    card.completed = true;
    await App.Storage.save(card);
    // Also push to cloud if logged in
    if (App.Supabase.configured() && App.Supabase.isLoggedIn()) {
      try { await App.Supabase.saveCard(card); } catch {}
    }
    alert('Scorecard saved!');
  });

  // Close editor on backdrop tap
  document.getElementById('cell-editor').addEventListener('click', (e) => {
    if (e.target.id === 'cell-editor') App.Scorecard.closeCellEditor();
  });

  // --- History view ---
  async function loadHistory() {
    const list = document.getElementById('saved-list');
    list.innerHTML = '<div class="loading">Loading saved scorecards...</div>';
    try {
      const cards = await App.Storage.list();
      if (!cards.length) {
        list.innerHTML = '<div class="no-games">No saved scorecards</div>';
        return;
      }
      list.innerHTML = '';
      cards.forEach(c => {
        const item = document.createElement('button');
        item.className = 'game-card';
        item.innerHTML = `
          <div class="game-matchup">
            <span class="team-abbr">${esc(c.away?.abbr || '')}</span>
            <span class="game-at">@</span>
            <span class="team-abbr">${esc(c.home?.abbr || '')}</span>
          </div>
          <div class="game-detail">
            <span>${esc(c.date || '')}</span>
            <span>${esc(c.venue || '')}</span>
            <span class="badge">${c.completed ? 'Final' : 'In Progress'}</span>
          </div>
        `;
        item.addEventListener('click', () => {
          App.Scorecard.setCard(c);
          showView('view-scorecard');
          App.Scorecard.refresh();
        });
        list.appendChild(item);
      });
    } catch (e) {
      list.innerHTML = '<div class="error">Failed to load history</div>';
    }
  }

  // --- Auth UI ---
  let authMode = 'signin'; // or 'signup'

  function updateAuthUI() {
    const loggedIn = App.Supabase.configured() && App.Supabase.isLoggedIn();
    document.getElementById('auth-logged-out').style.display = loggedIn ? 'none' : 'block';
    document.getElementById('auth-logged-in').style.display = loggedIn ? 'block' : 'none';
    if (loggedIn) {
      const user = App.Supabase.getUser();
      document.getElementById('auth-user-name').textContent =
        user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Signed in';
    }
    // Hide auth bar entirely if Supabase not configured
    document.getElementById('auth-bar').style.display = App.Supabase.configured() ? 'block' : 'none';
  }

  document.getElementById('btn-show-auth').addEventListener('click', () => {
    authMode = 'signin';
    document.getElementById('auth-modal').style.display = 'flex';
    document.getElementById('auth-modal-title').textContent = 'Sign In';
    document.getElementById('btn-auth-submit').textContent = 'Sign In';
    document.getElementById('btn-auth-toggle').textContent = 'Need an account? Sign up';
    document.getElementById('auth-name').style.display = 'none';
    document.getElementById('auth-error').textContent = '';
  });

  document.getElementById('btn-auth-toggle').addEventListener('click', () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    document.getElementById('auth-modal-title').textContent = authMode === 'signin' ? 'Sign In' : 'Sign Up';
    document.getElementById('btn-auth-submit').textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';
    document.getElementById('btn-auth-toggle').textContent = authMode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in';
    document.getElementById('auth-name').style.display = authMode === 'signup' ? 'block' : 'none';
    document.getElementById('auth-error').textContent = '';
  });

  document.getElementById('btn-auth-close').addEventListener('click', () => {
    document.getElementById('auth-modal').style.display = 'none';
  });

  document.getElementById('btn-auth-submit').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value.trim();
    const errEl = document.getElementById('auth-error');
    errEl.textContent = '';

    if (!email || !password) { errEl.textContent = 'Email and password required'; return; }

    try {
      if (authMode === 'signup') {
        await App.Supabase.signUp(email, password, name);
      } else {
        await App.Supabase.signIn(email, password);
      }
      document.getElementById('auth-modal').style.display = 'none';
      updateAuthUI();
      // Auto-sync local cards to cloud on first sign-in
      App.Supabase.syncAll().then(r => console.log('Synced', r.synced, 'cards'));
    } catch (e) {
      errEl.textContent = e.message;
    }
  });

  document.getElementById('btn-signout').addEventListener('click', async () => {
    await App.Supabase.signOut();
    updateAuthUI();
  });

  document.getElementById('btn-sync').addEventListener('click', async () => {
    const btn = document.getElementById('btn-sync');
    btn.textContent = 'Syncing...';
    try {
      const r = await App.Supabase.syncAll();
      btn.textContent = r.failed ? `Synced ${r.synced}, ${r.failed} failed` : `Synced (${r.synced})`;
      setTimeout(() => { btn.textContent = 'Sync'; }, 3000);
    } catch {
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = 'Sync'; }, 2000);
    }
  });

  // Share button
  document.getElementById('btn-share').addEventListener('click', async () => {
    const card = App.Scorecard.getCard();
    if (!card) return;

    if (!App.Supabase.configured() || !App.Supabase.isLoggedIn()) {
      alert('Sign in to share scorecards');
      return;
    }

    try {
      await App.Supabase.saveCard(card);
      const slug = await App.Supabase.shareCard(card.id);
      const url = `${location.origin}/share.html?s=${slug}`;
      if (navigator.share) {
        navigator.share({ title: `${card.away.abbr} @ ${card.home.abbr}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        alert('Share link copied!');
      }
    } catch (e) {
      alert('Share failed: ' + e.message);
    }
  });

  // --- Init auth ---
  if (App.Supabase.configured()) {
    App.Supabase.loadSession();
    if (App.Supabase.isLoggedIn()) {
      App.Supabase.refreshToken().catch(() => {}).then(() => updateAuthUI());
    }
  }
  updateAuthUI();

  // --- Drawing init ---
  App.Drawing.init(document.getElementById('diamond-canvas'));

  // --- Setup ---
  setupEditor();
  setupCounters();
  loadGames();
};

document.addEventListener('DOMContentLoaded', App.init);
