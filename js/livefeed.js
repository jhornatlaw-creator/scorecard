window.App = window.App || {};

App.LiveFeed = (() => {
  const BASE = 'https://statsapi.mlb.com/api/v1';
  let polling = false;
  let pollTimer = null;
  let pollInFlight = false;  // Guard against overlapping poll() calls
  let consecutiveErrors = 0;
  let lastPlayIndex = -1; // Track which plays we've already processed
  let gamePk = null;

  // MLB eventType → our play code
  const EVENT_MAP = {
    'strikeout':                'K',
    'strikeout_double_play':    'K',
    'single':                   '1B',
    'double':                   '2B',
    'triple':                   '3B',
    'home_run':                 'HR',
    'walk':                     'BB',
    'intent_walk':              'IBB',
    'hit_by_pitch':             'HBP',
    'field_out':                'FO',
    'force_out':                'GO',
    'grounded_into_double_play':'GIDP',
    'double_play':              'DP',
    'triple_play':              'TP',
    'sac_fly':                  'SF',
    'sac_fly_double_play':      'SF',
    'sac_bunt':                 'SAC',
    'sac_bunt_double_play':     'SAC',
    'fielders_choice':          'FC',
    'fielders_choice_out':      'FC',
    'field_error':              'E',
    'catcher_interf':           'CI',
    'batter_interference':      'FI',
    'fan_interference':         'FI',
  };

  // Refine field_out into GO/FO/LO/PO based on description text
  function refineOutType(eventType, description) {
    if (eventType !== 'field_out') return EVENT_MAP[eventType] || null;
    const d = (description || '').toLowerCase();
    if (d.includes('bunt'))                                      return 'BO';
    if (d.includes('foul'))                                      return 'FF';
    if (d.includes('grounds out') || d.includes('ground out'))  return 'GO';
    if (d.includes('lines out') || d.includes('line out'))      return 'LO';
    if (d.includes('pops out') || d.includes('pop out'))        return 'PO';
    if (d.includes('flies out') || d.includes('fly out'))       return 'FO';
    return 'FO'; // default
  }

  // Check if strikeout was looking (called)
  function isStrikeoutLooking(playEvents) {
    if (!playEvents?.length) return false;
    const pitches = playEvents.filter(e => e.isPitch);
    if (!pitches.length) return false;
    return pitches[pitches.length - 1]?.details?.call?.code === 'C';
  }

  // Position name → number
  const POS_MAP = {
    'pitcher': '1', 'catcher': '2', 'first baseman': '3',
    'second baseman': '4', 'third baseman': '5', 'shortstop': '6',
    'left fielder': '7', 'center fielder': '8', 'right fielder': '9',
    'designated hitter': 'DH',
  };

  // Parse fielding sequence from description
  // "grounds out, shortstop to first baseman" → "6-3"
  // "flies out to center fielder" → "8"
  function parseFielding(description) {
    if (!description) return '';
    const d = description.toLowerCase();
    const parts = [];

    // Look for position names in order
    for (const [name, num] of Object.entries(POS_MAP)) {
      // Find all occurrences with word boundary context
      let idx = 0;
      while ((idx = d.indexOf(name, idx)) !== -1) {
        parts.push({ pos: idx, num });
        idx += name.length;
      }
    }

    if (!parts.length) return '';

    // Sort by position in string, take unique numbers in order
    parts.sort((a, b) => a.pos - b.pos);
    const nums = [];
    for (const p of parts) {
      if (!nums.includes(p.num)) nums.push(p.num);
    }

    // For fly outs to a single fielder, just return the number
    if (nums.length === 1) return nums[0];
    return nums.join('-');
  }

  // Parse direction from description
  function parseDirection(description) {
    if (!description) return '';
    const d = description.toLowerCase();
    if (d.includes('left-center') || d.includes('left center'))   return '78';
    if (d.includes('right-center') || d.includes('right center')) return '89';
    if (d.includes('left field'))    return '7';
    if (d.includes('center field'))  return '8';
    if (d.includes('right field'))   return '9';
    if (d.includes('up the middle')) return '1';
    if (d.includes('third base') || d.includes('shortstop'))      return '56';
    if (d.includes('first base') || d.includes('second base'))    return '34';
    return '';
  }

  // Extract pitch sequence from play events
  function extractPitchSequence(playEvents) {
    if (!playEvents) return [];
    return playEvents
      .filter(e => e.isPitch)
      .map(e => e.details?.call?.code || 'X')
      .filter(code => code);
  }

  // Map a single MLB play to our at-bat format
  function mapPlay(play) {
    const event = play.result?.eventType;
    if (!event) return null;

    // Skip non-atBat events that don't produce an at-bat result
    const skipEvents = ['stolen_base_2b','stolen_base_3b','stolen_base_home',
      'caught_stealing_2b','caught_stealing_3b','caught_stealing_home',
      'pickoff_1b','pickoff_2b','pickoff_3b','wild_pitch','passed_ball',
      'balk','other_advance','defensive_indifference','pickoff_caught_stealing_2b',
      'pickoff_caught_stealing_3b','pickoff_caught_stealing_home'];
    if (skipEvents.includes(event)) return null;

    let playCode = refineOutType(event, play.result?.description);
    if (!playCode) return null;

    // Refine strikeout looking
    if (playCode === 'K' && isStrikeoutLooking(play.playEvents)) {
      playCode = 'KL';
    }

    const desc = play.result?.description || '';
    const fielding = parseFielding(desc);
    const direction = parseDirection(desc);
    const pitchSeq = extractPitchSequence(play.playEvents);
    const count = play.count || {};
    const rbi = play.result?.rbi || 0;

    // Did the batter score on this play?
    // Check runners array for batter crossing home, fallback to HR/IHR
    let scored = playCode === 'HR' || playCode === 'IHR';
    if (!scored && play.runners) {
      const batterId = play.matchup?.batter?.id;
      scored = play.runners.some(r =>
        r.details?.runner?.id === batterId && r.movement?.end === 'score'
      );
    }

    return {
      play: playCode,
      fielding,
      hitType: '',
      direction,
      outNumber: count.outs || 0,
      pitchSequence: pitchSeq,
      balls: count.balls || 0,
      strikes: count.strikes || 0,
      rbi,
      scored,
      strokes: [],
      drawingData: null,
      autoFilled: true,  // Mark as auto-filled
    };
  }

  // Process all plays from the live feed and fill the scorecard
  function processPlays(allPlays, card) {
    if (!allPlays || !card) return 0;

    let newPlays = 0;

    // Track which batter+inning combos we've processed THIS call
    // Distinguishes bat-around (create continuation) from re-poll (overwrite)
    const processedThisCall = new Set();

    for (let i = 0; i < allPlays.length; i++) {
      const play = allPlays[i];
      if (!play.about || !play.result?.eventType) continue;

      // Skip non-atBat types
      if (play.result.type !== 'atBat') continue;

      const teamKey = play.about.halfInning === 'top' ? 'away' : 'home';
      const inning = play.about.inning;
      const batterId = play.matchup?.batter?.id;

      if (!batterId) continue;

      // Find this batter in our lineup
      const team = card[teamKey];
      let batterIdx = team.batters.findIndex(b => b.id === batterId);

      // If batter not found by ID, try by name
      if (batterIdx === -1) {
        const name = play.matchup?.batter?.fullName;
        batterIdx = team.batters.findIndex(b => b.name === name);
      }

      // If still not found, skip (might be a sub not in original lineup)
      if (batterIdx === -1) {
        // Try to add as a substitution - find empty slot or add
        const emptyIdx = team.batters.findIndex(b => !b.name && !b.id);
        if (emptyIdx !== -1) {
          team.batters[emptyIdx].id = batterId;
          team.batters[emptyIdx].name = play.matchup?.batter?.fullName || '';
          team.batters[emptyIdx].number = '';
          batterIdx = emptyIdx;
        } else {
          continue;
        }
      }

      // Only process plays we haven't seen
      if (i <= lastPlayIndex) continue;

      const batter = team.batters[batterIdx];
      const innStr = String(inning);

      // Ensure columns array exists (backward compat)
      if (!card.columns) {
        card.columns = Array.from({length: card.innings}, (_, j) => String(j + 1));
      }
      // Ensure a column exists for this inning
      if (!card.columns.some(ck => parseInt(ck, 10) === inning)) {
        card.columns.push(innStr);
      }

      // Find available column for this batter in this inning
      const innCols = card.columns.filter(ck => parseInt(ck, 10) === inning);
      const batterInnKey = `${teamKey}_${batterIdx}_${inning}`;
      let targetColKey = innCols.find(ck => !batter.atBats[ck]);

      if (!targetColKey) {
        // All columns for this inning occupied by this batter
        // Skip if any column has a manual (non-autoFilled) entry
        if (innCols.some(ck => batter.atBats[ck] && !batter.atBats[ck].autoFilled)) continue;

        if (processedThisCall.has(batterInnKey)) {
          // Bat-around: already processed this batter for this inning → continuation
          const nextNum = innCols.length + 1;
          targetColKey = `${inning}_${nextNum}`;
          const lastContIdx = card.columns.lastIndexOf(innCols[innCols.length - 1]);
          card.columns.splice(lastContIdx + 1, 0, targetColKey);
        } else {
          // Re-poll: overwrite existing auto-filled entry in base column
          targetColKey = innCols.find(ck => batter.atBats[ck]?.autoFilled) || innCols[0];
        }
      }
      processedThisCall.add(batterInnKey);

      const mapped = mapPlay(play);
      if (!mapped) continue;

      batter.atBats[targetColKey] = mapped;
      newPlays++;
    }

    if (allPlays.length > 0) {
      lastPlayIndex = allPlays.length - 1;
    }

    // Expand innings if game goes to extras
    const maxInning = allPlays.reduce((max, p) => Math.max(max, p.about?.inning || 0), 0);
    if (maxInning > card.innings && maxInning <= 30) {
      card.innings = maxInning;
      // Ensure columns exist for all innings
      if (card.columns) {
        for (let inn = 1; inn <= maxInning; inn++) {
          if (!card.columns.some(ck => parseInt(ck, 10) === inn)) {
            card.columns.push(String(inn));
          }
        }
      }
    }

    return newPlays;
  }

  // Single poll
  async function poll() {
    if (!gamePk || pollInFlight) return;
    pollInFlight = true;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${BASE}/game/${gamePk}/feed/live`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return;  // finally resets pollInFlight
      const data = await res.json();

      const allPlays = data.liveData?.plays?.allPlays;
      const card = App.Scorecard.getCard();
      if (!allPlays || !card) return;  // finally resets pollInFlight

      consecutiveErrors = 0;
      const newCount = processPlays(allPlays, card);
      if (newCount > 0) {
        App.Scorecard.refresh();
        App.Scorecard.autoSave();
        updateStatus(`+${newCount} plays`);
      }

      // Check if game is final
      const state = data.gameData?.status?.abstractGameState;
      if (state === 'Final') {
        updateStatus('FINAL');
        stop();
      }
    } catch (e) {
      consecutiveErrors++;
      if (consecutiveErrors >= 5) {
        updateStatus('Feed stopped');
        stop();
      } else {
        updateStatus('Feed error');
      }
    } finally {
      pollInFlight = false;
    }
  }

  function updateStatus(msg) {
    const el = document.getElementById('autofill-status');
    if (el) el.textContent = msg;
  }

  function start(pk) {
    gamePk = pk;
    consecutiveErrors = 0;
    lastPlayIndex = -1;
    polling = true;
    updateStatus('LIVE');
    document.getElementById('btn-autofill')?.classList.add('active');

    // Initial fetch
    poll();
    // Poll every 20 seconds
    pollTimer = setInterval(poll, 20000);
  }

  function stop() {
    polling = false;
    clearInterval(pollTimer);
    pollTimer = null;
    document.getElementById('btn-autofill')?.classList.remove('active');
  }

  function toggle() {
    if (polling) {
      stop();
      updateStatus('OFF');
    } else {
      const card = App.Scorecard.getCard();
      if (card?.gamePk) {
        start(card.gamePk);
      } else {
        updateStatus('No game');
      }
    }
  }

  function isActive() { return polling; }

  // Test exports (internal functions exposed for game simulation tests)
  const _test = { refineOutType, isStrikeoutLooking, parseFielding, parseDirection, extractPitchSequence, mapPlay, processPlays, EVENT_MAP };

  return { start, stop, toggle, isActive, poll, _test };
})();
