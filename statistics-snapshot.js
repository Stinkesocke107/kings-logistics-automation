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

// ======================================================
// MEMBERS
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
      "Invalid TruckersMP server response."
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

      return String(
        a.name
      ).localeCompare(
        String(
          b.name
        )
      );
    });
}

// ======================================================
// LIVE PLAYER DATA
// ======================================================

async function getPlayers(server) {
  const url =
    `${LIVE_MAP_URL}` +
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

  /*
    IMPORTANT:

    Same format used by the working
    Kings Live Tracker:

    {
      Success: true,
      Data: [...]
    }
  */

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
// CURRENT KINGS ACTIVITY
// ======================================================

async function getActivity() {
  const servers =
    await getServers();

  console.log(
    `Online TruckersMP servers: ${servers.length}`
  );

  const uniquePlayers =
    new Map();

  const activeServers =
    [];

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
        players.filter(
          player =>
            Number(
              player.VtcId
            ) ===
            KINGS_VTC_ID
        );

      console.log(
        `Found ${kingsPlayers.length} Kings member(s).`
      );

      if (
        kingsPlayers.length > 0
      ) {
        activeServers.push({
          game:
            String(
              server.game
            ),

          name:
            String(
              server.name
            ),

          online:
            kingsPlayers.length,

          isEvent:
            server.isEvent
        });
      }

      for (
        const player
        of kingsPlayers
      ) {
        const tmpId =
          Number(
            player.MpId
          );

        const key =
          Number.isFinite(
            tmpId
          )
            ? String(
                tmpId
              )
            : `${server.mapId}:${player.Name}`;

        uniquePlayers.set(
          key,
          {
            tmpId:
              Number.isFinite(
                tmpId
              )
                ? tmpId
                : null,

            name:
              player.Name,

            game:
              String(
                server.game
              ).toUpperCase(),

            server:
              server.name
          }
        );
      }
    } catch (error) {
      /*
        Same safety principle as the Live Tracker:
        one broken server must not stop the
        complete Kings snapshot.
      */

      console.error(
        `Skipped server: ${error.message}`
      );
    }
  }

  const unique =
    Array.from(
      uniquePlayers.values()
    );

  const ets2 =
    unique.filter(
      player =>
        player.game ===
        "ETS2"
    ).length;

  const ats =
    unique.filter(
      player =>
        player.game ===
        "ATS"
    ).length;

  activeServers.sort(
    (a, b) =>
      b.online -
        a.online ||
      `${a.game} ${a.name}`.localeCompare(
        `${b.game} ${b.name}`
      )
  );

  return {
    totalOnline:
      unique.length,

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

  console.log("");
  console.log(
    "=============================="
  );

  console.log(
    "Statistics Snapshot Summary"
  );

  console.log(
    "=============================="
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

  for (
    const server
    of activity.activeServers
  ) {
    console.log(
      `${server.game} - ${server.name}: ${server.online} online`
    );
  }

  console.log("");

  console.log(
    "Statistics snapshot saved successfully."
  );
}

// ======================================================
// START
// ======================================================

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
