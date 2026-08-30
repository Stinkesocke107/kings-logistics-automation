const KINGS_VTC_ID = 64284;

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_MESSAGE_ID = process.env.DISCORD_MESSAGE_ID;

const SERVERS_URL = "https://api.truckersmp.com/v2/servers";

const ETS2_LOCATIONS_URL =
  "https://map.truckersmp.com/locations_ets2.min.json";

const ATS_LOCATIONS_URL =
  "https://map.truckersmp.com/locations_ats.min.json";

const KINGS_COLOR = parseInt("182dff", 16);


// ======================================================
// TRUCKERSMP SERVERS
// ======================================================

async function getServers() {
  const response = await fetch(SERVERS_URL);

  if (!response.ok) {
    throw new Error(
      `Could not load TruckersMP servers: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data.response)) {
    throw new Error("Invalid TruckersMP server response");
  }

  /*
    Every currently online TruckersMP server is included.

    This means automatically:
    - Simulation
    - Simulation 2
    - US Simulation
    - Asia / SGP
    - Arcade
    - ProMods
    - ProMods Arcade
    - ATS
    - Event Servers
    - Future TruckersMP servers

    No manual server list is required.
  */

  return data.response
    .filter(server => {
      if (!server.online) {
        return false;
      }

      const mapId = Number(server.mapid);

      if (!Number.isFinite(mapId)) {
        return false;
      }

      return true;
    })
    .map(server => ({
      name: server.name,
      mapId: Number(server.mapid),
      game: server.game,
      isEvent:
        server.event === true ||
        server.specialEvent === true
    }))
    .sort((a, b) => {
      const gameCompare =
        String(a.game).localeCompare(String(b.game));

      if (gameCompare !== 0) {
        return gameCompare;
      }

      return a.name.localeCompare(b.name);
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

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `${server.game} - ${server.name}: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!data.Success || !Array.isArray(data.Data)) {
    throw new Error(
      `${server.game} - ${server.name}: Invalid live response`
    );
  }

  return data.Data;
}


// ======================================================
// CITY / LOCATION DATA
// ======================================================

function collectCities(items, cities = []) {
  if (!Array.isArray(items)) {
    return cities;
  }

  for (const item of items) {
    if (
      item.type === "city" &&
      typeof item.x === "number" &&
      typeof item.y === "number"
    ) {
      cities.push({
        name: item.name,
        x: item.x,
        y: item.y
      });
    }

    if (Array.isArray(item.pois)) {
      collectCities(item.pois, cities);
    }
  }

  return cities;
}


async function getCities(url, game) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Could not load ${game} locations: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  return collectCities(data);
}


function getNearestCity(x, y, cities) {
  if (!cities.length) {
    return "Location unavailable";
  }

  let nearestCity = null;
  let nearestDistance = Infinity;

  for (const city of cities) {
    const dx = x - city.x;
    const dy = y - city.y;

    const distance =
      dx * dx +
      dy * dy;

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCity = city;
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
  console.log("Loading city data...");

  const [ets2Cities, atsCities] =
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

  const servers = await getServers();

  console.log("");
  console.log(
    `Loaded ${servers.length} online TruckersMP servers.`
  );

  for (const server of servers) {
    console.log(
      `Server: ${server.game} - ${server.name}` +
      `${server.isEvent ? " [EVENT]" : ""}`
    );
  }

  console.log("");

  const kingsOnline = [];

  for (const server of servers) {
    console.log(
      `Checking ${server.game} - ${server.name}...`
    );

    try {
      const players = await getPlayers(server);

      const kingsPlayers = players
        .filter(
          player =>
            Number(player.VtcId) ===
            KINGS_VTC_ID
        )
        .map(player => {
          let cities = [];

          if (server.game === "ATS") {
            cities = atsCities;
          } else if (server.game === "ETS2") {
            cities = ets2Cities;
          }

          return {
            name: player.Name,
            tmpId: Number(player.MpId),
            game: server.game,
            server: server.name,

            city:
              cities.length > 0
                ? getNearestCity(
                    player.X,
                    player.Y,
                    cities
                  )
                : "Location unavailable",

            isEvent: server.isEvent
          };
        });

      kingsOnline.push(...kingsPlayers);

      console.log(
        `Found ${kingsPlayers.length} Kings member(s).`
      );
    } catch (error) {
      /*
        If one TruckersMP server fails,
        the complete Kings tracker continues.
      */

      console.error(
        `Skipped server: ${error.message}`
      );
    }
  }

  /*
    Prevent duplicate drivers if the live API
    should ever return the same TMP ID twice.
  */

  const uniquePlayers = new Map();

  for (const player of kingsOnline) {
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
// DISCORD EMBEDS
// ======================================================

function buildDiscordEmbeds(players) {
  const ets2Count =
    players.filter(
      player => player.game === "ETS2"
    ).length;

  const atsCount =
    players.filter(
      player => player.game === "ATS"
    ).length;

  /*
    Discord renders this timestamp automatically
    in each Discord user's own timezone.

    :R = relative display:
    "a few seconds ago"
    "2 minutes ago"
    etc.
  */

  const timestamp =
    Math.floor(Date.now() / 1000);

  const embeds = [];


  // ====================================================
  // EMBED 1 — OVERVIEW
  // ====================================================

  let overviewDescription =
    "See which **Kings Logistics Family** members " +
    "are currently online on TruckersMP.\n\n";

  if (players.length === 0) {
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


  /*
    If nobody is online, only the overview
    embed is needed.
  */

  if (players.length === 0) {
    return embeds;
  }


  // ====================================================
  // GROUP DRIVERS BY GAME + SERVER
  // ====================================================

  const groups = {};

  for (const player of players) {
    const key =
      `${player.game}|||${player.server}`;

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(player);
  }


  /*
    Sort server groups alphabetically.
  */

  const sortedGroups =
    Object.entries(groups).sort(
      ([a], [b]) =>
        a.localeCompare(b)
    );


  // ====================================================
  // ONE EMBED PER ACTIVE KINGS SERVER
  // ====================================================

  for (
    const [key, serverPlayers]
    of sortedGroups
  ) {
    const [game, server] =
      key.split("|||");


    /*
      Drivers are sorted alphabetically.
    */

    serverPlayers.sort(
      (a, b) =>
        a.name.localeCompare(b.name)
    );


    /*
      Driver layout:

      DriverName
      City
      Profile • Live Map
    */

    const driverBlocks =
      serverPlayers.map(player => {
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
      });


    /*
      Clean separator only BETWEEN drivers.
    */

    const separator =
      "\n\n━━━━━━━━━━━━━━\n\n";

    let description =
      driverBlocks.join(separator);


    /*
      Protection against Discord's
      embed description limit.
    */

    if (description.length > 4000) {
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


    /*
      Event Server automatically receives
      an Event Server indicator.
    */

    if (hasEventDriver) {
      serverTitle +=
        " — Event Server";
    }


    serverTitle +=
      ` — ${serverPlayers.length} online`;


    embeds.push({
      title:
        serverTitle,

      description:
        description,

      color:
        KINGS_COLOR
    });


    /*
      Discord allows a maximum of
      10 embeds inside one message.
    */

    if (embeds.length >= 10) {
      break;
    }
  }

  return embeds;
}


// ======================================================
// UPDATE EXISTING DISCORD MESSAGE
// ======================================================

async function updateDiscordMessage(players) {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error(
      "DISCORD_WEBHOOK_URL is missing."
    );
  }

  if (!DISCORD_MESSAGE_ID) {
    throw new Error(
      "DISCORD_MESSAGE_ID is missing."
    );
  }


  /*
    PATCH /messages/MESSAGE_ID

    This is important:
    We DO NOT create a new Discord message.

    The same Kings Live Tracker message is
    updated every time.
  */

  const editUrl =
    `${DISCORD_WEBHOOK_URL}/messages/` +
    `${DISCORD_MESSAGE_ID}`;


  const embeds =
    buildDiscordEmbeds(players);


  const response =
    await fetch(editUrl, {
      method: "PATCH",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        content: "",
        embeds: embeds
      })
    });


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
  const kingsOnline =
    await getKingsOnline();


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


  await updateDiscordMessage(
    kingsOnline
  );
}


start().catch(error => {
  console.error(error);

  process.exit(1);
});
