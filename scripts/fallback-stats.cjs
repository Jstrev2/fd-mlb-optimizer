/**
 * Fallback Stats Module — MLB Stats API
 * 
 * For props missing from FanDuel, computes per-game rates from
 * real MLB season stats and converts to American odds equivalents.
 * 
 * Data source: statsapi.mlb.com (free, no auth)
 * These are REAL stats, not estimates. Labeled as "tier2:mlb-stats" in the app.
 */

const UA = 'Mozilla/5.0';
const MLB_API = 'https://statsapi.mlb.com/api/v1';

// Convert a probability to American odds (for consistency with our scoring engine)
function probToOdds(p) {
  if (p <= 0) return 0;
  if (p >= 1) return -10000;
  if (p >= 0.5) return -Math.round(p / (1 - p) * 100);
  return Math.round((1 - p) / p * 100);
}

// Estimate P(X >= k) from a per-game rate using Poisson distribution
function poissonCumGe(k, lambda) {
  if (lambda <= 0) return 0;
  let cdf = 0;
  for (let j = 0; j < k; j++) {
    let logP = -lambda;
    for (let i = 1; i <= j; i++) logP += Math.log(lambda / i);
    cdf += Math.exp(logP);
  }
  return Math.max(0, Math.min(1, 1 - cdf));
}

// ─── Search for a player by name and get their MLB ID ─────────────────────────
async function findPlayerId(name) {
  try {
    const res = await fetch(`${MLB_API}/people/search?names=${encodeURIComponent(name)}&sportIds=1`, { headers: { 'User-Agent': UA } });
    const data = await res.json();
    return data?.people?.[0]?.id || null;
  } catch { return null; }
}

// ─── Get season stats for a list of MLB player IDs ───────────────────────────
async function getPlayerStats(playerIds) {
  const stats = new Map(); // playerId → { batting: {...}, pitching: {...} }
  
  // Batch in groups of 10 to avoid hammering the API
  for (let i = 0; i < playerIds.length; i += 10) {
    const batch = playerIds.slice(i, i + 10);
    await Promise.all(batch.map(async (id) => {
      try {
        const [batRes, pitRes] = await Promise.all([
          fetch(`${MLB_API}/people/${id}/stats?stats=season&group=hitting&season=2026`, { headers: { 'User-Agent': UA } }),
          fetch(`${MLB_API}/people/${id}/stats?stats=season&group=pitching&season=2026`, { headers: { 'User-Agent': UA } }),
        ]);
        const bat = await batRes.json();
        const pit = await pitRes.json();
        stats.set(id, {
          batting: bat?.stats?.[0]?.splits?.[0]?.stat || null,
          pitching: pit?.stats?.[0]?.splits?.[0]?.stat || null,
        });
      } catch (e) { /* silent */ }
    }));
  }
  
  return stats;
}

// ─── Get today's lineup with MLB player IDs ──────────────────────────────────
async function getTodayLineups() {
  const today = new Date().toISOString().split('T')[0];
  const res = await fetch(`${MLB_API}/schedule?sportId=1&date=${today}&hydrate=probablePitcher,lineups`, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  const games = data?.dates?.[0]?.games || [];
  
  const playerMap = new Map(); // playerName → { mlbId, team }
  
  for (const game of games) {
    for (const side of ['away', 'home']) {
      const team = game.teams?.[side];
      const sp = team?.probablePitcher;
      if (sp) {
        playerMap.set(sp.fullName, { mlbId: sp.id, team: team.team?.abbreviation });
      }
      // Lineup batters
      const lineup = team?.lineup || [];
      for (const batter of lineup) {
        playerMap.set(batter.fullName, { mlbId: batter.id, team: team.team?.abbreviation });
      }
    }
  }
  
  return playerMap;
}

// ─── Compute fallback props from season stats ─────────────────────────────────
function computeBatterFallback(stat) {
  if (!stat || !stat.plateAppearances || stat.plateAppearances < 20) return null;
  
  const pa = stat.plateAppearances;
  const g = stat.gamesPlayed || 1;
  const paPerGame = pa / g;
  const ab = stat.atBats || 1;
  
  // Per-game rates
  const hitsPerGame = stat.hits / g;
  const doublesPerGame = (stat.doubles || 0) / g;
  const triplesPerGame = (stat.triples || 0) / g;
  const hrPerGame = stat.homeRuns / g;
  const singlesPerGame = hitsPerGame - doublesPerGame - triplesPerGame - hrPerGame;
  const tbPerGame = singlesPerGame + doublesPerGame * 2 + triplesPerGame * 3 + hrPerGame * 4;
  const rbiPerGame = (stat.rbi || 0) / g;
  const runsPerGame = stat.runs / g;
  const bbPerGame = stat.baseOnBalls / g;
  const sbPerGame = (stat.stolenBases || 0) / g;
  const hbpPerGame = (stat.hitByPitch || 0) / g;
  
  // Convert per-game rates to Poisson P(X>=k) → American odds
  const props = {};
  
  // Hits tiers
  props.hit_odds = probToOdds(poissonCumGe(1, hitsPerGame));
  if (hitsPerGame > 0.8) props.hits_2plus = probToOdds(poissonCumGe(2, hitsPerGame));
  if (hitsPerGame > 1.2) props.hits_3plus = probToOdds(poissonCumGe(3, hitsPerGame));
  
  // TB tiers
  props.tb_2plus = probToOdds(poissonCumGe(2, tbPerGame));
  if (tbPerGame > 1.5) props.tb_3plus = probToOdds(poissonCumGe(3, tbPerGame));
  if (tbPerGame > 2.0) props.tb_4plus = probToOdds(poissonCumGe(4, tbPerGame));
  if (tbPerGame > 2.5) props.tb_5plus = probToOdds(poissonCumGe(5, tbPerGame));
  
  // HR
  if (hrPerGame > 0.02) props.hr_odds = probToOdds(poissonCumGe(1, hrPerGame));
  
  // RBI tiers
  props.rbi_odds = probToOdds(poissonCumGe(1, rbiPerGame));
  if (rbiPerGame > 0.5) props.rbis_2plus = probToOdds(poissonCumGe(2, rbiPerGame));
  
  // Runs tiers
  props.run_odds = probToOdds(poissonCumGe(1, runsPerGame));
  if (runsPerGame > 0.5) props.runs_2plus = probToOdds(poissonCumGe(2, runsPerGame));
  
  // BB
  props.bb_odds = probToOdds(poissonCumGe(1, bbPerGame));
  if (bbPerGame > 0.5) props.bb_2plus = probToOdds(poissonCumGe(2, bbPerGame));
  
  // SB
  if (sbPerGame > 0.05) props.sb_odds = probToOdds(poissonCumGe(1, sbPerGame));
  
  // Singles/Doubles/Triples
  if (singlesPerGame > 0.3) props.single_odds = probToOdds(poissonCumGe(1, singlesPerGame));
  if (doublesPerGame > 0.1) props.double_odds = probToOdds(poissonCumGe(1, doublesPerGame));
  if (triplesPerGame > 0.02) props.triple_odds = probToOdds(poissonCumGe(1, triplesPerGame));
  
  return props;
}

function computePitcherFallback(stat) {
  if (!stat || !stat.gamesStarted || stat.gamesStarted < 3) return null;
  
  const gs = stat.gamesStarted;
  const ipStr = stat.inningsPitched || '0';
  const ip = parseFloat(ipStr.replace(/\.(\d)/, (_, d) => '.' + (parseInt(d) * 10 / 3).toFixed(0)));
  
  const outsPerStart = (ip / gs) * 3;
  const kPerStart = (stat.strikeOuts || 0) / gs;
  const erPerStart = (stat.earnedRuns || 0) / gs;
  const wPerStart = (stat.wins || 0) / gs;
  
  const props = {};
  
  // Ks — Poisson tiers
  props.ks_line = Math.round(kPerStart * 2) / 2; // round to nearest 0.5
  props.ks_over_odds = -110; // assume ~even for the line
  for (let k = 3; k <= 10; k++) {
    const p = poissonCumGe(k, kPerStart);
    if (p > 0.01) props[`ks_alt_${k}plus`] = probToOdds(p);
  }
  
  // Outs
  props.outs_line = Math.round(outsPerStart * 2) / 2;
  props.outs_over_odds = -110;
  
  // ER
  props.er_line = Math.round(erPerStart * 2) / 2;
  props.er_over_odds = -110;
  
  // Win rate
  props.win_odds = probToOdds(wPerStart);
  
  return props;
}

// ─── Get stats for a player by name (search + fetch, with prior season fallback) ─
async function getStatsByName(name) {
  const id = await findPlayerId(name);
  if (!id) return null;
  try {
    // Try current season first, fall back to prior season if not enough data
    const seasons = [2026, 2025];
    let batting = null, pitching = null;
    
    for (const season of seasons) {
      const [batRes, pitRes] = await Promise.all([
        fetch(`${MLB_API}/people/${id}/stats?stats=season&group=hitting&season=${season}`, { headers: { 'User-Agent': UA } }),
        fetch(`${MLB_API}/people/${id}/stats?stats=season&group=pitching&season=${season}`, { headers: { 'User-Agent': UA } }),
      ]);
      const bat = await batRes.json();
      const pit = await pitRes.json();
      const batStat = bat?.stats?.[0]?.splits?.[0]?.stat;
      const pitStat = pit?.stats?.[0]?.splits?.[0]?.stat;
      
      // Use this season's data if sufficient sample (20+ PA for batters, 3+ GS for pitchers)
      if (!batting && batStat && (batStat.plateAppearances || 0) >= 20) batting = batStat;
      if (!pitching && pitStat && (pitStat.gamesStarted || 0) >= 3) pitching = pitStat;
      
      if (batting && pitching) break; // got enough data
    }
    
    return { batting, pitching };
  } catch { return null; }
}

module.exports = {
  getTodayLineups,
  getPlayerStats,
  getStatsByName,
  findPlayerId,
  computeBatterFallback,
  computePitcherFallback,
  probToOdds,
  poissonCumGe,
};
