#!/usr/bin/env node
/**
 * FD MLB DFS Import Pipeline v3
 * 
 * Data sources (priority order):
 * 1. The Odds API  — multi-book consensus (FD + DK + BetMGM + Pinnacle)
 * 2. FanDuel Sportsbook API — supplement / game totals / win odds
 * 3. RotoGrinders  — FD DFS salaries + batting order
 * 4. DailyFantasyFuel — slate team verification
 * 
 * Props strategy:
 * - Pull from FD + DK + BetMGM via Odds API in one call
 * - Weight: Pinnacle 2x (if present), others 1x each → weighted avg devigged prob
 * - FD sportsbook API fills in pitcher win odds + game totals
 * - NO fallback estimates — missing = 0
 */

const puppeteer = require('puppeteer-core');
const { calcB, calcP, devigOneSided, impliedProb } = require('./scoring.cjs');

const SUPABASE_URL = 'https://udwafzawzeaoteghfwjq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd2FmemF3emVhb3RlZ2hmd2pxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM4Mjc1MCwiZXhwIjoyMDg5OTU4NzUwfQ.dbO_BZfeb6X2cBbPyr6cyrJC_SRwSC_Qr9ikn1W1_nc';

const ODDS_API_KEY = 'b6f580c485187b3e979b7689d22851d7b6f580c485187b3e979b7689d22851d7';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

const FD_API = 'https://sbapi.il.sportsbook.fanduel.com/api';
const FD_AK  = 'FhMFpcPWXMeyZxOx';
const UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Team name → abbreviation (for Odds API full names)
const TA = {
  'Pittsburgh Pirates':'PIT','New York Mets':'NYM','Chicago White Sox':'CWS',
  'Milwaukee Brewers':'MIL','Washington Nationals':'WAS','Chicago Cubs':'CHC',
  'Minnesota Twins':'MIN','Baltimore Orioles':'BAL','Boston Red Sox':'BOS',
  'Cincinnati Reds':'CIN','Los Angeles Angels':'LAA','Houston Astros':'HOU',
  'Tampa Bay Rays':'TB','St. Louis Cardinals':'STL','Texas Rangers':'TEX',
  'Philadelphia Phillies':'PHI','Detroit Tigers':'DET','San Diego Padres':'SD',
  'Los Angeles Dodgers':'LAD','Arizona Diamondbacks':'ARI','Seattle Mariners':'SEA',
  'Cleveland Guardians':'CLE','New York Yankees':'NYY','Toronto Blue Jays':'TOR',
  'Atlanta Braves':'ATL','Colorado Rockies':'COL','San Francisco Giants':'SF',
  'Kansas City Royals':'KC','Oakland Athletics':'OAK','Miami Marlins':'MIA',
  'Athletics':'OAK',
};

// The Odds API market keys → our schema fields
// Batters: these markets return Over/Under outcomes per player
const ODDS_BATTER_MARKETS = [
  'batter_hits',
  'batter_hits_alternate',
  'batter_total_bases',
  'batter_total_bases_alternate',
  'batter_home_runs',
  'batter_home_runs_alternate',
  'batter_rbis',
  'batter_rbis_alternate',
  'batter_runs_scored',
  'batter_runs_scored_alternate',
  'batter_stolen_bases',
  'batter_stolen_bases_alternate',
  'batter_walks',
  'batter_singles',
  'batter_doubles',
  'batter_triples',
];

const ODDS_PITCHER_MARKETS = [
  'pitcher_strikeouts',
  'pitcher_strikeouts_alternate',
  'pitcher_outs',
  'pitcher_record_a_win',
  'pitcher_earned_runs',
];

// Odds API market → schema field mapping
// For O/U markets: Over odds → field (the prop we care about is "over" this line)
// line_field: where to store the O/U line value
const MARKET_MAP = {
  // Batters
  'batter_hits':                     { over: 'hit_odds',    line: null },
  'batter_hits_alternate':           { altField: 'hits',    tiers: { 1: 'hit_odds', 2: 'hits_2plus', 3: 'hits_3plus', 4: 'hits_4plus' } },
  'batter_total_bases':              { over: 'tb_over_odds', line: 'tb_line' },
  'batter_total_bases_alternate':    { altField: 'tb',      tiers: { 1.5: 'tb_2plus', 2.5: 'tb_3plus', 3.5: 'tb_4plus', 4.5: 'tb_5plus' } },
  'batter_home_runs':                { over: 'hr_odds',     line: null },
  'batter_home_runs_alternate':      { altField: 'hr',      tiers: { 0.5: 'hr_odds', 1.5: 'hr_2plus' } },
  'batter_rbis':                     { over: 'rbi_odds',    line: null },
  'batter_rbis_alternate':           { altField: 'rbi',     tiers: { 0.5: 'rbi_odds', 1.5: 'rbis_2plus', 2.5: 'rbis_3plus', 3.5: 'rbis_4plus' } },
  'batter_runs_scored':              { over: 'run_odds',    line: null },
  'batter_runs_scored_alternate':    { altField: 'run',     tiers: { 0.5: 'run_odds', 1.5: 'runs_2plus', 2.5: 'runs_3plus' } },
  'batter_stolen_bases':             { over: 'sb_odds',     line: null },
  'batter_stolen_bases_alternate':   { altField: 'sb',      tiers: { 0.5: 'sb_odds', 1.5: 'sbs_2plus' } },
  'batter_walks':                    { over: 'bb_odds',     line: null },
  'batter_singles':                  { over: 'single_odds', line: null },
  'batter_doubles':                  { over: 'double_odds', line: null },
  'batter_triples':                  { over: 'triple_odds', line: null },
  // Pitchers
  'pitcher_strikeouts':              { over: 'ks_over_odds', line: 'ks_line' },
  'pitcher_strikeouts_alternate':    { altField: 'ks',      tiers: { 2.5: 'ks_alt_3plus', 3.5: 'ks_alt_4plus', 4.5: 'ks_alt_5plus', 5.5: 'ks_alt_6plus', 6.5: 'ks_alt_7plus', 7.5: 'ks_alt_8plus', 8.5: 'ks_alt_9plus', 9.5: 'ks_alt_10plus' } },
  'pitcher_outs':                    { over: 'outs_over_odds', line: 'outs_line' },
  'pitcher_record_a_win':            { over: 'win_odds',    line: null },
  'pitcher_earned_runs':             { over: null, under: 'er_over_odds', line: 'er_line' },
  // Note: for ER we want the UNDER (pitcher keeping ER low = good), but we store both
};

// Book weights for consensus: Pinnacle = 2x (sharpest), others = 1x
const BOOK_WEIGHTS = {
  pinnacle:    2.0,
  fanduel:     1.5,
  draftkings:  1.0,
  betmgm:      1.0,
  williamhill_us: 1.0,
  betrivers:   0.8,
};

function norm(n) {
  return n.toLowerCase().replace(/\./g, '').replace(/jr\.?$/i, '').replace(/\s+/g, ' ').trim();
}
function fm(n, m) {
  if (m.has(n)) return m.get(n);
  const nn = norm(n);
  for (const [k, v] of m) { if (norm(k) === nn) return v; }
  // Last name fallback (only if 4+ chars to avoid false matches)
  const last = nn.split(' ').pop();
  if (last && last.length >= 4) {
    for (const [k, v] of m) { if (norm(k).split(' ').pop() === last) return v; }
  }
  return null;
}
function gO(r) { return Number(r?.winRunnerOdds?.americanDisplayOdds?.americanOdds) || 0; }

// ─── STEP 1: Scrape RotoGrinders for FD salaries + batting order ──────────────
async function scrapeRG() {
  console.log('Scraping RotoGrinders...');
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await b.newPage();
  await pg.setUserAgent(UA);
  await pg.goto('https://rotogrinders.com/lineups/mlb?site=fanduel', { waitUntil: 'networkidle2', timeout: 25000 });
  await new Promise(r => setTimeout(r, 3000));
  const t = await pg.evaluate(() => document.body.innerText);
  await b.close();
  const lines = t.split('\n').map(l => l.trim()).filter(l => l);

  const CITY_MAP = {
    'PITTSBURGH':'PIT','NEW YORK':'NYM','CHICAGO':'CHC','MILWAUKEE':'MIL',
    'WASHINGTON':'WAS','MINNESOTA':'MIN','BALTIMORE':'BAL','BOSTON':'BOS',
    'CINCINNATI':'CIN','LOS ANGELES':'LAA','HOUSTON':'HOU','TAMPA BAY':'TB',
    'ST. LOUIS':'STL','TEXAS':'TEX','PHILADELPHIA':'PHI','DETROIT':'DET',
    'SAN DIEGO':'SD','ARIZONA':'ARI','SEATTLE':'SEA','CLEVELAND':'CLE',
    'TORONTO':'TOR','ATLANTA':'ATL','COLORADO':'COL','SAN FRANCISCO':'SF',
    'KANSAS CITY':'KC','OAKLAND':'OAK','MIAMI':'MIA',
  };
  const TEAM_NAME_MAP = {
    'METS':'NYM','YANKEES':'NYY','CUBS':'CHC','WHITE SOX':'CWS','ANGELS':'LAA',
    'DODGERS':'LAD','PIRATES':'PIT','BREWERS':'MIL','NATIONALS':'WAS','TWINS':'MIN',
    'ORIOLES':'BAL','RED SOX':'BOS','REDS':'CIN','ASTROS':'HOU','RAYS':'TB',
    'CARDINALS':'STL','RANGERS':'TEX','PHILLIES':'PHI','TIGERS':'DET','PADRES':'SD',
    'DIAMONDBACKS':'ARI','MARINERS':'SEA','GUARDIANS':'CLE','BLUE JAYS':'TOR',
    'BRAVES':'ATL','ROCKIES':'COL','GIANTS':'SF','ROYALS':'KC','ATHLETICS':'OAK','MARLINS':'MIA',
  };

  const games = [];
  for (let i = 0; i < lines.length - 4; i++) {
    if (lines[i].match(/^\d{1,2}:\d{2}\s*(AM|PM)\s*ET$/i)) {
      const city1 = lines[i+1], name1 = lines[i+2], city2 = lines[i+3], name2 = lines[i+4];
      const away = TEAM_NAME_MAP[name1] || CITY_MAP[city1] || '';
      const home = TEAM_NAME_MAP[name2] || CITY_MAP[city2] || '';
      if (away && home) games.push({ lineIdx: i, away, home });
    }
  }

  const players = [];
  let currentAway = '', currentHome = '', teamState = 'awayPitcher', gameIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (gameIdx < games.length && i >= games[gameIdx].lineIdx) {
      currentAway = games[gameIdx].away;
      currentHome = games[gameIdx].home;
      teamState = 'awayPitcher'; gameIdx++;
      continue;
    }
    const line = lines[i];
    const m1 = line.match(/^(.+?)\s+\([LRS]\)\s+([\w\/]+)\s+\$([\d.]+)K$/i);
    if (m1) {
      const isAway = teamState === 'awayPitcher' || teamState === 'awayBatters';
      const team = isAway ? currentAway : currentHome;
      const opp  = isAway ? currentHome : currentAway;
      players.push({ name: m1[1].trim(), position: m1[2], salary: Math.round(parseFloat(m1[3]) * 1000), team, opponent: opp });
      if (teamState === 'awayPitcher') teamState = 'awayBatters';
      if (teamState === 'homePitcher') teamState = 'homeBatters';
      continue;
    }
    const m2 = line.match(/^(.+?)\s+(SP|RP|P)\s+\$([\d.]+)K$/i);
    if (m2) {
      const isAway = teamState === 'awayPitcher';
      const team = isAway ? currentAway : currentHome;
      const opp  = isAway ? currentHome : currentAway;
      players.push({ name: m2[1].trim(), position: 'P', salary: Math.round(parseFloat(m2[3]) * 1000), team, opponent: opp });
      if (teamState === 'awayPitcher') teamState = 'awayBatters';
      if (teamState === 'homePitcher') teamState = 'homeBatters';
      continue;
    }
    if (line.match(/^vs\.?\s+/i) && teamState === 'awayBatters') { teamState = 'homePitcher'; }
  }

  const m = new Map();
  for (const p of players) m.set(p.name, p);
  console.log(`  RG: ${m.size} players`);
  return m;
}

// ─── STEP 2: Scrape DFF for slate team verification ───────────────────────────
async function scrapeDFF() {
  console.log('Scraping DFF...');
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await b.newPage();
  await pg.setUserAgent(UA);
  await pg.goto('https://www.dailyfantasyfuel.com/mlb/projections/fanduel', { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2000));
  const rows = await pg.evaluate(() => {
    const data = [];
    document.querySelectorAll('tr[class*="player"], .player-row, tbody tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) return;
      const name = cells[0]?.textContent?.trim();
      const pos  = cells[1]?.textContent?.trim();
      const team = cells[2]?.textContent?.trim()?.toUpperCase();
      if (name && pos && team && team.length <= 4) data.push({ name, pos, team });
    });
    return data;
  });
  await b.close();
  const m = new Map();
  for (const r of rows) {
    if (r.name) m.set(r.name, r);
  }
  console.log(`  DFF: ${m.size} players`);
  return m;
}

// ─── STEP 3: Get FD game-level data (totals + event IDs) ──────────────────────
async function getFDGameData() {
  const r = await fetch(`${FD_API}/content-managed-page?page=SPORT&eventTypeId=7511&_ak=${FD_AK}&timezone=America/Chicago`, { headers: { 'User-Agent': UA } });
  const d = await r.json();
  const events  = d?.attachments?.events  || {};
  const markets = d?.attachments?.markets || {};
  const today   = new Date().toISOString().split('T')[0];

  // Build game total + moneyline map keyed by team abbrev
  const gameTotals = {}; // teamAbbrev → { total, homeTeam, awayTeam, eventId, winOddsHome, winOddsAway }

  for (const [eid, ev] of Object.entries(events)) {
    if (!(ev.openDate || '').startsWith(today)) continue;
    const m = ev.name.match(/^(.+?)\s*\(.+?\)\s*@\s*(.+?)\s*\(.+?\)$/);
    if (!m) continue;
    const away = TA[m[1].trim()] || m[1].trim();
    const home = TA[m[2].trim()] || m[2].trim();

    let total = null, awayML = null, homeML = null;
    for (const mk of Object.values(markets)) {
      if (mk.eventId !== ev.eventId) continue;
      if (mk.marketType === 'TOTAL_POINTS_(OVER/UNDER)') {
        for (const rn of mk.runners || []) {
          if (rn.runnerName === 'Over') total = Number(rn.handicap) || null;
        }
      }
      if (mk.marketType === 'MONEY_LINE') {
        for (const rn of mk.runners || []) {
          const o = gO(rn);
          if (rn.runnerName?.includes(m[1].trim().split(' ').pop())) awayML = o;
          if (rn.runnerName?.includes(m[2].trim().split(' ').pop())) homeML = o;
        }
      }
    }

    if (away) gameTotals[away] = { total, eventId: ev.eventId, opponentML: homeML };
    if (home) gameTotals[home] = { total, eventId: ev.eventId, opponentML: awayML };
  }

  return gameTotals;
}

// ─── STEP 4: Pull multi-book props from The Odds API ─────────────────────────
async function getOddsAPIProps() {
  console.log('Fetching props from The Odds API (FD + DK + BetMGM + Pinnacle)...');

  // Step 4a: Get today's MLB event IDs from Odds API
  const evRes = await fetch(
    `${ODDS_API_BASE}/sports/baseball_mlb/events?apiKey=${ODDS_API_KEY}&dateFormat=iso`,
    { headers: { 'User-Agent': UA } }
  );
  const events = await evRes.json();
  if (!Array.isArray(events)) {
    console.error('  Odds API events error:', JSON.stringify(events).substring(0, 200));
    return new Map();
  }

  const today = new Date().toISOString().split('T')[0];
  const todayEvents = events.filter(e => (e.commence_time || '').startsWith(today));
  console.log(`  Odds API: ${todayEvents.length} MLB games today`);

  // Step 4b: For each game, fetch all batter + pitcher prop markets
  const allPlayerProps = new Map(); // playerName → props object
  let remaining = '?';

  for (const ev of todayEvents) {
    const homeTeam = TA[ev.home_team] || ev.home_team;
    const awayTeam = TA[ev.away_team] || ev.away_team;

    // Fetch batter markets
    const batterUrl = `${ODDS_API_BASE}/sports/baseball_mlb/events/${ev.id}/odds?` +
      `apiKey=${ODDS_API_KEY}&` +
      `bookmakers=fanduel,draftkings,betmgm,pinnacle&` +
      `markets=${ODDS_BATTER_MARKETS.join(',')}&` +
      `oddsFormat=american`;

    // Fetch pitcher markets  
    const pitcherUrl = `${ODDS_API_BASE}/sports/baseball_mlb/events/${ev.id}/odds?` +
      `apiKey=${ODDS_API_KEY}&` +
      `bookmakers=fanduel,draftkings,betmgm,pinnacle&` +
      `markets=${ODDS_PITCHER_MARKETS.join(',')}&` +
      `oddsFormat=american`;

    let batterData, pitcherData;
    try {
      const [bRes, pRes] = await Promise.all([
        fetch(batterUrl,  { headers: { 'User-Agent': UA } }),
        fetch(pitcherUrl, { headers: { 'User-Agent': UA } }),
      ]);
      remaining = bRes.headers.get('x-requests-remaining') || remaining;
      batterData  = await bRes.json();
      pitcherData = await pRes.json();
    } catch (e) {
      console.error(`  Error fetching ${awayTeam}@${homeTeam}:`, e.message);
      continue;
    }

    // Process each game's data
    for (const gameData of [batterData, pitcherData]) {
      if (!gameData?.bookmakers) continue;
      processOddsAPIResponse(gameData, allPlayerProps);
    }
  }

  console.log(`  Odds API credits remaining: ${remaining}`);
  console.log(`  Props found: ${allPlayerProps.size} players`);
  return allPlayerProps;
}

// ─── Process Odds API response into consensus props ───────────────────────────
function processOddsAPIResponse(gameData, propsMap) {
  // Accumulate weighted probs per player/market/line across books
  // Structure: playerName → marketKey → line → { weightedProbSum, weightSum }
  const accumulator = {}; // playerName → field → { weightedSum, totalWeight }

  for (const bookmaker of (gameData.bookmakers || [])) {
    const bookWeight = BOOK_WEIGHTS[bookmaker.key] || 1.0;

    for (const market of (bookmaker.markets || [])) {
      const marketKey = market.key;
      const mapping   = MARKET_MAP[marketKey];
      if (!mapping) continue;

      // Group outcomes by player name
      const byPlayer = {};
      for (const outcome of (market.outcomes || [])) {
        const name = outcome.name || outcome.description;
        if (!name) continue;
        if (!byPlayer[name]) byPlayer[name] = [];
        byPlayer[name].push(outcome);
      }

      for (const [playerName, outcomes] of Object.entries(byPlayer)) {
        if (!accumulator[playerName]) accumulator[playerName] = {};
        const acc = accumulator[playerName];

        if (mapping.altField !== undefined) {
          // Alt lines: multiple outcomes per player, each with a `point`
          for (const outcome of outcomes) {
            const point = outcome.point;
            const field = mapping.tiers?.[point];
            if (!field) continue;
            // Alt lines are typically "Over" markets (player achieves X+)
            const prob = devigOneSided(outcome.price);
            if (!acc[field]) acc[field] = { wSum: 0, wTotal: 0 };
            acc[field].wSum   += prob * bookWeight;
            acc[field].wTotal += bookWeight;
          }
        } else {
          // Standard O/U market — two outcomes (Over, Under) or Yes/No
          const overOutcome  = outcomes.find(o => o.name === playerName && !o.description?.includes('Under')) || outcomes[0];
          const underOutcome = outcomes.find(o => o.description?.includes('Under') || o.name?.includes('Under'));

          if (mapping.over && overOutcome) {
            const prob = underOutcome
              ? (() => { const r = impliedProb(overOutcome.price) + impliedProb(underOutcome.price); return impliedProb(overOutcome.price) / r; })()
              : devigOneSided(overOutcome.price);
            if (!acc[mapping.over]) acc[mapping.over] = { wSum: 0, wTotal: 0 };
            acc[mapping.over].wSum   += prob * bookWeight;
            acc[mapping.over].wTotal += bookWeight;
          }

          if (mapping.line && overOutcome?.point !== undefined) {
            // Store the line value (use first book's line — lines are usually identical)
            if (!acc[mapping.line]) acc[mapping.line] = { value: overOutcome.point };
          }
        }
      }
    }
  }

  // Resolve accumulator → final props (weighted avg devigged prob → back to American odds)
  for (const [playerName, fields] of Object.entries(accumulator)) {
    if (!propsMap.has(playerName)) propsMap.set(playerName, {});
    const props = propsMap.get(playerName);

    for (const [field, data] of Object.entries(fields)) {
      if (data.value !== undefined) {
        // Line value (not odds) — just store it
        props[field] = data.value;
      } else if (data.wTotal > 0) {
        // Convert weighted avg probability back to American odds
        const avgProb = data.wSum / data.wTotal;
        const americanOdds = avgProb >= 0.5
          ? -Math.round(avgProb / (1 - avgProb) * 100)
          : Math.round((1 - avgProb) / avgProb * 100);
        props[field] = americanOdds;
      }
    }
  }
}

// ─── STEP 5: Supplement with FD sportsbook for pitcher win + game totals ──────
async function getFDPitcherSupplements(fdGameData, propsMap) {
  // FD's event-page pitcher-props tab has win odds + outs that Odds API may miss
  const eventIds = [...new Set(Object.values(fdGameData).map(g => g.eventId).filter(Boolean))];
  let supplemented = 0;

  for (const eid of eventIds) {
    try {
      const r = await fetch(`${FD_API}/event-page?eventId=${eid}&tab=pitcher-props&_ak=${FD_AK}`, { headers: { 'User-Agent': UA } });
      const d = await r.json();
      const markets = d?.attachments?.markets || {};

      for (const mk of Object.values(markets)) {
        const mt = mk.marketType || '';
        const mn = mk.marketName || '';
        const rs = mk.runners || [];

        // Pitcher win odds
        if (mt.match(/^PITCHER_[A-Z]_WIN$/i) || mt === 'PITCHER_WIN') {
          for (const rn of rs) {
            const pName = rn.runnerName?.replace(/ to Win$/, '').trim();
            if (!pName) continue;
            const o = gO(rn);
            if (!o) continue;
            if (!propsMap.has(pName)) propsMap.set(pName, {});
            if (!propsMap.get(pName).win_odds) {
              propsMap.get(pName).win_odds = o;
              supplemented++;
            }
          }
        }

        // Outs recorded (if Odds API missed it)
        if (mt.match(/^PITCHER_[A-Z]_OUTS_RECORDED$/)) {
          const pName = mn.replace(/ Outs Recorded$/, '').trim();
          if (!pName) continue;
          for (const rn of rs) {
            if (rn.runnerName === 'Over') {
              if (!propsMap.has(pName)) propsMap.set(pName, {});
              const p = propsMap.get(pName);
              if (!p.outs_line) {
                p.outs_line = Number(rn.handicap) || 0;
                p.outs_over_odds = gO(rn);
                supplemented++;
              }
            }
          }
        }

        // Alt K tiers from FD (9+, 10+)
        if (mt.match(/^PITCHING_SPECIALS/)) {
          for (const rn of rs) {
            const x = (rn.runnerName || '').match(/^(.+?)\s+(\d+)\+\s*Strikeouts$/);
            if (x) {
              const pName = x[1].trim();
              const kTier = parseInt(x[2]);
              if (!propsMap.has(pName)) propsMap.set(pName, {});
              const p = propsMap.get(pName);
              if (kTier === 9 && !p.ks_alt_9plus)  { p.ks_alt_9plus  = gO(rn); supplemented++; }
              if (kTier === 10 && !p.ks_alt_10plus) { p.ks_alt_10plus = gO(rn); supplemented++; }
            }
          }
        }
      }
    } catch (e) { /* silent — FD supplement is best-effort */ }
  }

  if (supplemented > 0) console.log(`  FD supplement: +${supplemented} fields filled`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const [rg, dff] = await Promise.all([scrapeRG(), scrapeDFF()]);

  // Get FD game totals + Odds API props in parallel
  const [fdGameData, oddsProps] = await Promise.all([
    getFDGameData(),
    getOddsAPIProps(),
  ]);

  // Supplement with FD pitcher-specific markets
  await getFDPitcherSupplements(fdGameData, oddsProps);

  // Build slate team set from DFF
  const slateTeams = new Set();
  for (const [, d] of dff) {
    if (d.team) slateTeams.add(d.team);
  }
  console.log(`  Slate teams: ${[...slateTeams].sort().join(', ')} (${slateTeams.size} teams)`);

  const rows = [];
  let skipped = 0;

  for (const [name, rp] of rg) {
    if (slateTeams.size > 0 && rp.team && !slateTeams.has(rp.team)) { skipped++; continue; }

    const pr = fm(name, oddsProps) || {};
    const isP = rp.position === 'P';

    // Attach game context to pitcher
    if (isP && fdGameData[rp.team]) {
      if (!pr.game_total) pr.game_total = fdGameData[rp.team].total;
    }

    const hasOdds = Object.keys(pr).length > 0;
    const pts = hasOdds
      ? (isP ? calcP(pr) : calcB(pr))
      : { projected: 0, upside: 0 };

    // Determine odds source label
    let oddsSource = 'none';
    if (hasOdds) oddsSource = 'odds-api-consensus';

    rows.push({
      name,
      team:        rp.team    || '',
      opponent:    rp.opponent || '',
      position:    rp.position || '',
      salary:      rp.salary  || 0,
      // Batter odds
      hit_odds:    pr.hit_odds    || null,
      hits_2plus:  pr.hits_2plus  || null,
      hits_3plus:  pr.hits_3plus  || null,
      hits_4plus:  pr.hits_4plus  || null,
      single_odds: pr.single_odds || null,
      double_odds: pr.double_odds || null,
      triple_odds: pr.triple_odds || null,
      hr_odds:     pr.hr_odds     || null,
      hr_2plus:    pr.hr_2plus    || null,
      tb_line:     pr.tb_line     || null,
      tb_over_odds:pr.tb_over_odds|| null,
      tb_2plus:    pr.tb_2plus    || null,
      tb_3plus:    pr.tb_3plus    || null,
      tb_4plus:    pr.tb_4plus    || null,
      tb_5plus:    pr.tb_5plus    || null,
      rbi_odds:    pr.rbi_odds    || null,
      rbis_2plus:  pr.rbis_2plus  || null,
      rbis_3plus:  pr.rbis_3plus  || null,
      rbis_4plus:  pr.rbis_4plus  || null,
      run_odds:    pr.run_odds    || null,
      runs_2plus:  pr.runs_2plus  || null,
      runs_3plus:  pr.runs_3plus  || null,
      sb_odds:     pr.sb_odds     || null,
      sbs_2plus:   pr.sbs_2plus   || null,
      bb_odds:     pr.bb_odds     || null,
      bb_2plus:    pr.bb_2plus    || null,
      hrr_1plus:   pr.hrr_1plus   || null,
      hrr_2plus:   pr.hrr_2plus   || null,
      hrr_3plus:   pr.hrr_3plus   || null,
      hrr_4plus:   pr.hrr_4plus   || null,
      // Pitcher odds
      ks_line:      pr.ks_line      || null,
      ks_over_odds: pr.ks_over_odds || null,
      ks_alt_3plus: pr.ks_alt_3plus || null,
      ks_alt_4plus: pr.ks_alt_4plus || null,
      ks_alt_5plus: pr.ks_alt_5plus || null,
      ks_alt_6plus: pr.ks_alt_6plus || null,
      ks_alt_7plus: pr.ks_alt_7plus || null,
      ks_alt_8plus: pr.ks_alt_8plus || null,
      ks_alt_9plus: pr.ks_alt_9plus || null,
      ks_alt_10plus:pr.ks_alt_10plus|| null,
      outs_line:    pr.outs_line    || null,
      outs_over_odds:pr.outs_over_odds || null,
      win_odds:     pr.win_odds     || null,
      er_line:      pr.er_line      || null,
      er_over_odds: pr.er_over_odds || null,
      game_total:   pr.game_total   || null,
      // Scores
      projected_pts: pts.projected,
      upside_pts:    pts.upside,
      pts_per_k:     rp.salary > 0 ? Math.round((pts.upside / (rp.salary / 1000)) * 10) / 10 : 0,
      odds_source:   oddsSource,
      slate_id:      'main',
    });
  }

  console.log(`  Skipped ${skipped} non-slate players`);
  console.log(`  Inserting ${rows.length} players...`);

  // Clear and reload
  const hd = {
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'apikey': SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };

  await fetch(`${SUPABASE_URL}/rest/v1/players`, { method: 'DELETE', headers: hd });

  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/players`, {
      method: 'POST', headers: hd, body: JSON.stringify(chunk),
    });
    if (!res.ok) console.error('Insert error:', await res.text());
  }

  const withProps = rows.filter(r => r.projected_pts > 0).length;
  const salRange  = rows.length > 0
    ? `$${Math.min(...rows.map(r => r.salary))}-$${Math.max(...rows.map(r => r.salary))}`
    : 'N/A';

  console.log(`\n✅ ${rows.length} players | ${withProps} w/props | ${salRange}`);
}

main().catch(console.error);
