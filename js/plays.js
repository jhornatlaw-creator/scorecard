window.App = window.App || {};

// === POSITION NUMBERING (universal) ===
App.POSITIONS = {
  1:'P', 2:'C', 3:'1B', 4:'2B', 5:'3B', 6:'SS', 7:'LF', 8:'CF', 9:'RF', 10:'DH'
};

// Baserunning path coordinates on a 200x200 diamond
App.BASES = { home:[100,185], '1B':[175,100], '2B':[100,15], '3B':[25,100] };

// === EVERY PLAY RESULT ===
// cat: out, hit, bb, err, br (baserunning), sub (substitution), other
// fielding: true = needs position input (e.g. "6-3")
// bases: which bases the runner path touches on the diamond drawing
// direction: true = can note where ball went (field zone)
// hitType: true = can note line drive / ground ball / fly ball / bunt
App.PLAYS = {
  // ────── OUTS ──────
  K:     { label:'K',    name:'Strikeout Swinging',    cat:'out',   bases:[], fielding:false, hitType:false, direction:false },
  KL:    { label:'ꓘ',    name:'Strikeout Looking',     cat:'out',   bases:[], fielding:false, hitType:false, direction:false },
  KWP:   { label:'K+WP', name:'Strikeout + Wild Pitch', cat:'out',  bases:['1B'], fielding:false, hitType:false, direction:false, note:'Batter reaches on dropped 3rd strike / WP' },
  KPB:   { label:'K+PB', name:'Strikeout + Passed Ball',cat:'out',  bases:['1B'], fielding:false, hitType:false, direction:false, note:'Batter reaches on dropped 3rd strike / PB' },
  GO:    { label:'GO',   name:'Groundout',              cat:'out',   bases:[], fielding:true,  hitType:false, direction:true },
  FO:    { label:'FO',   name:'Flyout',                 cat:'out',   bases:[], fielding:true,  hitType:false, direction:true },
  LO:    { label:'LO',   name:'Lineout',                cat:'out',   bases:[], fielding:true,  hitType:false, direction:true },
  PO:    { label:'PO',   name:'Popout',                 cat:'out',   bases:[], fielding:true,  hitType:false, direction:true },
  FF:    { label:'FF',   name:'Foul Flyout',            cat:'out',   bases:[], fielding:true,  hitType:false, direction:false },
  BO:    { label:'BO',   name:'Bunt Out',               cat:'out',   bases:[], fielding:true,  hitType:false, direction:false },
  DP:    { label:'DP',   name:'Double Play',            cat:'out',   bases:[], fielding:true,  hitType:false, direction:true },
  GIDP:  { label:'GIDP', name:'Grounded Into DP',      cat:'out',   bases:[], fielding:true,  hitType:false, direction:true },
  LIDP:  { label:'LIDP', name:'Lined Into DP',         cat:'out',   bases:[], fielding:true,  hitType:false, direction:true },
  TP:    { label:'TP',   name:'Triple Play',            cat:'out',   bases:[], fielding:true,  hitType:false, direction:true },
  SAC:   { label:'SAC',  name:'Sacrifice Bunt',         cat:'out',   bases:['1B'], fielding:true, hitType:false, direction:false },
  SF:    { label:'SF',   name:'Sacrifice Fly',          cat:'out',   bases:[],     fielding:true, hitType:false, direction:true },
  FC:    { label:'FC',   name:"Fielder's Choice",       cat:'out',   bases:['1B'], fielding:true, hitType:false, direction:true },
  IF:    { label:'IF',   name:'Infield Fly',            cat:'out',   bases:[], fielding:true,  hitType:false, direction:false },
  U:     { label:'U',    name:'Unassisted Out',         cat:'out',   bases:[], fielding:true,  hitType:false, direction:false },
  OA:    { label:'OA',   name:'Runner Out Advancing',   cat:'out',   bases:[], fielding:true,  hitType:false, direction:false },
  AP:    { label:'AP',   name:'Appeal Play',            cat:'out',   bases:[], fielding:true,  hitType:false, direction:false },

  // ────── HITS ──────
  '1B':  { label:'1B',   name:'Single',                cat:'hit',   bases:['1B'],                   fielding:false, hitType:true, direction:true },
  '2B':  { label:'2B',   name:'Double',                cat:'hit',   bases:['1B','2B'],              fielding:false, hitType:true, direction:true },
  '3B':  { label:'3B',   name:'Triple',                cat:'hit',   bases:['1B','2B','3B'],         fielding:false, hitType:true, direction:true },
  HR:    { label:'HR',   name:'Home Run',              cat:'hit',   bases:['1B','2B','3B','home'],  fielding:false, hitType:false, direction:true },
  IHR:   { label:'IHR',  name:'Inside-the-Park HR',    cat:'hit',   bases:['1B','2B','3B','home'],  fielding:false, hitType:true, direction:true },
  GRD:   { label:'GRD',  name:'Ground Rule Double',    cat:'hit',   bases:['1B','2B'],              fielding:false, hitType:false, direction:true },
  BH:    { label:'BH',   name:'Bunt Hit',              cat:'hit',   bases:['1B'],                   fielding:false, hitType:false, direction:false },

  // ────── WALKS / REACHING BASE ──────
  BB:    { label:'BB',   name:'Walk (Base on Balls)',   cat:'bb',    bases:['1B'], fielding:false, hitType:false, direction:false },
  IBB:   { label:'IBB',  name:'Intentional Walk',      cat:'bb',    bases:['1B'], fielding:false, hitType:false, direction:false },
  HBP:   { label:'HBP',  name:'Hit By Pitch',          cat:'bb',    bases:['1B'], fielding:false, hitType:false, direction:false },

  // ────── ERRORS / INTERFERENCE ──────
  E:     { label:'E',    name:'Error',                  cat:'err',   bases:['1B'], fielding:true,  hitType:false, direction:false },
  ET:    { label:'ET',   name:'Error on Throw',         cat:'err',   bases:['1B'], fielding:true,  hitType:false, direction:false },
  CI:    { label:'CI',   name:"Catcher's Interference", cat:'err',   bases:['1B'], fielding:false, hitType:false, direction:false },
  OBS:   { label:'OBS',  name:'Obstruction',            cat:'err',   bases:['1B'], fielding:true,  hitType:false, direction:false },
  FI:    { label:'FI',   name:'Fan Interference',       cat:'err',   bases:[],     fielding:false, hitType:false, direction:false },

  // ────── BASERUNNING (between at-bats / during play) ──────
  SB:    { label:'SB',   name:'Stolen Base',            cat:'br',    bases:[], fielding:false, hitType:false, direction:false },
  CS:    { label:'CS',   name:'Caught Stealing',        cat:'br',    bases:[], fielding:true,  hitType:false, direction:false },
  PKOF:  { label:'PK',   name:'Picked Off',             cat:'br',    bases:[], fielding:true,  hitType:false, direction:false },
  DI:    { label:'DI',   name:'Defensive Indifference', cat:'br',    bases:[], fielding:false, hitType:false, direction:false },
  WP:    { label:'WP',   name:'Wild Pitch',             cat:'br',    bases:[], fielding:false, hitType:false, direction:false },
  PB:    { label:'PB',   name:'Passed Ball',            cat:'br',    bases:[], fielding:false, hitType:false, direction:false },
  BK:    { label:'BK',   name:'Balk',                   cat:'br',    bases:[], fielding:false, hitType:false, direction:false },

  // ────── SUBSTITUTIONS ──────
  PH:    { label:'PH',   name:'Pinch Hitter',           cat:'sub',   bases:[], fielding:false, hitType:false, direction:false },
  PR:    { label:'PR',   name:'Pinch Runner',           cat:'sub',   bases:[], fielding:false, hitType:false, direction:false },
};

// === PLAY BUTTON LAYOUT FOR CELL EDITOR ===
App.PLAY_CATEGORIES = [
  { label:'Outs',          keys:['K','KL','GO','FO','LO','PO','FF','BO','IF','U'] },
  { label:'Multi-Out',     keys:['DP','GIDP','LIDP','TP'] },
  { label:'Sacrifice',     keys:['SAC','SF','FC','OA','AP'] },
  { label:'Hits',          keys:['1B','2B','3B','HR','IHR','GRD','BH'] },
  { label:'Walks / HBP',   keys:['BB','IBB','HBP'] },
  { label:'Errors',        keys:['E','ET','CI','OBS','FI'] },
  { label:'Baserunning',   keys:['SB','CS','PKOF','DI','WP','PB','BK'] },
  { label:'Substitution',  keys:['PH','PR'] },
];

// === COLOR CODING ===
App.PLAY_COLORS = {
  out: '#8B0000',    // dark red
  hit: '#2D5016',    // dark green
  bb:  '#00008B',    // dark blue
  err: '#B8860B',    // dark goldenrod
  br:  '#6B3FA0',    // purple
  sub: '#555555',    // gray
  other: '#555555',
};

// === HIT TYPE MODIFIERS ===
App.HIT_TYPES = [
  { key:'G',  label:'G',  name:'Ground Ball' },
  { key:'L',  label:'L',  name:'Line Drive' },
  { key:'F',  label:'F',  name:'Fly Ball' },
  { key:'B',  label:'B',  name:'Bunt' },
  { key:'P',  label:'P',  name:'Pop Up' },
  { key:'FL', label:'FL', name:'Fliner (Fly/Liner)' },
];

// === FIELD DIRECTION ZONES (spray chart) ===
// Standard 7-zone layout matching field positions
App.FIELD_ZONES = [
  { key:'7',  label:'LF',  name:'Left Field',    angle:225 },
  { key:'78', label:'LCF', name:'Left-Center',   angle:247 },
  { key:'8',  label:'CF',  name:'Center Field',  angle:270 },
  { key:'89', label:'RCF', name:'Right-Center',  angle:293 },
  { key:'9',  label:'RF',  name:'Right Field',   angle:315 },
  { key:'56', label:'3B-SS',name:'Left Infield',  angle:225, infield:true },
  { key:'34', label:'1B-2B',name:'Right Infield', angle:315, infield:true },
  { key:'1',  label:'P',   name:'Up the Middle',  angle:270, infield:true },
];

// === PITCH-BY-PITCH TRACKING ===
App.PITCH_RESULTS = [
  { key:'B', label:'B', name:'Ball',              color:'#2e7d32' },
  { key:'C', label:'C', name:'Called Strike',      color:'#c62828' },
  { key:'S', label:'S', name:'Swinging Strike',    color:'#c62828' },
  { key:'F', label:'F', name:'Foul Ball',          color:'#e65100' },
  { key:'T', label:'T', name:'Foul Tip',           color:'#e65100' },
  { key:'L', label:'L', name:'Foul Bunt',          color:'#e65100' },
  { key:'M', label:'M', name:'Missed Bunt',        color:'#c62828' },
  { key:'X', label:'X', name:'Ball In Play',       color:'#1565c0' },
  { key:'H', label:'H', name:'Hit Batter',         color:'#6a1b9a' },
  { key:'I', label:'I', name:'Intentional Ball',   color:'#2e7d32' },
  { key:'P', label:'P', name:'Pitchout',           color:'#2e7d32' },
  { key:'D', label:'D', name:'Ball in Dirt',       color:'#2e7d32' },
  { key:'N', label:'N', name:'No Pitch',           color:'#757575' },
  { key:'O', label:'O', name:'Foul Tip Bunt',     color:'#e65100' },
  { key:'Q', label:'Q', name:'Swinging on Pitchout', color:'#c62828' },
  { key:'R', label:'R', name:'Foul on Pitchout',  color:'#e65100' },
  { key:'V', label:'V', name:'Called Ball (mouth)',color:'#2e7d32' },
  { key:'Y', label:'Y', name:'In Play (pitchout)', color:'#1565c0' },
];

// === PITCH TYPES (optional, for tracking what was thrown) ===
App.PITCH_TYPES = [
  { key:'FF', label:'4FB',  name:'Four-Seam Fastball' },
  { key:'FT', label:'2FB',  name:'Two-Seam Fastball' },
  { key:'SI', label:'SI',   name:'Sinker' },
  { key:'FC', label:'CUT',  name:'Cutter' },
  { key:'CH', label:'CH',   name:'Changeup' },
  { key:'CU', label:'CU',   name:'Curveball' },
  { key:'SL', label:'SL',   name:'Slider' },
  { key:'ST', label:'SWP',  name:'Sweeper' },
  { key:'FS', label:'SPL',  name:'Splitter' },
  { key:'KN', label:'KN',   name:'Knuckleball' },
  { key:'KC', label:'KC',   name:'Knuckle-Curve' },
  { key:'SC', label:'SC',   name:'Screwball' },
  { key:'EP', label:'EP',   name:'Eephus' },
  { key:'FO', label:'FK',   name:'Forkball' },
];

// === STATISTICAL FIELDS (per-team totals) ===
App.TEAM_STATS = ['R','H','E','LOB'];

// === PITCHING LINE FIELDS ===
App.PITCHING_STATS = [
  { key:'ip',  label:'IP',  name:'Innings Pitched' },
  { key:'h',   label:'H',   name:'Hits' },
  { key:'r',   label:'R',   name:'Runs' },
  { key:'er',  label:'ER',  name:'Earned Runs' },
  { key:'bb',  label:'BB',  name:'Walks' },
  { key:'k',   label:'K',   name:'Strikeouts' },
  { key:'hr',  label:'HR',  name:'Home Runs' },
  { key:'np',  label:'NP',  name:'Pitch Count' },
  { key:'s',   label:'S',   name:'Strikes' },
  { key:'dec', label:'Dec', name:'Decision (W/L/S/BS/H)' },
];

// === DECISIONS ===
App.PITCHER_DECISIONS = [
  { key:'W',  label:'W',  name:'Win' },
  { key:'L',  label:'L',  name:'Loss' },
  { key:'SV', label:'SV', name:'Save' },
  { key:'BS', label:'BS', name:'Blown Save' },
  { key:'H',  label:'H',  name:'Hold' },
  { key:'ND', label:'ND', name:'No Decision' },
];
