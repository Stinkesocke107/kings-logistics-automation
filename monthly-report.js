const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — AUTOMATIC MONTHLY REPORT
// ======================================================

const DISCORD_WEBHOOK_URL =
  process.env.MONTHLY_REPORT_DISCORD_WEBHOOK_URL;

const NEWS_ROLE_ID =
  process.env.NEWS_NOTIFICATIONS_ROLE_ID;

const STATISTICS_FILE =
  path.join(
    __dirname,
    "data",
    "statistics.json"
  );

const REPORT_STATE_FILE =
  path.join(
    __dirname,
    "data",
    "monthly-report-state.json"
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

const MAX_DISCORD_LENGTH = 2000;


// ======================================================
// JSON HELPERS
// ======================================================

function readJson(
  file,
  fallback
) {
  if (
    !fs.existsSync(
      file
    )
  ) {
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
    console.error(
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


// ======================================================
// PREVIOUS MONTH
// ======================================================

function getPreviousMonth() {
  const now =
    new Date();

  const date =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - 1,
        1
      )
    );

  const year =
    date.getUTCFullYear();

  const monthNumber =
    date.getUTCMonth() + 1;

  const monthKey =
    `${year}-${String(monthNumber).padStart(2, "0")}`;

  const monthName =
    date.toLocaleString(
      "en-GB",
      {
        month: "long",
        timeZone: "UTC"
      }
    );

  const daysInMonth =
    new Date(
      Date.UTC(
        year,
        monthNumber,
        0
      )
    ).getUTCDate();

  return {
    year,
    monthNumber,
    monthKey,
    monthName,
    daysInMonth
  };
}


// ======================================================
// LOAD MONTHLY STATISTICS
// ======================================================

function getMonthStatistics(
  monthInfo
) {
  const statistics =
    readJson(
      STATISTICS_FILE,
      null
    );

  if (
    !statistics ||
    !Array.isArray(
      statistics.days
    )
  ) {
    return null;
  }

  const days =
    statistics.days
      .filter(
        day =>
          String(
            day.date
          ).startsWith(
            monthInfo.monthKey
          )
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(
            b.date
          )
      );

  if (
    days.length === 0
  ) {
    return null;
  }

  const firstDay =
    days[0];

  const lastDay =
    days[
      days.length - 1
    ];

  const startMembers =
    Number(
      firstDay.startMembers
    ) || 0;

  const endMembers =
    Number(
      lastDay.members
    ) || startMembers;

  const growth =
    endMembers -
    startMembers;

  const peakOnline =
    Math.max(
      0,
      ...days.map(
        day =>
          Number(
            day.peakOnline
          ) || 0
      )
    );

  const peakETS2 =
    Math.max(
      0,
      ...days.map(
        day =>
          Number(
            day.peakETS2
          ) || 0
      )
    );

  const peakATS =
    Math.max(
      0,
      ...days.map(
        day =>
          Number(
            day.peakATS
          ) || 0
      )
    );

  const firstRecordedDay =
    Number(
      firstDay.date.slice(
        -2
      )
    );

  const lastRecordedDay =
    Number(
      lastDay.date.slice(
        -2
      )
    );

  /*
    We do not want to publish a misleading
    monthly report if Statistics only recorded
    a few days of the month.

    Requirements:
    - At least 20 recorded days
    - Recording started by day 3
    - Recording continued until the final
      three days of the month
  */

  const enoughCoverage =
    days.length >= 20 &&
    firstRecordedDay <= 3 &&
    lastRecordedDay >=
      monthInfo.daysInMonth - 2;

  return {
    recordedDays:
      days.length,

    firstRecordedDate:
      firstDay.date,

    lastRecordedDate:
      lastDay.date,

    startMembers,
    endMembers,
    growth,

    peakOnline,
    peakETS2,
    peakATS,

    enoughCoverage
  };
}


// ======================================================
// FIND MILESTONES REACHED DURING MONTH
// ======================================================

function getMilestonesForMonth(
  monthInfo
) {
  const milestoneEntries =
    [];

  // ====================================================
  // CURRENT CHANGELOG QUEUE
  // ====================================================

  const queue =
    readJson(
      CHANGELOG_QUEUE_FILE,
      {
        entries: []
      }
    );

  if (
    Array.isArray(
      queue.entries
    )
  ) {
    milestoneEntries.push(
      ...queue.entries
    );
  }

  // ====================================================
  // PUBLISHED CHANGELOG HISTORY
  // ====================================================

  const history =
    readJson(
      CHANGELOG_HISTORY_FILE,
      {
        changelogs: []
      }
    );

  if (
    Array.isArray(
      history.changelogs
    )
  ) {
    for (
      const changelog
      of history.changelogs
    ) {
      if (
        Array.isArray(
          changelog.entries
        )
      ) {
        milestoneEntries.push(
          ...changelog.entries
        );
      }
    }
  }

  const milestones =
    new Map();

  for (
    const entry
    of milestoneEntries
  ) {
    const source =
      String(
        entry.source || ""
      );

    if (
      !source.startsWith(
        "milestone-"
      )
    ) {
      continue;
    }

    if (
      !entry.addedAt
    ) {
      continue;
    }

    const addedAt =
      String(
        entry.addedAt
      );

    if (
      !addedAt.startsWith(
        monthInfo.monthKey
      )
    ) {
      continue;
    }

    const milestone =
      Number(
        source.replace(
          "milestone-",
          ""
        )
      );

    if (
      !Number.isFinite(
        milestone
      )
    ) {
      continue;
    }

    milestones.set(
      milestone,
      milestone
    );
  }

  return Array.from(
    milestones.values()
  ).sort(
    (a, b) =>
      a - b
  );
}


// ======================================================
// REPORT STATE / DUPLICATE PROTECTION
// ======================================================

function loadReportState() {
  const state =
    readJson(
      REPORT_STATE_FILE,
      {
        publishedMonths: []
      }
    );

  if (
    !Array.isArray(
      state.publishedMonths
    )
  ) {
    state.publishedMonths = [];
  }

  return state;
}


function hasAlreadyPublished(
  state,
  monthKey
) {
  return state.publishedMonths
    .some(
      report =>
        report.month ===
        monthKey
    );
}


function savePublishedReport(
  state,
  monthInfo,
  statistics,
  milestones
) {
  state.publishedMonths.push({
    month:
      monthInfo.monthKey,

    publishedAt:
      new Date().toISOString(),

    startMembers:
      statistics.startMembers,

    endMembers:
      statistics.endMembers,

    growth:
      statistics.growth,

    peakOnline:
      statistics.peakOnline,

    peakETS2:
      statistics.peakETS2,

    peakATS:
      statistics.peakATS,

    recordedDays:
      statistics.recordedDays,

    milestones:
      milestones
  });

  writeJson(
    REPORT_STATE_FILE,
    state
  );

  console.log(
    "Monthly Report state saved."
  );
}


// ======================================================
// FORMAT GROWTH
// ======================================================

function formatGrowth(
  growth
) {
  if (
    growth > 0
  ) {
    return `+${growth}`;
  }

  return String(
    growth
  );
}


// ======================================================
// BUILD PUBLIC MONTHLY REPORT
// ======================================================

function buildMonthlyReport(
  monthInfo,
  statistics,
  milestones
) {
  let content =
    `<@&${NEWS_ROLE_ID}>\n\n` +

    `👑📊 **Kings Logistics — ${monthInfo.monthName} ${monthInfo.year} Monthly Report**\n\n` +

    `Another month has come to an end, and here is a look back at the latest ` +
    `Kings Logistics TruckersMP statistics and community growth.\n\n` +

    `**Members**\n` +
    `Start of Month: **${statistics.startMembers}**\n` +
    `End of Month: **${statistics.endMembers}**\n` +
    `Monthly Growth: **${formatGrowth(statistics.growth)}**\n\n` +

    `**TruckersMP Activity**\n` +
    `Highest Online: **${statistics.peakOnline}**\n` +
    `ETS2 Peak: **${statistics.peakETS2}**\n` +
    `ATS Peak: **${statistics.peakATS}**\n\n` +

    `**Milestones**\n`;

  if (
    milestones.length === 0
  ) {
    content +=
      `No new 50-member milestone was reached this month.`;
  } else {
    content +=
      milestones
        .map(
          milestone =>
            `🎉 **${milestone.toLocaleString("en-US")} TruckersMP Members** reached`
        )
        .join(
          "\n"
        );
  }

  content +=
    `\n\nThank you to everyone who continues to be part of the ` +
    `**Kings Logistics Family** and helps our community move forward together. 👑🌍🚛\n\n` +

    `**Kings Logistics — Connecting the world, creating friendships.** ` +
    `<:kings_heart:1500949819110326352>`;

  if (
    content.length >
    MAX_DISCORD_LENGTH
  ) {
    throw new Error(
      `Monthly Report is too long for Discord: ${content.length} characters.`
    );
  }

  return content;
}


// ======================================================
// SEND TO DISCORD
// ======================================================

async function sendToDiscord(
  content
) {
  if (
    !DISCORD_WEBHOOK_URL
  ) {
    throw new Error(
      "MONTHLY_REPORT_DISCORD_WEBHOOK_URL is missing."
    );
  }

  if (
    !NEWS_ROLE_ID
  ) {
    throw new Error(
      "NEWS_NOTIFICATIONS_ROLE_ID is missing."
    );
  }

  const response =
    await fetch(
      DISCORD_WEBHOOK_URL,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            content,

            allowed_mentions: {
              parse: [],

              roles: [
                NEWS_ROLE_ID
              ]
            }
          })
      }
    );

  if (
    !response.ok
  ) {
    const errorText =
      await response.text();

    throw new Error(
      `Discord Monthly Report failed: HTTP ${response.status} - ${errorText}`
    );
  }

  console.log(
    "Monthly Report posted successfully."
  );
}


// ======================================================
// CREATE MONTHLY REPORT
// ======================================================

async function createMonthlyReport() {
  const monthInfo =
    getPreviousMonth();

  console.log(
    `Preparing Monthly Report for ${monthInfo.monthName} ${monthInfo.year}...`
  );

  const state =
    loadReportState();

  // ====================================================
  // DUPLICATE PROTECTION
  // ====================================================

  if (
    hasAlreadyPublished(
      state,
      monthInfo.monthKey
    )
  ) {
    console.log("");
    console.log(
      `${monthInfo.monthName} ${monthInfo.year} was already published.`
    );

    console.log(
      "No duplicate Monthly Report will be posted."
    );

    return;
  }

  // ====================================================
  // STATISTICS
  // ====================================================

  const statistics =
    getMonthStatistics(
      monthInfo
    );

  if (
    !statistics
  ) {
    console.log("");
    console.log(
      `No Statistics data exists for ${monthInfo.monthName} ${monthInfo.year}.`
    );

    console.log(
      "No Monthly Report will be posted."
    );

    return;
  }

  console.log(
    `Recorded Statistics days: ${statistics.recordedDays}/${monthInfo.daysInMonth}`
  );

  // ====================================================
  // INCOMPLETE MONTH PROTECTION
  // ====================================================

  if (
    !statistics.enoughCoverage
  ) {
    console.log("");
    console.log(
      "Statistics coverage is not complete enough for a public Monthly Report."
    );

    console.log(
      "The report will be skipped to avoid publishing misleading data."
    );

    return;
  }

  // ====================================================
  // MILESTONES
  // ====================================================

  const milestones =
    getMilestonesForMonth(
      monthInfo
    );

  console.log(
    `Milestones during month: ${milestones.length}`
  );

  // ====================================================
  // BUILD + POST
  // ====================================================

  const content =
    buildMonthlyReport(
      monthInfo,
      statistics,
      milestones
    );

  await sendToDiscord(
    content
  );

  // ====================================================
  // SAVE ONLY AFTER SUCCESSFUL DISCORD POST
  // ====================================================

  savePublishedReport(
    state,
    monthInfo,
    statistics,
    milestones
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
