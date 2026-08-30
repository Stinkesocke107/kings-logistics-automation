const KINGS_VTC_ID = 64284;

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_MESSAGE_ID = process.env.DISCORD_MESSAGE_ID;

const SERVERS_URL = "https://api.truckersmp.com/v2/servers";

const ETS2_LOCATIONS_URL =
  "https://map.truckersmp.com/locations_ets2.min.json";

const ATS_LOCATIONS_URL =
  "https://map.truckersmp.com/locations_ats.min.json";

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

  const allowedRegularServers = [
    "Simulation",
    "Simulation 1",
    "Simulation 2",
    "[US] Simulation",
    "ProMods"
  ];

  return data.response
    .filter(server => {
      if (!server.online) return false;

      // Event Servers immer automatisch mitnehmen
      if (server.event === true || server.specialEvent === true) {
        return true;
      }

      // Arcade ignorieren
      if (server.name.toLowerCase().includes("arcade")) {
        return false;
      }

      // Asia ignorieren
      if (server.name.toLowerCase().includes("asia")) {
        return false;
      }

      return allowedRegularServers.includes(server.name);
    })
    .map(server => ({
      name: server.name,
      mapId: server.mapid,
      game: server.game,
      isEvent: server.event === true || server.specialEvent === true
    }));
}

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

function collectCities(items, cities = []) {
  if (!Array.isArray(items)) return cities;

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

    const distance = dx * dx + dy * dy;

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCity = city;
    }
  }

  return nearestCity
    ? nearestCity.name
    : "Location unavailable";
}

async function getKingsOnline() {
  console.log("Loading city data...");

  const [ets2Cities, atsCities] = await Promise.all([
    getCities(ETS2_LOCATIONS_URL, "ETS2"),
    getCities(ATS_LOCATIONS_URL, "ATS")
  ]);

  console.log(`Loaded ${ets2Cities.length} ETS2 cities.`);
  console.log(`Loaded ${atsCities.length} ATS cities.`);

  const servers = await getServers();

  console.log(
    `Loaded ${servers.length} relevant TruckersMP servers.`
  );

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
            Number(player.VtcId) === KINGS_VTC_ID
        )
        .map(player => {
          const cities =
            server.game === "ATS"
              ? atsCities
              : ets2Cities;

          return {
            name: player.Name,
            tmpId: player.MpId,
            game: server.game,
            server: server.name,
            city: getNearestCity(
              player.X,
              player.Y,
              cities
            )
          };
        });

      kingsOnline.push(...kingsPlayers);

      console.log(
        `Found ${kingsPlayers.length} Kings member(s).`
      );
    } catch (error) {
      console.error(error.message);
    }
  }

  return kingsOnline;
}

function buildDiscordEmbed(players) {
  const ets2Count =
    players.filter(player => player.game === "ETS2")
      .length;

  const atsCount =
    players.filter(player => player.game === "ATS")
      .length;

  const fields = [];

  if (players.length === 0) {
    fields.push({
      name: "Currently Online",
      value:
        "No Kings Logistics members are currently online on TruckersMP.",
      inline: false
    });
  } else {
    const groups = {};

    for (const player of players) {
      const key = `${player.game}|||${player.server}`;

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(player);
    }

    for (const [key, serverPlayers] of Object.entries(groups)) {
      const [game, server] = key.split("|||");

      let value = "";

      for (const player of serverPlayers) {
        const profile =
          `https://truckersmp.com/user/${player.tmpId}`;

        const liveMap =
          `https://map.truckersmp.com/?follow=${player.tmpId}`;

        const playerText =
          `**${player.name}**\n` +
          `${player.city}\n` +
          `[Profile](${profile}) • ` +
          `[Live Map](${liveMap})\n\n`;

        // Discord Embed Field Limit absichern
        if ((value + playerText).length > 1000) {
          value +=
            "\n*More Kings drivers are online on this server.*";
          break;
        }

        value += playerText;
      }

      fields.push({
        name:
          `${game} — ${server} — ` +
          `${serverPlayers.length} online`,
        value: value.trim(),
        inline: false
      });
    }
  }

  const now =
    new Date().toISOString().slice(11, 16);

  return {
    title:
      "Kings Logistics — TruckersMP Live Tracker",

    description:
      `**${players.length} Kings member${
        players.length === 1 ? "" : "s"
      } currently online**`,

    fields,

    footer: {
      text:
        `ETS2: ${ets2Count} • ATS: ${atsCount}` +
        ` • Last updated: ${now} UTC`
    }
  };
}

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

  const editUrl =
    `${DISCORD_WEBHOOK_URL}/messages/` +
    `${DISCORD_MESSAGE_ID}`;

  const embed = buildDiscordEmbed(players);

  const response = await fetch(editUrl, {
    method: "PATCH",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      content: "",
      embeds: [embed]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Discord update failed: ` +
      `HTTP ${response.status} - ${errorText}`
    );
  }

  console.log(
    "Discord Live Tracker message updated successfully."
  );
}

async function start() {
  const kingsOnline = await getKingsOnline();

  console.log("");
  console.log("==============================");
  console.log("Kings Logistics Live Tracker");
  console.log("==============================");
  console.log(`Online: ${kingsOnline.length}`);

  for (const player of kingsOnline) {
    console.log(
      `${player.name} | ` +
      `${player.game} | ` +
      `${player.server} | ` +
      `${player.city}`
    );
  }

  await updateDiscordMessage(kingsOnline);
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
