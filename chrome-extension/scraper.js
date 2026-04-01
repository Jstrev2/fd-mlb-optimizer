/**
 * FD Optimizer — DraftKings Prop Scraper
 * Injected on every sportsbook.draftkings.com page.
 * Shows a floating button. Click it → scrapes props → pushes to Supabase.
 */

const SUPABASE_URL = 'https://udwafzawzeaoteghfwjq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd2FmemF3emVhb3RlZ2hmd2pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODI3NTAsImV4cCI6MjA4OTk1ODc1MH0.9Y-4XLE_qrfONurb6x1VxOl9lHbZY3eCgVtJEjvx2is';

// DK prop page URLs and their categories
const PAGES = [
  { url: 'category=pitcher-props&subcategory=earned-runs', category: 'earned-runs' },
  { url: 'category=pitcher-props&subcategory=outs-recorded-o-u', category: 'outs-recorded' },
  { url: 'category=pitcher-props&subcategory=strikeouts-o-u', category: 'strikeouts' },
  { url: 'category=pitcher-props&subcategory=walks-allowed', category: 'walks-allowed' },
  { url: 'category=pitcher-props&subcategory=hits-allowed', category: 'hits-allowed' },
  { url: 'category=batter-props&subcategory=home-runs', category: 'batter-hr' },
  { url: 'category=batter-props&subcategory=hits', category: 'batter-hits' },
  { url: 'category=batter-props&subcategory=total-bases', category: 'batter-tb' },
  { url: 'category=batter-props&subcategory=rbis', category: 'batter-rbi' },
  { url: 'category=batter-props&subcategory=runs', category: 'batter-runs' },
  { url: 'category=batter-props&subcategory=stolen-bases', category: 'batter-sb' },
  { url: 'category=batter-props&subcategory=walks', category: 'batter-bb' },
];

function detectCategory() {
  const search = location.search || '';
  for (const p of PAGES) {
    if (search.includes(p.url.split('&')[1])) return p.category;
  }
  return 'unknown';
}

function scrapeCurrentPage() {
  const text = document.body.innerText;
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const props = {};

  // Strategy: Find player names (capitalized first+last), then look for
  // Over/Under patterns, odds, and lines in nearby lines
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    // Detect O/U pattern: "Over" or "Under" followed by a number line and odds
    if (l === 'Over' || l === 'Under' || l === 'O' || l === 'U') {
      const direction = (l === 'Over' || l === 'O') ? 'over' : 'under';

      // Look backward for player name
      let name = '';
      for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
        // Player name: 2+ words, starts with caps, not a number or odds
        if (lines[j].match(/^[A-Z][a-z]+\.?\s+[A-Z][a-z]+/) &&
            !lines[j].match(/^(Over|Under|O|U)$/i) &&
            !lines[j].match(/^[+-]\d+$/) &&
            !lines[j].match(/^\d+(\.\d+)?$/) &&
            !lines[j].match(/^(SGP|ML|Alt|Total|1st|2nd|3rd|Game|AT|@)/i)) {
          name = lines[j].replace(/\s+(O|U|Over|Under)$/, '').trim();
          break;
        }
      }

      // Look forward for line number and odds
      let line = '', odds = '';
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (!line && lines[j].match(/^\d+(\.\d+)?$/)) line = lines[j];
        if (!odds && lines[j].match(/^[+-]\d+$/)) odds = lines[j];
        if (line && odds) break;
      }

      if (name) {
        if (!props[name]) props[name] = {};
        if (line) props[name].line = parseFloat(line);
        if (odds) props[name][direction] = odds;
      }
      continue;
    }

    // Detect alt line pattern: "X or Fewer" / "X or More"
    const altMatch = l.match(/^(\d+)\s+or\s+(Fewer|More|Less)$/i);
    if (altMatch) {
      const threshold = parseInt(altMatch[1]);
      const dir = altMatch[2].toLowerCase();

      let name = '', odds = '';
      for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
        if (lines[j].match(/^[A-Z][a-z]+\.?\s+[A-Z][a-z]+/) &&
            !lines[j].match(/^(Over|Under|O|U|\d|[+-])/) &&
            !lines[j].match(/^(SGP|ML|Alt|Total|Game|AT|@)/i)) {
          name = lines[j].trim();
          break;
        }
      }
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        if (lines[j].match(/^[+-]\d+$/)) { odds = lines[j]; break; }
      }

      if (name && odds) {
        if (!props[name]) props[name] = {};
        const key = (dir === 'more') ? `alt_${threshold}plus` : `alt_${threshold}minus`;
        props[name][key] = odds;
        if (!props[name].line) props[name].line = threshold - 0.5;
      }
    }
  }

  return props;
}

async function pushToSupabase(category, props) {
  const count = Object.keys(props).length;
  const today = new Date().toISOString().split('T')[0];
  const payload = {
    id: `dk-${category}-${today}`,
    date: today,
    category: category,
    data: props,
    player_count: count,
    scraped_at: new Date().toISOString(),
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/dk_props`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  });

  return { ok: res.ok, count, status: res.status };
}

async function runScrapeAll() {
  const btn = document.getElementById('fd-scrape-btn');
  btn.textContent = '⏳ Scraping...';
  btn.className = 'running';

  const results = {};
  const category = detectCategory();

  // If on a specific category page, just scrape this one
  if (category !== 'unknown') {
    const props = scrapeCurrentPage();
    const res = await pushToSupabase(category, props);
    results[category] = res;
    btn.textContent = res.ok ? `✅ ${res.count} ${category} props!` : '❌ Error';
    btn.className = res.ok ? 'done' : 'error';
    setTimeout(() => {
      btn.textContent = `⚾ Scrape DK (${category})`;
      btn.className = '';
    }, 3000);
    console.log(`[FD Optimizer] ${category}:`, props);
    return;
  }

  // If on main MLB page, scrape all categories by navigating
  btn.textContent = '⚾ Navigate to a prop page first!';
  btn.className = 'error';
  setTimeout(() => { btn.textContent = '⚾ Scrape DK Props'; btn.className = ''; }, 3000);
}

// Create the floating button
function init() {
  if (document.getElementById('fd-scrape-btn')) return;

  const category = detectCategory();
  const btn = document.createElement('button');
  btn.id = 'fd-scrape-btn';
  btn.textContent = category !== 'unknown' 
    ? `⚾ Scrape DK (${category})`
    : '⚾ Pick a prop category';
  btn.addEventListener('click', runScrapeAll);
  document.body.appendChild(btn);

  // Also add quick-nav links for pitcher props
  if (location.search.includes('category=pitcher-props') || location.search.includes('category=batter-props')) {
    const nav = document.createElement('div');
    nav.style.cssText = 'position:fixed;bottom:70px;right:20px;z-index:999998;display:flex;flex-direction:column;gap:4px;align-items:flex-end;';
    const pitcherPages = PAGES.filter(p => p.category.startsWith('pitcher') || p.category.startsWith('batter'));
    pitcherPages.forEach(p => {
      const a = document.createElement('a');
      a.href = `/leagues/baseball/mlb?${p.url}`;
      a.textContent = p.category;
      a.style.cssText = `background:${detectCategory() === p.category ? '#4ade80' : '#333'};color:${detectCategory() === p.category ? '#000' : '#aaa'};padding:4px 10px;border-radius:20px;font-size:11px;text-decoration:none;font-family:system-ui;font-weight:600;`;
      nav.appendChild(a);
    });
    document.body.appendChild(nav);
  }
}

// Wait for page to fully load
if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', () => setTimeout(init, 2000));
}

// Also re-init on URL change (DK is a SPA)
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    const old = document.getElementById('fd-scrape-btn');
    if (old) old.remove();
    const oldNav = document.querySelector('[style*="bottom:70px"]');
    if (oldNav) oldNav.remove();
    setTimeout(init, 2000);
  }
}, 1000);
