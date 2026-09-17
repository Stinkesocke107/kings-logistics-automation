const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — HR WEEKLY SUMMARY
// Uses only aggregate/public-safe persisted data.
// ======================================================

const HR_WEBHOOK_URL =
  process.env.HR_AUTOMATION_WEBHOOK_URL;

const PREVIEW_MODE =
  String(process.env.HR_WEEKLY_SUMMARY_PREVIEW || "")
    .toLowerCase() === "true";

const HISTORY_FILE =
  path.join(__dirname, "data", "driver-history.json");

const PROBATION_FILE =
  path.join(__dirname, "data", "probation-state.json");

const STATE_FILE =
  path.join(__dirname, "data", "hr-weekly-summary-state.json");

const DAY_MS = 24 * 60 * 60 * 1000;

function nowISO() {
  return new Date().toISOString();
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.warn(`Could not read ${path.basename(file)}.`);
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2) + "\n",
    "utf8"
  );
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSigned(number) {
  return number > 0 ? `+${number}` : String(number);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function getPreviousCompletedWeek() {
  const now = new Date();
  const today = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));

  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const currentWeekStart = new Date(
    today.getTime() - daysSinceMonday * DAY_MS
  );

  const start = new Date(
    currentWeekStart.getTime() - 7 * DAY_MS
  );

  const end = currentWeekStart;
  const endDisplay = new Date(end.getTime() - 1);

  return {
    start,
    end,
    key: start.toISOString().slice(0, 10),
    label: `${formatDate(start)} – ${formatDate(endDisplay)}`
  };
}

function getPreviewPeriod() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * DAY_MS);

  return {
    start,
    end,
    key: "preview",
    label: "Preview • Last 7 Days"
  };
}

function loadHistory() {
  const history = readJson(HISTORY_FILE, null);

  if (!history || !Array.isArray(history.events)) {
    throw new Error("Driver History does not exist or is invalid.");
  }

  return history;
}

function loadProbationState() {
  const state = readJson(PROBATION_FILE, { notified: [] });

  if (!Array.isArray(state.notified)) {
    state.notified = [];
  }

  return state;
}

function loadSummaryState() {
  const state = readJson(STATE_FILE, null);

  if (!state || !Array.isArray(state.publishedWeeks)) {
    return {
      version: 1,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      publishedWeeks: []
    };
  }

  return state;
}

function saveSummaryState(state) {
  state.updatedAt = nowISO();

  if (state.publishedWeeks.length > 104) {
    state.publishedWeeks = state.publishedWeeks.slice(-104);
  }

  writeJson(STATE_FILE, state);
}

function dateIsInPeriod(value, period) {
  const date = normalizeDate(value);

  if (!date) return false;

  return (
    date.getTime() >= period.start.getTime() &&
    date.getTime() < period.end.getTime()
  );
}

function buildWeeklyData(history, probationState, period) {
  const events = history.events.filter(event =>
    dateIsInPeriod(
      event.occurredAt || event.detectedAt,
      period
    )
  );

  const joined = events.filter(event => event.type === "join");
  const left = events.filter(event => event.type === "leave");
  const nameChanges = events.filter(
    event => event.type === "name_change"
  );

  const probationReviews = probationState.notified.filter(item =>
    item.notifiedAt &&
    dateIsInPeriod(item.notifiedAt, period)
  );

  return {
    currentDrivers: Number(history.currentDrivers || 0),
    joined,
    left,
    nameChanges,
    probationReviews,
    netGrowth: joined.length - left.length
  };
}

function buildEmbed(period, data) {
  return {
    title: PREVIEW_MODE
      ? "👑 Kings HR Weekly Summary • TEST"
      : "👑 Kings HR Weekly Summary",

    description: PREVIEW_MODE
      ? `Testing the weekly HR overview using **${period.label}**.`
      : `Weekly HR overview for **${period.label}**.`,

    color: 1584639,

    fields: [
      {
        name: "Current Drivers",
        value: `**${data.currentDrivers}**`,
        inline: false
      },
      {
        name: "Driver Movement",
        value:
          `Joined: **${data.joined.length}**\n` +
          `Left: **${data.left.length}**\n` +
          `Net Growth: **${formatSigned(data.netGrowth)}**`,
        inline: true
      },
      {
        name: "Probation",
        value: `Reviews Triggered: **${data.probationReviews.length}**`,
        inline: true
      },
      {
        name: "Name Changes",
        value: `**${data.nameChanges.length}**`,
        inline: true
      }
    ],

    footer: {
      text: PREVIEW_MODE
        ? "Kings Logistics • HR Automation • TEST"
        : "Kings Logistics • HR Automation"
    },

    timestamp: nowISO()
  };
}

async function sendSummary(period, data) {
  if (!HR_WEBHOOK_URL) {
    throw new Error("HR_AUTOMATION_WEBHOOK_URL is missing.");
  }

  const response = await fetch(HR_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      embeds: [buildEmbed(period, data)],
      allowed_mentions: { parse: [] }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HR Discord webhook failed: HTTP ${response.status} - ${errorText}`
    );
  }
}

function historyCoversPeriod(history, period) {
  const initializedAt = normalizeDate(history.initializedAt);

  return Boolean(
    initializedAt &&
    initializedAt.getTime() <= period.start.getTime()
  );
}

async function createWeeklySummary() {
  const history = loadHistory();
  const probationState = loadProbationState();
  const summaryState = loadSummaryState();

  const period = PREVIEW_MODE
    ? getPreviewPeriod()
    : getPreviousCompletedWeek();

  if (!PREVIEW_MODE && !historyCoversPeriod(history, period)) {
    console.log(
      "Driver History does not cover the complete reporting week."
    );
    console.log("No HR Weekly Summary will be posted.");
    return;
  }

  if (!PREVIEW_MODE) {
    const alreadyPublished = summaryState.publishedWeeks.some(
      item => item.key === period.key
    );

    if (alreadyPublished) {
      console.log(`Weekly Summary ${period.key} was already published.`);
      return;
    }
  }

  const data = buildWeeklyData(
    history,
    probationState,
    period
  );

  await sendSummary(period, data);

  if (PREVIEW_MODE) {
    console.log("TEST HR Weekly Summary sent successfully.");
    return;
  }

  summaryState.publishedWeeks.push({
    key: period.key,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    publishedAt: nowISO(),
    currentDrivers: data.currentDrivers,
    joined: data.joined.length,
    left: data.left.length,
    netGrowth: data.netGrowth,
    probationReviews: data.probationReviews.length,
    nameChanges: data.nameChanges.length
  });

  saveSummaryState(summaryState);

  console.log("HR Weekly Summary published successfully.");
}

async function start() {
  console.log("==================================");
  console.log("Kings Logistics HR Weekly Summary");
  console.log("==================================");

  await createWeeklySummary();

  console.log("Kings HR Weekly Summary process completed successfully.");
}

start().catch(error => {
  console.error("Kings HR Weekly Summary failed:");
  console.error(error);
  process.exit(1);
});
