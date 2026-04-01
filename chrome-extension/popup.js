const PAGES = [
  { url: 'https://sportsbook.draftkings.com/leagues/baseball/mlb?category=pitcher-props&subcategory=earned-runs', name: 'Pitcher ER' },
  { url: 'https://sportsbook.draftkings.com/leagues/baseball/mlb?category=pitcher-props&subcategory=outs-recorded-o-u', name: 'Pitcher Outs' },
  { url: 'https://sportsbook.draftkings.com/leagues/baseball/mlb?category=pitcher-props&subcategory=strikeouts-o-u', name: 'Pitcher Ks' },
  { url: 'https://sportsbook.draftkings.com/leagues/baseball/mlb?category=pitcher-props&subcategory=walks-allowed', name: 'Pitcher BB' },
  { url: 'https://sportsbook.draftkings.com/leagues/baseball/mlb?category=pitcher-props&subcategory=hits-allowed', name: 'Pitcher Hits' },
  { url: 'https://sportsbook.draftkings.com/leagues/baseball/mlb?category=batter-props&subcategory=hits', name: 'Batter Hits' },
  { url: 'https://sportsbook.draftkings.com/leagues/baseball/mlb?category=batter-props&subcategory=total-bases', name: 'Batter TB' },
  { url: 'https://sportsbook.draftkings.com/leagues/baseball/mlb?category=batter-props&subcategory=home-runs', name: 'Batter HR' },
  { url: 'https://sportsbook.draftkings.com/leagues/baseball/mlb?category=batter-props&subcategory=rbis', name: 'Batter RBI' },
  { url: 'https://sportsbook.draftkings.com/leagues/baseball/mlb?category=batter-props&subcategory=runs-scored', name: 'Batter Runs' },
  { url: 'https://sportsbook.draftkings.com/leagues/baseball/mlb?category=batter-props&subcategory=stolen-bases', name: 'Batter SB' },
];

// Build the category list UI
const catDiv = document.getElementById('categories');
PAGES.forEach((p, i) => {
  const row = document.createElement('div');
  row.className = 'category';
  row.innerHTML = `<span class="name">${p.name}</span><span class="result waiting" id="cat-${i}">—</span>`;
  catDiv.appendChild(row);
});

async function scrapeAll() {
  const btn = document.getElementById('scrape-btn');
  const status = document.getElementById('status');
  btn.disabled = true;
  btn.textContent = '⏳ Scraping...';
  status.textContent = '';

  // Send message to background script to handle the scraping
  chrome.runtime.sendMessage({ action: 'scrapeAll', pages: PAGES }, (response) => {
    // Background handles everything, we just listen for updates
  });

  // Listen for progress updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'progress') {
      const el = document.getElementById(`cat-${msg.index}`);
      if (el) {
        el.textContent = msg.status;
        el.className = `result ${msg.class}`;
      }
    }
    if (msg.action === 'complete') {
      btn.textContent = `✅ Done! ${msg.total} props scraped`;
      btn.disabled = false;
      status.textContent = 'Now hit Import in the optimizer app.';
      status.style.color = '#4ade80';
      setTimeout(() => { btn.textContent = 'Scrape ALL Props'; }, 5000);
    }
    if (msg.action === 'error') {
      btn.textContent = '❌ Error';
      btn.disabled = false;
      status.textContent = msg.message;
      status.style.color = '#ef4444';
    }
  });
}
