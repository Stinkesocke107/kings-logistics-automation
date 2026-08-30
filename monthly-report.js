const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — ADVANCED MONTHLY REPORT
// ======================================================

const WEBHOOK_URL =
  process.env.MONTHLY_REPORT_DISCORD_WEBHOOK_URL;

const NEWS_ROLE_ID =
  process.env.NEWS_NOTIFICATIONS_ROLE_ID;

const PREVIEW_MODE =
  String(
    process.env.MONTHLY_REPORT_PREVIEW || ""
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

const CHANGELOG_QUEUE_FILE =
  path.join(
    __dirname,
    "data",
    "changelog-queue.json"
  );

const CHANGELOG_HISTORY_FILE =
  path.join(
    __dirname,
    "data",
    "changelog-history.json"
  );

const STATE_FILE =
  path.join(
    __dirname,
    "data",
    "monthly-report-state.json"
  );

// ======================================================
// HELPERS
// ======================================================

function nowISO() {
  return new Date().toISOString();
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

function monthName(date) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }
  ).format(date);
}

function monthKey(date) {
  return (
    `${date.getUTCFullYear()}-` +
    `${String(
      date.getUTCMonth() + 1
    ).padStart(2, "0")}`
  );
}

function daysInMonth(date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      0
    )
  ).getUTCDate();
}

// ======================================================
// REPORT PERIOD
// ======================================================

function getPreviousMonth() {
  const now =
    new Date();

  const end =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1
      )
    );

  const start =
    new Date(
      Date.UTC(
        end.getUTCFullYear(),
        end.getUTCMonth() - 1,
        1
      )
    );

  return {
    start,
    end,

    key:
      monthKey(start),

    label:
      monthName(start)
  };
}

function getPreviewMonth() {
  const now =
    new Date();

  const start =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1
      )
    );

  return {
    start,
    end:
      now,

    key:
      "preview",

    label:
      `${monthName(start)} • Preview`
  };
}

// ======================================================
// LOAD STATISTICS
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

  if (
    Array.isArray(raw)
  ) {
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

  return history
    .filter(
      day =>
        day &&
        /^\d{4}-\d{2}-\d{2}$/.test(
          String(day.date || "")
        )
    )
    .sort(
      (a, b) =>
        String(a.date).localeCompare(
          String(b.date)
        )
    );
}

// ======================================================
// FILTER MONTH DATA
// ======================================================

function getMonthStatistics(
  history,
  period
) {
  return history.filter(
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
}

// ======================================================
// COVERAGE PROTECTION
// ======================================================

function hasFullCoverage(
  days,
  period
) {
  if (
    days.length <
    20
  ) {
    return false;
  }

  const firstDate =
    normalizeDate(
      `${days[0].date}T00:00:00.000Z`
    );

  const lastDate =
    normalizeDate(
      `${days[days.length - 1].date}T00:00:00.000Z`
    );

  if (
    !firstDate ||
    !lastDate
  ) {
    return false;
  }

  const firstDay =
    firstDate.getUTCDate();

  const lastDay =
    lastDate.getUTCDate();

  const finalDay =
    daysInMonth(
      period.start
    );

  return (
    firstDay <= 3 &&
    lastDay >=
      finalDay - 2
  );
}

// ======================================================
// MEMBER + PEAK STATISTICS
// ======================================================

function buildStatistics(
  days
) {
  if (
    days.length ===
    0
  ) {
    return null;
  }

  const first =
    days[0];

  const last =
    days[
      days.length - 1
    ];

  const startMembers =
    number(
      first.startMembers,
      first.members
    );

  const endMembers =
    number(
      last.members,
      startMembers
    );

  return {
    recordedDays:
      days.length,

    firstRecordedDate:
      first.date,

    lastRecordedDate:
      last.date,

    startMembers,

    endMembers,

    growth:
      endMembers -
      startMembers,

    peakOnline:
      Math.max(
        0,
        ...days.map(
          day =>
            number(
              day.peakOnline
            )
        )
      ),

    peakETS2:
      Math.max(
        0,
        ...days.map(
          day =>
            number(
              day.peakETS2
            )
        )
      ),

    peakATS:
      Math.max(
        0,
        ...days.map(
          day =>
            number(
              day.peakATS
            )
        )
      )
  };
}

// ======================================================
// ADVANCED ACTIVITY ANALYTICS
// ======================================================

function buildActivityAnalytics(
  days
) {
  let ets2Samples =
    0;

  let atsSamples =
    0;

  let sampleCount =
    0;

  const serverSamples =
    {};

  for (
    const day
    of days
  ) {
    ets2Samples +=
      number(
        day.ets2PlayerSamples
      );

    atsSamples +=
      number(
        day.atsPlayerSamples
      );

    sampleCount +=
      number(
        day.activitySamples
      );

    const servers =
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
        servers
      )
    ) {
      serverSamples[
        server
      ] =
        number(
          serverSamples[
            server
          ]
        ) +
        number(
          count
        );
    }
  }

  const totalActivity =
    ets2Samples +
    atsSamples;

  const ranking =
    Object.entries(
      serverSamples
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
    ranking.length >
    0
      ? ranking[0]
      : null;

  return {
    sampleCount,

    totalActivity,

    ets2Samples,

    atsSamples,

    ets2Percent:
      percent(
        ets2Samples,
        totalActivity
      ),

    atsPercent:
      percent(
        atsSamples,
        totalActivity
      ),

    mostUsedServer:
      mostUsed
        ? mostUsed.server
        : null,

    mostUsedPercent:
      mostUsed
        ? percent(
            mostUsed.count,
            totalActivity
          )
        : 0
  };
}

// ======================================================
// DRIVER MOVEMENT
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
      history.events
    )
  ) {
    return null;
  }

  return history;
}

function driverHistoryCoversMonth(
  history,
  period
) {
  if (!history) {
    return false;
  }

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

function getDriverMovement(
  history,
  period
) {
  if (
    !driverHistoryCoversMonth(
      history,
      period
    )
  ) {
    return {
      complete:
        false,

      joined:
        0,

      left:
        0,

      net:
        0,

      nameChanges:
        0
    };
  }

  let joined =
    0;

  let left =
    0;

  let nameChanges =
    0;

  for (
    const event
    of history.events
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
        period.start.getTime() ||
      date.getTime() >=
        period.end.getTime()
    ) {
      continue;
    }

    if (
      event.type ===
      "join"
    ) {
      joined++;
    }

    if (
      event.type ===
      "leave"
    ) {
      left++;
    }

    if (
      event.type ===
      "name_change"
    ) {
      nameChanges++;
    }
  }

  return {
    complete:
      true,

    joined,

    left,

    net:
      joined -
      left,

    nameChanges
  };
}

// ======================================================
// MILESTONES
// ======================================================

function collectMilestoneObjects(
  value,
  results = []
) {
  if (
    Array.isArray(value)
  ) {
    for (
      const item
      of value
    ) {
      collectMilestoneObjects(
        item,
        results
      );
    }

    return results;
  }

  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return results;
  }

  if (
    typeof value.source ===
      "string" &&
    /^milestone-\d+$/.test(
      value.source
    )
  ) {
    results.push(
      value
    );
  }

  for (
    const child
    of Object.values(
      value
    )
  ) {
    if (
      child &&
      typeof child ===
        "object"
    ) {
      collectMilestoneObjects(
        child,
        results
      );
    }
  }

  return results;
}

function getMilestones(
  period
) {
  const queue =
    readJson(
      CHANGELOG_QUEUE_FILE,
      []
    );

  const history =
    readJson(
      CHANGELOG_HISTORY_FILE,
      []
    );

  const candidates = [
    ...collectMilestoneObjects(
      queue
    ),

    ...collectMilestoneObjects(
      history
    )
  ];

  const unique =
    new Map();

  for (
    const item
    of candidates
  ) {
    const date =
      normalizeDate(
        item.addedAt
      );

    if (!date) {
      continue;
    }

    if (
      date.getTime() <
        period.start.getTime() ||
      date.getTime() >=
        period.end.getTime()
    ) {
      continue;
    }

    const match =
      String(
        item.source
      ).match(
        /^milestone-(\d+)$/
      );

    if (!match) {
      continue;
    }

    const milestone =
      Number(
        match[1]
      );

    unique.set(
      item.source,
      milestone
    );
  }

  return [
    ...unique.values()
  ].sort(
    (a, b) =>
      a - b
  );
}

// ======================================================
// REPORT STATE
// ======================================================

function loadReportState() {
  const state =
    readJson(
      STATE_FILE,
      null
    );

  if (
    !state ||
    !Array.isArray(
      state.publishedMonths
    )
  ) {
    return {
      version:
        1,

      createdAt:
        nowISO(),

      updatedAt:
        nowISO(),

      publishedMonths:
        []
    };
  }

  return state;
}

function saveReportState(
  state
) {
  state.updatedAt =
    nowISO();

  writeJson(
    STATE_FILE,
    state
  );

  console.log(
    "Monthly Report state saved."
  );
}

// ======================================================
// BUILD REPORT
// ======================================================

function buildReport(
  period,
  statistics,
  activity,
  movement,
  milestones
) {
  const lines = [];

  if (
    !PREVIEW_MODE &&
    NEWS_ROLE_ID
  ) {
    lines.push(
      `<@&${NEWS_ROLE_ID}>`
    );

    lines.push("");
  }

  lines.push(
    `👑📊 **Kings Logistics — ${period.label} Monthly Report**`
  );

  lines.push("");

  if (PREVIEW_MODE) {
    lines.push(
      "**PREVIEW — this is not an official monthly publication.**"
    );

    lines.push("");
  }

  lines.push(
    "Another month of Kings Logistics activity, growth and community is behind us. Here is the monthly overview."
  );

  lines.push("");

  lines.push(
    "**Members**"
  );

  lines.push(
    `Start of Month: **${statistics.startMembers}**`
  );

  lines.push(
    `End of Month: **${statistics.endMembers}**`
  );

  lines.push(
    `Monthly Growth: **${formatSigned(statistics.growth)}**`
  );

  lines.push("");

  lines.push(
    "**Driver Movement**"
  );

  if (
    movement.complete
  ) {
    lines.push(
      `Joined: **${movement.joined}**`
    );

    lines.push(
      `Left: **${movement.left}**`
    );

    lines.push(
      `Net Growth: **${formatSigned(movement.net)}**`
    );

    lines.push(
      `Name Changes: **${movement.nameChanges}**`
    );
  } else {
    lines.push(
      "*Driver History did not cover the complete month.*"
    );
  }

  lines.push("");

  lines.push(
    "**TruckersMP Activity**"
  );

  lines.push(
    `Highest Online: **${statistics.peakOnline}**`
  );

  lines.push(
    `ETS2 Peak: **${statistics.peakETS2}**`
  );

  lines.push(
    `ATS Peak: **${statistics.peakATS}**`
  );

  if (
    activity.totalActivity >
    0
  ) {
    lines.push(
      `Activity Distribution: **ETS2 ${activity.ets2Percent}% • ATS ${activity.atsPercent}%**`
    );

    if (
      activity.mostUsedServer
    ) {
      lines.push(
        `Most Used Server: **${activity.mostUsedServer}** (${activity.mostUsedPercent}%)`
      );
    }
  }

  lines.push("");

  lines.push(
    "**Milestones**"
  );

  if (
    milestones.length ===
    0
  ) {
    lines.push(
      "No new 50-member milestone was reached this month."
    );
  } else {
    for (
      const milestone
      of milestones
    ) {
      lines.push(
        `👑 **${milestone} TruckersMP Members reached**`
      );
    }
  }

  lines.push("");

  lines.push(
    "Thank you to everyone who continues to be part of the Kings Family and contributes to Kings Logistics."
  );

  lines.push("");

  lines.push(
    "*Kings Logistics — Connecting the world, creating friendships.*"
  );

  return lines.join(
    "\n"
  );
}

// ======================================================
// SEND DISCORD MESSAGE
// ======================================================

async function sendReport(
  content
) {
  if (!WEBHOOK_URL) {
    throw new Error(
      "MONTHLY_REPORT_DISCORD_WEBHOOK_URL is missing."
    );
  }

  if (
    content.length >
    2000
  ) {
    throw new Error(
      `Monthly Report is too long for Discord: ${content.length} characters.`
    );
  }

  const payload = {
    content,

    allowed_mentions:
      !PREVIEW_MODE &&
      NEWS_ROLE_ID
        ? {
            parse: [],
            roles: [
              NEWS_ROLE_ID
            ]
          }
        : {
            parse: []
          }
  };

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
          JSON.stringify(
            payload
          )
      }
    );

  if (!response.ok) {
    throw new Error(
      `Monthly Report Discord webhook failed: HTTP ${response.status} - ${await response.text()}`
    );
  }
}

// ======================================================
// MAIN
// ======================================================

async function createMonthlyReport() {
  const period =
    PREVIEW_MODE
      ? getPreviewMonth()
      : getPreviousMonth();

  console.log(
    `Preparing Monthly Report for ${period.label}...`
  );

  if (PREVIEW_MODE) {
    console.log(
      "Preview mode enabled."
    );
  }

  const history =
    loadStatistics();

  const monthDays =
    getMonthStatistics(
      history,
      period
    );

  if (
    monthDays.length ===
    0
  ) {
    console.log(
      `No Statistics data exists for ${period.label}.`
    );

    console.log(
      "No Monthly Report will be posted."
    );

    return;
  }

  // ====================================================
  // FULL-MONTH PROTECTION
  // ====================================================

  if (
    !PREVIEW_MODE &&
    !hasFullCoverage(
      monthDays,
      period
    )
  ) {
    console.log(
      `Statistics coverage for ${period.label} is incomplete.`
    );

    console.log(
      `Recorded days: ${monthDays.length}`
    );

    console.log(
      "No Monthly Report will be posted."
    );

    return;
  }

  const reportState =
    loadReportState();

  if (!PREVIEW_MODE) {
    const alreadyPublished =
      reportState.publishedMonths.some(
        item =>
          item.key ===
          period.key
      );

    if (alreadyPublished) {
      console.log(
        `${period.label} Monthly Report was already published.`
      );

      console.log(
        "No duplicate Monthly Report will be posted."
      );

      return;
    }
  }

  const statistics =
    buildStatistics(
      monthDays
    );

  const activity =
    buildActivityAnalytics(
      monthDays
    );

  const driverHistory =
    loadDriverHistory();

  const movement =
    getDriverMovement(
      driverHistory,
      period
    );

  const milestones =
    getMilestones(
      period
    );

  console.log("");
  console.log(
    `Recorded days: ${statistics.recordedDays}`
  );

  console.log(
    `Members: ${statistics.startMembers} -> ${statistics.endMembers}`
  );

  console.log(
    `Growth: ${formatSigned(statistics.growth)}`
  );

  console.log(
    `Peak Online: ${statistics.peakOnline}`
  );

  console.log(
    `ETS2 Peak: ${statistics.peakETS2}`
  );

  console.log(
    `ATS Peak: ${statistics.peakATS}`
  );

  if (
    movement.complete
  ) {
    console.log(
      `Joined: ${movement.joined}`
    );

    console.log(
      `Left: ${movement.left}`
    );

    console.log(
      `Net Driver Growth: ${formatSigned(movement.net)}`
    );
  } else {
    console.log(
      "Driver Movement: incomplete history coverage"
    );
  }

  if (
    activity.mostUsedServer
  ) {
    console.log(
      `Most Used Server: ${activity.mostUsedServer}`
    );
  } else {
    console.log(
      "Most Used Server: no activity data"
    );
  }

  console.log(
    `Milestones: ${
      milestones.length > 0
        ? milestones.join(", ")
        : "none"
    }`
  );

  const content =
    buildReport(
      period,
      statistics,
      activity,
      movement,
      milestones
    );

  await sendReport(
    content
  );

  if (PREVIEW_MODE) {
    console.log("");
    console.log(
      "Monthly Report PREVIEW sent successfully."
    );

    console.log(
      "No publication state was changed."
    );

    return;
  }

  reportState.publishedMonths.push({
    key:
      period.key,

    month:
      period.label,

    publishedAt:
      nowISO(),

    startMembers:
      statistics.startMembers,

    endMembers:
      statistics.endMembers,

    growth:
      statistics.growth,

    joined:
      movement.complete
        ? movement.joined
        : null,

    left:
      movement.complete
        ? movement.left
        : null,

    netDriverGrowth:
      movement.complete
        ? movement.net
        : null,

    peakOnline:
      statistics.peakOnline,

    peakETS2:
      statistics.peakETS2,

    peakATS:
      statistics.peakATS,

    mostUsedServer:
      activity.mostUsedServer,

    milestones
  });

  saveReportState(
    reportState
  );

  console.log("");
  console.log(
    `${period.label} Monthly Report published successfully.`
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
    "Kings Logistics Monthly Report"
  );

  console.log(
    "=================================="
  );

  console.log("");

  await createMonthlyReport();

  console.log("");

  console.log(
    "Kings Monthly Report process completed successfully."
  );
}

start().catch(error => {
  console.error("");

  console.error(
    "Kings Monthly Report failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
