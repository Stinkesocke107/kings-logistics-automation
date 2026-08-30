const KINGS_VTC_ID = 64284;

const ETS2_LOCATIONS_URL =
  "https://map.truckersmp.com/locations_ets2.min.json?v=fa63451b";

const ATS_LOCATIONS_URL =
  "https://map.truckersmp.com/locations_ats.min.json?v=6c59ff2b";

const SERVERS_URL = "https://api.truckersmp.com/v2/servers";

async function getServers() {
  const response = await fetch(SERVERS_URL);

  if (!response.ok) {
    throw new Error(`Could not load TruckersMP servers: HTTP ${response.status}`);
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

      // Active Event Servers are always included
      if (server.event === true || server.specialEvent === true) {
        return true;
      }

      // No Arcade servers
      if (server.name.toLowerCase().includes("arcade")) {
        return false;
      }

      // No Asia server
      if (server.name.toLowerCase().includes("asia")) {
        return false;
      }

      // Only our normal relevant servers
      return allowedRegularServers.includes(server.name);
    })
    .map(server => ({
      name: `${server.game} - ${server.name}`,
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
    throw new Error(`${server.name}: HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.Success || !Array.isArray(data.Data)) {
    throw new Error(`${server.name}: Invalid live tracker response`);
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
  if (!cities.length) return "Location unavailable";

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

  return nearestCity ? nearestCity.name : "Location unavailable";
}

async function main() {
  console.log("Loading city data...");

  const [ets2Cities, atsCities] = await Promise.all([
    getCities(ETS2_LOCATIONS_URL, "ETS2"),
    getCities(ATS_LOCATIONS_URL, "ATS")
  ]);

  console.log(`Loaded ${ets2Cities.length} ETS2 cities.`);
  console.log(`Loaded ${atsCities.length} ATS cities.`);
  console.log("");
const servers = await getServers();

console.log(`Loaded ${servers.length} relevant TruckersMP servers.`);

for (const server of servers) {
  console.log(
    `Server: ${server.name}${server.isEvent ? " [EVENT]" : ""}`
  );
}

console.log("");
  const kingsOnline = [];

  for (const server of servers) {
    console.log(`Checking ${server.name}...`);

    try {
      const players = await getPlayers(server);

      const kingsPlayers = players
        .filter(player => Number(player.VtcId) === KINGS_VTC_ID)
        .map(player => {
          const cities =
            server.game === "ATS" ? atsCities : ets2Cities;

          return {
            name: player.Name,
            tmpId: player.MpId,
            playerId: player.PlayerId,
            x: player.X,
            y: player.Y,
            server: server.name,
            game: server.game,
            city: getNearestCity(player.X, player.Y, cities)
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

  console.log("");
  console.log("==============================");
  console.log("Kings Logistics Live Tracker");
  console.log("==============================");
  console.log(`Online: ${kingsOnline.length}`);
  console.log("");

  if (kingsOnline.length === 0) {
    console.log(
      "No Kings Logistics members are currently online on TruckersMP."
    );
    return;
  }

const groupedServers = {};

for (const player of kingsOnline) {
  if (!groupedServers[player.server]) {
    groupedServers[player.server] = [];
  }

  groupedServers[player.server].push(player);
}

for (const [serverName, players] of Object.entries(groupedServers)) {
  console.log("");
  console.log(
    `${serverName} — ${players.length} online`
  );
  console.log("--------------------------------");

  for (const player of players) {
    console.log("");
    console.log(player.name);
    console.log(player.city);
    console.log(
      `Profile: https://truckersmp.com/user/${player.tmpId}`
    );
    console.log(
      `Live Map: https://map.truckersmp.com/?follow=${player.tmpId}`
    );
  }
}
}

main().catch(console.error);
