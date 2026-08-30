const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — STATISTICS
// ======================================================

const KINGS_VTC_ID = 64284;

const DISCORD_WEBHOOK_URL =
  process.env.STATS_DISCORD_WEBHOOK_URL;

const MEMBERS_URL =
  `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/members`;

const SERVERS_URL =
  "https://api.truckersmp.com/v2/servers";

const STATE_FILE =
  path.join(
    __dirname,
    "data",
    "statistics.json"
  );

const KINGS_COLOR =
  parseInt("182dff", 16);


// ======================================================
// HELPERS
// ======================================================

function getTodayUTC() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}


function getMonthUTC() {
  return new Date()
    .toISOString()
    .slice(0, 7);
}


function getStartOfWeekUTC() {
  const now =
    new Date();

  const day =
    now.getUTCDay();

  const difference =
    day === 0
      ? -6
      : 1 - day;

  const monday =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      )
    );

  monday.setUTCDate(
    monday.getUTCDate() +
    difference
  );

  return monday
    .toISOString()
    .slice(0, 10);
}


// ======================================================
// TRUCKERSMP MEMBERS
// ======================================================

async function getMemberCount() {
  console.log(
    "Loading Kings Logistics VTC members..."
  );

  const response =
    await fetch(
      MEMBERS_URL,
      {
        headers: {
          "Accept":
            "application/json",

          "User-Agent":
            "Kings Logistics Statistics"
        }
      }
    );


  if (!response.ok) {
    throw new Error(
      `VTC members request failed: HTTP ${response.status}`
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


  const count =
    data.response.members.length;


  console.log(
    `Kings members: ${count}`
  );


  return count;
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
      `Server request failed: HTTP ${response.status}`
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

      game:
        server.game,

      mapId:
        Number(
          server.mapid
        )
    }));
}


// ======================================================
// LIVE PLAYERS
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
    await fetch(
      url
    );


  if (!response.ok) {
    throw new Error(
      `${server.name}: HTTP ${response.status}`
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
      `${server.name}: Invalid live response`
    );
  }


  return data.Data;
}


// ======================================================
// CURRENT KINGS ONLINE
// ======================================================

async function getOnlineStatistics() {
  const servers =
    await getServers();


  console.log(
    `Checking ${servers.length} TruckersMP servers...`
  );


  const uniquePlayers =
    new Map();


  for (
    const server
    of servers
  ) {
    try {
      const players =
        await getPlayers(
          server
        );


      for (
        const player
        of players
      ) {
        if (
          Number(
            player.VtcId
          ) !== KINGS_VTC_ID
        ) {
          continue;
        }


        const tmpId =
          Number(
            player.MpId
          );


        if (
          !Number.isFinite(
            tmpId
          )
        ) {
          continue;
        }


        uniquePlayers.set(
          tmpId,
          {
            tmpId,
            game:
              server.game,
            server:
              server.name
          }
        );
      }
    } catch (error) {
      console.error(
        `Skipped ${server.name}: ${error.message}`
      );
    }
  }


  const players =
    Array.from(
      uniquePlayers.values()
    );


  const ets2 =
    players.filter(
      player =>
        player.game === "ETS2"
    ).length;


  const ats =
    players.filter(
      player =>
        player.game === "ATS"
    ).length;


  console.log(
    `Currently online: ${players.length}`
  );

  console.log(
    `ETS2: ${ets} | ATS: ${ats}`
  );


  return {
    total:
      players.length,

    ets2,
    ats
  };
}


// ======================================================
// LOAD / CREATE STATISTICS STATE
// ======================================================

function loadState() {
  if (
    !fs.existsSync(
      STATE_FILE
    )
  ) {
    return {
      discordMessageId:
        null,

      days:
        []
    };
  }


  try {
    const raw =
      fs.readFileSync(
        STATE_FILE,
        "utf8"
      );


    const state =
      JSON.parse(
        raw
      );


    if (
      !Array.isArray(
        state.days
      )
    ) {
      state.days = [];
    }


    return state;
  } catch (error) {
    console.error(
      "Could not read statistics state."
    );


    return {
      discordMessageId:
        null,

      days:
        []
    };
  }
}


function saveState(state) {
  const directory =
    path.dirname(
      STATE_FILE
    );


  fs.mkdirSync(
    directory,
    {
      recursive: true
    }
  );


  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      state,
      null,
      2
    ) + "\n",
    "utf8"
  );


  console.log(
    "Statistics state saved."
  );
}


// ======================================================
// UPDATE DAILY HISTORY
// ======================================================

function updateHistory(
  state,
  memberCount,
  online
) {
  const today =
    getTodayUTC();


  let day =
    state.days.find(
      item =>
        item.date === today
    );


  if (!day) {
    day = {
      date:
        today,

      startMembers:
        memberCount,

      members:
        memberCount,

      peakOnline:
        online.total,

      peakETS2:
        online.ets2,

      peakATS:
        online.ats
    };


    state.days.push(
      day
    );
  } else {
    day.members =
      memberCount;


    day.peakOnline =
      Math.max(
        day.peakOnline || 0,
        online.total
      );


    day.peakETS2 =
      Math.max(
        day.peakETS2 || 0,
        online.ets2
      );


    day.peakATS =
      Math.max(
        day.peakATS || 0,
        online.ats
      );
  }


  /*
    Keep approximately two years
    of daily statistics.
  */

  if (
    state.days.length >
    730
  ) {
    state.days =
      state.days.slice(
        -730
      );
  }


  return day;
}


// ======================================================
// GROWTH
// ======================================================

function getGrowth(
  state,
  memberCount
) {
  const today =
    getTodayUTC();

  const weekStart =
    getStartOfWeekUTC();

  const month =
    getMonthUTC();


  const todayEntry =
    state.days.find(
      item =>
        item.date === today
    );


  const weekEntry =
    state.days.find(
      item =>
        item.date >= weekStart
    );


  const monthEntry =
    state.days.find(
      item =>
        item.date.startsWith(
          month
        )
    );


  const todayStart =
    todayEntry
      ? todayEntry.startMembers
      : memberCount;


  const weekStartMembers =
    weekEntry
      ? weekEntry.startMembers
      : memberCount;


  const monthStartMembers =
    monthEntry
      ? monthEntry.startMembers
      : memberCount;


  return {
    today:
      memberCount -
      todayStart,

    week:
      memberCount -
      weekStartMembers,

    month:
      memberCount -
      monthStartMembers
  };
}


// ======================================================
// PEAKS
// ======================================================

function getPeaks(
  state,
  currentDay
) {
  const weekStart =
    getStartOfWeekUTC();

  const month =
    getMonthUTC();


  const weekDays =
    state.days.filter(
      item =>
        item.date >=
        weekStart
    );


  const monthDays =
    state.days.filter(
      item =>
        item.date.startsWith(
          month
        )
    );


  const weeklyPeak =
    Math.max(
      0,
      ...weekDays.map(
        item =>
          item.peakOnline || 0
      )
    );


  const monthlyPeak =
    Math.max(
      0,
      ...monthDays.map(
        item =>
          item.peakOnline || 0
      )
    );


  return {
    daily:
      currentDay.peakOnline || 0,

    weekly:
      weeklyPeak,

    monthly:
      monthlyPeak
  };
}


// ======================================================
// FORMAT NUMBERS
// ======================================================

function formatGrowth(
  value
) {
  if (value > 0) {
    return `+${value}`;
  }

  return String(
    value
  );
}


// ======================================================
// BUILD DISCORD EMBED
// ======================================================

function buildEmbed(
  memberCount,
  online,
  growth,
  peaks
) {
  const timestamp =
    Math.floor(
      Date.now() / 1000
    );


  const description =
    `**Members**\n` +
    `**${memberCount}** TruckersMP Members\n` +
    `Today: **${formatGrowth(growth.today)}**` +
    ` • This Week: **${formatGrowth(growth.week)}**` +
    ` • This Month: **${formatGrowth(growth.month)}**\n\n` +

    `**Current Activity**\n` +
    `**${online.total}** Currently Online\n` +
    `ETS2: **${online.ets2}**` +
    ` • ATS: **${online.ats}**\n\n` +

    `**Online Peaks**\n` +
    `Today: **${peaks.daily}**` +
    ` • This Week: **${peaks.weekly}**` +
    ` • This Month: **${peaks.monthly}**\n\n` +

    `Last updated <t:${timestamp}:R>`;


  return {
    title:
      "Kings Logistics Statistics",

    description,

    color:
      KINGS_COLOR,

    footer: {
      text:
        "Kings Logistics — Connecting the world, creating friendships."
    }
  };
}


// ======================================================
// CREATE FIRST DISCORD MESSAGE
// ======================================================

async function createDiscordMessage(
  embed
) {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error(
      "STATS_DISCORD_WEBHOOK_URL is missing."
    );
  }


  const separator =
    DISCORD_WEBHOOK_URL.includes("?")
      ? "&"
      : "?";


  const url =
    `${DISCORD_WEBHOOK_URL}${separator}wait=true`;


  const response =
    await fetch(
      url,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            content:
              "",

            embeds: [
              embed
            ]
          })
      }
    );


  if (!response.ok) {
    const errorText =
      await response.text();


    throw new Error(
      `Discord create failed: HTTP ${response.status} - ${errorText}`
    );
  }


  const message =
    await response.json();


  if (!message.id) {
    throw new Error(
      "Discord did not return a message ID."
    );
  }


  console.log(
    `Statistics Discord message created: ${message.id}`
  );


  return message.id;
}


// ======================================================
// UPDATE EXISTING DISCORD MESSAGE
// ======================================================

async function updateDiscordMessage(
  messageId,
  embed
) {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error(
      "STATS_DISCORD_WEBHOOK_URL is missing."
    );
  }


  const url =
    `${DISCORD_WEBHOOK_URL}/messages/${messageId}`;


  const response =
    await fetch(
      url,
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

            embeds: [
              embed
            ]
          })
      }
    );


  if (!response.ok) {
    const errorText =
      await response.text();


    throw new Error(
      `Discord update failed: HTTP ${response.status} - ${errorText}`
    );
  }


  console.log(
    "Statistics Discord message updated successfully."
  );
}


// ======================================================
// START
// ======================================================

async function start() {
  console.log(
    "=================================="
  );

  console.log(
    "Kings Logistics Statistics"
  );

  console.log(
    "=================================="
  );

  console.log("");


  const [
    memberCount,
    online
  ] =
    await Promise.all([
      getMemberCount(),
      getOnlineStatistics()
    ]);


  const state =
    loadState();


  const currentDay =
    updateHistory(
      state,
      memberCount,
      online
    );


  const growth =
    getGrowth(
      state,
      memberCount
    );


  const peaks =
    getPeaks(
      state,
      currentDay
    );


  const embed =
    buildEmbed(
      memberCount,
      online,
      growth,
      peaks
    );


  if (
    !state.discordMessageId
  ) {
    console.log("");
    console.log(
      "No Statistics Discord message exists yet."
    );


    state.discordMessageId =
      await createDiscordMessage(
        embed
      );
  } else {
    await updateDiscordMessage(
      state.discordMessageId,
      embed
    );
  }


  saveState(
    state
  );


  console.log("");
  console.log(
    "Kings Statistics completed successfully."
  );
}


start().catch(error => {
  console.error("");

  console.error(
    "Kings Statistics failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
