const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — ADVANCED STATISTICS
// ======================================================

const KINGS_VTC_ID = 64284;
const KINGS_BLUE = 0x182dff;

const HISTORY_RETENTION_DAYS = 730;

const MEMBERS_URL =
  `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/members`;

const SERVERS_URL =
  "https://api.truckersmp.com/v2/servers";

const LIVE_MAP_URL =
  "https://tracker.ets2map.com/v3/area";

const DISCORD_WEBHOOK_URL =
  process.env.STATS_DISCORD_WEBHOOK_URL;

const STATE_FILE =
  path.join(
    __dirname,
    "data",
    "statistics.json"
  );

const DRIVER_HISTORY_FILE =
  path.join(
    __dirname,
    "data",
    "driver-history.json"
  );

const DAY_MS =
  24 * 60 * 60 * 1000;

// ======================================================
// HELPERS
// ======================================================

function nowISO() {
  return new Date().toISOString();
}

function ensureDataDirectory() {
  fs.mkdirSync(
    path.dirname(STATE_FILE),
    {
      recursive: true
    }
  );
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
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

function writeJson(file, data) {
  ensureDataDirectory();

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

function number(value, fallback = 0) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

function dateKey(date) {
  return date
    .toISOString()
    .slice(0, 10);
}

function startOfDay(
  date = new Date()
) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    )
  );
}

function startOfWeek(
  date = new Date()
) {
  const day =
    startOfDay(date);

  const daysSinceMonday =
    (
      day.getUTCDay() +
      6
    ) % 7;

  return new Date(
    day.getTime() -
    (
      daysSinceMonday *
      DAY_MS
    )
  );
}

function startOfMonth(
  date = new Date()
) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      1
    )
  );
}

function currentHourKey(
  date = new Date()
) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours()
    )
  ).toISOString();
}

function formatSigned(value) {
  const parsed =
    number(value);

  if (parsed > 0) {
    return `+${parsed}`;
  }

  return String(parsed);
}

function percent(part, total) {
  if (total <= 0) {
    return 0;
  }

  return Math.round(
    (
      part /
      total
    ) * 100
  );
}

function progressBar(value) {
  const safe =
    Math.max(
      0,
      Math.min(
        100,
        value
      )
    );

  const filled =
    Math.round(
      safe / 10
    );

  return (
    "█".repeat(filled) +
    "░".repeat(
      10 - filled
    )
  );
}

// ======================================================
// STATISTICS DATA
// ======================================================

function normalizeDay(entry) {
  return {
    date:
      String(
        entry.date || ""
      ),

    startMembers:
      number(
        entry.startMembers,
        number(entry.members)
      ),

    members:
      number(
        entry.members
      ),

    peakOnline:
      number(
        entry.peakOnline
      ),

    peakETS2:
      number(
        entry.peakETS2
      ),

    peakATS:
      number(
        entry.peakATS
      ),

    activitySamples:
      number(
        entry.activitySamples
      ),

    ets2PlayerSamples:
      number(
        entry.ets2PlayerSamples
      ),

    atsPlayerSamples:
      number(
        entry.atsPlayerSamples
      ),

    serverPlayerSamples:
      entry.serverPlayerSamples &&
      typeof entry.serverPlayerSamples ===
        "object"
        ? {
            ...entry.serverPlayerSamples
          }
        : {},

    sampledHours:
      Array.isArray(
        entry.sampledHours
      )
        ? [
            ...new Set(
              entry.sampledHours.map(
                String
              )
            )
          ]
        : []
  };
}

function loadStatistics() {
  const raw =
    readJson(
      STATE_FILE,
      null
    );

  let oldHistory = [];
  let messageId = null;
  let createdAt =
    nowISO();

  let oldAllTime = {};
  let migrated =
    false;

  if (Array.isArray(raw)) {
    oldHistory =
      raw;

    migrated =
      true;
  } else if (
    raw &&
    typeof raw ===
      "object"
  ) {
    if (
      Array.isArray(
        raw.history
      )
    ) {
      oldHistory =
        raw.history;
    } else if (
      Array.isArray(
        raw.days
      )
    ) {
      oldHistory =
        raw.days;

      migrated =
        true;
    } else {
      oldHistory =
        [];

      migrated =
        true;
    }

    messageId =
      raw.messageId ||
      raw.discordMessageId ||
      raw.discord_message_id ||
      null;

    createdAt =
      raw.createdAt ||
      createdAt;

    oldAllTime =
      raw.allTime &&
      typeof raw.allTime ===
        "object"
        ? raw.allTime
        : {};

    if (
      raw.version !==
      2
    ) {
      migrated =
        true;
    }
  } else {
    migrated =
      true;
  }

  const history =
    oldHistory
      .map(normalizeDay)
      .filter(
        entry =>
          /^\d{4}-\d{2}-\d{2}$/.test(
            entry.date
          )
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(
            b.date
          )
      );

  const previousOnlinePeak =
    Math.max(
      0,
      ...history.map(
        day =>
          day.peakOnline
      )
    );

  const previousETS2Peak =
    Math.max(
      0,
      ...history.map(
        day =>
          day.peakETS2
      )
    );

  const previousATSPeak =
    Math.max(
      0,
      ...history.map(
        day =>
          day.peakATS
      )
    );

  return {
    migrated,

    state: {
      version: 2,

      createdAt,

      updatedAt:
        raw &&
        raw.updatedAt
          ? raw.updatedAt
          : createdAt,

      messageId,

      allTime: {
        peakOnline:
          Math.max(
            number(
              oldAllTime.peakOnline
            ),
            previousOnlinePeak
          ),

        peakETS2:
          Math.max(
            number(
              oldAllTime.peakETS2
            ),
            previousETS2Peak
          ),

        peakATS:
          Math.max(
            number(
              oldAllTime.peakATS
            ),
            previousATSPeak
          )
      },

      history
    }
  };
}

// ======================================================
// HTTP REQUEST
// ======================================================

async function fetchJson(
  url,
  label
) {
  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `${label}: HTTP ${response.status}`
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
      "TruckersMP members request failed"
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
      "TruckersMP servers request failed"
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
    }));
}

// ======================================================
// LIVE MAP
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

    The TruckersMP live-map endpoint returns:

    {
      Success: true,
      Data: [...]
    }

    This is the same response handling used
    by the working Kings Live Tracker.
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

async function getLiveActivity() {
  const servers =
    await getServers();

  console.log(
    `Online TruckersMP servers checked: ${servers.length}`
  );

  const uniquePlayers =
    new Map();

  const serverCounts =
    [];

  let ets2Count = 0;
  let atsCount = 0;

  for (
    const server
    of servers
  ) {
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

      const game =
        String(
          server.game || ""
        ).toUpperCase();

      if (
        game === "ETS2"
      ) {
        ets2Count +=
          kingsPlayers.length;
      }

      if (
        game === "ATS"
      ) {
        atsCount +=
          kingsPlayers.length;
      }

      if (
        kingsPlayers.length > 0
      ) {
        serverCounts.push({
          key:
            `${game} — ${server.name}`,

          game,

          name:
            server.name,

          count:
            kingsPlayers.length,

          event:
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
            ? String(tmpId)
            : `${server.mapId}:${player.Name}`;

        uniquePlayers.set(
          key,
          player
        );
      }

      console.log(
        `${game} - ${server.name}: ${kingsPlayers.length} Kings member(s)`
      );
    } catch (error) {
      console.error(
        `Skipped server: ${error.message}`
      );
    }
  }

  serverCounts.sort(
    (a, b) =>
      b.count -
        a.count ||
      a.key.localeCompare(
        b.key
      )
  );

  return {
    totalOnline:
      uniquePlayers.size,

    ets2Count,

    atsCount,

    serverCounts
  };
}

// ======================================================
// DRIVER HISTORY
// ======================================================

function loadDriverHistory() {
  const history =
    readJson(
      DRIVER_HISTORY_FILE,
      null
    );

  if (
    !history ||
    !Array.isArray(
      history.members
    ) ||
    !Array.isArray(
      history.events
    )
  ) {
    console.warn(
      "Driver History unavailable."
    );

    return null;
  }

  return history;
}

function historyCovers(
  driverHistory,
  start
) {
  if (!driverHistory) {
    return false;
  }

  const initialized =
    normalizeDate(
      driverHistory.initializedAt
    );

  if (!initialized) {
    return false;
  }

  return (
    initialized.getTime() <=
    start.getTime()
  );
}

// ======================================================
// DRIVER MOVEMENT
// ======================================================

function getMovement(
  driverHistory,
  start,
  end
) {
  if (
    !historyCovers(
      driverHistory,
      start
    )
  ) {
    return {
      complete: false,
      joined: 0,
      left: 0,
      net: 0
    };
  }

  let joined = 0;
  let left = 0;

  for (
    const event
    of driverHistory.events
  ) {
    const date =
      normalizeDate(
        event.occurredAt ||
        event.detectedAt
      );

    if (!date) {
      continue;
    }

    if (
      date.getTime() <
        start.getTime() ||
      date.getTime() >=
        end.getTime()
    ) {
      continue;
    }

    if (
      event.type === "join"
    ) {
      joined++;
    }

    if (
      event.type === "leave"
    ) {
      left++;
    }
  }

  return {
    complete: true,
    joined,
    left,
    net:
      joined - left
  };
}

function movementLine(
  label,
  movement
) {
  if (!movement.complete) {
    return (
      `${label}: ` +
      "*collecting data*"
    );
  }

  return (
    `${label}: ` +
    `**${movement.joined} joined** • ` +
    `**${movement.left} left** • ` +
    `**${formatSigned(movement.net)} net**`
  );
}

// ======================================================
// UPDATE DAILY DATA
// ======================================================

function updateState(
  state,
  members,
  activity,
  now
) {
  let changed =
    false;

  const today =
    dateKey(now);

  let entry =
    state.history.find(
      day =>
        day.date ===
        today
    );

  if (!entry) {
    entry =
      normalizeDay({
        date:
          today,

        startMembers:
          members,

        members,

        peakOnline:
          activity.totalOnline,

        peakETS2:
          activity.ets2Count,

        peakATS:
          activity.atsCount
      });

    state.history.push(
      entry
    );

    changed =
      true;
  }

  if (
    entry.members !==
    members
  ) {
    entry.members =
      members;

    changed =
      true;
  }

  if (
    activity.totalOnline >
    entry.peakOnline
  ) {
    entry.peakOnline =
      activity.totalOnline;

    changed =
      true;
  }

  if (
    activity.ets2Count >
    entry.peakETS2
  ) {
    entry.peakETS2 =
      activity.ets2Count;

    changed =
      true;
  }

  if (
    activity.atsCount >
    entry.peakATS
  ) {
    entry.peakATS =
      activity.atsCount;

    changed =
      true;
  }

  // ====================================================
  // HOURLY ACTIVITY SAMPLE
  // ====================================================

  const hour =
    currentHourKey(now);

  if (
    !entry.sampledHours.includes(
      hour
    )
  ) {
    entry.sampledHours.push(
      hour
    );

    entry.activitySamples++;

    entry.ets2PlayerSamples +=
      activity.ets2Count;

    entry.atsPlayerSamples +=
      activity.atsCount;

    for (
      const server
      of activity.serverCounts
    ) {
      entry.serverPlayerSamples[
        server.key
      ] =
        number(
          entry.serverPlayerSamples[
            server.key
          ]
        ) +
        server.count;
    }

    changed =
      true;
  }

  // ====================================================
  // ALL-TIME RECORDS
  // ====================================================

  if (
    activity.totalOnline >
    state.allTime.peakOnline
  ) {
    state.allTime.peakOnline =
      activity.totalOnline;

    changed =
      true;
  }

  if (
    activity.ets2Count >
    state.allTime.peakETS2
  ) {
    state.allTime.peakETS2 =
      activity.ets2Count;

    changed =
      true;
  }

  if (
    activity.atsCount >
    state.allTime.peakATS
  ) {
    state.allTime.peakATS =
      activity.atsCount;

    changed =
      true;
  }

  // ====================================================
  // HISTORY RETENTION
  // ====================================================

  state.history.sort(
    (a, b) =>
      a.date.localeCompare(
        b.date
      )
  );

  const cutoff =
    dateKey(
      new Date(
        now.getTime() -
        (
          HISTORY_RETENTION_DAYS *
          DAY_MS
        )
      )
    );

  const oldLength =
    state.history.length;

  state.history =
    state.history.filter(
      day =>
        day.date >=
        cutoff
    );

  if (
    oldLength !==
    state.history.length
  ) {
    changed =
      true;
  }

  return changed;
}

// ======================================================
// PERIOD STATISTICS
// ======================================================

function entriesFrom(
  state,
  start
) {
  const key =
    dateKey(start);

  return state.history.filter(
    day =>
      day.date >= key
  );
}

function memberGrowth(
  state,
  start,
  currentMembers
) {
  const entries =
    entriesFrom(
      state,
      start
    );

  if (
    entries.length === 0
  ) {
    return 0;
  }

  return (
    currentMembers -
    number(
      entries[0].startMembers,
      currentMembers
    )
  );
}

function peakFrom(
  state,
  start,
  field
) {
  const entries =
    entriesFrom(
      state,
      start
    );

  return Math.max(
    0,
    ...entries.map(
      entry =>
        number(
          entry[field]
        )
    )
  );
}

// ======================================================
// MONTHLY ACTIVITY
// ======================================================

function getMonthlyActivity(
  state,
  monthStart
) {
  const entries =
    entriesFrom(
      state,
      monthStart
    );

  let ets2 = 0;
  let ats = 0;
  let samples = 0;

  const servers = {};

  for (
    const day
    of entries
  ) {
    ets2 +=
      number(
        day.ets2PlayerSamples
      );

    ats +=
      number(
        day.atsPlayerSamples
      );

    samples +=
      number(
        day.activitySamples
      );

    for (
      const [
        server,
        count
      ]
      of Object.entries(
        day.serverPlayerSamples ||
        {}
      )
    ) {
      servers[server] =
        number(
          servers[server]
        ) +
        number(count);
    }
  }

  const total =
    ets2 + ats;

  const ranking =
    Object.entries(
      servers
    )
      .map(
        ([server, count]) => ({
          server,
          count
        })
      )
      .sort(
        (a, b) =>
          b.count -
            a.count ||
          a.server.localeCompare(
            b.server
          )
      );

  const mostUsed =
    ranking[0] ||
    null;

  return {
    samples,
    ets2,
    ats,
    total,

    ets2Percent:
      percent(
        ets2,
        total
      ),

    atsPercent:
      percent(
        ats,
        total
      ),

    mostUsed:
      mostUsed
        ? {
            server:
              mostUsed.server,

            count:
              mostUsed.count,

            percent:
              percent(
                mostUsed.count,
                total
              )
          }
        : null
  };
}

// ======================================================
// MILESTONE
// ======================================================

function getNextMilestone(
  members
) {
  for (
    let milestone = 150;
    milestone <= 1000;
    milestone += 50
  ) {
    if (
      members < milestone
    ) {
      const completion =
        Math.min(
          100,
          Math.floor(
            (
              members /
              milestone
            ) * 100
          )
        );

      return {
        milestone,

        remaining:
          milestone -
          members,

        completion
      };
    }
  }

  return null;
}

// ======================================================
// EMBED
// ======================================================

function buildEmbed(
  state,
  members,
  activity,
  driverHistory,
  now
) {
  const dayStart =
    startOfDay(now);

  const weekStart =
    startOfWeek(now);

  const monthStart =
    startOfMonth(now);

  const updatedUnix =
    Math.floor(
      now.getTime() /
      1000
    );

  const todayGrowth =
    memberGrowth(
      state,
      dayStart,
      members
    );

  const weekGrowth =
    memberGrowth(
      state,
      weekStart,
      members
    );

  const monthGrowth =
    memberGrowth(
      state,
      monthStart,
      members
    );

  const todayPeak =
    peakFrom(
      state,
      dayStart,
      "peakOnline"
    );

  const weekPeak =
    peakFrom(
      state,
      weekStart,
      "peakOnline"
    );

  const monthPeak =
    peakFrom(
      state,
      monthStart,
      "peakOnline"
    );

  const todayMovement =
    getMovement(
      driverHistory,
      dayStart,
      now
    );

  const weekMovement =
    getMovement(
      driverHistory,
      weekStart,
      now
    );

  const monthMovement =
    getMovement(
      driverHistory,
      monthStart,
      now
    );

  const monthlyActivity =
    getMonthlyActivity(
      state,
      monthStart
    );

  let activityText =
    "No Kings activity recorded yet.";

  if (
    monthlyActivity.total > 0
  ) {
    activityText =
      `ETS2: **${monthlyActivity.ets2Percent}%** • ` +
      `ATS: **${monthlyActivity.atsPercent}%**`;

    if (
      monthlyActivity.mostUsed
    ) {
      activityText +=
        `\nMost Used: **${monthlyActivity.mostUsed.server}** ` +
        `(${monthlyActivity.mostUsed.percent}%)`;
    }
  }

  const milestone =
    getNextMilestone(
      members
    );

  let milestoneText =
    "All configured milestones up to **1,000 members** reached. 👑";

  if (milestone) {
    milestoneText =
      `**${members} / ${milestone.milestone}** members\n` +
      `${progressBar(
        milestone.completion
      )} **${milestone.completion}%**\n` +
      `**${milestone.remaining}** remaining`;
  }

  return {
    title:
      "👑 Kings Logistics Statistics",

    description:
      "Live and historical TruckersMP statistics for **Kings Logistics**.",

    color:
      KINGS_BLUE,

    fields: [
      {
        name:
          "Members",

        value:
          `**${members} TruckersMP Members**\n` +
          `Today: **${formatSigned(todayGrowth)}** • ` +
          `This Week: **${formatSigned(weekGrowth)}** • ` +
          `This Month: **${formatSigned(monthGrowth)}**`,

        inline:
          false
      },

      {
        name:
          "Current Activity",

        value:
          `**${activity.totalOnline} Currently Online**\n` +
          `ETS2: **${activity.ets2Count}** • ` +
          `ATS: **${activity.atsCount}**`,

        inline:
          false
      },

      {
        name:
          "Online Peaks",

        value:
          `Today: **${todayPeak}** • ` +
          `This Week: **${weekPeak}** • ` +
          `This Month: **${monthPeak}**\n` +
          `All-Time Tracked: **${state.allTime.peakOnline}**`,

        inline:
          false
      },

      {
        name:
          "Driver Movement",

        value:
          [
            movementLine(
              "Today",
              todayMovement
            ),

            movementLine(
              "This Week",
              weekMovement
            ),

            movementLine(
              "This Month",
              monthMovement
            )
          ].join("\n"),

        inline:
          false
      },

      {
        name:
          "Activity This Month",

        value:
          activityText,

        inline:
          false
      },

      {
        name:
          "Next Milestone",

        value:
          `${milestoneText}\n\n` +
          `Last updated <t:${updatedUnix}:R>`,

        inline:
          false
      }
    ],

    footer: {
      text:
        "Kings Logistics • Advanced Statistics"
    }
  };
}

// ======================================================
// DISCORD
// ======================================================

function webhookWithWait() {
  const url =
    new URL(
      DISCORD_WEBHOOK_URL
    );

  url.searchParams.set(
    "wait",
    "true"
  );

  return url.toString();
}

async function createDiscordMessage(
  embed
) {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error(
      "STATS_DISCORD_WEBHOOK_URL is missing."
    );
  }

  const response =
    await fetch(
      webhookWithWait(),
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            embeds: [
              embed
            ],

            allowed_mentions: {
              parse: []
            }
          })
      }
    );

  if (!response.ok) {
    throw new Error(
      `Statistics Discord create failed: HTTP ${response.status} - ${await response.text()}`
    );
  }

  const message =
    await response.json();

  if (!message.id) {
    throw new Error(
      "Discord did not return a Statistics message ID."
    );
  }

  return String(
    message.id
  );
}

async function updateDiscordMessage(
  messageId,
  embed
) {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error(
      "STATS_DISCORD_WEBHOOK_URL is missing."
    );
  }

  const base =
    DISCORD_WEBHOOK_URL
      .split("?")[0]
      .replace(
        /\/$/,
        ""
      );

  const response =
    await fetch(
      `${base}/messages/${messageId}`,
      {
        method:
          "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            embeds: [
              embed
            ],

            allowed_mentions: {
              parse: []
            }
          })
      }
    );

  if (
    response.status === 404
  ) {
    return false;
  }

  if (!response.ok) {
    throw new Error(
      `Statistics Discord update failed: HTTP ${response.status} - ${await response.text()}`
    );
  }

  return true;
}

async function publishStatistics(
  state,
  embed
) {
  if (state.messageId) {
    const updated =
      await updateDiscordMessage(
        state.messageId,
        embed
      );

    if (updated) {
      console.log(
        "Existing Kings Statistics message updated."
      );

      return false;
    }

    console.log(
      "Stored Statistics message no longer exists."
    );

    console.log(
      "Creating a new Statistics message."
    );
  }

  state.messageId =
    await createDiscordMessage(
      embed
    );

  console.log(
    `New Kings Statistics message created: ${state.messageId}`
  );

  return true;
}

// ======================================================
// MAIN
// ======================================================

async function start() {
  console.log(
    "===================================="
  );

  console.log(
    "Kings Logistics Advanced Statistics"
  );

  console.log(
    "===================================="
  );

  console.log("");

  const now =
    new Date();

  const loaded =
    loadStatistics();

  const state =
    loaded.state;

  const driverHistory =
    loadDriverHistory();

  console.log(
    "Loading TruckersMP member count..."
  );

  const members =
    await getMemberCount();

  console.log(
    `Current members: ${members}`
  );

  console.log("");

  console.log(
    "Loading Kings TruckersMP activity..."
  );

  const activity =
    await getLiveActivity();

  console.log(
    `Currently online: ${activity.totalOnline}`
  );

  console.log(
    `ETS2: ${activity.ets2Count} • ATS: ${activity.atsCount}`
  );

  let stateChanged =
    loaded.migrated;

  if (loaded.migrated) {
    console.log("");

    console.log(
      "Statistics data upgraded to Advanced Statistics format."
    );
  }

  if (
    updateState(
      state,
      members,
      activity,
      now
    )
  ) {
    stateChanged =
      true;
  }

  const embed =
    buildEmbed(
      state,
      members,
      activity,
      driverHistory,
      now
    );

  const newMessage =
    await publishStatistics(
      state,
      embed
    );

  if (newMessage) {
    stateChanged =
      true;
  }

  if (stateChanged) {
    state.updatedAt =
      nowISO();

    writeJson(
      STATE_FILE,
      state
    );

    console.log(
      "Statistics data saved."
    );
  } else {
    console.log(
      "No persistent Statistics data changes to save."
    );
  }

  console.log("");

  console.log(
    "Advanced Statistics summary:"
  );

  console.log(
    `Members: ${members}`
  );

  console.log(
    `Online: ${activity.totalOnline}`
  );

  console.log(
    `ETS2: ${activity.ets2Count}`
  );

  console.log(
    `ATS: ${activity.atsCount}`
  );

  console.log(
    `All-Time Tracked Peak: ${state.allTime.peakOnline}`
  );

  const milestone =
    getNextMilestone(
      members
    );

  if (milestone) {
    console.log(
      `Next Milestone: ${members}/${milestone.milestone}`
    );
  } else {
    console.log(
      "Next Milestone: all configured milestones reached"
    );
  }

  console.log("");

  console.log(
    "Kings Advanced Statistics completed successfully."
  );
}

// ======================================================
// START
// ======================================================

start().catch(error => {
  console.error("");

  console.error(
    "Kings Advanced Statistics failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
