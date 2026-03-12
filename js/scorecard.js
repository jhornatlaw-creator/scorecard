window.App = window.App || {};

App.Scorecard = (() => {
  let card = null;

  // Extract base inning number from a column key ('3' → 3, '3_2' → 3)
  function parseColKey(colKey) {
    return parseInt(colKey, 10);
  }

  function createCard(gameInfo, lineup) {
    const id = `card_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    function makeBatters(team) {
      const batters = (team.batters || []).slice(0, 9);
      while (batters.length < 9) {
        batters.push({ order: batters.length + 1, name: '', number: '', position: '', id: null });
      }
      return batters.map(b => ({
        ...b,
        subs: [],
        atBats: {},
      }));
    }

    card = {
      id,
      gamePk: gameInfo?.gamePk || null,
      date: lineup?.date || new Date().toISOString().slice(0,10),
      venue: lineup?.venue || gameInfo?.venue || '',
      away: {
        name: lineup?.away?.name || gameInfo?.away?.name || 'Away',
        abbr: lineup?.away?.abbr || gameInfo?.away?.abbr || 'AWY',
        batters: makeBatters(lineup?.away || {}),
        pitching: [],
      },
      home: {
        name: lineup?.home?.name || gameInfo?.home?.name || 'Home',
        abbr: lineup?.home?.abbr || gameInfo?.home?.abbr || 'HME',
        batters: makeBatters(lineup?.home || {}),
        pitching: [],
      },
      innings: 9,
      columns: ['1','2','3','4','5','6','7','8','9'],
      notes: '',
      notesStrokes: [],
      completed: false,
      created: new Date().toISOString(),
    };
    return card;
  }

  function getCard() { return card; }
  function setCard(c) {
    if (c) {
      // Generate columns array if missing (backward compat with pre-columns cards)
      if (!c.columns) {
        const n = (typeof c.innings === 'number' && c.innings > 0) ? c.innings : 9;
        c.columns = Array.from({length: n}, (_, i) => String(i + 1));
      }
    }
    card = c;
  }

  // Render the scorecard grid for one team
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function getColumns() {
    return card.columns || Array.from({length: card.innings}, (_, i) => String(i + 1));
  }

  function renderGrid(teamKey, container) {
    const team = card[teamKey];
    if (!team) return;
    container.innerHTML = '';

    const columns = getColumns();
    const table = document.createElement('table');
    table.className = 'scorecard-table';

    // Header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `<th class="player-col">${esc(team.abbr)}</th>`;
    columns.forEach(colKey => {
      const inn = parseColKey(colKey);
      const isCont = colKey.includes('_');
      const th = document.createElement('th');
      th.className = 'inning-col' + (isCont ? ' cont-col' : '');
      th.textContent = inn;
      if (isCont) th.title = `Inning ${inn} (cont.)`;
      headerRow.appendChild(th);
    });
    ['R', 'H'].forEach(label => {
      const th = document.createElement('th');
      th.className = 'stat-col';
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Batter rows
    const tbody = document.createElement('tbody');
    team.batters.forEach((batter, bi) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.className = 'player-cell';
      nameCell.innerHTML = `
        <span class="player-order">${batter.order}</span>
        <span class="player-name" data-team="${teamKey}" data-batter="${bi}">${esc(batter.name || '\u2014')}</span>
        <span class="player-pos">${esc(batter.position || '')}</span>
      `;
      nameCell.querySelector('.player-name').addEventListener('click', () => editPlayerName(teamKey, bi));
      row.appendChild(nameCell);

      columns.forEach(colKey => {
        const cell = document.createElement('td');
        cell.className = 'ab-cell';
        if (colKey.includes('_')) cell.classList.add('cont-col');
        cell.dataset.team = teamKey;
        cell.dataset.batter = bi;
        cell.dataset.col = colKey;

        const ab = batter.atBats[colKey];
        if (ab) {
          renderCellContent(cell, ab);
        }

        cell.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(miniDiamondSVG())}")`;
        cell.style.backgroundSize = '70% 70%';
        cell.style.backgroundPosition = 'center 2px';
        cell.style.backgroundRepeat = 'no-repeat';

        cell.addEventListener('click', () => openCellEditor(teamKey, bi, colKey));
        row.appendChild(cell);
      });

      // Per-batter totals
      const runs = Object.values(batter.atBats).filter(a => a.scored).length;
      const hits = Object.values(batter.atBats).filter(a => App.PLAYS[a.play]?.cat === 'hit').length;

      const rCell = document.createElement('td');
      rCell.className = 'stat-cell';
      rCell.textContent = runs || '';
      row.appendChild(rCell);

      const hCell = document.createElement('td');
      hCell.className = 'stat-cell';
      hCell.textContent = hits || '';
      row.appendChild(hCell);

      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    // Totals footer
    const tfoot = document.createElement('tfoot');
    const totalRow = document.createElement('tr');
    totalRow.innerHTML = '<td class="player-cell total-label">TOTAL</td>';
    let totalR = 0, totalH = 0;
    columns.forEach(colKey => {
      let colR = 0;
      team.batters.forEach(b => {
        const ab = b.atBats[colKey];
        if (ab?.scored) colR++;
      });
      totalR += colR;
      totalRow.innerHTML += `<td class="inning-total">${colR || ''}</td>`;
    });
    team.batters.forEach(b => {
      totalH += Object.values(b.atBats).filter(a => App.PLAYS[a.play]?.cat === 'hit').length;
    });
    totalRow.innerHTML += `<td class="stat-cell total">${totalR}</td><td class="stat-cell total">${totalH}</td>`;
    tfoot.appendChild(totalRow);
    table.appendChild(tfoot);

    container.appendChild(table);
  }

  function miniDiamondSVG() {
    return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><path d='M20 4 L36 20 L20 36 L4 20 Z' fill='none' stroke='%23c8bfa0' stroke-width='0.8'/></svg>`;
  }

  function renderCellContent(cell, ab) {
    const play = App.PLAYS[ab.play];
    if (!play) return;

    const color = App.PLAY_COLORS[play.cat] || '#333';
    let text = play.label;
    if (ab.fielding) text += ` ${esc(ab.fielding)}`;

    let html = `<span class="ab-result" style="color:${color}">${text}</span>`;

    // Out number indicator (circled)
    if (ab.outNumber) {
      html += `<span class="ab-out-num">${ab.outNumber}</span>`;
    }
    // Direction shorthand
    if (ab.direction) {
      const zone = App.FIELD_ZONES.find(z => z.key === ab.direction);
      if (zone) html += `<span class="ab-dir">${zone.label}</span>`;
    }
    // RBI
    if (ab.rbi) html += `<span class="ab-rbi">${ab.rbi}</span>`;
    // Pitch count (total pitches in sequence)
    if (ab.pitchSequence?.length) {
      html += `<span class="ab-pitches">${ab.pitchSequence.length}p</span>`;
    }

    cell.innerHTML = html;
    if (ab.scored) cell.classList.add('scored');
    if (ab.drawingData) {
      const img = document.createElement('img');
      img.src = ab.drawingData;
      img.className = 'ab-drawing';
      cell.appendChild(img);
    }
  }

  function editPlayerName(teamKey, batterIdx) {
    const batter = card[teamKey].batters[batterIdx];
    const name = prompt('Player name:', batter.name || '');
    if (name !== null) {
      batter.name = name;
      const pos = prompt('Position:', batter.position || '');
      if (pos !== null) batter.position = pos;
      const num = prompt('Number:', batter.number || '');
      if (num !== null) batter.number = num;
      refresh();
      autoSave();
    }
  }

  // --- Cell Editor ---
  let editorState = { teamKey: null, batterIdx: null, colKey: null };

  function openCellEditor(teamKey, batterIdx, colKey) {
    editorState = { teamKey, batterIdx, colKey };
    const batter = card[teamKey].batters[batterIdx];
    const ab = batter.atBats[colKey] || {};
    const inn = parseColKey(colKey);
    const isCont = String(colKey).includes('_');

    const sheet = document.getElementById('cell-editor');
    document.getElementById('editor-title').textContent =
      `${batter.name || 'Batter ' + (batterIdx+1)} \u2014 Inn ${inn}${isCont ? ' (cont)' : ''}`;

    // Reset all controls
    document.querySelectorAll('.play-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.out-num-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#hit-type-buttons button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#direction-buttons button').forEach(b => b.classList.remove('active'));

    const play = ab.play ? App.PLAYS[ab.play] : null;

    // Restore play button
    if (ab.play) {
      const btn = document.querySelector(`.play-btn[data-play="${ab.play}"]`);
      if (btn) btn.classList.add('active');
    }

    // Fielding
    document.getElementById('fielding-input').value = ab.fielding || '';
    document.getElementById('fielding-group').style.display = (play?.fielding) ? 'flex' : 'none';

    // Hit type
    document.getElementById('hit-type-group').style.display = (play?.hitType) ? 'flex' : 'none';
    if (ab.hitType) {
      const htBtn = document.querySelector(`#hit-type-buttons button[data-hittype="${ab.hitType}"]`);
      if (htBtn) htBtn.classList.add('active');
    }

    // Direction
    document.getElementById('direction-group').style.display = (play?.direction) ? 'flex' : 'none';
    if (ab.direction) {
      const dirBtn = document.querySelector(`#direction-buttons button[data-zone="${ab.direction}"]`);
      if (dirBtn) dirBtn.classList.add('active');
    }

    // Out number
    document.getElementById('out-number-group').style.display = (play?.cat === 'out') ? 'flex' : 'none';
    if (ab.outNumber) {
      const outBtn = document.querySelector(`.out-num-btn[data-out="${ab.outNumber}"]`);
      if (outBtn) outBtn.classList.add('active');
    }

    // Pitch sequence
    App.pitchSequence = (ab.pitchSequence || []).map(key => {
      return App.PITCH_RESULTS.find(pr => pr.key === key) || { key, label: key, color: '#555' };
    });
    const display = document.getElementById('pitch-sequence-display');
    display.innerHTML = App.pitchSequence.map(p =>
      `<span style="background:${p.color}20;color:${p.color}">${p.key}</span>`
    ).join('');

    // Count
    document.getElementById('balls-display').textContent = ab.balls || 0;
    document.getElementById('strikes-display').textContent = ab.strikes || 0;

    // RBI
    document.getElementById('rbi-display').textContent = ab.rbi || 0;

    // Scored
    document.getElementById('btn-scored').classList.toggle('active', !!ab.scored);

    // Drawing
    App.Drawing.setStrokes(ab.strokes || []);
    App.Drawing.setEnabled(false);
    document.getElementById('btn-draw-toggle').classList.remove('active');

    if (ab.play && App.PLAYS[ab.play]) {
      setTimeout(() => {
        App.Drawing.resize();
        App.Drawing.drawBasePath(App.PLAYS[ab.play].bases, 200);
        if (ab.strokes?.length) App.Drawing.setStrokes(ab.strokes);
      }, 50);
    } else {
      setTimeout(() => {
        App.Drawing.clearBasePath();
        App.Drawing.resize();
      }, 50);
    }

    sheet.classList.add('open');
    document.body.classList.add('sheet-open');
  }

  function closeCellEditor() {
    document.getElementById('cell-editor').classList.remove('open');
    document.body.classList.remove('sheet-open');
    App.Drawing.setEnabled(false);
  }

  function saveCurrentCell() {
    const { teamKey, batterIdx, colKey } = editorState;
    if (!teamKey || batterIdx == null || !colKey || !card?.[teamKey]?.batters?.[batterIdx]) return;

    const batter = card[teamKey].batters[batterIdx];
    const activePlayBtn = document.querySelector('.play-btn.active');
    const play = activePlayBtn?.dataset.play || null;

    if (!play) {
      delete batter.atBats[colKey];
    } else {
      // Gather all fields
      const activeHitType = document.querySelector('#hit-type-buttons button.active');
      const activeDir = document.querySelector('#direction-buttons button.active');
      const activeOut = document.querySelector('.out-num-btn.active');

      batter.atBats[colKey] = {
        play,
        fielding: document.getElementById('fielding-input').value || '',
        hitType: activeHitType?.dataset.hittype || '',
        direction: activeDir?.dataset.zone || '',
        outNumber: activeOut ? parseInt(activeOut.dataset.out) : 0,
        pitchSequence: App.pitchSequence.map(p => p.key),
        balls: parseInt(document.getElementById('balls-display').textContent) || 0,
        strikes: parseInt(document.getElementById('strikes-display').textContent) || 0,
        rbi: parseInt(document.getElementById('rbi-display').textContent) || 0,
        scored: document.getElementById('btn-scored').classList.contains('active'),
        strokes: App.Drawing.getStrokes(),
        drawingData: App.Drawing.toDataURL(),
      };
    }

    // Auto-create continuation column when all 9 batters have batted in this column
    if (play) {
      const team = card[teamKey];
      const filled = team.batters.filter(b => b.atBats[colKey]).length;
      if (filled >= 9) {
        const inn = parseColKey(colKey);
        const columns = getColumns();
        const innCols = columns.filter(ck => parseColKey(ck) === inn);
        // Only add if this is the last column for this inning
        if (innCols.indexOf(colKey) === innCols.length - 1) {
          const nextNum = innCols.length + 1;
          const newKey = `${inn}_${nextNum}`;
          const lastIdx = columns.lastIndexOf(colKey);
          card.columns.splice(lastIdx + 1, 0, newKey);
        }
      }
    }

    closeCellEditor();
    refresh();
    autoSave();
  }

  function addInning() {
    if (!card) return;
    const columns = getColumns();
    if (columns.length >= 30) return;
    const maxInn = columns.reduce((max, ck) => Math.max(max, parseColKey(ck)), 0);
    const newInn = maxInn + 1;
    card.columns.push(String(newInn));
    card.innings = newInn;
    refresh();
  }

  // Insert a continuation column after the tapped inning header
  function splitInning(colKey) {
    if (!card) return;
    const inn = parseColKey(colKey);
    const columns = getColumns();
    // Find all columns for this inning
    const contCols = columns.filter(ck => parseColKey(ck) === inn);
    const nextNum = contCols.length + 1;
    const newKey = `${inn}_${nextNum}`;
    // Insert after the last column for this inning
    const lastIdx = columns.lastIndexOf(contCols[contCols.length - 1]);
    card.columns.splice(lastIdx + 1, 0, newKey);
    refresh();
    autoSave();
  }

  function refresh() {
    const activeTab = document.querySelector('.team-tab.active');
    const teamKey = activeTab?.dataset.team || 'away';
    const container = document.getElementById('scorecard-grid');
    renderGrid(teamKey, container);
    updateGameTitle();
  }

  function updateGameTitle() {
    if (!card) return;
    document.getElementById('game-title').textContent = `${card.away.abbr} @ ${card.home.abbr}`;
    const sub = document.getElementById('game-subtitle');
    if (sub) sub.textContent = `${card.venue} \u2014 ${card.date}`;
  }

  async function autoSave() {
    if (!card) return;
    try { await App.Storage.save(card); }
    catch (e) { console.error('Autosave failed:', e); }
  }

  return { createCard, getCard, setCard, renderGrid, openCellEditor, closeCellEditor, saveCurrentCell, addInning, splitInning, refresh, autoSave, editorState, parseColKey };
})();
