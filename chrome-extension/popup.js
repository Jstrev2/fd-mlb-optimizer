const PAGES = [
  { url: 'https://sportsbook.draftkings.com/leagues/baseball/mlb?category=pitcher-props&subcategory=earned-runs', name: 'Pitcher Earned Runs' },
];

document.getElementById('scrape-btn').addEventListener('click', scrapeAll);

// Build the category list UI
const catDiv = document.getElementById('categories');
PAGES.forEach((p, i) => {
  const row = document.createElement('div');
  row.className = 'category';
  row.innerHTML = `<span class="name">${p.name}</span><span class="result waiting" id="cat-${i}">-</span>`;
  catDiv.appendChild(row);
});

async function scrapeAll() {
  const btn = document.getElementById('scrape-btn');
  const status = document.getElementById('status');
  btn.disabled = true;
  btn.textContent = 'Scraping...';
  status.textContent = '';

  chrome.runtime.sendMessage({ action: 'scrapeAll', pages: PAGES });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'progress') {
      const el = document.getElementById(`cat-${msg.index}`);
      if (el) {
        el.textContent = msg.status;
        el.className = `result ${msg.class}`;
      }
    }
    if (msg.action === 'complete') {
      btn.textContent = `Done! ${msg.total} pitcher ER props`;
      btn.disabled = false;
      status.textContent = 'Now hit Import in the optimizer.';
      status.style.color = '#4ade80';
    }
    if (msg.action === 'error') {
      btn.textContent = 'Error';
      btn.disabled = false;
      status.textContent = msg.message;
      status.style.color = '#ef4444';
    }
  });
}
