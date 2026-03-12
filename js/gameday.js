window.App = window.App || {};

App.Gameday = (() => {
  const BASE = 'https://statsapi.mlb.com/api/v1';

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  async function fetchJSON(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`MLB API ${r.status}`);
    return r.json();
  }

  // Get today's games
  async function getTodaysGames(date) {
    const d = date || todayStr();
    const data = await fetchJSON(`${BASE}/schedule?sportId=1&date=${d}&hydrate=probablePitcher,team`);
    if (!data?.dates?.length) return [];
    return data.dates[0].games.filter(g => g?.teams?.away?.team && g?.teams?.home?.team).map(g => ({
      gamePk: g.gamePk,
      status: g.status?.detailedState || '',
      time: new Date(g.gameDate).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }),
      venue: g.venue?.name || '',
      away: {
        id: g.teams.away.team.id,
        name: g.teams.away.team.name,
        abbr: g.teams.away.team.abbreviation || g.teams.away.team.name.slice(0,3).toUpperCase(),
        pitcher: g.teams.away.probablePitcher?.fullName || 'TBD',
        record: g.teams.away.leagueRecord ? `${g.teams.away.leagueRecord.wins}-${g.teams.away.leagueRecord.losses}` : '',
      },
      home: {
        id: g.teams.home.team.id,
        name: g.teams.home.team.name,
        abbr: g.teams.home.team.abbreviation || g.teams.home.team.name.slice(0,3).toUpperCase(),
        pitcher: g.teams.home.probablePitcher?.fullName || 'TBD',
        record: g.teams.home.leagueRecord ? `${g.teams.home.leagueRecord.wins}-${g.teams.home.leagueRecord.losses}` : '',
      },
    }));
  }

  // Get lineup for a game
  async function getLineup(gamePk) {
    const data = await fetchJSON(`${BASE}/game/${gamePk}/feed/live`);
    const box = data.liveData?.boxscore;
    const gameData = data.gameData;

    function extractBatters(teamKey) {
      const team = box?.teams?.[teamKey];
      if (!team) return [];
      const battingOrder = team.battingOrder || [];
      return battingOrder.map((id, i) => {
        const p = team.players?.[`ID${id}`];
        if (!p) return { order: i+1, id, name: `Player #${id}`, number: '', position: '' };
        return {
          order: i + 1,
          id: id,
          name: p.person?.fullName || `#${id}`,
          number: p.jerseyNumber || '',
          position: p.position?.abbreviation || p.allPositions?.[0]?.abbreviation || '',
        };
      });
    }

    // Fallback: get roster if lineup not posted yet
    async function getRoster(teamId) {
      try {
        const r = await fetchJSON(`${BASE}/teams/${teamId}/roster/active`);
        return (r.roster || []).map((p, i) => ({
          order: i + 1,
          id: p.person.id,
          name: p.person.fullName,
          number: p.jerseyNumber || '',
          position: p.position?.abbreviation || '',
        }));
      } catch { return []; }
    }

    let awayBatters = extractBatters('away');
    let homeBatters = extractBatters('home');

    const awayTeamId = gameData?.teams?.away?.id;
    const homeTeamId = gameData?.teams?.home?.id;

    // If no batting order yet, fall back to roster
    if (!awayBatters.length && awayTeamId) awayBatters = await getRoster(awayTeamId);
    if (!homeBatters.length && homeTeamId) homeBatters = await getRoster(homeTeamId);

    return {
      away: {
        name: gameData?.teams?.away?.name || 'Away',
        abbr: gameData?.teams?.away?.abbreviation || 'AWY',
        batters: awayBatters,
      },
      home: {
        name: gameData?.teams?.home?.name || 'Home',
        abbr: gameData?.teams?.home?.abbreviation || 'HME',
        batters: homeBatters,
      },
      venue: gameData?.venue?.name || '',
      date: gameData?.datetime?.officialDate || todayStr(),
    };
  }

  return { getTodaysGames, getLineup, todayStr };
})();
