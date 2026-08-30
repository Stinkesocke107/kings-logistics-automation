const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — STATISTICS SNAPSHOT
// ======================================================

const KINGS_VTC_ID = 64284;

const MEMBERS_URL =
  `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/members`;

const SERVERS_URL =
  "https://api.truckersmp.com/v2/servers";

const LIVE_MAP_URL =
  "https://tracker.ets2map.com/v3/area";

const SNAPSHOT_FILE =
  path.join(
    __dirname,
    "data",
    "statistics-snapshot.json"
  );

// ======================================================
// HELPERS
// ======================================================

function nowISO() {
  return new Date().toISOString();
}

function writeJson(file, data) {
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

async function fetchJson(
  url,
  label
) {
  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "Kings Logistics Statistics Snapshot"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `${label} failed: HTTP ${response.status}`
    );
  }

  return response.json();
}

// ======================================================
// MEMBERS
// ======================================================

async function getMemberCount() {
  const data =
    await fetchJson(
      MEMBERS_URL,
      "TruckersMP VTC members request"
    );

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
// SERVERS
// ======================================================

async function getServers() {
  const data =
    await fetchJson(
      SERVERS_URL,
      "TruckersMP servers request"
    );

  if (
    !Array.isArray(
      data.response
    )
  ) {
    throw new Error(
      "Invalid TruckersMP servers response."
    );
  }

  return data.response.filter(
    server =>
      server.online === true &&
      Number.isFinite(
        Number(server.mapid)
      )
  );
}

// ======================================================
// LIVE PLAYERS
// ======================================================

async function getKingsPlayers(
  server
) {
  const params =
    new URLSearchParams({
      x1: "-1000000",
      y1: "1000000",
      x2: "1000000",
      y2: "-1000000",
      server: String(
        server.mapid
      )
    });

  const data =
    await fetchJson(
      `${LIVE_MAP_URL}?${params.toString()}`,
      `Live map request for ${server.name}`
    );

  let players = [];

  if (Array.isArray(data)) {
    players = data;
  } else if (
    Array.isArray(
      data.players
    )
  ) {
    players =
      data.players;
  } else if (
    Array.isArray(
      data.response
    )
  ) {
    players =
      data.response;
  }

  return players.filter(
    player =>
      Number(
        player.VtcId
      ) ===
      KINGS_VTC_ID
  );
}

// ======================================================
// ACTIVITY
// ======================================================

async function getActivity() {
  const servers =
    await getServers();

  const results =
    await Promise.all(
      servers.map(
        async server => ({
          server,
          players:
            await getKingsPlayers(
              server
            )
        })
      )
    );

  const uniquePlayers =
    new Map();

  let ets2 =
    0;

  let ats =
    0;

  const activeServers = [];

  for (
    const result
    of results
  ) {
    const game =
      String(
        result.server.game || ""
      ).toUpperCase();

    const count =
      result.players.length;

    if (game === "ETS2") {
      ets2 +=
        count;
    }

    if (game === "ATS") {
      ats +=
        count;
    }

    if (
      count > 0
    ) {
      activeServers.push({
        game,

        name:
          String(
            result.server.name ||
            result.server.shortname ||
            "Unknown Server"
          ),

        online:
          count
      });
    }

    for (
      const player
      of result.players
    ) {
      const tmpId =
        Number(
          player.MpId ||
          player.mpId ||
          player.id
        );

      const key =
        Number.isFinite(
          tmpId
        )
          ? String(tmpId)
          : `${result.server.mapid}:${player.Name}`;

      uniquePlayers.set(
        key,
        true
      );
    }
  }

  activeServers.sort(
    (a, b) =>
      b.online -
        a.online ||
      a.name.localeCompare(
        b.name
      )
  );

  return {
    totalOnline:
      uniquePlayers.size,

    ets2,

    ats,

    activeServers
  };
}

// ======================================================
// MAIN
// ======================================================

async function start() {
  console.log(
    "===================================="
  );

  console.log(
    "Kings Logistics Statistics Snapshot"
  );

  console.log(
    "===================================="
  );

  console.log("");

  const [
    members,
    activity
  ] =
    await Promise.all([
      getMemberCount(),
      getActivity()
    ]);

  const snapshot = {
    updatedAt:
      nowISO(),

    members,

    online:
      activity.totalOnline,

    ets2Online:
      activity.ets2,

    atsOnline:
      activity.ats,

    activeServers:
      activity.activeServers
  };

  writeJson(
    SNAPSHOT_FILE,
    snapshot
  );

  console.log(
    `Members: ${members}`
  );

  console.log(
    `Currently Online: ${activity.totalOnline}`
  );

  console.log(
    `ETS2: ${activity.ets2}`
  );

  console.log(
    `ATS: ${activity.ats}`
  );

  console.log(
    `Active Servers: ${activity.activeServers.length}`
  );

  console.log("");

  console.log(
    "Statistics snapshot saved successfully."
  );
}

start().catch(error => {
  console.error("");

  console.error(
    "Statistics Snapshot failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
