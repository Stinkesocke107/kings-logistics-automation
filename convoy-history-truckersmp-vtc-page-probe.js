const fs = require('fs');

const VTC_ID = String(process.env.KINGS_VTC_ID || '64284');
const MAX_PAGES = Number(process.env.KINGS_VTC_ATTENDING_PROBE_PAGES || '40');
const OUTPUT = process.env.KINGS_VTC_ATTENDING_PROBE_OUTPUT || 'data/convoy-history-vtc-page-probe.json';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function eventIdsFromHtml(html) {
  const ids = new Set();
  for (const match of String(html || '').matchAll(/href=["'](?:https:\/\/truckersmp\.com)?\/events\/(\d+)[^"']*["']/gi)) {
    ids.add(match[1]);
  }
  return [...ids];
}

function titleFromHtml(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

async function fetchPage(page) {
  const url = `https://truckersmp.com/vtc/${encodeURIComponent(VTC_ID)}/events/attending?page=${page}`;
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB,en;q=0.9',
      'Cache-Control': 'no-cache',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36 KingsLogisticsHistoryProbe/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });
  const html = await response.text();
  return {
    page,
    url,
    status: response.status,
    finalUrl: response.url,
    title: titleFromHtml(html),
    bytes: Buffer.byteLength(html),
    eventIds: eventIdsFromHtml(html),
    containsKings: /Kings\s+Logistics/i.test(html),
    containsVtcAttending: /VTCs?\s+Attending/i.test(html),
    htmlSample: html.slice(0, 500).replace(/\s+/g, ' ')
  };
}

async function main() {
  const pages = [];
  const allIds = new Set();
  let consecutiveEmpty = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    try {
      const result = await fetchPage(page);
      pages.push(result);
      for (const id of result.eventIds) allIds.add(id);

      if (result.status === 200 && result.eventIds.length === 0) consecutiveEmpty += 1;
      else consecutiveEmpty = 0;

      console.log(`Page ${page}: HTTP ${result.status}, events=${result.eventIds.length}`);

      if (page >= 3 && consecutiveEmpty >= 3) break;
      if (result.status === 403 || result.status === 429) break;
    } catch (error) {
      pages.push({ page, error: error.message });
      console.warn(`Page ${page}: ${error.message}`);
      break;
    }

    await sleep(250);
  }

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    vtcId: VTC_ID,
    maxPagesRequested: MAX_PAGES,
    pagesChecked: pages.length,
    uniqueEventIds: allIds.size,
    eventIds: [...allIds],
    pages
  };

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');
  console.log(`Probe complete: ${output.pagesChecked} pages, ${output.uniqueEventIds} unique event IDs.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('VTC attending page probe failed:', error.message);
    process.exit(1);
  });
}

module.exports = { eventIdsFromHtml, titleFromHtml };
