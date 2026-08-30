const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — CENTRAL OVERVIEW
// ======================================================

const KINGS_BLUE = 0x182dff;

const WEBHOOK_URL =
  process.env.CENTRAL_OVERVIEW_WEBHOOK_URL;

const SNAPSHOT_FILE =
  path.join(
    __dirname,
    "data",
    "statistics-snapshot.json"
  );

const STATISTICS_FILE =
  path.join(
    __dirname,
    "data",
    "statistics.json"
  );

const CHANGELOG_STATE_FILE =
  path.join(
    __dirname,
    "data",
    "changelog-state.json"
  );

const CHANGELOG_HISTORY_FILE =
  path.join(
    __dirname,
    "data",
    "changelog-history.json"
  );

const OVERVIEW_STATE_FILE =
  path.join(
    __dirname,
    "data",
    "central-overview.json"
  );

// ======================================================
// HELPERS
// ======================================================

function nowISO() {
  return new Date().toISOString();
}

function readJson(
  file,
  fallback
) {
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

function number(
  value,
  fallback = 0
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function normalizeDate(
  value
) {
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

function formatSigned(
  value
) {
  const parsed =
    number(value);

  if (parsed > 0) {
    return `+${parsed}`;
  }

  return String(parsed);
}

function percent(
  part,
  total
) {
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

function progressBar(
  value
) {
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

function monthKey(
  date
) {
  return (
    `${date.getUTCFullYear()}-` +
    `${String(
      date.getUTCMonth() + 1
    ).padStart(2, "0")}`
  );
}

// ======================================================
// LOAD STATISTICS SNAPSHOT
// ======================================================

function loadSnapshot() {
  const snapshot =
    readJson(
      SNAPSHOT_FILE,
      null
    );

  if (!snapshot) {
    throw new Error(
      "Statistics Snapshot does not exist."
    );
  }

  if (
    !Number.isFinite(
      Number(snapshot.members)
    )
  ) {
    throw new Error(
      "Statistics Snapshot is invalid."
    );
  }

  return {
    updatedAt:
      snapshot.updatedAt ||
      nowISO(),

    members:
      number(
        snapshot.members
      ),

    online:
      number(
        snapshot.online
      ),

    ets2Online:
      number(
        snapshot.ets2Online
      ),

    atsOnline:
      number(
        snapshot.atsOnline
      ),

    activeServers:
      Array.isArray(
        snapshot.activeServers
      )
        ? snapshot.activeServers
        : []
  };
}

// ======================================================
// LOAD ADVANCED STATISTICS
// ======================================================

function loadStatistics() {
  const raw =
    readJson(
      STATISTICS_FILE,
      null
    );

  if (!raw) {
    throw new Error(
      "Statistics data does not exist."
    );
  }

  let history = [];

  if (Array.isArray(raw)) {
    history =
      raw;
  } else if (
    Array.isArray(
      raw.history
    )
  ) {
    history =
      raw.history;
  } else if (
    Array.isArray(
      raw.days
    )
  ) {
    history =
      raw.days;
  }

  return {
    history,

    allTime:
      raw &&
      raw.allTime &&
      typeof raw.allTime ===
        "object"
        ? raw.allTime
        : {}
  };
}

// ======================================================
// CURRENT MONTH STATISTICS
// ======================================================

function getCurrentMonthDays(
  history,
  now
) {
  const currentMonth =
    monthKey(now);

  return history
    .filter(
      day =>
        String(
          day.date || ""
        ).startsWith(
          currentMonth
        )
    )
    .sort(
      (a, b) =>
        String(a.date).localeCompare(
          String(b.date)
        )
    );
}

function getMonthlyGrowth(
  days,
  currentMembers
) {
  if (
    days.length === 0
  ) {
    return 0;
  }

  const first =
    days[0];

  const startMembers =
    number(
      first.startMembers,
      number(
        first.members,
        currentMembers
      )
    );

  return (
    currentMembers -
    startMembers
  );
}

function getMonthlyPeak(
  days
) {
  return Math.max(
    0,
    ...days.map(
      day =>
        number(
          day.peakOnline
        )
    )
  );
}

// ======================================================
// MONTHLY SERVER ACTIVITY
// ======================================================

function getMonthlyServerActivity(
  days
) {
  let ets2 =
    0;

  let ats =
    0;

  const servers = {};

  for (
    const day
    of days
  ) {
    ets2 +=
      number(
        day.ets2PlayerSamples
      );

    ats +=
      number(
        day.atsPlayerSamples
      );

    const dayServers =
      day.serverPlayerSamples &&
      typeof day.serverPlayerSamples ===
        "object"
        ? day.serverPlayerSamples
        : {};

    for (
      const [
        server,
        count
      ]
      of Object.entries(
        dayServers
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
          count:
            number(count)
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

    mostUsedServer:
      mostUsed
        ? mostUsed.server
        : null,

    mostUsedPercent:
      mostUsed
        ? percent(
            mostUsed.count,
            total
          )
        : 0
  };
}

// ======================================================
// NEXT MILESTONE
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
// LATEST CHANGELOG
// ======================================================

function collectChangelogIds(
  value,
  results = []
) {
  if (
    typeof value ===
    "string"
  ) {
    const matches =
      value.match(
        /S(\d+)\s*[-–—]?\s*KL(\d+)/gi
      );

    if (matches) {
      for (
        const match
        of matches
      ) {
        const parsed =
          match.match(
            /S(\d+)\s*[-–—]?\s*KL(\d+)/i
          );

        if (parsed) {
          results.push({
            season:
              Number(
                parsed[1]
              ),

            number:
              Number(
                parsed[2]
              )
          });
        }
      }
    }

    return results;
  }

  if (
    Array.isArray(value)
  ) {
    for (
      const child
      of value
    ) {
      collectChangelogIds(
        child,
        results
      );
    }

    return results;
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    const seasonCandidate =
      value.season ??
      value.currentSeason ??
      value.seasonNumber;

    const numberCandidate =
      value.kl ??
      value.klNumber ??
      value.changelogNumber ??
      value.number;

    if (
      Number.isFinite(
        Number(
          seasonCandidate
        )
      ) &&
      Number.isFinite(
        Number(
          numberCandidate
        )
      )
    ) {
      results.push({
        season:
          Number(
            seasonCandidate
          ),

        number:
          Number(
            numberCandidate
          )
      });
    }

    for (
      const child
      of Object.values(
        value
      )
    ) {
      collectChangelogIds(
        child,
        results
      );
    }
  }

  return results;
}

function getLatestChangelog() {
  const state =
    readJson(
      CHANGELOG_STATE_FILE,
      {}
    );

  const history =
    readJson(
      CHANGELOG_HISTORY_FILE,
      []
    );

  const ids = [
    ...collectChangelogIds(
      history
    ),

    ...collectChangelogIds(
      state
    )
  ];

  /*
    The Changelog state may contain the NEXT
    number instead of the latest published one.
    Try to derive the previous number as fallback.
  */

  const season =
    number(
      state.currentSeason ??
      state.season,
      0
    );

  const nextNumber =
    number(
      state.nextNumber ??
      state.nextKL ??
      state.nextChangelogNumber,
      0
    );

  if (
    season > 0 &&
    nextNumber > 1
  ) {
    ids.push({
      season,
      number:
        nextNumber - 1
    });
  }

  if (
    ids.length === 0
  ) {
    return null;
  }

  ids.sort(
    (a, b) =>
      b.season -
        a.season ||
      b.number -
        a.number
  );

  const latest =
    ids[0];

  return (
    `S${String(
      latest.season
    ).padStart(2, "0")} — ` +
    `KL${String(
      latest.number
    ).padStart(2, "0")}`
  );
}

// ======================================================
// CENTRAL OVERVIEW STATE
// ======================================================

function loadOverviewState() {
  const state =
    readJson(
      OVERVIEW_STATE_FILE,
      null
    );

  if (
    !state ||
    typeof state !==
      "object"
  ) {
    return {
      version: 1,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      messageId: null
    };
  }

  return {
    version: 1,

    createdAt:
      state.createdAt ||
      nowISO(),

    updatedAt:
      state.updatedAt ||
      nowISO(),

    messageId:
      state.messageId ||
      null
  };
}

function saveOverviewState(
  state
) {
  state.updatedAt =
    nowISO();

  writeJson(
    OVERVIEW_STATE_FILE,
    state
  );

  console.log(
    "Central Overview state saved."
  );
}

// ======================================================
// BUILD OVERVIEW EMBED
// ======================================================

function buildEmbed(
  snapshot,
  statistics,
  now
) {
  const monthDays =
    getCurrentMonthDays(
      statistics.history,
      now
    );

  const monthlyGrowth =
    getMonthlyGrowth(
      monthDays,
      snapshot.members
    );

  const monthlyPeak =
    getMonthlyPeak(
      monthDays
    );

  const serverActivity =
    getMonthlyServerActivity(
      monthDays
    );

  const milestone =
    getNextMilestone(
      snapshot.members
    );

  const latestChangelog =
    getLatestChangelog();

  // ====================================================
  // MILESTONE TEXT
  // ====================================================

  let milestoneText =
    "All configured milestones up to **1,000 members** reached. 👑";

  if (milestone) {
    milestoneText =
      `**${snapshot.members} / ${milestone.milestone}** members\n` +
      `${progressBar(
        milestone.completion
      )} **${milestone.completion}%**\n` +
      `**${milestone.remaining}** remaining`;
  }

  // ====================================================
  // ACTIVITY TEXT
  // ====================================================

  let activityText =
    `Monthly Peak: **${monthlyPeak}**`;

  if (
    serverActivity.mostUsedServer
  ) {
    activityText +=
      `\nMost Used Server: **${serverActivity.mostUsedServer}** ` +
      `(${serverActivity.mostUsedPercent}%)`;

    activityText +=
      `\nETS2: **${serverActivity.ets2Percent}%** • ` +
      `ATS: **${serverActivity.atsPercent}%**`;
  } else {
    activityText +=
      "\nMost Used Server: *collecting data*";
  }

  // ====================================================
  // LAST UPDATED
  // ====================================================

  const snapshotDate =
    normalizeDate(
      snapshot.updatedAt
    ) ||
    now;

  const updatedUnix =
    Math.floor(
      snapshotDate.getTime() /
      1000
    );

  // ====================================================
  // EMBED
  // ====================================================

  return {
    title:
      "👑 Kings Logistics Overview",

    description:
      "A quick overview of the current **Kings Logistics** community and TruckersMP activity.",

    color:
      KINGS_BLUE,

    fields: [
      {
        name:
          "Members",

        value:
          `**${snapshot.members} TruckersMP Members**\n` +
          `Monthly Growth: **${formatSigned(monthlyGrowth)}**`,

        inline:
          false
      },

      {
        name:
          "Current Activity",

        value:
          `**${snapshot.online} Kings Members Online**\n` +
          `ETS2: **${snapshot.ets2Online}** • ` +
          `ATS: **${snapshot.atsOnline}**`,

        inline:
          false
      },

      {
        name:
          "Next Milestone",

        value:
          milestoneText,

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
          "Latest Changelog",

        value:
          latestChangelog
            ? `**${latestChangelog}**`
            : "*No published changelog detected.*",

        inline:
          false
      },

      {
        name:
          "Live Data",

        value:
          `Last updated <t:${updatedUnix}:R>`,

        inline:
          false
      }
    ],

    footer: {
      text:
        "Kings Logistics • Central Overview"
    }
  };
}

// ======================================================
// DISCORD
// ======================================================

function webhookWithWait() {
  const url =
    new URL(
      WEBHOOK_URL
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
  if (!WEBHOOK_URL) {
    throw new Error(
      "CENTRAL_OVERVIEW_WEBHOOK_URL is missing."
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
      `Central Overview Discord create failed: HTTP ${response.status} - ${await response.text()}`
    );
  }

  const message =
    await response.json();

  if (!message.id) {
    throw new Error(
      "Discord did not return a Central Overview message ID."
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
  if (!WEBHOOK_URL) {
    throw new Error(
      "CENTRAL_OVERVIEW_WEBHOOK_URL is missing."
    );
  }

  const base =
    WEBHOOK_URL
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
    response.status ===
    404
  ) {
    return false;
  }

  if (!response.ok) {
    throw new Error(
      `Central Overview Discord update failed: HTTP ${response.status} - ${await response.text()}`
    );
  }

  return true;
}

// ======================================================
// PUBLISH OVERVIEW
// ======================================================

async function publishOverview(
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
        "Existing Kings Central Overview message updated."
      );

      return false;
    }

    console.log(
      "Stored Central Overview message no longer exists."
    );

    console.log(
      "Creating a new Central Overview message."
    );
  }

  state.messageId =
    await createDiscordMessage(
      embed
    );

  console.log(
    `New Kings Central Overview message created: ${state.messageId}`
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
    "Kings Logistics Central Overview"
  );

  console.log(
    "===================================="
  );

  console.log("");

  const now =
    new Date();

  console.log(
    "Loading Kings Statistics Snapshot..."
  );

  const snapshot =
    loadSnapshot();

  console.log(
    `Members: ${snapshot.members}`
  );

  console.log(
    `Currently Online: ${snapshot.online}`
  );

  console.log("");

  console.log(
    "Loading Kings Advanced Statistics..."
  );

  const statistics =
    loadStatistics();

  const state =
    loadOverviewState();

  const embed =
    buildEmbed(
      snapshot,
      statistics,
      now
    );

  const newMessage =
    await publishOverview(
      state,
      embed
    );

  if (
    newMessage ||
    !fs.existsSync(
      OVERVIEW_STATE_FILE
    )
  ) {
    saveOverviewState(
      state
    );
  }

  console.log("");

  console.log(
    "Central Overview summary:"
  );

  console.log(
    `Members: ${snapshot.members}`
  );

  console.log(
    `Online: ${snapshot.online}`
  );

  const milestone =
    getNextMilestone(
      snapshot.members
    );

  if (milestone) {
    console.log(
      `Next Milestone: ${snapshot.members}/${milestone.milestone}`
    );
  }

  const latest =
    getLatestChangelog();

  console.log(
    `Latest Changelog: ${latest || "not detected"}`
  );

  console.log("");

  console.log(
    "Kings Central Overview completed successfully."
  );
}

// ======================================================
// START
// ======================================================

start().catch(error => {
  console.error("");

  console.error(
    "Kings Central Overview failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
