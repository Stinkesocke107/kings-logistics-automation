const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — LIVE TRACKER
// CENTRAL LIVE DATA SOURCE
// ======================================================

const KINGS_VTC_ID = 64284;

const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL;

const DISCORD_MESSAGE_ID =
  process.env.DISCORD_MESSAGE_ID;

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

// ======================================================
// KINGS MEMBER COUNT
// ======================================================

async function getMemberCount() {
  const response =
    await fetch(
      MEMBERS_URL
    );

  if (!response.ok) {
    throw new Error(
      `Could not load Kings VTC members: HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    !data.response ||
    !Array.isArray(
      data.response.members
    )
  ) {
    throw new Error(
      "Invalid TruckersMP VTC members response."
    );
  }

  return data.response.members.length;
}

// ======================================================
// TRUCKERSMP SERVERS
// ======================================================

async function getServers() {
  const response =
    await fetch(
      SERVERS_URL
    );

  if (!response.ok) {
    throw new Error(
      `Could not load TruckersMP servers: HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    !Array.isArray(
      data.response
    )
  ) {
    throw new Error(
      "Invalid TruckersMP server response"
    );
  }

  return data.response
    .filter(server => {
      if (!server.online) {
        return false;
      }

      const mapId =
        Number(
          server.mapid
        );

      return Number.isFinite(
        mapId
      );
    })
    .map(server => ({
      name:
        server.name,

      mapId:
        Number(
          server.mapid
        ),

      game:
        server.game,

      isEvent:
        server.event === true ||
        server.specialEvent === true
    }))
    .sort((a, b) => {
      const gameCompare =
        String(
          a.game
        ).localeCompare(
          String(
            b.game
          )
        );

      if (
        gameCompare !== 0
      ) {
        return gameCompare;
      }

      return a.name.localeCompare(
        b.name
      );
    });
}

// ======================================================
// LIVE PLAYER DATA
// ======================================================

async function getPlayers(server) {
  const url =
    `https://tracker.ets2map.com/v3/area` +
    `?x1=-1000000` +
    `&y1=1000000` +
    `&x2=1000000` +
    `&y2=-1000000` +
    `&server=${server.mapId}`;

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `${server.game} - ${server.name}: HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    !data.Success ||
    !Array.isArray(
      data.Data
    )
  ) {
    throw new Error(
      `${server.game} - ${server.name}: Invalid live response`
    );
  }

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
  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Could not load ${game} locations: HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  return collectCities(
    data
  );
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
  console.log(
    "Loading city data..."
  );

  const [
    ets2Cities,
    atsCities
  ] =
    await Promise.all([
      getCities(
        ETS2_LOCATIONS_URL,
        "ETS2"
      ),

      getCities(
        ATS_LOCATIONS_URL,
        "ATS"
      )
    ]);

  console.log(
    `Loaded ${ets2Cities.length} ETS2 cities.`
  );

  console.log(
    `Loaded ${atsCities.length} ATS cities.`
  );

  const servers =
    await getServers();

  console.log("");

  console.log(
    `Loaded ${servers.length} online TruckersMP servers.`
  );

  const kingsOnline = [];

  for (
    const server
    of servers
  ) {
    console.log(
      `Checking ${server.game} - ${server.name}...`
    );

    try {
      const players =
        await getPlayers(
          server
        );

      const kingsPlayers =
        players
          .filter(
            player =>
              Number(
                player.VtcId
              ) ===
              KINGS_VTC_ID
          )
          .map(player => {
            let cities = [];

            if (
              server.game ===
              "ATS"
            ) {
              cities =
                atsCities;
            } else if (
              server.game ===
              "ETS2"
            ) {
              cities =
                ets2Cities;
            }

            return {
              name:
                player.Name,

              tmpId:
                Number(
                  player.MpId
                ),

              game:
                server.game,

              server:
                server.name,

              city:
                cities.length > 0
                  ? getNearestCity(
                      player.X,
                      player.Y,
                      cities
                    )
                  : "Location unavailable",

              isEvent:
                server.isEvent
            };
          });

      kingsOnline.push(
        ...kingsPlayers
      );

      console.log(
        `Found ${kingsPlayers.length} Kings member(s).`
      );
    } catch (error) {
      /*
        One broken TruckersMP server must
        not stop the complete Live Tracker.
      */

      console.error(
        `Skipped server: ${error.message}`
      );
    }
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

  return Array.from(
    uniquePlayers.values()
  );
}

// ======================================================
// BUILD CENTRAL LIVE SNAPSHOT
// ======================================================

function buildLiveSnapshot(
  players,
  members
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

  return {
    version:
      1,

    updatedAt:
      nowISO(),

    members,

    online:
      players.length,

    ets2Online,

    atsOnline,

    activeServers,

    players:
      players
        .map(player => ({
          tmpId:
            player.tmpId,

          name:
            player.name,

          game:
            player.game,

          server:
            player.server,

          city:
            player.city,

          isEvent:
            player.isEvent
        }))
        .sort(
          (a, b) =>
            a.name.localeCompare(
              b.name
            )
        )
  };
}

function saveLiveSnapshot(
  players,
  members
) {
  const snapshot =
    buildLiveSnapshot(
      players,
      members
    );

  writeJson(
    SNAPSHOT_FILE,
    snapshot
  );

  console.log("");

  console.log(
    "Central Live Snapshot saved."
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
// UPDATE EXISTING DISCORD MESSAGE
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

  if (
    !DISCORD_MESSAGE_ID
  ) {
    throw new Error(
      "DISCORD_MESSAGE_ID is missing."
    );
  }

  const editUrl =
    `${DISCORD_WEBHOOK_URL}/messages/` +
    `${DISCORD_MESSAGE_ID}`;

  const embeds =
    buildDiscordEmbeds(
      players
    );

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

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Discord update failed: ` +
      `HTTP ${response.status} - ` +
      `${errorText}`
    );
  }

  console.log("");

  console.log(
    "Discord Live Tracker message updated successfully."
  );
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

  for (
    const player
    of kingsOnline
  ) {
    console.log(
      `${player.name} | ` +
      `${player.game} | ` +
      `${player.server} | ` +
      `${player.city}`
    );
  }

  /*
    First update the public Live Tracker.
    Only after that succeeds do we save the
    shared snapshot used by other systems.
  */

  await updateDiscordMessage(
    kingsOnline
  );

  saveLiveSnapshot(
    kingsOnline,
    memberCount
  );

  console.log("");

  console.log(
    "Kings Live Tracker completed successfully."
  );
}

start().catch(error => {
  console.error("");

  console.error(
    "Kings Live Tracker failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
