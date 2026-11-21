require('./kings-branding').installDiscordBranding();
const { resilientFetchJson } = require('./api-resilience');
const { loadTrackerTruckersMpIdentityIndex, markLinkedTruckersMpPlayers } = require('./tracker-driver-identity');
const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — LIVE TRACKER
// CENTRAL LIVE DATA SOURCE
// ======================================================

const KINGS_VTC_ID = 64284;

const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL;

const SERVERS_URL =
  "https://api.truckersmp.com/v2/servers";

const MEMBERS_URL =
  `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/members`;

const ETS2_LOCATIONS_URL =
  "https://map.truckersmp.com/locations_ets2.min.json";

const ATS_LOCATIONS_URL =
  "https://map.truckersmp.com/locations_ats.min.json";

const SNAPSHOT_FILE =
  path.join(
    __dirname,
    "data",
    "live-tracker-snapshot.json"
  );

const KINGS_COLOR =
  parseInt(
    "182dff",
    16
  );

// ======================================================
// HELPERS
// ======================================================

function nowISO() {
  return new Date().toISOString();
}

function writeJson(
  file,
  data
) {
  fs.mkdirSync(
    path.dirname(file),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    file,
    JSON.stringify(
      data,
      null,
      2
    ) + "\n",
    "utf8"
  );
}

function readJson(
  file,
  fallback
) {
  if (
    !fs.existsSync(
      file
    )
  ) {
    return fallback;
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  } catch (error) {
    console.warn(
      `Could not read ${path.basename(file)}.`
    );
    return fallback;
  }
}

function getStoredDiscordMessageId() {
  const snapshot =
    readJson(
      SNAPSHOT_FILE,
      null
    );

  const messageId =
    snapshot &&
    snapshot.discordMessageId
      ? String(
          snapshot.discordMessageId
        ).trim()
      : "";

  return /^\d+$/.test(
    messageId
  )
    ? messageId
    : null;
}

// ======================================================
// KINGS MEMBER COUNT — ALL OFFICIAL TRUCKERSMP VTC MEMBERS
// This count is independent of Discord, Trial/Driver roles and the private
// identity register. VTC-only members belong to Kings and must be included.
// ======================================================

async function getMemberCount() {
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
}

// ======================================================
// TRUCKERSMP SERVERS
// ======================================================

async function getServers() {
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
      // Only an explicitly verified integer zero can skip a map lookup.
      // Missing/malformed counts are unknown, NEVER assumed offline.
      reportedPlayers: Number.isSafeInteger(server.players) && server.players >= 0
        ? server.players : null,
      isEvent: server.event === true || server.specialEvent === true
    }))
    .sort((a, b) => {
      const gameCompare = String(a.game).localeCompare(String(b.game));
      if (gameCompare !== 0) return gameCompare;
      return a.name.localeCompare(b.name);
    });
}

// ======================================================
// LIVE PLAYER DATA
// ======================================================

async function getPlayers(server, options = {}) {
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
      // Every complete scan must include the first server. A failed first
      // probe proves the current global snapshot cannot be complete, so avoid
      // retrying eight servers during known provider outages.
      retries: options.probe ? 0 : 1,
      // The full-area map query may exceed the former 7s first-server
      // timeout. Keep bounded limits and fail closed if coverage is incomplete.
      timeoutMs: options.probe ? 16000 : 15000,
      validateJson: (payload) =>
        Boolean(payload && payload.Success && Array.isArray(payload.Data))
    }
  );

  return data.Data;
}

// ======================================================
// CITY / LOCATION DATA
// ======================================================

function collectCities(
  items,
  cities = []
) {
  if (!Array.isArray(items)) {
    return cities;
  }

  for (const item of items) {
    if (
      item.type === "city" &&
      typeof item.x ===
        "number" &&
      typeof item.y ===
        "number"
    ) {
      cities.push({
        name:
          item.name,

        x:
          item.x,

        y:
          item.y
      });
    }

    if (
      Array.isArray(
        item.pois
      )
    ) {
      collectCities(
        item.pois,
        cities
      );
    }
  }

  return cities;
}

async function getCities(
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

  return collectCities(data);
}

// City labels are optional: a map metadata outage must not prevent verified
// Kings VTC players from being counted when the player map itself is healthy.
async function getOptionalCities(url, game) {
  try { return await getCities(url, game); }
  catch {
    console.warn('Kings '+game+' city labels unavailable; using Location unavailable.');
    return [];
  }
}

function getNearestCity(
  x,
  y,
  cities
) {
  if (!cities.length) {
    return "Location unavailable";
  }

  let nearestCity =
    null;

  let nearestDistance =
    Infinity;

  for (
    const city
    of cities
  ) {
    const dx =
      x - city.x;

    const dy =
      y - city.y;

    const distance =
      dx * dx +
      dy * dy;

    if (
      distance <
      nearestDistance
    ) {
      nearestDistance =
        distance;

      nearestCity =
        city;
    }
  }

  return nearestCity
    ? nearestCity.name
    : "Location unavailable";
}

// ======================================================
// FIND ONLINE KINGS MEMBERS
// ======================================================

async function getKingsOnline() {
  // The player map is the critical dependency. Do NOT spend API calls and
  // time on optional city labels until every official server was verified.
  // This prevents the city API's own outages from delaying recovery checks.

  const servers =
    await getServers();

  console.log("");

  console.log(
    `Loaded ${servers.length} online TruckersMP servers.`
  );

  if (!servers.length) {
    throw new Error("No usable online TruckersMP servers; keeping the last known good tracker state.");
  }

  const kingsOnline = [];

  let successfulServerChecks =
    0;

  for (
    const [serverIndex, server]
    of servers.entries()
  ) {
    console.log(
      `Checking ${server.game} - ${server.name}...`
    );

    // The OFFICIAL TruckersMP server directory explicitly reports zero
    // current players: there cannot be any Kings players to locate there.
    // This avoids expensive full-world map requests for empty servers.
    // Any missing/non-integer count must still be queried, never guessed.
    if (server.reportedPlayers === 0) {
      successfulServerChecks++;
      console.log('Skipped confirmed empty TruckersMP server.');
      continue;
    }

    try {
      const players =
        await getPlayers(
          server,
          { probe: serverIndex === 0 }
        );

      successfulServerChecks++;

      const kingsPlayers =
        players
          .filter(
            player =>
              Number(
                player.VtcId
              ) ===
              KINGS_VTC_ID
          )
          .map(player => ({
            name: player.Name,
            tmpId: Number(player.MpId),
            game: server.game,
            server: server.name,
            // Temporary in-memory coordinates for the optional city labels.
            // They are removed before the public tracker or state sees them.
            X: player.X,
            Y: player.Y,
            isEvent: server.isEvent
          }));

      kingsOnline.push(
        ...kingsPlayers
      );

      console.log(
        `Found ${kingsPlayers.length} Kings member(s).`
      );
    } catch (error) {
      // A single failed server makes the global online measurement
      // incomplete. Stop immediately rather than probing the others and
      // repeatedly hammering an unavailable map provider.
      const reason = error?.name === 'AbortError' || error?.name === 'TimeoutError'
        ? 'provider timeout'
        : error?.code === 'CIRCUIT_OPEN' ? 'provider circuit open'
        : Number.isInteger(error?.status) ? 'HTTP ' + error.status
        : 'provider request failed';
      // Never log private records or player IDs in public workflow logs.
      console.error('Kings map coverage incomplete ('+server.game+
        ' server '+server.mapId+'): '+reason);
      throw new Error(
        'Only ' + successfulServerChecks + '/' + servers.length +
        ' live TruckersMP server checks succeeded. Keeping the last known good tracker state instead of publishing incomplete online statistics.'
      );
    }
  }

  // Never publish a partial online count as if it were complete.
  // In particular, 0 Kings Drivers on one responding server does not mean
  // 0 Kings Drivers across the servers that failed to respond.
  if (successfulServerChecks !== servers.length) {
    throw new Error(
      'Only ' + successfulServerChecks + '/' + servers.length +
      ' live TruckersMP server checks succeeded. Keeping the last known good tracker state instead of publishing incomplete online statistics.'
    );
  }

  /*
    Prevent duplicate Drivers.
  */

  const uniquePlayers =
    new Map();

  for (
    const player
    of kingsOnline
  ) {
    uniquePlayers.set(
      player.tmpId,
      player
    );
  }

  // City metadata is cosmetic; download only once a *complete* player
  // scan has succeeded. Failed city APIs must not invalidate verified players.
  const [ets2Cities, atsCities] = await Promise.all([
    getOptionalCities(ETS2_LOCATIONS_URL, "ETS2"),
    getOptionalCities(ATS_LOCATIONS_URL, "ATS")
  ]);
  const safePlayers = Array.from(uniquePlayers.values()).map(player => {
    const cities = player.game === "ATS" ? atsCities : ets2Cities;
    const { X, Y, ...safe } = player;
    return {
      ...safe,
      city: cities.length && Number.isFinite(X) && Number.isFinite(Y)
        ? getNearestCity(X, Y, cities)
        : "Location unavailable"
    };
  });
  // No coordinates leave this function or enter persisted snapshots.
  return safePlayers;
}

// ======================================================
// BUILD PUBLIC-SAFE CENTRAL LIVE SNAPSHOT
// ======================================================

function buildLiveSnapshot(
  players,
  members,
  discordMessageId
) {
  const ets2Online =
    players.filter(
      player =>
        player.game ===
        "ETS2"
    ).length;

  const atsOnline =
    players.filter(
      player =>
        player.game ===
        "ATS"
    ).length;

  const activeServerMap =
    new Map();

  for (
    const player
    of players
  ) {
    const key =
      `${player.game}|||${player.server}`;

    if (
      !activeServerMap.has(
        key
      )
    ) {
      activeServerMap.set(
        key,
        {
          game:
            player.game,

          name:
            player.server,

          online:
            0,

          isEvent:
            player.isEvent
        }
      );
    }

    activeServerMap.get(
      key
    ).online++;
  }

  const activeServers =
    Array.from(
      activeServerMap.values()
    ).sort(
      (a, b) =>
        b.online -
          a.online ||
        `${a.game} ${a.name}`.localeCompare(
          `${b.game} ${b.name}`
        )
    );

  /*
    IMPORTANT:
    The repository snapshot contains only aggregated
    information.

    Individual driver names, TruckersMP IDs and live
    locations are intentionally NOT stored here.

    Individual player information exists only during
    the current tracker run and is used for the Discord
    Live Tracker message.
  */

  return {
    version:
      2,

    updatedAt:
      nowISO(),

    members,

    discordMessageId:
      discordMessageId ||
      null,

    online:
      players.length,

    ets2Online,

    atsOnline,

    activeServers
  };
}

function saveLiveSnapshot(
  players,
  members,
  discordMessageId
) {
  const snapshot =
    buildLiveSnapshot(
      players,
      members,
      discordMessageId
    );

  writeJson(
    SNAPSHOT_FILE,
    snapshot
  );

  console.log("");

  console.log(
    "Public-safe Central Live Snapshot saved."
  );

  console.log(
    `Snapshot Members: ${snapshot.members}`
  );

  console.log(
    `Snapshot Online: ${snapshot.online}`
  );

  console.log(
    `Snapshot ETS2: ${snapshot.ets2Online}`
  );

  console.log(
    `Snapshot ATS: ${snapshot.atsOnline}`
  );

  console.log(
    `Snapshot Active Servers: ${snapshot.activeServers.length}`
  );
}

// ======================================================
// DISCORD EMBEDS
// ======================================================

function buildDiscordEmbeds(
  players
) {
  const ets2Count =
    players.filter(
      player =>
        player.game ===
        "ETS2"
    ).length;

  const atsCount =
    players.filter(
      player =>
        player.game ===
        "ATS"
    ).length;

  const timestamp =
    Math.floor(
      Date.now() /
      1000
    );

  const embeds = [];

  // ====================================================
  // EMBED 1 — OVERVIEW
  // ====================================================

  let overviewDescription =
    "See which **Kings Logistics Family** members " +
    "are currently online on TruckersMP.\n\n";

  if (
    players.length === 0
  ) {
    overviewDescription +=
      "**No Kings Logistics members are currently online on TruckersMP.**";
  } else {
    overviewDescription +=
      `**${players.length} Kings member${
        players.length === 1
          ? ""
          : "s"
      } currently online**`;
  }

  overviewDescription +=
    `\n\nETS2: **${ets2Count}**` +
    ` • ATS: **${atsCount}**` +
    `\nLast updated <t:${timestamp}:R>`;

  embeds.push({
    title:
      "Live TruckersMP VTC Members Online",

    description:
      overviewDescription,

    color:
      KINGS_COLOR
  });

  if (
    players.length === 0
  ) {
    return embeds;
  }

  // ====================================================
  // GROUP DRIVERS BY GAME + SERVER
  // ====================================================

  const groups = {};

  for (
    const player
    of players
  ) {
    const key =
      `${player.game}|||${player.server}`;

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(
      player
    );
  }

  const sortedGroups =
    Object.entries(
      groups
    ).sort(
      ([a], [b]) =>
        a.localeCompare(b)
    );

  // ====================================================
  // ONE EMBED PER ACTIVE SERVER
  // ====================================================

  for (
    const [
      key,
      serverPlayers
    ]
    of sortedGroups
  ) {
    const [
      game,
      server
    ] =
      key.split("|||");

    serverPlayers.sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );

    const driverBlocks =
      serverPlayers.map(
        player => {
          const profile =
            `https://truckersmp.com/user/${player.tmpId}`;

          const liveMap =
            `https://map.truckersmp.com/?follow=${player.tmpId}`;

          return (
            `**${player.name}**\n` +
            `${player.city}\n` +
            `TruckersMP ID: ${player.tmpId}` +
            (player.identityLinked ? ' • Kings Identity Linked' : '') + '\n' +
            `[Profile](${profile})` +
            ` • ` +
            `[Live Map](${liveMap})`
          );
        }
      );

    const separator =
      "\n\n━━━━━━━━━━━━━━\n\n";

    let description =
      driverBlocks.join(
        separator
      );

    if (
      description.length >
      4000
    ) {
      description =
        description.slice(
          0,
          3900
        ) +
        "\n\n*Additional Kings drivers are currently online.*";
    }

    const hasEventDriver =
      serverPlayers.some(
        player =>
          player.isEvent
      );

    let serverTitle =
      `${game} — ${server}`;

    if (
      hasEventDriver
    ) {
      serverTitle +=
        " — Event Server";
    }

    serverTitle +=
      ` — ${serverPlayers.length} online`;

    embeds.push({
      title:
        serverTitle,

      description,

      color:
        KINGS_COLOR
    });

    if (
      embeds.length >=
      10
    ) {
      break;
    }
  }

  return embeds;
}

// ======================================================
// CREATE / UPDATE DISCORD MESSAGE
// ======================================================

async function updateDiscordMessage(
  players
) {
  if (
    !DISCORD_WEBHOOK_URL
  ) {
    throw new Error(
      "DISCORD_WEBHOOK_URL is missing."
    );
  }

  const embeds =
    buildDiscordEmbeds(
      players
    );

  const messageId =
    getStoredDiscordMessageId();

  if (!messageId) {
    throw new Error('Live Tracker stored Discord message ID missing or invalid; refusing to create another message.');
  }

  const editUrl =
    `${DISCORD_WEBHOOK_URL}/messages/` +
    `${messageId}`;

  const response =
    await fetch(
      editUrl,
      {
        method:
          "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            content:
              "",

            embeds
          })
      }
    );

  if (response.ok) {
    console.log("");
    console.log(
      "Discord Live Tracker message updated successfully."
    );

    return messageId;
  }

  if (response.status === 404) {
    throw new Error('Live Tracker stored Discord message is missing or webhook ownership changed; refusing duplicate publication.');
  }

  throw new Error(`Live Tracker Discord update failed: HTTP ${response.status}.`);
}

// ======================================================
// SAFE PUBLIC LIVE TRACKER DIAGNOSTICS
// ======================================================

// Never print arbitrary thrown Error objects, provider payloads, player IDs,
// coordinates, Discord webhook URLs, headers or stack traces to public CI.
// Preserve the verified *coverage numbers* needed to diagnose map outages.
function publicTrackerFailureReason(error) {
  const raw=typeof error?.message==='string'?error.message:'';
  const coverage=/^Only (\d{1,3})\/(\d{1,3}) live TruckersMP server checks succeeded\./.exec(raw);
  if(coverage){
    const checked=Number(coverage[1]),total=Number(coverage[2]);
    if(total>0&&checked<=total)
      return 'Incomplete live map coverage ('+checked+'/'+total+
        ' servers); last known-good snapshot preserved.';
  }
  if(raw==='No usable online TruckersMP servers; keeping the last known good tracker state.')
    return 'No usable online TruckersMP servers; last known-good snapshot preserved.';
  if(raw==='Live Tracker stored Discord message is missing or webhook ownership changed; refusing duplicate publication.')
    return 'Stored Discord Live Tracker message missing or changed ownership; refusing duplicate post.';
  const discord=/^Live Tracker Discord update failed: HTTP ([4-5]\d\d)\.$/.exec(raw);
  if(discord)return 'Discord Live Tracker message update failed (HTTP '+discord[1]+').';
  if(error?.name==='AbortError'||error?.name==='TimeoutError')
    return 'Live Tracker provider timeout (details withheld).';
  if(error?.code==='CIRCUIT_OPEN')
    return 'Live Tracker provider circuit open (details withheld).';
  if(Number.isSafeInteger(error?.status)&&error.status>=400&&error.status<=599)
    return 'Live Tracker provider HTTP '+error.status+' (details withheld).';
  return 'Live Tracker execution or provider failure (details withheld).';
}

// ======================================================
// START TRACKER
// ======================================================

async function start() {
  const [
    kingsOnline,
    memberCount
  ] =
    await Promise.all([
      getKingsOnline(),
      getMemberCount()
    ]);

  // The private register adds an optional identityLinked display marker only.
  // It must NEVER filter Kings VTC players or change VTC membership/online totals.
  // Match only explicitly registered TruckersMP IDs via the private
  // Management-authored Kings Driver identity register. Never persist,
  // display or log the underlying Discord IDs or Kings joining dates.
  let trackedPlayers = markLinkedTruckersMpPlayers(kingsOnline, null);
  if (process.env.TRACKER_IDENTITY_SYNC_ENABLED === 'true') {
    try {
      const identity = await loadTrackerTruckersMpIdentityIndex();
      if (identity.enabled) {
        trackedPlayers = markLinkedTruckersMpPlayers(kingsOnline, identity.index);
        console.log('Live Tracker private ID matches: ' +
          trackedPlayers.filter(p => p.identityLinked).length + '/' + trackedPlayers.length);
      } else {
        console.log('Live Tracker private identity register not configured; standard display retained.');
      }
    } catch {
      // An unavailable or unsafe private register must NEVER invent matches
      // or take down the existing live player feed.
      console.warn('Private Kings identity lookup unavailable; publishing without identity markers.');
    }
  }

  console.log("");

  console.log(
    "=============================="
  );

  console.log(
    "Kings Logistics Live Tracker"
  );

  console.log(
    "=============================="
  );

  console.log(
    `Members: ${memberCount}`
  );

  console.log(
    `Online: ${kingsOnline.length}`
  );

  // Never log per-player names, locations or server presence in public CI.
  // Aggregate game totals and snapshot safety checks are logged above.

  /*
    First update the public Discord Live Tracker.

    Only after the Discord update succeeds do we save
    the shared, public-safe aggregated snapshot used
    by other Kings systems.
  */

  const discordMessageId =
    await updateDiscordMessage(
      trackedPlayers
    );

  saveLiveSnapshot(
    trackedPlayers,
    memberCount,
    discordMessageId
  );

  console.log("");

  console.log(
    "Kings Live Tracker completed successfully."
  );
}

start().catch(error => {
  console.error('Kings Live Tracker failed: '+publicTrackerFailureReason(error));
  // Public logs contain only fixed categories/coverage. Keep CI failing
  // until a genuinely complete, independently verified live scan succeeds.
  process.exit(1);
});
