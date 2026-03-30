#!/usr/bin/env node
/**
 * FD MLB DFS Import Pipeline v4
 * 
 * Data sources:
 * 1. FanDuel Sportsbook API — ALL player prop odds (batter + pitcher)
 * 2. FanDuel Sportsbook API — game totals + moneylines
 * 3. RotoGrinders  — FD DFS salaries + positions + teams
 * 4. DailyFantasyFuel — slate team verification
 * 
 * NO third-party paid APIs. FD has everything we need.
 * NO fallback estimates — missing props = 0 contribution.
 */

const puppeteer = require('puppeteer-core');
const { calcB, calcP } = require('./scoring.cjs');

const SUPABASE_URL = 'https://udwafzawzeaoteghfwjq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd2FmemF3emVhb3RlZ2hmd2pxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM4Mjc1MCwiZXhwIjoyMDg5OTU4NzUwfQ.dbO_BZfeb6X2cBbPyr6cyrJC_SRwSC_Qr9ikn1W1_nc';
const FD   = 'https://sbapi.il.sportsbook.fanduel.com/api';
const AK   = 'FhMFpcPWXMeyZxOx';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

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

// FD batter market type → our schema field
const BATTER_MAP = {
  'PLAYER_TO_RECORD_A_HIT':           'hit_odds',
  'PLAYER_TO_RECORD_2+_HITS':         'hits_2plus',
  'PLAYER_TO_RECORD_3+_HITS':         'hits_3plus',
  'PLAYER_TO_RECORD_4+_HITS':         'hits_4plus',
  'TO_HIT_A_SINGLE':                  'single_odds',
  'TO_HIT_A_DOUBLE':                  'double_odds',
  'TO_HIT_A_TRIPLE':                  'triple_odds',
  'TO_HIT_A_HOME_RUN':                'hr_odds',
  'TO_HIT_2+_HOME_RUNS':              'hr_2plus',
  'TO_RECORD_2+_TOTAL_BASES':         'tb_2plus',
  'TO_RECORD_3+_TOTAL_BASES':         'tb_3plus',
  'TO_RECORD_4+_TOTAL_BASES':         'tb_4plus',
  'TO_RECORD_5+_TOTAL_BASES':         'tb_5plus',
  'TO_RECORD_AN_RBI':                 'rbi_odds',
  'TO_RECORD_2+_RBIS':                'rbis_2plus',
  'TO_RECORD_3+_RBIS':                'rbis_3plus',
  'TO_RECORD_4+_RBIS':                'rbis_4plus',
  'TO_RECORD_A_RUN':                  'run_odds',
  'TO_RECORD_2+_RUNS':                'runs_2plus',
  'TO_RECORD_3+_RUNS':                'runs_3plus',
  'TO_RECORD_A_STOLEN_BASE':          'sb_odds',
  'TO_RECORD_2+_STOLEN_BASES':        'sbs_2plus',
  'TO_RECORD_A_WALK':                 'bb_odds',
  'TO_RECORD_2+_WALKS':               'bb_2plus',
  'PLAYER_TO_RECORD_1+_HITS+RUNS+RBIS': 'hrr_1plus',
  'PLAYER_TO_RECORD_2+_HITS+RUNS+RBIS': 'hrr_2plus',
  'PLAYER_TO_RECORD_3+_HITS+RUNS+RBIS': 'hrr_3plus',
  'PLAYER_TO_RECORD_4+_HITS+RUNS+RBIS': 'hrr_4plus',
};

function gO(r) {
  return Number(r?.winRunnerOdds?.americanDisplayOdds?.americanOdds) || 0;
}
function norm(n) {
  return n.toLowerCase().replace(/\./g, '').replace(/jr\.?$/i, '').replace(/\s+/g, ' ').trim();
}
function fm(name, map) {
  if (map.has(name)) return map.get(name);
  const nn = norm(name);
  for (const [k, v] of map) { if (norm(k) === nn) return v; }
  const last = nn.split(' ').pop();
  if (last && last.length >= 4) {
    for (const [k, v] of map) { if (norm(k).split(' ').pop() === last) return v; }
  }
  return null;
}

// ─── 1. Get FD events + game totals + moneylines ─────────────────────────────
async function getFDEvents() {
  console.log('Fetching FD events...');
  const r = await fetch(`${FD}/content-managed-page?page=SPORT&eventTypeId=7511&_ak=${AK}&timezone=America/Chicago`, { headers: { 'User-Agent': UA } });
  const d = await r.json();
  const events = d?.attachments?.events || {};
  const markets = d?.attachments?.markets || {};
  const today = new Date().toISOString().split('T')[0];

  const gameData = {}; // teamAbbrev → { total, eventId, winOdds }
  const eventList = [];

  for (const ev of Object.values(events)) {
    if (!(ev.openDate || '').startsWith(today)) continue;
    const m = ev.name?.match(/^(.+?)\s*\(.+?\)\s*@\s*(.+?)\s*\(.+?\)$/);
    if (!m) continue;
    const away = TA[m[1].trim()] || m[1].trim();
    const home = TA[m[2].trim()] || m[2].trim();
    if (!away || !home) continue;

    eventList.push({ id: ev.eventId, away, home });

    // Extract game total + moneyline from game-level markets
    let total = null, awayML = null, homeML = null;
    for (const mk of Object.values(markets)) {
      if (mk.eventId !== ev.eventId) continue;
      if (mk.marketType === 'TOTAL_POINTS_(OVER/UNDER)') {
        for (const rn of mk.runners || []) {
          if ((rn.runnerName || '').includes('Over')) total = Number(rn.handicap) || null;
        }
      }
      if (mk.marketType === 'MONEY_LINE') {
        for (const rn of mk.runners || []) {
          const o = gO(rn);
          if (!o) continue;
          // Match runner name to team
          const rName = (rn.runnerName || '').toLowerCase();
          if (rName.includes(m[1].trim().split(' ').pop().toLowerCase())) awayML = o;
          else if (rName.includes(m[2].trim().split(' ').pop().toLowerCase())) homeML = o;
        }
      }
    }

    gameData[away] = { total, eventId: ev.eventId, winOdds: awayML };
    gameData[home] = { total, eventId: ev.eventId, winOdds: homeML };
  }

  console.log(`  ${eventList.length} MLB games today`);
  return { eventList, gameData };
}

// ─── 2. Get FD player props for all games ─────────────────────────────────────
async function getFDProps(eventList) {
  console.log(`Fetching props from ${eventList.length} games...`);
  const allProps = new Map(); // playerName → props object
  let totalBatter = 0, totalPitcher = 0;

  for (const ev of eventList) {
    let bd, pd;
    try {
      const [bRes, pRes] = await Promise.all([
        fetch(`${FD}/event-page?eventId=${ev.id}&tab=batter-props&_ak=${AK}`, { headers: { 'User-Agent': UA } }),
        fetch(`${FD}/event-page?eventId=${ev.id}&tab=pitcher-props&_ak=${AK}`, { headers: { 'User-Agent': UA } }),
      ]);
      bd = await bRes.json();
      pd = await pRes.json();
    } catch (e) {
      console.error(`  Error fetching ${ev.away}@${ev.home}:`, e.message);
      continue;
    }

    const getPlayer = (name) => {
      const clean = name.replace(/ (Over|Under)$/i, '').trim();
      if (!clean) return {};
      if (!allProps.has(clean)) allProps.set(clean, {});
      return allProps.get(clean);
    };

    // Batter props
    for (const mk of Object.values(bd?.attachments?.markets || {})) {
      const field = BATTER_MAP[mk.marketType || ''];
      if (!field) continue;
      for (const rn of (mk.runners || [])) {
        const n = rn.runnerName || '';
        if (!n || n === 'Over' || n === 'Under') continue;
        const o = gO(rn);
        if (o) { getPlayer(n)[field] = o; totalBatter++; }
      }
    }

    // Pitcher props — K O/U line
    for (const mk of Object.values(pd?.attachments?.markets || {})) {
      const mt = mk.marketType || '';
      const mn = mk.marketName || '';
      const rs = mk.runners || [];

      // K O/U line (PITCHER_A_TOTAL_STRIKEOUTS, PITCHER_B_TOTAL_STRIKEOUTS, etc.)
      if (mt.match(/^PITCHER_[A-Z]_TOTAL_STRIKEOUTS$/)) {
        const pName = mn.replace(/ - Strikeouts$/, '').replace(/ - Total Strikeouts$/, '').trim();
        for (const rn of rs) {
          if ((rn.runnerName || '').includes('Over')) {
            const p = getPlayer(pName);
            p.ks_line = Number(rn.handicap) || 0;
            p.ks_over_odds = gO(rn);
            totalPitcher++;
          }
        }
      }

      // Alt K tiers (PITCHER_A_STRIKEOUTS, PITCHER_B_STRIKEOUTS, etc.)
      if (mt.match(/^PITCHER_[A-Z]_STRIKEOUTS$/)) {
        for (const rn of rs) {
          const x = (rn.runnerName || '').match(/^(.+?)\s+(\d+)\+\s*Strikeouts$/);
          if (x) {
            const p = getPlayer(x[1].trim());
            const k = parseInt(x[2]);
            if (k >= 3 && k <= 10) { p[`ks_alt_${k}plus`] = gO(rn); totalPitcher++; }
          }
        }
      }

      // High alt K tiers (PITCHING_SPECIALS — 9+, 10+)
      if (mt.match(/^PITCHING_SPECIALS/)) {
        for (const rn of rs) {
          const x = (rn.runnerName || '').match(/^(.+?)\s+(\d+)\+\s*Strikeouts$/);
          if (x) {
            const p = getPlayer(x[1].trim());
            const k = parseInt(x[2]);
            if (k === 9) { p.ks_alt_9plus = gO(rn); totalPitcher++; }
            if (k === 10) { p.ks_alt_10plus = gO(rn); totalPitcher++; }
          }
        }
      }

      // Outs recorded (PITCHER_A_OUTS_RECORDED, etc.)
      if (mt.match(/^PITCHER_[A-Z]_OUTS_RECORDED$/)) {
        const pName = mn.replace(/ Outs Recorded$/, '').replace(/ - Outs Recorded$/, '').trim();
        for (const rn of rs) {
          if ((rn.runnerName || '') === 'Over') {
            const p = getPlayer(pName);
            p.outs_line = Number(rn.handicap) || 0;
            p.outs_over_odds = gO(rn);
            totalPitcher++;
          }
        }
      }

      // Earned runs (PITCHER_A_EARNED_RUNS, etc.)
      if (mt.match(/^PITCHER_[A-Z]_EARNED_RUNS$/)) {
        const pName = mn.replace(/ Earned Runs$/, '').replace(/ - Earned Runs$/, '').trim();
        for (const rn of rs) {
          if ((rn.runnerName || '').includes('Under')) {
            const p = getPlayer(pName);
            p.er_line = Number(rn.handicap) || 0;
            p.er_over_odds = gO(rn);
            totalPitcher++;
          }
        }
      }

      // Win odds
      if (mt.match(/^PITCHER_[A-Z]_TO_RECORD_A_WIN$/i) || mt.match(/^PITCHER_[A-Z]_WIN$/i)) {
        for (const rn of rs) {
          const n = (rn.runnerName || '').replace(/ To Record a Win$/i, '').replace(/ to Win$/i, '').trim();
          if (n) { getPlayer(n).win_odds = gO(rn); totalPitcher++; }
        }
      }
    }
  }

  console.log(`  Props: ${allProps.size} players (${totalBatter} batter fields, ${totalPitcher} pitcher fields)`);
  return allProps;
}

// ─── 3. Scrape RotoGrinders for FD salaries ───────────────────────────────────
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

  const TEAM_NAME_MAP = {
    'METS':'NYM','YANKEES':'NYY','CUBS':'CHC','WHITE SOX':'CWS','ANGELS':'LAA',
    'DODGERS':'LAD','PIRATES':'PIT','BREWERS':'MIL','NATIONALS':'WAS','TWINS':'MIN',
    'ORIOLES':'BAL','RED SOX':'BOS','REDS':'CIN','ASTROS':'HOU','RAYS':'TB',
    'CARDINALS':'STL','RANGERS':'TEX','PHILLIES':'PHI','TIGERS':'DET','PADRES':'SD',
    'DIAMONDBACKS':'ARI','MARINERS':'SEA','GUARDIANS':'CLE','BLUE JAYS':'TOR',
    'BRAVES':'ATL','ROCKIES':'COL','GIANTS':'SF','ROYALS':'KC','ATHLETICS':'OAK','MARLINS':'MIA',
  };
  const CITY_MAP = {
    'PITTSBURGH':'PIT','NEW YORK':'NYM','CHICAGO':'CHC','MILWAUKEE':'MIL',
    'WASHINGTON':'WAS','MINNESOTA':'MIN','BALTIMORE':'BAL','BOSTON':'BOS',
    'CINCINNATI':'CIN','LOS ANGELES':'LAA','HOUSTON':'HOU','TAMPA BAY':'TB',
    'ST. LOUIS':'STL','TEXAS':'TEX','PHILADELPHIA':'PHI','DETROIT':'DET',
    'SAN DIEGO':'SD','ARIZONA':'ARI','SEATTLE':'SEA','CLEVELAND':'CLE',
    'TORONTO':'TOR','ATLANTA':'ATL','COLORADO':'COL','SAN FRANCISCO':'SF',
    'KANSAS CITY':'KC','OAKLAND':'OAK','MIAMI':'MIA',
  };

  const games = [];
  for (let i = 0; i < lines.length - 4; i++) {
    if (lines[i].match(/^\d{1,2}:\d{2}\s*(AM|PM)\s*ET$/i)) {
      const away = TEAM_NAME_MAP[lines[i+2]] || CITY_MAP[lines[i+1]] || '';
      const home = TEAM_NAME_MAP[lines[i+4]] || CITY_MAP[lines[i+3]] || '';
      if (away && home) games.push({ lineIdx: i, away, home });
    }
  }

  const players = new Map();
  let currentAway = '', currentHome = '', teamState = 'awayPitcher', gameIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (gameIdx < games.length && i >= games[gameIdx].lineIdx) {
      currentAway = games[gameIdx].away; currentHome = games[gameIdx].home;
      teamState = 'awayPitcher'; gameIdx++; continue;
    }
    const m1 = lines[i].match(/^(.+?)\s+\([LRS]\)\s+([\w\/]+)\s+\$([\d.]+)K$/i);
    if (m1) {
      const isAway = teamState === 'awayPitcher' || teamState === 'awayBatters';
      const team = isAway ? currentAway : currentHome;
      const opp = isAway ? currentHome : currentAway;
      players.set(m1[1].trim(), { name: m1[1].trim(), position: m1[2], salary: Math.round(parseFloat(m1[3]) * 1000), team, opponent: opp });
      if (teamState === 'awayPitcher') teamState = 'awayBatters';
      if (teamState === 'homePitcher') teamState = 'homeBatters';
      continue;
    }
    const m2 = lines[i].match(/^(.+?)\s+(SP|RP|P)\s+\$([\d.]+)K$/i);
    if (m2) {
      const isAway = teamState === 'awayPitcher';
      const team = isAway ? currentAway : currentHome;
      const opp = isAway ? currentHome : currentAway;
      players.set(m2[1].trim(), { name: m2[1].trim(), position: 'P', salary: Math.round(parseFloat(m2[3]) * 1000), team, opponent: opp });
      if (teamState === 'awayPitcher') teamState = 'awayBatters';
      if (teamState === 'homePitcher') teamState = 'homeBatters';
      continue;
    }
    if (lines[i].match(/^vs\.?\s+/i) && teamState === 'awayBatters') teamState = 'homePitcher';
  }

  console.log(`  RG: ${players.size} players`);
  return players;
}

// ─── 4. Scrape DFF for slate teams ────────────────────────────────────────────
async function scrapeDFF() {
  console.log('Scraping DFF...');
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await b.newPage();
  await pg.setUserAgent(UA);
  await pg.goto('https://www.dailyfantasyfuel.com/mlb/projections/fanduel', { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2000));
  const rows = await pg.evaluate(() => {
    const d = [];
    document.querySelectorAll('tr[class*="player"], .player-row, tbody tr').forEach(r => {
      const c = r.querySelectorAll('td');
      if (c.length < 4) return;
      const name = c[0]?.textContent?.trim();
      const team = c[2]?.textContent?.trim()?.toUpperCase();
      if (name && team && team.length <= 4) d.push({ name, team });
    });
    return d;
  });
  await b.close();
  const teams = new Set(rows.map(r => r.team).filter(Boolean));
  console.log(`  DFF: ${rows.length} players, ${teams.size} teams`);
  return teams;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  // Run in parallel: RG + DFF + FD events
  const [rg, dffTeams, { eventList, gameData }] = await Promise.all([
    scrapeRG(),
    scrapeDFF(),
    getFDEvents(),
  ]);

  // Get all FD props
  const fdProps = await getFDProps(eventList);

  // Determine slate teams (prefer DFF, fall back to RG)
  const slateTeams = dffTeams.size > 0 ? dffTeams : new Set([...rg.values()].map(p => p.team).filter(Boolean));
  console.log(`  Slate teams: ${[...slateTeams].sort().join(', ')} (${slateTeams.size} teams)`);

  // Build player rows
  const rows = [];
  let withProps = 0, skipped = 0;

  for (const [name, rp] of rg) {
    if (slateTeams.size > 0 && rp.team && !slateTeams.has(rp.team)) { skipped++; continue; }

    const pr = fm(name, fdProps) || {};
    const isP = rp.position === 'P';

    // Attach game context
    if (gameData[rp.team]) {
      pr.game_total = pr.game_total || gameData[rp.team].total;
      if (isP && !pr.win_odds && gameData[rp.team].winOdds) {
        pr.win_odds = gameData[rp.team].winOdds;
      }
    }

    const hasOdds = Object.keys(pr).filter(k => k !== 'game_total').length > 0;
    const pts = hasOdds ? (isP ? calcP(pr) : calcB(pr)) : { projected: 0, upside: 0 };
    if (hasOdds) withProps++;

    rows.push({
      name, team: rp.team || '', opponent: rp.opponent || '',
      position: rp.position || '', salary: rp.salary || 0,
      // Batter
      hit_odds: pr.hit_odds || null, hits_2plus: pr.hits_2plus || null,
      hits_3plus: pr.hits_3plus || null, hits_4plus: pr.hits_4plus || null,
      single_odds: pr.single_odds || null, double_odds: pr.double_odds || null,
      triple_odds: pr.triple_odds || null,
      hr_odds: pr.hr_odds || null, hr_2plus: pr.hr_2plus || null,
      tb_2plus: pr.tb_2plus || null, tb_3plus: pr.tb_3plus || null,
      tb_4plus: pr.tb_4plus || null, tb_5plus: pr.tb_5plus || null,
      rbi_odds: pr.rbi_odds || null, rbis_2plus: pr.rbis_2plus || null,
      rbis_3plus: pr.rbis_3plus || null, rbis_4plus: pr.rbis_4plus || null,
      run_odds: pr.run_odds || null, runs_2plus: pr.runs_2plus || null,
      runs_3plus: pr.runs_3plus || null,
      sb_odds: pr.sb_odds || null, sbs_2plus: pr.sbs_2plus || null,
      bb_odds: pr.bb_odds || null, bb_2plus: pr.bb_2plus || null,
      hrr_1plus: pr.hrr_1plus || null, hrr_2plus: pr.hrr_2plus || null,
      hrr_3plus: pr.hrr_3plus || null, hrr_4plus: pr.hrr_4plus || null,
      // Pitcher
      ks_line: pr.ks_line || null, ks_over_odds: pr.ks_over_odds || null,
      ks_alt_3plus: pr.ks_alt_3plus || null, ks_alt_4plus: pr.ks_alt_4plus || null,
      ks_alt_5plus: pr.ks_alt_5plus || null, ks_alt_6plus: pr.ks_alt_6plus || null,
      ks_alt_7plus: pr.ks_alt_7plus || null, ks_alt_8plus: pr.ks_alt_8plus || null,
      ks_alt_9plus: pr.ks_alt_9plus || null, ks_alt_10plus: pr.ks_alt_10plus || null,
      outs_line: pr.outs_line || null, outs_over_odds: pr.outs_over_odds || null,
      win_odds: pr.win_odds || null,
      er_line: pr.er_line || null, er_over_odds: pr.er_over_odds || null,
      game_total: pr.game_total || null,
      // Scores
      projected_pts: pts.projected, upside_pts: pts.upside,
      pts_per_k: rp.salary > 0 ? Math.round((pts.upside / (rp.salary / 1000)) * 10) / 10 : 0,
      odds_source: hasOdds ? 'fanduel' : 'none',
      slate_id: 'main',
    });
  }

  if (skipped > 0) console.log(`  Skipped ${skipped} non-slate players`);
  console.log(`  Inserting ${rows.length} players...`);

  // Clear and reload
  const hd = { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
  await fetch(`${SUPABASE_URL}/rest/v1/players`, { method: 'DELETE', headers: hd });

  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/players`, { method: 'POST', headers: hd, body: JSON.stringify(chunk) });
    if (!res.ok) console.error('Insert error:', await res.text());
  }

  const salRange = rows.length > 0 ? `$${Math.min(...rows.map(r => r.salary))}-$${Math.max(...rows.map(r => r.salary))}` : 'N/A';
  console.log(`\n✅ ${rows.length} players | ${withProps} w/props | ${salRange}`);
}

main().catch(console.error);
