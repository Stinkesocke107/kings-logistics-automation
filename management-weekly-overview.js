const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — MANAGEMENT WEEKLY OVERVIEW
// ======================================================

const KINGS_BLUE = 0x182dff;

const WEBHOOK_URL =
  process.env.MANAGEMENT_AUTOMATION_WEBHOOK_URL;

const PREVIEW_MODE =
  String(
    process.env.MANAGEMENT_WEEKLY_PREVIEW || ""
  ).toLowerCase() === "true";

const STATISTICS_FILE =
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

const PROBATION_FILE =
  path.join(
    __dirname,
    "data",
    "probation-state.json"
  );

const STATE_FILE =
  path.join(
    __dirname,
    "data",
    "management-weekly-overview-state.json"
  );

const DAY_MS =
  24 * 60 * 60 * 1000;

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

function formatDate(
  date
) {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }
  ).format(date);
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

// ======================================================
// REPORT PERIOD
// ======================================================

function getPreviousCompletedWeek() {
  const now =
    new Date();

  const today =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      )
    );

  const daysSinceMonday =
    (
      today.getUTCDay() +
      6
    ) % 7;

  const currentWeekStart =
    new Date(
      today.getTime() -
      (
        daysSinceMonday *
        DAY_MS
      )
    );

  const start =
    new Date(
      currentWeekStart.getTime() -
      (
        7 *
        DAY_MS
      )
    );

  const end =
    currentWeekStart;

  const displayEnd =
    new Date(
      end.getTime() -
      1
    );

  return {
    start,
    end,

    key:
      start
        .toISOString()
        .slice(0, 10),

    label:
      `${formatDate(start)} – ${formatDate(displayEnd)}`
  };
}

function getPreviewPeriod() {
  const end =
    new Date();

  const start =
    new Date(
      end.getTime() -
      (
        7 *
        DAY_MS
      )
    );

  return {
    start,
    end,

    key:
      "preview",

    label:
      "Preview • Last 7 Days"
  };
}

// ======================================================
// STATISTICS
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

  history =
    history
      .filter(
        day =>
          day &&
          /^\d{4}-\d{2}-\d{2}$/.test(
            String(
              day.date || ""
            )
          )
      )
      .sort(
        (a, b) =>
          String(a.date).localeCompare(
            String(b.date)
          )
      );

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

function getPeriodStatistics(
  statistics,
  period
) {
  const days =
    statistics.history.filter(
      day => {
        const date =
          normalizeDate(
            `${day.date}T00:00:00.000Z`
          );

        if (!date) {
          return false;
        }

        return (
          date.getTime() >=
            period.start.getTime() &&
          date.getTime() <
            period.end.getTime()
        );
      }
    );

  const latestDay =
    statistics.history.length > 0
      ? statistics.history[
          statistics.history.length - 1
        ]
      : null;

  const currentMembers =
    latestDay
      ? number(
          latestDay.members
        )
      : 0;

  const weeklyPeak =
    Math.max(
      0,
      ...days.map(
        day =>
          number(
            day.peakOnline
          )
      )
    );

  const peakETS2 =
    Math.max(
      0,
      ...days.map(
        day =>
          number(
            day.peakETS2
          )
      )
    );

  const peakATS =
    Math.max(
      0,
      ...days.map(
        day =>
          number(
            day.peakATS
          )
      )
    );

  return {
    days,

    currentMembers,

    weeklyPeak,

    peakETS2,

    peakATS,

    allTimePeak:
      number(
        statistics.allTime.peakOnline
      )
  };
}

// ======================================================
// STATISTICS COVERAGE
// ======================================================

function statisticsCoverPeriod(
  periodStats,
  period
) {
  if (
    periodStats.days.length === 0
  ) {
    return false;
  }

  const first =
    normalizeDate(
      `${periodStats.days[0].date}T00:00:00.000Z`
    );

  const last =
    normalizeDate(
      `${periodStats.days[
        periodStats.days.length - 1
      ].date}T00:00:00.000Z`
    );

  if (
    !first ||
    !last
  ) {
    return false;
  }

  const expectedLast =
    new Date(
      period.end.getTime() -
      DAY_MS
    );

  return (
    first.getTime() <=
      period.start.getTime() &&
    last.getTime() >=
      expectedLast.getTime()
  );
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
    throw new Error(
      "Driver History does not exist or is invalid."
    );
  }

  return history;
}

function driverHistoryCoversPeriod(
  history,
  period
) {
  const initializedAt =
    normalizeDate(
      history.initializedAt
    );

  if (!initializedAt) {
    return false;
  }

  return (
    initializedAt.getTime() <=
    period.start.getTime()
  );
}

function eventIsInPeriod(
  event,
  period
) {
  const date =
    normalizeDate(
      event.occurredAt ||
      event.detectedAt
    );

  if (!date) {
    return false;
  }

  return (
    date.getTime() >=
      period.start.getTime() &&
    date.getTime() <
      period.end.getTime()
  );
}

function getDriverMovement(
  history,
  period
) {
  const events =
    history.events.filter(
      event =>
        eventIsInPeriod(
          event,
          period
        )
    );

  const joined =
    events.filter(
      event =>
        event.type ===
        "join"
    ).length;

  const left =
    events.filter(
      event =>
        event.type ===
        "leave"
    ).length;

  const nameChanges =
    events.filter(
      event =>
        event.type ===
        "name_change"
    ).length;

  return {
    joined,
    left,

    net:
      joined - left,

    nameChanges
  };
}

// ======================================================
// PROBATION DATA
// ======================================================

function loadProbationState() {
  const state =
    readJson(
      PROBATION_FILE,
      {
        notified: []
      }
    );

  if (
    !Array.isArray(
      state.notified
    )
  ) {
    state.notified = [];
  }

  return state;
}

function getProbationReviews(
  probation,
  period
) {
  return probation.notified.filter(
    item => {
      const date =
        normalizeDate(
          item.notifiedAt
        );

      if (!date) {
        return false;
      }

      return (
        date.getTime() >=
          period.start.getTime() &&
        date.getTime() <
          period.end.getTime()
      );
    }
  );
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
          milestone - members,

        completion
      };
    }
  }

  return null;
}

// ======================================================
// REPORT STATE
// ======================================================

function loadState() {
  const state =
    readJson(
      STATE_FILE,
      null
    );

  if (
    !state ||
    !Array.isArray(
      state.publishedWeeks
    )
  ) {
    return {
      version: 1,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      publishedWeeks: []
    };
  }

  return state;
}

function saveState(
  state
) {
  state.updatedAt =
    nowISO();

  if (
    state.publishedWeeks.length >
    104
  ) {
    state.publishedWeeks =
      state.publishedWeeks.slice(
        -104
      );
  }

  writeJson(
    STATE_FILE,
    state
  );

  console.log(
    "Management Weekly Overview state saved."
  );
}

// ======================================================
// BUILD EMBED
// ======================================================

function buildEmbed(
  period,
  periodStats,
  movement,
  probationReviews
) {
  const milestone =
    getNextMilestone(
      periodStats.currentMembers
    );

  let milestoneText =
    "All configured milestones up to **1,000 members** reached. 👑";

  if (milestone) {
    milestoneText =
      `**${periodStats.currentMembers} / ${milestone.milestone}** members\n` +
      `${progressBar(
        milestone.completion
      )} **${milestone.completion}%**\n` +
      `**${milestone.remaining}** remaining`;
  }

  return {
    title:
      PREVIEW_MODE
        ? "👑 Kings Logistics — Weekly Management Overview • TEST"
        : "👑 Kings Logistics — Weekly Management Overview",

    description:
      PREVIEW_MODE
        ? `Testing the Management overview using **${period.label}**.`
        : `Management overview for **${period.label}**.`,

    color:
      KINGS_BLUE,

    fields: [
      {
        name:
          "Members",

        value:
          `**${periodStats.currentMembers} TruckersMP Members**`,

        inline:
          false
      },

      {
        name:
          "Driver Movement",

        value:
          `Joined: **${movement.joined}**\n` +
          `Left: **${movement.left}**\n` +
          `Net Growth: **${formatSigned(movement.net)}**`,

        inline:
          true
      },

      {
        name:
          "HR",

        value:
          `Probation Reviews Triggered: **${probationReviews.length}**\n` +
          `Name Changes: **${movement.nameChanges}**`,

        inline:
          true
      },

      {
        name:
          "TruckersMP Activity",

        value:
          `Weekly Peak: **${periodStats.weeklyPeak}**\n` +
          `ETS2 Peak: **${periodStats.peakETS2}** • ` +
          `ATS Peak: **${periodStats.peakATS}**\n` +
          `All-Time Tracked Peak: **${periodStats.allTimePeak}**`,

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
      }
    ],

    footer: {
      text:
        PREVIEW_MODE
          ? "Kings Logistics • Management Automation • TEST"
          : "Kings Logistics • Management Automation"
    },

    timestamp:
      nowISO()
  };
}

// ======================================================
// DISCORD
// ======================================================

async function sendOverview(
  embed
) {
  if (!WEBHOOK_URL) {
    throw new Error(
      "MANAGEMENT_AUTOMATION_WEBHOOK_URL is missing."
    );
  }

  const response =
    await fetch(
      WEBHOOK_URL,
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
      `Management Discord webhook failed: HTTP ${response.status} - ${await response.text()}`
    );
  }
}

// ======================================================
// MAIN
// ======================================================

async function createOverview() {
  console.log(
    "Loading Kings Management data..."
  );

  const period =
    PREVIEW_MODE
      ? getPreviewPeriod()
      : getPreviousCompletedWeek();

  console.log(
    `Report period: ${period.label}`
  );

  if (PREVIEW_MODE) {
    console.log(
      "Preview mode enabled."
    );
  }

  const statistics =
    loadStatistics();

  const periodStats =
    getPeriodStatistics(
      statistics,
      period
    );

  const driverHistory =
    loadDriverHistory();

  const probation =
    loadProbationState();

  // ====================================================
  // PRODUCTION COVERAGE PROTECTION
  // ====================================================

  if (!PREVIEW_MODE) {
    if (
      !statisticsCoverPeriod(
        periodStats,
        period
      )
    ) {
      console.log(
        "Statistics do not cover the complete reporting week."
      );

      console.log(
        "No Management Weekly Overview will be posted."
      );

      return;
    }

    if (
      !driverHistoryCoversPeriod(
        driverHistory,
        period
      )
    ) {
      console.log(
        "Driver History does not cover the complete reporting week."
      );

      console.log(
        "No Management Weekly Overview will be posted."
      );

      return;
    }
  }

  const state =
    loadState();

  // ====================================================
  // DUPLICATE PROTECTION
  // ====================================================

  if (!PREVIEW_MODE) {
    const alreadyPublished =
      state.publishedWeeks.some(
        item =>
          item.key ===
          period.key
      );

    if (alreadyPublished) {
      console.log(
        `Management Overview ${period.key} was already published.`
      );

      console.log(
        "No duplicate report will be posted."
      );

      return;
    }
  }

  const movement =
    getDriverMovement(
      driverHistory,
      period
    );

  const probationReviews =
    getProbationReviews(
      probation,
      period
    );

  console.log("");
  console.log(
    `Current Members: ${periodStats.currentMembers}`
  );

  console.log(
    `Joined: ${movement.joined}`
  );

  console.log(
    `Left: ${movement.left}`
  );

  console.log(
    `Net Growth: ${formatSigned(movement.net)}`
  );

  console.log(
    `Name Changes: ${movement.nameChanges}`
  );

  console.log(
    `Probation Reviews: ${probationReviews.length}`
  );

  console.log(
    `Weekly Peak: ${periodStats.weeklyPeak}`
  );

  console.log(
    `All-Time Peak: ${periodStats.allTimePeak}`
  );

  const embed =
    buildEmbed(
      period,
      periodStats,
      movement,
      probationReviews
    );

  await sendOverview(
    embed
  );

  if (PREVIEW_MODE) {
    console.log("");
    console.log(
      "Management Weekly Overview TEST sent successfully."
    );

    console.log(
      "No publication state was changed."
    );

    return;
  }

  state.publishedWeeks.push({
    key:
      period.key,

    periodStart:
      period.start.toISOString(),

    periodEnd:
      period.end.toISOString(),

    publishedAt:
      nowISO(),

    members:
      periodStats.currentMembers,

    joined:
      movement.joined,

    left:
      movement.left,

    netGrowth:
      movement.net,

    nameChanges:
      movement.nameChanges,

    probationReviews:
      probationReviews.length,

    weeklyPeak:
      periodStats.weeklyPeak,

    peakETS2:
      periodStats.peakETS2,

    peakATS:
      periodStats.peakATS,

    allTimePeak:
      periodStats.allTimePeak
  });

  saveState(
    state
  );

  console.log("");
  console.log(
    "Management Weekly Overview published successfully."
  );
}

// ======================================================
// START
// ======================================================

async function start() {
  console.log(
    "=========================================="
  );

  console.log(
    "Kings Logistics Management Weekly Overview"
  );

  console.log(
    "=========================================="
  );

  console.log("");

  await createOverview();

  console.log("");

  console.log(
    "Kings Management Weekly Overview process completed successfully."
  );
}

start().catch(error => {
  console.error("");

  console.error(
    "Kings Management Weekly Overview failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
