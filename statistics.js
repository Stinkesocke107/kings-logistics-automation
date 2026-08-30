const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — ADVANCED STATISTICS
// Uses the Kings Live Tracker as its live data source.
// ======================================================

const KINGS_BLUE = 0x182dff;
const HISTORY_RETENTION_DAYS = 730;
const MAX_SNAPSHOT_AGE_MINUTES = 20;

const DISCORD_WEBHOOK_URL =
  process.env.STATS_DISCORD_WEBHOOK_URL;

const STATE_FILE =
  path.join(
    __dirname,
    "data",
    "statistics.json"
  );

const LIVE_SNAPSHOT_FILE =
  path.join(
    __dirname,
    "data",
    "live-tracker-snapshot.json"
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
// CENTRAL LIVE SNAPSHOT
// ======================================================

function loadLiveSnapshot() {
  const snapshot =
    readJson(
      LIVE_SNAPSHOT_FILE,
      null
    );

  if (
    !snapshot ||
    typeof snapshot !== "object"
  ) {
    throw new Error(
      "Kings Live Tracker snapshot does not exist."
    );
  }

  const updatedAt =
    normalizeDate(
      snapshot.updatedAt
    );

  if (!updatedAt) {
    throw new Error(
      "Kings Live Tracker snapshot has no valid updatedAt timestamp."
    );
  }

  const ageMs =
    Date.now() -
    updatedAt.getTime();

  const maximumAge =
    MAX_SNAPSHOT_AGE_MINUTES *
    60 *
    1000;

  if (ageMs > maximumAge) {
    throw new Error(
      `Kings Live Tracker snapshot is too old (${Math.floor(
        ageMs / 60000
      )} minutes).`
    );
  }

  const activeServers =
    Array.isArray(
      snapshot.activeServers
    )
      ? snapshot.activeServers
      : [];

  const serverCounts =
    activeServers
      .map(server => ({
        key:
          `${String(
            server.game || "Unknown"
          ).toUpperCase()} — ${String(
            server.name || "Unknown Server"
          )}`,

        game:
          String(
            server.game || ""
          ).toUpperCase(),

        name:
          String(
            server.name ||
            "Unknown Server"
          ),

        count:
          number(
            server.online
          ),

        event:
          Boolean(
            server.isEvent
          )
      }))
      .filter(
        server =>
          server.count > 0
      );

  return {
    updatedAt,

    members:
      number(
        snapshot.members
      ),

    activity: {
      totalOnline:
        number(
          snapshot.online
        ),

      ets2Count:
        number(
          snapshot.ets2Online
        ),

      atsCount:
        number(
          snapshot.atsOnline
        ),

      serverCounts
    }
  };
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
      raw.version !== 2
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
      joined -
      left
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
// UPDATE DAILY STATISTICS
// ======================================================

function updateState(
  state,
  members,
  activity,
  sampleTime
) {
  let changed =
    false;

  const today =
    dateKey(
      sampleTime
    );

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
  // ONE ACTIVITY SAMPLE PER HOUR
  // ====================================================

  const hour =
    currentHourKey(
      sampleTime
    );

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
        sampleTime.getTime() -
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
// BUILD EMBED
// ======================================================

function buildEmbed(
  state,
  members,
  activity,
  driverHistory,
  sampleTime
) {
  const dayStart =
    startOfDay(
      sampleTime
    );

  const weekStart =
    startOfWeek(
      sampleTime
    );

  const monthStart =
    startOfMonth(
      sampleTime
    );

  const updatedUnix =
    Math.floor(
      sampleTime.getTime() /
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
      sampleTime
    );

  const weekMovement =
    getMovement(
      driverHistory,
      weekStart,
      sampleTime
    );

  const monthMovement =
    getMovement(
      driverHistory,
      monthStart,
      sampleTime
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
            embeds: [embed],

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
            embeds: [embed],

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

  console.log(
    "Loading central Kings Live Tracker snapshot..."
  );

  const live =
    loadLiveSnapshot();

  const members =
    live.members;

  const activity =
    live.activity;

  const sampleTime =
    live.updatedAt;

  console.log(
    `Snapshot age: ${Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          sampleTime.getTime()
        ) / 1000
      )
    )} seconds`
  );

  console.log(
    `Members: ${members}`
  );

  console.log(
    `Currently Online: ${activity.totalOnline}`
  );

  console.log(
    `ETS2: ${activity.ets2Count}`
  );

  console.log(
    `ATS: ${activity.atsCount}`
  );

  console.log(
    `Active Servers: ${activity.serverCounts.length}`
  );

  const loaded =
    loadStatistics();

  const state =
    loaded.state;

  const driverHistory =
    loadDriverHistory();

  let stateChanged =
    loaded.migrated;

  if (
    updateState(
      state,
      members,
      activity,
      sampleTime
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
      sampleTime
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
  }

  console.log("");

  console.log(
    "Live data source: Kings Live Tracker Snapshot"
  );

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
