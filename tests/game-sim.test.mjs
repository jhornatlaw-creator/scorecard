/**
 * Game Simulation Tests for Scorecard PWA
 *
 * Simulates real MLB game scenarios through the livefeed processing pipeline.
 * Uses Node's built-in test runner (node --test).
 *
 * Run: node --test tests/game-sim.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(__dirname, '..', 'js');

// --- Minimal browser stubs ---
function createContext() {
  const stubEl = () => ({
    textContent: '',
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    style: {},
    dataset: {},
    className: '',
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); },
      contains(c) { return this._set.has(c); },
    },
    appendChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  });

  const appObj = {};
  const ctx = vm.createContext({
    window: { App: appObj },
    App: appObj,  // mirror window.App at global scope (browser does this)
    document: {
      createElement: () => stubEl(),
      getElementById: () => stubEl(),
      querySelectorAll: () => [],
      body: { classList: { add() {}, remove() {} } },
    },
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] ?? null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; },
    },
    fetch: async () => ({ ok: false }),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    console,
    crypto: globalThis.crypto,
    indexedDB: undefined,
    navigator: { serviceWorker: undefined },
    location: { origin: 'http://test', search: '' },
    alert: () => {},
    prompt: () => null,
    AbortController: globalThis.AbortController,
    encodeURIComponent: globalThis.encodeURIComponent,
  });

  // Load source files in order
  const files = ['plays.js', 'livefeed.js', 'scorecard.js'];
  for (const f of files) {
    const code = readFileSync(path.join(jsDir, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }

  return ctx.window.App;
}

// --- Helpers to build fake MLB API play objects ---
function makePlay({ eventType, type = 'atBat', halfInning = 'top', inning = 1,
  batterId = 100, batterName = 'Test Batter', description = '',
  rbi = 0, playEvents = [], runners = [], outs = 0 }) {
  return {
    about: { halfInning, inning },
    result: { eventType, type, description, rbi },
    matchup: { batter: { id: batterId, fullName: batterName } },
    count: { balls: 0, strikes: 0, outs },
    playEvents,
    runners,
  };
}

function makePitchEvent(callCode, isPitch = true) {
  return { isPitch, details: { call: { code: callCode } } };
}

function makeRunnerEvent(isPitch = false) {
  return { isPitch, details: { event: 'Stolen Base 2B' } };
}

function makeCard(App) {
  return App.Scorecard.createCard(
    { gamePk: 12345 },
    {
      away: {
        name: 'Yankees', abbr: 'NYY',
        batters: [
          { order: 1, name: 'Aaron Judge', number: '99', position: 'RF', id: 100 },
          { order: 2, name: 'Juan Soto', number: '22', position: 'LF', id: 101 },
          { order: 3, name: 'Anthony Rizzo', number: '48', position: '1B', id: 102 },
          { order: 4, name: 'Giancarlo Stanton', number: '27', position: 'DH', id: 103 },
          { order: 5, name: 'Gleyber Torres', number: '25', position: '2B', id: 104 },
          { order: 6, name: 'Anthony Volpe', number: '11', position: 'SS', id: 105 },
          { order: 7, name: 'Alex Verdugo', number: '24', position: 'CF', id: 106 },
          { order: 8, name: 'Jose Trevino', number: '39', position: 'C', id: 107 },
          { order: 9, name: 'Oswaldo Cabrera', number: '95', position: '3B', id: 108 },
        ],
      },
      home: {
        name: 'Red Sox', abbr: 'BOS',
        batters: [
          { order: 1, name: 'Jarren Duran', number: '16', position: 'CF', id: 200 },
          { order: 2, name: 'Rafael Devers', number: '11', position: '3B', id: 201 },
          { order: 3, name: 'Masataka Yoshida', number: '7', position: 'LF', id: 202 },
          { order: 4, name: 'Tyler ONeill', number: '5', position: 'RF', id: 203 },
          { order: 5, name: 'Triston Casas', number: '36', position: '1B', id: 204 },
          { order: 6, name: 'Connor Wong', number: '12', position: 'C', id: 205 },
          { order: 7, name: 'Ceddanne Rafaela', number: '43', position: 'SS', id: 206 },
          { order: 8, name: 'Enmanuel Valdez', number: '47', position: '2B', id: 207 },
          { order: 9, name: 'David Hamilton', number: '70', position: 'DH', id: 208 },
        ],
      },
      venue: 'Fenway Park',
      date: '2026-03-11',
    }
  );
}

// ============================================================
// TEST SUITE 1: Play Classification
// ============================================================
describe('Play Classification', () => {
  let App;
  test.before(() => { App = createContext(); });

  test('single maps to 1B', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'single',
      description: 'Aaron Judge singles on a line drive to left fielder.',
    }));
    assert.equal(result.play, '1B');
  });

  test('double maps to 2B', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'double',
      description: 'Juan Soto doubles on a fly ball to left-center field.',
    }));
    assert.equal(result.play, '2B');
  });

  test('triple maps to 3B', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'triple',
      description: 'Anthony Volpe triples on a line drive to right field.',
    }));
    assert.equal(result.play, '3B');
  });

  test('home_run maps to HR with scored=true', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'home_run',
      description: 'Aaron Judge homers to center field.',
      rbi: 1,
    }));
    assert.equal(result.play, 'HR');
    assert.equal(result.scored, true);
    assert.equal(result.rbi, 1);
  });

  test('walk maps to BB', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'walk',
      description: 'Aaron Judge walks.',
    }));
    assert.equal(result.play, 'BB');
  });

  test('hit_by_pitch maps to HBP', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'hit_by_pitch',
      description: 'Aaron Judge hit by pitch.',
    }));
    assert.equal(result.play, 'HBP');
  });

  test('field_error maps to E', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'field_error',
      description: 'Fielding error by shortstop.',
    }));
    assert.equal(result.play, 'E');
  });

  test('sac_fly maps to SF', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'sac_fly',
      description: 'Aaron Judge out on a sacrifice fly to center fielder.',
      rbi: 1,
    }));
    assert.equal(result.play, 'SF');
    assert.equal(result.rbi, 1);
  });

  test('sac_bunt maps to SAC', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'sac_bunt',
      description: 'Oswaldo Cabrera sacrifices bunts, pitcher to first baseman.',
    }));
    assert.equal(result.play, 'SAC');
  });

  test('GIDP maps correctly', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'grounded_into_double_play',
      description: 'Gleyber Torres grounded into double play, shortstop to second baseman to first baseman.',
    }));
    assert.equal(result.play, 'GIDP');
  });

  test('intent_walk maps to IBB', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'intent_walk',
      description: 'Aaron Judge intentionally walked.',
    }));
    assert.equal(result.play, 'IBB');
  });

  test('fielders_choice maps to FC', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'fielders_choice',
      description: 'Gleyber Torres reaches on a fielders choice, fielded by shortstop.',
    }));
    assert.equal(result.play, 'FC');
  });
});

// ============================================================
// TEST SUITE 2: Force Out Classification (P1 bug fix)
// ============================================================
describe('Force Out → GO (was incorrectly FC)', () => {
  let App;
  test.before(() => { App = createContext(); });

  test('force_out maps to GO, not FC', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'force_out',
      description: 'Gleyber Torres grounds into a force out, shortstop to second baseman. Anthony Volpe out at 2nd.',
    }));
    assert.equal(result.play, 'GO', 'force_out should map to GO, not FC');
  });

  test('force_out distinct from fielders_choice', () => {
    const fo = App.LiveFeed._test.refineOutType('force_out', 'force out');
    const fc = App.LiveFeed._test.EVENT_MAP['fielders_choice'];
    assert.equal(fo, 'GO');
    assert.equal(fc, 'FC');
    assert.notEqual(fo, fc, 'force_out and fielders_choice must produce different codes');
  });
});

// ============================================================
// TEST SUITE 3: Field Out Refinement
// ============================================================
describe('Field Out Refinement (GO/FO/LO/PO)', () => {
  let App;
  test.before(() => { App = createContext(); });

  test('groundout detected', () => {
    assert.equal(App.LiveFeed._test.refineOutType('field_out', 'Aaron Judge grounds out, shortstop to first baseman.'), 'GO');
  });

  test('flyout detected', () => {
    assert.equal(App.LiveFeed._test.refineOutType('field_out', 'Juan Soto flies out to center fielder.'), 'FO');
  });

  test('lineout detected', () => {
    assert.equal(App.LiveFeed._test.refineOutType('field_out', 'Anthony Rizzo lines out to shortstop.'), 'LO');
  });

  test('popout detected', () => {
    assert.equal(App.LiveFeed._test.refineOutType('field_out', 'Jose Trevino pops out to catcher.'), 'PO');
  });

  test('bunt out detected', () => {
    assert.equal(App.LiveFeed._test.refineOutType('field_out', 'Cabrera bunt grounds out, pitcher to first baseman.'), 'BO');
  });

  test('foul out detected', () => {
    assert.equal(App.LiveFeed._test.refineOutType('field_out', 'Judge foul out to catcher.'), 'FF');
  });

  test('unknown field_out defaults to FO', () => {
    assert.equal(App.LiveFeed._test.refineOutType('field_out', 'something weird happens'), 'FO');
  });
});

// ============================================================
// TEST SUITE 4: Strikeout Classification (P2 bug fix)
// ============================================================
describe('Strikeout Looking vs Swinging', () => {
  let App;
  test.before(() => { App = createContext(); });

  test('swinging strikeout (last pitch is swinging strike)', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'strikeout',
      description: 'Aaron Judge strikes out swinging.',
      playEvents: [
        makePitchEvent('C'),  // called strike
        makePitchEvent('S'),  // swinging strike
        makePitchEvent('S'),  // swinging strike 3
      ],
    }));
    assert.equal(result.play, 'K');
  });

  test('called strikeout (last pitch is called strike C)', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'strikeout',
      description: 'Aaron Judge called out on strikes.',
      playEvents: [
        makePitchEvent('S'),  // swinging strike
        makePitchEvent('C'),  // called strike
        makePitchEvent('C'),  // called strike 3
      ],
    }));
    assert.equal(result.play, 'KL');
  });

  test('called K3 with trailing non-pitch event (runner advance on wild pitch)', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'strikeout',
      description: 'Aaron Judge called out on strikes.',
      playEvents: [
        makePitchEvent('B'),     // ball
        makePitchEvent('C'),     // called strike
        makePitchEvent('C'),     // called strike 3
        makeRunnerEvent(false),  // runner advances — NOT a pitch
      ],
    }));
    assert.equal(result.play, 'KL', 'Should detect called K even with trailing non-pitch event');
  });

  test('swinging K with trailing runner event stays K (not KL)', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'strikeout',
      description: 'Judge strikes out swinging.',
      playEvents: [
        makePitchEvent('S'),     // swinging strike
        makePitchEvent('S'),     // swinging strike 3
        makeRunnerEvent(false),  // runner steals — NOT a pitch
      ],
    }));
    assert.equal(result.play, 'K', 'Trailing non-pitch after swinging K should still be K');
  });

  test('empty playEvents defaults to K (swinging)', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'strikeout',
      description: 'Judge strikes out.',
      playEvents: [],
    }));
    assert.equal(result.play, 'K');
  });
});

// ============================================================
// TEST SUITE 5: Fielding Sequence Parsing
// ============================================================
describe('Fielding Sequence', () => {
  let App;
  test.before(() => { App = createContext(); });

  test('6-3 groundout (shortstop to first baseman)', () => {
    assert.equal(
      App.LiveFeed._test.parseFielding('Aaron Judge grounds out, shortstop to first baseman.'),
      '6-3'
    );
  });

  test('fly out to center fielder = 8', () => {
    assert.equal(
      App.LiveFeed._test.parseFielding('Juan Soto flies out to center fielder.'),
      '8'
    );
  });

  test('4-6-3 double play', () => {
    assert.equal(
      App.LiveFeed._test.parseFielding('Torres grounded into double play, second baseman to shortstop to first baseman.'),
      '4-6-3'
    );
  });

  test('1-3 bunt (pitcher to first baseman)', () => {
    assert.equal(
      App.LiveFeed._test.parseFielding('Cabrera bunts, pitcher to first baseman.'),
      '1-3'
    );
  });

  test('null description returns empty', () => {
    assert.equal(App.LiveFeed._test.parseFielding(null), '');
  });

  test('no position names returns empty', () => {
    assert.equal(App.LiveFeed._test.parseFielding('Something happened.'), '');
  });

  test('5-4-3 (third baseman to second baseman to first baseman)', () => {
    assert.equal(
      App.LiveFeed._test.parseFielding('Rizzo grounded into double play, third baseman to second baseman to first baseman.'),
      '5-4-3'
    );
  });
});

// ============================================================
// TEST SUITE 6: Direction Parsing
// ============================================================
describe('Direction Parsing', () => {
  let App;
  test.before(() => { App = createContext(); });

  test('left field = 7', () => {
    assert.equal(App.LiveFeed._test.parseDirection('homers to deep left field'), '7');
  });

  test('center field = 8', () => {
    assert.equal(App.LiveFeed._test.parseDirection('flies out to center field'), '8');
  });

  test('right field = 9', () => {
    assert.equal(App.LiveFeed._test.parseDirection('singles on a line drive to right field'), '9');
  });

  test('left-center = 78', () => {
    assert.equal(App.LiveFeed._test.parseDirection('doubles to left-center field'), '78');
  });

  test('right-center = 89', () => {
    assert.equal(App.LiveFeed._test.parseDirection('triples to right-center field'), '89');
  });

  test('up the middle = 1', () => {
    assert.equal(App.LiveFeed._test.parseDirection('singles up the middle'), '1');
  });

  test('null returns empty', () => {
    assert.equal(App.LiveFeed._test.parseDirection(null), '');
  });
});

// ============================================================
// TEST SUITE 7: Pitch Sequence Extraction
// ============================================================
describe('Pitch Sequence Extraction', () => {
  let App;
  test.before(() => { App = createContext(); });

  test('filters to only isPitch events', () => {
    const events = [
      makePitchEvent('B'),
      makeRunnerEvent(),       // not a pitch
      makePitchEvent('S'),
      makePitchEvent('F'),
      makeRunnerEvent(),       // not a pitch
      makePitchEvent('C'),
    ];
    const seq = App.LiveFeed._test.extractPitchSequence(events);
    assert.deepEqual(seq, ['B', 'S', 'F', 'C']);
  });

  test('null input returns empty array', () => {
    const result = App.LiveFeed._test.extractPitchSequence(null);
    assert.equal(result.length, 0);
  });

  test('missing call code falls back to X', () => {
    const events = [{ isPitch: true, details: {} }];
    const seq = App.LiveFeed._test.extractPitchSequence(events);
    assert.deepEqual(seq, ['X']);
  });
});

// ============================================================
// TEST SUITE 8: Scoring Detection
// ============================================================
describe('Scoring Detection', () => {
  let App;
  test.before(() => { App = createContext(); });

  test('HR always scored=true', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'home_run',
      description: 'homers',
    }));
    assert.equal(result.scored, true);
  });

  test('single with batter scoring via runners array', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'single',
      description: 'singles',
      batterId: 100,
      runners: [
        { details: { runner: { id: 100 } }, movement: { end: 'score' } },
      ],
    }));
    assert.equal(result.scored, true);
  });

  test('single without scoring = scored false', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'single',
      description: 'singles to left field',
      runners: [
        { details: { runner: { id: 100 } }, movement: { end: '1B' } },
      ],
    }));
    assert.equal(result.scored, false);
  });

  test('walk does not score batter (no runner data)', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'walk',
      description: 'walks',
      runners: [],
    }));
    assert.equal(result.scored, false);
  });
});

// ============================================================
// TEST SUITE 9: Skip Events (baserunning, not at-bats)
// ============================================================
describe('Non-AtBat Events Skipped', () => {
  let App;
  test.before(() => { App = createContext(); });

  const skipTypes = [
    'stolen_base_2b', 'stolen_base_3b', 'caught_stealing_2b',
    'pickoff_1b', 'wild_pitch', 'passed_ball', 'balk',
    'defensive_indifference',
  ];

  for (const eventType of skipTypes) {
    test(`${eventType} returns null`, () => {
      const result = App.LiveFeed._test.mapPlay(makePlay({ eventType }));
      assert.equal(result, null, `${eventType} should be skipped`);
    });
  }
});

// ============================================================
// TEST SUITE 10: Full Game Simulation — 3 innings
// ============================================================
describe('Full Game Simulation: 3-Inning Game', () => {
  let App, card;
  test.before(() => {
    App = createContext();
    card = makeCard(App);
  });

  test('processes a realistic 3-inning top half', () => {
    const plays = [
      // Inning 1 top: Judge K, Soto 1B, Rizzo FO
      makePlay({ eventType: 'strikeout', inning: 1, halfInning: 'top', batterId: 100, batterName: 'Aaron Judge', description: 'Judge strikes out swinging.', playEvents: [makePitchEvent('S'), makePitchEvent('S'), makePitchEvent('S')] }),
      makePlay({ eventType: 'single', inning: 1, halfInning: 'top', batterId: 101, batterName: 'Juan Soto', description: 'Soto singles on a line drive to left field.' }),
      makePlay({ eventType: 'field_out', inning: 1, halfInning: 'top', batterId: 102, batterName: 'Anthony Rizzo', description: 'Rizzo flies out to center fielder.', outs: 2 }),

      // Inning 2 top: Stanton HR, Torres GO, Volpe BB
      makePlay({ eventType: 'home_run', inning: 2, halfInning: 'top', batterId: 103, batterName: 'Giancarlo Stanton', description: 'Stanton homers to deep left field.', rbi: 1 }),
      makePlay({ eventType: 'field_out', inning: 2, halfInning: 'top', batterId: 104, batterName: 'Gleyber Torres', description: 'Torres grounds out, shortstop to first baseman.' }),
      makePlay({ eventType: 'walk', inning: 2, halfInning: 'top', batterId: 105, batterName: 'Anthony Volpe', description: 'Volpe walks.' }),

      // Inning 3 top: Verdugo 2B, Trevino SF, Cabrera GIDP
      makePlay({ eventType: 'double', inning: 3, halfInning: 'top', batterId: 106, batterName: 'Alex Verdugo', description: 'Verdugo doubles to right-center field.' }),
      makePlay({ eventType: 'sac_fly', inning: 3, halfInning: 'top', batterId: 107, batterName: 'Jose Trevino', description: 'Trevino out on a sacrifice fly to right fielder.', rbi: 1 }),
      makePlay({ eventType: 'grounded_into_double_play', inning: 3, halfInning: 'top', batterId: 108, batterName: 'Oswaldo Cabrera', description: 'Cabrera grounded into double play, shortstop to second baseman to first baseman.' }),
    ];

    const count = App.LiveFeed._test.processPlays(plays, card);
    assert.equal(count, 9, 'Should process all 9 plays');

    // Verify inning 1
    const judge1 = card.away.batters[0].atBats[1];
    assert.equal(judge1.play, 'K');

    const soto1 = card.away.batters[1].atBats[1];
    assert.equal(soto1.play, '1B');
    assert.equal(soto1.direction, '7');

    const rizzo1 = card.away.batters[2].atBats[1];
    assert.equal(rizzo1.play, 'FO');

    // Verify inning 2
    const stanton2 = card.away.batters[3].atBats[2];
    assert.equal(stanton2.play, 'HR');
    assert.equal(stanton2.scored, true);
    assert.equal(stanton2.rbi, 1);

    const torres2 = card.away.batters[4].atBats[2];
    assert.equal(torres2.play, 'GO');
    assert.equal(torres2.fielding, '6-3');

    const volpe2 = card.away.batters[5].atBats[2];
    assert.equal(volpe2.play, 'BB');

    // Verify inning 3
    const verdugo3 = card.away.batters[6].atBats[3];
    assert.equal(verdugo3.play, '2B');
    assert.equal(verdugo3.direction, '89');

    const trevino3 = card.away.batters[7].atBats[3];
    assert.equal(trevino3.play, 'SF');
    assert.equal(trevino3.rbi, 1);

    const cabrera3 = card.away.batters[8].atBats[3];
    assert.equal(cabrera3.play, 'GIDP');
    assert.equal(cabrera3.fielding, '6-4-3');
  });
});

// ============================================================
// TEST SUITE 11: Extra Innings Expansion
// ============================================================
describe('Extra Innings', () => {
  let App, card;
  test.before(() => {
    App = createContext();
    card = makeCard(App);
  });

  test('game extends to 11 innings when plays occur in 10th and 11th', () => {
    const plays = [
      makePlay({ eventType: 'single', inning: 10, halfInning: 'top', batterId: 100, batterName: 'Aaron Judge', description: 'Judge singles.' }),
      makePlay({ eventType: 'home_run', inning: 11, halfInning: 'top', batterId: 101, batterName: 'Juan Soto', description: 'Soto homers.', rbi: 2 }),
    ];
    App.LiveFeed._test.processPlays(plays, card);
    assert.equal(card.innings, 11, 'Card should expand to 11 innings');
  });

  test('innings do not expand beyond 30', () => {
    const plays = [
      makePlay({ eventType: 'single', inning: 50, halfInning: 'top', batterId: 100, batterName: 'Aaron Judge', description: 'Judge singles.' }),
    ];
    card.innings = 9;
    App.LiveFeed._test.processPlays(plays, card);
    assert.ok(card.innings <= 30, 'Innings should be capped at 30');
  });
});

// ============================================================
// TEST SUITE 12: Substitution Handling
// ============================================================
describe('Substitution (unknown batter)', () => {
  let App, card;
  test.before(() => {
    App = createContext();
    card = makeCard(App);
    // Clear one slot to simulate an available sub slot
    card.away.batters[8].name = '';
    card.away.batters[8].id = null;
  });

  test('unknown batter fills empty slot', () => {
    const plays = [
      makePlay({ eventType: 'single', inning: 5, halfInning: 'top', batterId: 999, batterName: 'Pinch Hitter', description: 'Pinch Hitter singles.' }),
    ];
    App.LiveFeed._test.processPlays(plays, card);
    assert.equal(card.away.batters[8].name, 'Pinch Hitter');
    assert.equal(card.away.batters[8].id, 999);
    assert.equal(card.away.batters[8].atBats[5].play, '1B');
  });

  test('unknown batter with no empty slot is skipped', () => {
    // All slots filled
    const card2 = makeCard(App);
    const plays = [
      makePlay({ eventType: 'single', inning: 5, halfInning: 'top', batterId: 999, batterName: 'Extra Guy', description: 'singles.' }),
    ];
    const count = App.LiveFeed._test.processPlays(plays, card2);
    assert.equal(count, 0, 'Should skip batter with no available slot');
  });
});

// ============================================================
// TEST SUITE 13: Manual Entry Protection
// ============================================================
describe('Manual Entry Not Overwritten', () => {
  let App, card;
  test.before(() => {
    App = createContext();
    card = makeCard(App);
    // Manually fill Judge's inning 1 (no autoFilled flag)
    card.away.batters[0].atBats[1] = {
      play: '2B',
      fielding: '7',
      scored: false,
      rbi: 0,
      // no autoFilled flag = manual entry
    };
  });

  test('auto-fill does not overwrite manual entry', () => {
    const plays = [
      makePlay({ eventType: 'strikeout', inning: 1, halfInning: 'top', batterId: 100, batterName: 'Aaron Judge', description: 'Judge strikes out.' }),
    ];
    App.LiveFeed._test.processPlays(plays, card);
    assert.equal(card.away.batters[0].atBats[1].play, '2B', 'Manual entry should be preserved');
  });

  test('auto-fill DOES overwrite previous auto-fill (fresh context)', () => {
    // Need a fresh context to reset lastPlayIndex to -1 (simulates page reload)
    const App2 = createContext();
    const card2 = makeCard(App2);
    card2.away.batters[1].atBats[1] = {
      play: 'K',
      autoFilled: true,
    };
    const plays = [
      makePlay({ eventType: 'single', inning: 1, halfInning: 'top', batterId: 101, batterName: 'Juan Soto', description: 'Soto singles.' }),
    ];
    App2.LiveFeed._test.processPlays(plays, card2);
    assert.equal(card2.away.batters[1].atBats[1].play, '1B', 'Auto-filled entry should be updated on re-poll');
  });
});

// ============================================================
// TEST SUITE 14: Home Team Plays
// ============================================================
describe('Home Team (bottom half)', () => {
  let App, card;
  test.before(() => {
    App = createContext();
    card = makeCard(App);
  });

  test('bottom-half plays go to home team', () => {
    const plays = [
      makePlay({ eventType: 'home_run', inning: 1, halfInning: 'bottom', batterId: 200, batterName: 'Jarren Duran', description: 'Duran homers to right field.', rbi: 1 }),
      makePlay({ eventType: 'field_out', inning: 1, halfInning: 'bottom', batterId: 201, batterName: 'Rafael Devers', description: 'Devers grounds out, second baseman to first baseman.' }),
    ];
    App.LiveFeed._test.processPlays(plays, card);

    assert.equal(card.home.batters[0].atBats[1].play, 'HR');
    assert.equal(card.home.batters[0].atBats[1].scored, true);
    assert.equal(card.home.batters[1].atBats[1].play, 'GO');
    assert.equal(card.home.batters[1].atBats[1].fielding, '4-3');
  });
});

// ============================================================
// TEST SUITE 15: Batting Around (continuation columns)
// ============================================================
describe('Batting Around (same batter, same inning)', () => {
  let App, card;
  test.before(() => {
    App = createContext();
    card = makeCard(App);
  });

  test('second AB goes to continuation column, first AB preserved', () => {
    const plays = [
      // Judge first AB in inning 1: strikeout
      makePlay({ eventType: 'strikeout', inning: 1, halfInning: 'top', batterId: 100, batterName: 'Aaron Judge', description: 'Judge strikes out.', playEvents: [makePitchEvent('S'), makePitchEvent('S'), makePitchEvent('S')] }),
      // 8 more batters bat through the order
      makePlay({ eventType: 'single', inning: 1, halfInning: 'top', batterId: 101, batterName: 'Juan Soto', description: 'Soto singles.' }),
      makePlay({ eventType: 'walk', inning: 1, halfInning: 'top', batterId: 102, batterName: 'Anthony Rizzo', description: 'Rizzo walks.' }),
      makePlay({ eventType: 'single', inning: 1, halfInning: 'top', batterId: 103, batterName: 'Giancarlo Stanton', description: 'Stanton singles.' }),
      makePlay({ eventType: 'walk', inning: 1, halfInning: 'top', batterId: 104, batterName: 'Gleyber Torres', description: 'Torres walks.' }),
      makePlay({ eventType: 'single', inning: 1, halfInning: 'top', batterId: 105, batterName: 'Anthony Volpe', description: 'Volpe singles.' }),
      makePlay({ eventType: 'double', inning: 1, halfInning: 'top', batterId: 106, batterName: 'Alex Verdugo', description: 'Verdugo doubles.' }),
      makePlay({ eventType: 'walk', inning: 1, halfInning: 'top', batterId: 107, batterName: 'Jose Trevino', description: 'Trevino walks.' }),
      makePlay({ eventType: 'single', inning: 1, halfInning: 'top', batterId: 108, batterName: 'Oswaldo Cabrera', description: 'Cabrera singles.' }),
      // Judge second AB in inning 1: home run (batting around)
      makePlay({ eventType: 'home_run', inning: 1, halfInning: 'top', batterId: 100, batterName: 'Aaron Judge', description: 'Judge homers.', rbi: 3 }),
    ];
    App.LiveFeed._test.processPlays(plays, card);

    // First AB (K) stays in column '1'
    const judgeFirst = card.away.batters[0].atBats['1'];
    assert.equal(judgeFirst.play, 'K', 'First AB preserved in original column');

    // Second AB (HR) goes to continuation column '1_2'
    const judgeCont = card.away.batters[0].atBats['1_2'];
    assert.ok(judgeCont, 'Continuation column created for bat-around');
    assert.equal(judgeCont.play, 'HR', 'Second AB stored in continuation column');
    assert.equal(judgeCont.rbi, 3);
    assert.equal(judgeCont.scored, true);

    // Continuation column was inserted into card.columns
    assert.ok(card.columns.includes('1_2'), 'columns array includes continuation key');

    // Continuation column is right after the base column
    const idx1 = card.columns.indexOf('1');
    const idx1_2 = card.columns.indexOf('1_2');
    assert.equal(idx1_2, idx1 + 1, 'Continuation column is adjacent to base column');
  });

  test('manual entry in base column is not overwritten by live feed', () => {
    const freshApp = createContext();
    const freshCard = makeCard(freshApp);

    // Manually score Judge's first AB (not autoFilled)
    freshCard.away.batters[0].atBats['1'] = { play: 'K', fielding: '6-3', autoFilled: false };

    const plays = [
      // Live feed tries to fill Judge's inning 1
      makePlay({ eventType: 'home_run', inning: 1, halfInning: 'top', batterId: 100, batterName: 'Aaron Judge', description: 'Judge homers.' }),
    ];
    freshApp.LiveFeed._test.processPlays(plays, freshCard);

    // Manual entry preserved
    assert.equal(freshCard.away.batters[0].atBats['1'].play, 'K');
    assert.equal(freshCard.away.batters[0].atBats['1'].fielding, '6-3');
  });
});

// ============================================================
// TEST SUITE 16: Pitch Count Logic (extracted for testing)
// ============================================================
describe('Pitch Count Logic', () => {
  // Replicate the addPitch counting logic from app.js
  function countPitches(keys) {
    let balls = 0, strikeCount = 0;
    for (const key of keys) {
      if (['B', 'I', 'P', 'D', 'V'].includes(key)) balls++;
      else if (['C', 'S', 'M', 'Q'].includes(key)) strikeCount++;
      else if (key === 'T') strikeCount++;  // Foul tip always a strike
      else if (['F', 'L', 'O', 'R'].includes(key) && strikeCount < 2) strikeCount++;
    }
    return { balls: Math.min(balls, 4), strikes: Math.min(strikeCount, 3) };
  }

  test('3 called strikes = 0-3', () => {
    assert.deepEqual(countPitches(['C', 'C', 'C']), { balls: 0, strikes: 3 });
  });

  test('4 balls = 4-0', () => {
    assert.deepEqual(countPitches(['B', 'B', 'B', 'B']), { balls: 4, strikes: 0 });
  });

  test('full count = 3-2', () => {
    assert.deepEqual(countPitches(['B', 'C', 'B', 'S', 'B']), { balls: 3, strikes: 2 });
  });

  test('fouls with 2 strikes do not advance count', () => {
    // C, C, F, F, F = 0-2 (fouls don't add 3rd strike)
    assert.deepEqual(countPitches(['C', 'C', 'F', 'F', 'F']), { balls: 0, strikes: 2 });
  });

  test('fouls before 2 strikes DO advance count', () => {
    // F, F, S = 0-3
    assert.deepEqual(countPitches(['F', 'F', 'S']), { balls: 0, strikes: 3 });
  });

  test('foul tip IS a strike on any count including 0-2 (P5 fix)', () => {
    // C, C, T = 0-3 (foul tip = strikeout)
    assert.deepEqual(countPitches(['C', 'C', 'T']), { balls: 0, strikes: 3 });
  });

  test('foul tip on 0-0 is a strike', () => {
    assert.deepEqual(countPitches(['T']), { balls: 0, strikes: 1 });
  });

  test('realistic AB: B, C, F, B, F, S = 2-3', () => {
    assert.deepEqual(countPitches(['B', 'C', 'F', 'B', 'F', 'S']), { balls: 2, strikes: 3 });
  });

  test('long AB with many fouls: B, S, F, B, F, F, F, F, C = 2-3', () => {
    // S (1 strike), F (2 strikes), then 3 more fouls (stay at 2), then C (3rd strike)
    assert.deepEqual(countPitches(['B', 'S', 'F', 'B', 'F', 'F', 'F', 'F', 'C']), { balls: 2, strikes: 3 });
  });

  test('HBP after balls and strikes: B, C, B, P = 2-1 (P is a ball-type)', () => {
    assert.deepEqual(countPitches(['B', 'C', 'B', 'P']), { balls: 3, strikes: 1 });
  });
});

// ============================================================
// TEST SUITE 17: Edge Cases and Regression
// ============================================================
describe('Edge Cases', () => {
  let App;
  test.before(() => { App = createContext(); });

  test('null eventType returns null from mapPlay', () => {
    const play = makePlay({ eventType: 'single' });
    play.result.eventType = undefined;
    assert.equal(App.LiveFeed._test.mapPlay(play), null);
  });

  test('non-atBat type is filtered in processPlays', () => {
    const card = makeCard(App);
    const plays = [
      makePlay({ eventType: 'stolen_base_2b', type: 'action', inning: 1, halfInning: 'top', batterId: 100, batterName: 'Judge' }),
    ];
    // mapPlay skips it, and processPlays also checks result.type !== 'atBat'
    const count = App.LiveFeed._test.processPlays(plays, card);
    assert.equal(count, 0);
  });

  test('triple_play maps to TP', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'triple_play',
      description: 'Triple play!',
    }));
    assert.equal(result.play, 'TP');
  });

  test('catcher_interf maps to CI', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'catcher_interf',
      description: 'Catchers interference.',
    }));
    assert.equal(result.play, 'CI');
  });

  test('fan_interference maps to FI', () => {
    const result = App.LiveFeed._test.mapPlay(makePlay({
      eventType: 'fan_interference',
      description: 'Fan interference.',
    }));
    assert.equal(result.play, 'FI');
  });

  test('processPlays with null card returns 0', () => {
    assert.equal(App.LiveFeed._test.processPlays([], null), 0);
  });

  test('processPlays with null allPlays returns 0', () => {
    const card = makeCard(App);
    assert.equal(App.LiveFeed._test.processPlays(null, card), 0);
  });
});

// ============================================================
// TEST SUITE 18: Grand Slam Scenario
// ============================================================
describe('Grand Slam', () => {
  let App, card;
  test.before(() => {
    App = createContext();
    card = makeCard(App);
  });

  test('grand slam: HR with 4 RBI and batter scores', () => {
    const plays = [
      makePlay({
        eventType: 'home_run',
        inning: 1, halfInning: 'top',
        batterId: 103, batterName: 'Giancarlo Stanton',
        description: 'Giancarlo Stanton hits a grand slam to deep left field.',
        rbi: 4,
        runners: [
          { details: { runner: { id: 103 } }, movement: { end: 'score' } },
          { details: { runner: { id: 100 } }, movement: { end: 'score' } },
          { details: { runner: { id: 101 } }, movement: { end: 'score' } },
          { details: { runner: { id: 102 } }, movement: { end: 'score' } },
        ],
      }),
    ];
    App.LiveFeed._test.processPlays(plays, card);
    const ab = card.away.batters[3].atBats[1];
    assert.equal(ab.play, 'HR');
    assert.equal(ab.rbi, 4);
    assert.equal(ab.scored, true);
    assert.equal(ab.direction, '7');
  });
});

// ============================================================
// TEST SUITE 19: Inside-the-Park HR via runners array
// ============================================================
describe('Runner-Based Scoring', () => {
  let App, card;
  test.before(() => {
    App = createContext();
    card = makeCard(App);
  });

  test('single where batter scores from runners array', () => {
    const plays = [
      makePlay({
        eventType: 'single',
        inning: 1, halfInning: 'top',
        batterId: 100, batterName: 'Aaron Judge',
        description: 'Judge singles, scores on throwing error.',
        runners: [
          { details: { runner: { id: 100 } }, movement: { end: 'score' } },
        ],
      }),
    ];
    App.LiveFeed._test.processPlays(plays, card);
    assert.equal(card.away.batters[0].atBats[1].scored, true);
  });
});

// ============================================================
// TEST SUITE 20: processPlays idempotency
// ============================================================
describe('processPlays Idempotency', () => {
  test('processing same plays twice does not double-count (fresh context)', () => {
    const App = createContext();
    const card = makeCard(App);
    const plays = [
      makePlay({ eventType: 'single', inning: 1, halfInning: 'top', batterId: 100, batterName: 'Aaron Judge', description: 'Judge singles.' }),
      makePlay({ eventType: 'strikeout', inning: 1, halfInning: 'top', batterId: 101, batterName: 'Juan Soto', description: 'Soto strikes out.', playEvents: [makePitchEvent('S'), makePitchEvent('S'), makePitchEvent('S')] }),
    ];

    const count1 = App.LiveFeed._test.processPlays(plays, card);
    assert.equal(count1, 2, 'First run should process 2 plays');

    // Second run with same plays — lastPlayIndex should prevent reprocessing
    const count2 = App.LiveFeed._test.processPlays(plays, card);
    assert.equal(count2, 0, 'Second run should process 0 plays (already seen)');
  });
});
