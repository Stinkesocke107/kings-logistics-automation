const KINGS_VTC_ID = 64284;

const servers = [
  { name: "ETS2 - Simulation 1", mapId: 2, game: "ETS2" },
  { name: "ETS2 - Simulation 2", mapId: 41, game: "ETS2" },
  { name: "ETS2 - [US] Simulation", mapId: 15, game: "ETS2" },
  { name: "ETS2 - ProMods", mapId: 50, game: "ETS2" },
  { name: "ATS - Simulation", mapId: 8, game: "ATS" },
  { name: "ATS - [US] Simulation", mapId: 10, game: "ATS" }
];

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
      `${server.name}: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!data.Success || !Array.isArray(data.Data)) {
    throw new Error(
      `${server.name}: Invalid live tracker response`
    );
  }

  return data.Data;
}

async function main() {
  const kingsOnline = [];

  for (const server of servers) {
    console.log(`Checking ${server.name}...`);

    try {
      const players = await getPlayers(server);

      const kingsPlayers = players
        .filter(player => Number(player.VtcId) === KINGS_VTC_ID)
        .map(player => ({
          name: player.Name,
          tmpId: player.MpId,
          playerId: player.PlayerId,
          x: player.X,
          y: player.Y,
          server: server.name,
          game: server.game
        }));

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
      "No Kings Logistics members are currently online."
    );
    return;
  }

  for (const player of kingsOnline) {
    console.log(
      `${player.name} | ${player.game} | ${player.server} | TMP ID: ${player.tmpId}`
    );
  }
}

main().catch(console.error);
