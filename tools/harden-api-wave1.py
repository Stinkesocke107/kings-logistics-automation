from pathlib import Path
import re

IMPORT = "const { resilientFetchJson } = require('./api-resilience');\n"
BRANDING = "require('./kings-branding').installDiscordBranding();\n"


def add_import(source: str, filename: str) -> str:
    if IMPORT in source:
        return source
    if BRANDING not in source:
        raise SystemExit(f'Branding anchor not found in {filename}')
    return source.replace(BRANDING, BRANDING + IMPORT, 1)


# ------------------------------------------------------
# STAFF MANAGEMENT
# ------------------------------------------------------
path = Path('staff-management.js')
source = add_import(path.read_text(encoding='utf-8'), path.name)

pattern = re.compile(r"async function fetchJson\(url, label\) \{.*?\n\}", re.S)
replacement = '''async function fetchJson(url, label) {
  return resilientFetchJson(url, {
    label: String(label || 'truckersmp-api')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-'),
    retries: 3,
    timeoutMs: 15000,
    fetchOptions: {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Kings Logistics Staff Management/1.2'
      }
    },
    validateJson: (payload) => Boolean(payload && payload.error !== true)
  });
}'''
source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit(f'staff-management fetchJson replacement count: {count}')
path.write_text(source, encoding='utf-8')


# ------------------------------------------------------
# NEWS
# ------------------------------------------------------
path = Path('news.js')
source = add_import(path.read_text(encoding='utf-8'), path.name)

pattern = re.compile(
    r'async function getNews\(\) \{.*?\n\}\n\n\n// ======================================================\n// STATE',
    re.S
)
replacement = '''async function getNews() {
  console.log(
    "Loading Kings Logistics TruckersMP News API with resilience..."
  );

  const data = await resilientFetchJson(
    NEWS_API_URL,
    {
      label: 'truckersmp-vtc-news',
      retries: 3,
      timeoutMs: 15000,
      fetchOptions: {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Kings Logistics GitHub Automation"
        }
      },
      validateJson: (payload) =>
        Boolean(
          payload &&
          payload.error !== true &&
          payload.response &&
          Array.isArray(payload.response.news)
        )
    }
  );

  const news =
    data.response.news
      .map(item => ({
        id: Number(item.id),
        title: item.title || "Kings Logistics News",
        description: cleanText(item.content_summary || ""),
        author: item.author || "Kings Logistics",
        publishedAt: item.published_at || null,
        updatedAt: item.updated_at || null,
        url: `https://truckersmp.com/vtc/${KINGS_VTC_ID}/news/${item.id}`
      }))
      .filter(item => Number.isFinite(item.id));

  news.sort((a, b) => {
    const dateA = new Date(a.publishedAt || 0).getTime();
    const dateB = new Date(b.publishedAt || 0).getTime();
    return dateB - dateA;
  });

  if (news.length === 0) {
    throw new Error(
      "No Kings Logistics news posts were returned by TruckersMP."
    );
  }

  console.log(
    `Loaded ${news.length} Kings Logistics news post(s).`
  );
  console.log(
    `Latest news: ${news[0].title}`
  );

  return news;
}


// ======================================================
// STATE'''
source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit(f'news getNews replacement count: {count}')
path.write_text(source, encoding='utf-8')


# ------------------------------------------------------
# LIVE TRACKER
# ------------------------------------------------------
path = Path('tracker.js')
source = add_import(path.read_text(encoding='utf-8'), path.name)

# Member count
pattern = re.compile(r'async function getMemberCount\(\) \{.*?\n\}', re.S)
replacement = '''async function getMemberCount() {
  const data = await resilientFetchJson(
    MEMBERS_URL,
    {
      label: 'truckersmp-vtc-members-live-tracker',
      retries: 3,
      timeoutMs: 15000,
      validateJson: (payload) =>
        Boolean(
          payload &&
          payload.response &&
          Array.isArray(payload.response.members)
        )
    }
  );

  return data.response.members.length;
}'''
source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit(f'tracker getMemberCount replacement count: {count}')

# Servers
pattern = re.compile(
    r'async function getServers\(\) \{.*?\n\}\n\n// ======================================================\n// LIVE PLAYER DATA',
    re.S
)
replacement = '''async function getServers() {
  const data = await resilientFetchJson(
    SERVERS_URL,
    {
      label: 'truckersmp-servers',
      retries: 3,
      timeoutMs: 15000,
      validateJson: (payload) =>
        Boolean(payload && Array.isArray(payload.response))
    }
  );

  return data.response
    .filter(server => {
      if (!server.online) return false;
      const mapId = Number(server.mapid);
      return Number.isFinite(mapId);
    })
    .map(server => ({
      name: server.name,
      mapId: Number(server.mapid),
      game: server.game,
      isEvent: server.event === true || server.specialEvent === true
    }))
    .sort((a, b) => {
      const gameCompare = String(a.game).localeCompare(String(b.game));
      if (gameCompare !== 0) return gameCompare;
      return a.name.localeCompare(b.name);
    });
}

// ======================================================
// LIVE PLAYER DATA'''
source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit(f'tracker getServers replacement count: {count}')

# Players
pattern = re.compile(r'async function getPlayers\(server\) \{.*?\n\}', re.S)
replacement = '''async function getPlayers(server) {
  const url =
    `https://tracker.ets2map.com/v3/area` +
    `?x1=-1000000` +
    `&y1=1000000` +
    `&x2=1000000` +
    `&y2=-1000000` +
    `&server=${server.mapId}`;

  const data = await resilientFetchJson(
    url,
    {
      label: 'truckersmp-map-live',
      retries: 2,
      timeoutMs: 12000,
      validateJson: (payload) =>
        Boolean(payload && payload.Success && Array.isArray(payload.Data))
    }
  );

  return data.Data;
}'''
source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit(f'tracker getPlayers replacement count: {count}')

# Cities
pattern = re.compile(r'async function getCities\(\n  url,\n  game\n\) \{.*?\n\}', re.S)
replacement = '''async function getCities(
  url,
  game
) {
  const data = await resilientFetchJson(
    url,
    {
      label: `truckersmp-map-locations-${String(game).toLowerCase()}`,
      retries: 3,
      timeoutMs: 15000,
      validateJson: (payload) => Array.isArray(payload)
    }
  );

  return collectCities(
    data
  );
}'''
source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit(f'tracker getCities replacement count: {count}')

# Make complete live-map failure fail-safe instead of false zero-online.
if 'let successfulServerChecks =' not in source:
    anchor = '  const kingsOnline = [];\n'
    if anchor not in source:
        raise SystemExit('tracker kingsOnline anchor not found')
    source = source.replace(
        anchor,
        anchor + '\n  let successfulServerChecks =\n    0;\n',
        1
    )

if 'successfulServerChecks++;' not in source:
    anchor = '''      const players =
        await getPlayers(
          server
        );
'''
    if anchor not in source:
        raise SystemExit('tracker getPlayers call anchor not found')
    source = source.replace(
        anchor,
        anchor + '\n      successfulServerChecks++;\n',
        1
    )

if 'All live TruckersMP server checks failed' not in source:
    anchor = '''  /*
    Prevent duplicate Drivers.
  */
'''
    if anchor not in source:
        raise SystemExit('tracker duplicate-driver anchor not found')
    source = source.replace(
        anchor,
        '''  if (
    servers.length > 0 &&
    successfulServerChecks === 0
  ) {
    throw new Error(
      "All live TruckersMP server checks failed. Keeping the last known good tracker state instead of publishing a false zero-online snapshot."
    );
  }

''' + anchor,
        1
    )

path.write_text(source, encoding='utf-8')

print('API resilience wave one applied to Staff Management, News, and Live Tracker.')
