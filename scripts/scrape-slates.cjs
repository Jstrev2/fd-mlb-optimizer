#!/usr/bin/env node
const puppeteer = require('puppeteer-core');
const SUPABASE_URL = 'https://udwafzawzeaoteghfwjq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd2FmemF3emVhb3RlZ2hmd2pxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM4Mjc1MCwiZXhwIjoyMDg5OTU4NzUwfQ.dbO_BZfeb6X2cBbPyr6cyrJC_SRwSC_Qr9ikn1W1_nc';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const FD_API = 'https://sbapi.il.sportsbook.fanduel.com/api';
const AK = 'FhMFpcPWXMeyZxOx';

const TA = {'Pittsburgh Pirates':'PIT','New York Mets':'NYM','Chicago White Sox':'CWS','Milwaukee Brewers':'MIL','Washington Nationals':'WAS','Chicago Cubs':'CHC','Minnesota Twins':'MIN','Baltimore Orioles':'BAL','Boston Red Sox':'BOS','Cincinnati Reds':'CIN','Los Angeles Angels':'LAA','Houston Astros':'HOU','Tampa Bay Rays':'TB','St. Louis Cardinals':'STL','Texas Rangers':'TEX','Philadelphia Phillies':'PHI','Detroit Tigers':'DET','San Diego Padres':'SD','Los Angeles Dodgers':'LAD','Arizona Diamondbacks':'ARI','Seattle Mariners':'SEA','Cleveland Guardians':'CLE','New York Yankees':'NYY','Toronto Blue Jays':'TOR','Atlanta Braves':'ATL','Colorado Rockies':'COL','San Francisco Giants':'SF','Kansas City Royals':'KC','Oakland Athletics':'OAK','Miami Marlins':'MIA','Athletics':'OAK'};

async function scrapeDFFSlates() {
  console.log('Scraping DFF slates...');
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const p = await b.newPage();
  await p.setUserAgent(UA);
  await p.goto('https://www.dailyfantasyfuel.com/mlb/projections/fanduel', { waitUntil: 'networkidle2', timeout: 20000 });
  
  // Click slate trigger to open dropdown
  await p.click('.projections-slates-trigger').catch(() => {});
  await new Promise(r => setTimeout(r, 500));

  const raw = await p.evaluate(() => {
    const items = document.querySelectorAll('[class*=slates] a, [class*=slates-dropdown] a, [class*=slates] [class*=item]');
    const result = [];
    items.forEach(el => {
      const t = el.textContent.trim();
      if (t.length > 5 && t.length < 80) result.push(t);
    });
    return result;
  });
  await b.close();

  // Parse slate entries
  const slates = [];
  for (const text of raw) {
    // Classic: "11 Games  · All Day\n\t\tTHU 1:15PM ET"
    const classicMatch = text.match(/(\d+)\s*Games?\s*[·•]\s*(.+?)[\n\t]+(\w{3}\s+\d{1,2}:\d{2}(?:AM|PM)\s*ET)/);
    if (classicMatch) {
      slates.push({
        type: 'classic',
        games: parseInt(classicMatch[1]),
        label: `${classicMatch[1]} Games · ${classicMatch[2].trim()}`,
        lockTime: classicMatch[3].trim(),
        slateType: classicMatch[2].trim().toLowerCase(),
      });
      continue;
    }
    // Showdown: "WSH @ CHC\n\t\tTHU 2:20PM ET"
    const sdMatch = text.match(/([A-Z]{2,3})\s*@\s*([A-Z]{2,3})[\n\t]+(\w{3}\s+\d{1,2}:\d{2}(?:AM|PM)\s*ET)/);
    if (sdMatch) {
      slates.push({
        type: 'showdown',
        games: 1,
        label: `${sdMatch[1]} @ ${sdMatch[2]}`,
        lockTime: sdMatch[3].trim(),
        teams: [sdMatch[1], sdMatch[2]],
      });
    }
  }

  console.log(`  DFF slates: ${slates.length} (${slates.filter(s => s.type === 'classic').length} classic, ${slates.filter(s => s.type === 'showdown').length} showdown)`);
  return slates;
}

async function getFDGames() {
  const r = await fetch(`${FD_API}/content-managed-page?page=SPORT&eventTypeId=7511&_ak=${AK}&timezone=America/New_York`, { headers: { 'User-Agent': UA } });
  const d = await r.json();
  const events = d?.attachments?.events || {};

  // Use ET for "today" to match FD/DFF slate dates
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const today = `${nowET.getFullYear()}-${String(nowET.getMonth()+1).padStart(2,'0')}-${String(nowET.getDate()).padStart(2,'0')}`;
  const tomorrowUTC = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  return Object.entries(events)
    .filter(([, ev]) => {
      const od = ev.openDate || '';
      if (!ev.name?.includes('@') || !ev.name?.includes('(')) return false;
      // Include today's games + tomorrow-UTC games that are tonight's late games
      if (od.startsWith(today)) return true;
      if (od.startsWith(tomorrowUTC)) {
        // Only include if game starts before 10 AM ET (= late night game from tonight)
        const hourUTC = parseInt(od.substring(11, 13)) || 0;
        return hourUTC < 15; // 15 UTC = 10 AM ET
      }
      return false;
    })
    .map(([id, ev]) => {
      const m = ev.name.match(/^(.+?)\s*\(.+?\)\s*@\s*(.+?)\s*\(.+?\)$/);
      if (!m) return null;
      const away = TA[m[1].trim()], home = TA[m[2].trim()];
      if (!away || !home) return null;
      return { id, openDate: ev.openDate, away, home };
    })
    .filter(Boolean)
    .sort((a, b) => a.openDate.localeCompare(b.openDate));
}

function resolveSlateTeams(dffSlates, fdGames) {
  const resolved = [];
  for (const s of dffSlates) {
    if (s.type === 'showdown') {
      resolved.push({ ...s, id: `sd-${s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` });
      continue;
    }
    // Map classic slates to FD games by position in sorted order
    let games = [];
    const sorted = [...fdGames];
    const st = s.slateType || '';
    
    if (st.includes('all day') || st.includes('all')) {
      games = sorted;
    } else {
      // For all other slates: take the last N games by start time
      // This works because DFF slates are ordered by lock time:
      //   Early = first N, Main = last N (everything from lock time on),
      //   After Hours = last N, Express = subset
      // The key insight: if a slate says "10 games" starting at 7:07 PM,
      // those are the 10 games that start at/after 7:07 PM (the last 10 by time)
      // Exception: "Early Only" takes the FIRST N games
      if (st.includes('early')) {
        games = sorted.slice(0, s.games);
      } else {
        // Main, After Hours, Express, Late — all take from the end
        games = sorted.slice(sorted.length - s.games);
      }
    }
    
    const teams = [...new Set(games.flatMap(g => [g.away, g.home]))];
    resolved.push({
      ...s,
      id: s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      teams,
    });
  }
  return resolved;
}

async function main() {
  const [dffSlates, fdGames] = await Promise.all([scrapeDFFSlates(), getFDGames()]);
  const resolved = resolveSlateTeams(dffSlates, fdGames);
  
  const today = new Date().toISOString().split('T')[0];
  const hd = { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
  
  // Clear today's slates
  await fetch(`${SUPABASE_URL}/rest/v1/slates?date=eq.${today}`, { method: 'DELETE', headers: hd });
  
  // Insert resolved slates
  const rows = resolved.map(s => ({
    id: `${today}-${s.id}`,
    label: s.label,
    lock_time: s.lockTime,
    games: s.games,
    teams: s.teams || [],
    type: s.type,
    date: today,
  }));
  
  if (rows.length > 0) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/slates`, { method: 'POST', headers: hd, body: JSON.stringify(rows) });
    if (!res.ok) console.error('Insert error:', await res.text());
  }
  
  console.log(`\n✅ ${rows.length} slates saved to Supabase`);
  for (const s of resolved) {
    console.log(`  [${s.type}] ${s.label} | ${s.lockTime} | ${(s.teams || []).length} teams`);
  }
}

main().catch(console.error);
