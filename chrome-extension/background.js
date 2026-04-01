const SUPABASE_URL = 'https://udwafzawzeaoteghfwjq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd2FmemF3emVhb3RlZ2hmd2pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODI3NTAsImV4cCI6MjA4OTk1ODc1MH0.9Y-4XLE_qrfONurb6x1VxOl9lHbZY3eCgVtJEjvx2is';

// The scraper function that gets injected into each DK page
function scraperFunction() {
  const text = document.body.innerText;
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const props = {};

  // Debug: capture raw text sample
  const debug = { lineCount: lines.length, sample: lines.slice(0, 50), blocked: text.includes('Access Denied') };

  if (debug.blocked || lines.length < 20) {
    return { props: {}, debug };
  }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    // Match Over/Under with various formats DK uses
    if (/^(Over|Under|O |U )$/i.test(l) || l === 'O' || l === 'U') {
      const direction = /^(Over|O)/i.test(l) ? 'over' : 'under';
      let name = '', line = '', odds = '';
      // Look backward for player name
      for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
        const prev = lines[j];
        if (prev.match(/^[A-Z][a-z]+\.?\s+[A-Z][a-z]/) &&
            !prev.match(/^(Over|Under|O|U|SGP|ML|Alt|Total|1st|2nd|3rd|Game|AT|More|Fewer|Less|Earned|Outs|Strikeout|Walk|Hit|Run|Base|Steal)/i) &&
            !prev.match(/^[+-]\d/) &&
            !prev.match(/^\d+(\.\d)?$/)) {
          name = prev.trim();
          break;
        }
      }
      // Look forward for line and odds
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        if (!line && lines[j].match(/^\d+(\.\d+)?$/)) line = lines[j];
        if (!odds && lines[j].match(/^[\u2212+-]\d+$/)) odds = lines[j].replace('\u2212', '-');
        if (line && odds) break;
      }
      if (name) {
        if (!props[name]) props[name] = {};
        if (line) props[name].line = parseFloat(line);
        if (odds) props[name][direction] = odds;
      }
      continue;
    }

    // Alt lines: "2 or Fewer", "3 or More", etc
    const altMatch = l.match(/^(\d+)\s+or\s+(Fewer|More|Less)$/i);
    if (altMatch) {
      const threshold = parseInt(altMatch[1]);
      const dir = altMatch[2].toLowerCase();
      let name = '', odds = '';
      for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
        if (lines[j].match(/^[A-Z][a-z]+\.?\s+[A-Z][a-z]/) &&
            !lines[j].match(/^(Over|Under|O|U|\d|[+-]|SGP|ML|Alt|Total|Game|AT|More|Fewer|Less|Earned|Outs)/i)) {
          name = lines[j].trim();
          break;
        }
      }
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (lines[j].match(/^[\u2212+-]\d+$/)) { odds = lines[j].replace('\u2212', '-'); break; }
      }
      if (name && odds) {
        if (!props[name]) props[name] = {};
        const key = (dir === 'more') ? `alt_${threshold}plus` : `alt_${threshold}minus`;
        props[name][key] = odds;
        if (!props[name].line) props[name].line = threshold - 0.5;
      }
    }
  }

  return { props, debug: { ...debug, propsFound: Object.keys(props).length } };
}

async function pushToSupabase(category, props) {
  const count = Object.keys(props).length;
  const today = new Date().toISOString().split('T')[0];
  const payload = {
    id: `dk-${category}-${today}`,
    date: today,
    category,
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
  return { ok: res.ok, count };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'scrapeAll') return;

  const pages = msg.pages;
  let totalProps = 0;

  (async () => {
    // Create a tab for scraping (we'll reuse it)
    const tab = await chrome.tabs.create({ url: pages[0].url, active: false });

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];

      // Update popup progress
      chrome.runtime.sendMessage({ action: 'progress', index: i, status: 'loading...', class: 'running' });

      // Navigate to page
      if (i > 0) {
        await chrome.tabs.update(tab.id, { url: page.url });
      }

      // Wait for page to load
      await new Promise(resolve => {
        const check = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(check);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(check);
      });

      // Extra wait for DK's SPA to render
      await new Promise(r => setTimeout(r, 3000));

      // Inject and run scraper
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scraperFunction,
        });

        const result = results[0]?.result || { props: {}, debug: {} };
        const props = result.props || {};
        const debug = result.debug || {};
        const count = Object.keys(props).length;

        console.log(`[FD Optimizer] Page ${i}:`, debug);

        const urlParams = new URL(page.url).searchParams;
        const category = urlParams.get('subcategory') || 'unknown';

        if (debug.blocked) {
          chrome.runtime.sendMessage({ action: 'progress', index: i, status: 'BLOCKED', class: 'error' });
        } else if (count > 0) {
          const res = await pushToSupabase(category, props);
          totalProps += count;
          chrome.runtime.sendMessage({ action: 'progress', index: i, status: count + ' found', class: 'done' });
        } else {
          chrome.runtime.sendMessage({ action: 'progress', index: i, status: '0 (' + debug.lineCount + ' lines)', class: 'error' });
        }
      } catch (e) {
        chrome.runtime.sendMessage({ action: 'progress', index: i, status: 'ERR: ' + e.message.substring(0, 30), class: 'error' });
      }
    }

    // Close the scraping tab
    chrome.tabs.remove(tab.id);

    // Done!
    chrome.runtime.sendMessage({ action: 'complete', total: totalProps });
  })();

  return true; // async
});
