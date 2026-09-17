const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ======================================================
// KINGS LOGISTICS — DRIVER PROBATION TRACKER
// Public-safe state: no usernames or TMP IDs are persisted.
// ======================================================

const KINGS_VTC_ID = 64284;
const PROBATION_DAYS = 7;

const MEMBERS_URL =
  `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/members`;

const HR_WEBHOOK_URL =
  process.env.HR_AUTOMATION_WEBHOOK_URL;

const DRIVER_STATE_KEY =
  process.env.DRIVER_STATE_KEY;

const STATE_FILE =
  path.join(__dirname, "data", "probation-state.json");

function nowISO() {
  return new Date().toISOString();
}

function normalizeDate(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
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

function getProbationKey() {
  if (
    !DRIVER_STATE_KEY ||
    String(DRIVER_STATE_KEY).length < 32
  ) {
    throw new Error(
      "DRIVER_STATE_KEY is missing or too short. Use at least 32 characters."
    );
  }

  return crypto
    .createHash("sha256")
    .update("kings-probation-state-v1\\0")
    .update(String(DRIVER_STATE_KEY))
    .digest();
}

function membershipKey(tmpId, joinedAt) {
  return crypto
    .createHmac(
      "sha256",
      getProbationKey()
    )
    .update(`${tmpId}:${joinedAt}`)
    .digest("hex");
}

function probationDue(joinedAt) {
  const time = new Date(joinedAt).getTime();

  if (!Number.isFinite(time)) return false;

  return (
    Date.now() >=
    time + PROBATION_DAYS * 24 * 60 * 60 * 1000
  );
}

function toUnixTimestamp(dateString) {
  const time = new Date(dateString).getTime();

  return Number.isFinite(time)
    ? Math.floor(time / 1000)
    : null;
}

function getProfileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

async function getCurrentMembers() {
  const response = await fetch(MEMBERS_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Kings Logistics Probation Tracker"
    }
  });

  if (!response.ok) {
    throw new Error(
      `TruckersMP members request failed: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!data.response || !Array.isArray(data.response.members)) {
    throw new Error("Invalid TruckersMP VTC members response.");
  }

  return data.response.members
    .map(member => ({
      tmpId: Number(member.user_id),
      username: String(member.username || "").trim(),
      joinedAt: normalizeDate(member.joinDate)
    }))
    .filter(member =>
      Number.isFinite(member.tmpId) &&
      member.username &&
      member.joinedAt
    );
}

function loadState() {
  const state = readJson(STATE_FILE, null);

  if (
    state &&
    state.version === 3 &&
    Array.isArray(state.notified)
  ) {
    return state;
  }

  return {
    version: 3,
    initializedAt: null,
    updatedAt: null,
    notified: []
  };
}

function saveState(state) {
  state.updatedAt = nowISO();
  writeJson(STATE_FILE, state);
  console.log("Public-safe probation state saved.");
}

async function sendProbationReminder(member) {
  if (!HR_WEBHOOK_URL) {
    throw new Error("HR_AUTOMATION_WEBHOOK_URL is missing.");
  }

  const joinedUnix = toUnixTimestamp(member.joinedAt);
  const joinedText = joinedUnix
    ? `<t:${joinedUnix}:F>\n<t:${joinedUnix}:R>`
    : member.joinedAt;

  const payload = {
    embeds: [
      {
        title: "👑 Kings Driver Probation Review",
        description:
          `**[${member.username}](${getProfileUrl(member.tmpId)})** ` +
          `has reached the end of the **${PROBATION_DAYS}-day Driver probation period**.`,
        color: 1584639,
        fields: [
          {
            name: "TruckersMP ID",
            value: String(member.tmpId),
            inline: true
          },
          {
            name: "Status",
            value: "Active Kings Driver",
            inline: true
          },
          {
            name: "Joined Kings",
            value: joinedText,
            inline: false
          },
          {
            name: "HR Action",
            value:
              "Please review the Driver's probation period and complete the appropriate internal decision.",
            inline: false
          }
        ],
        footer: {
          text: "Kings Logistics • HR Automation"
        },
        timestamp: nowISO()
      }
    ],
    allowed_mentions: {
      parse: []
    }
  };

  const response = await fetch(HR_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HR Discord webhook failed: HTTP ${response.status} - ${errorText}`
    );
  }
}

async function checkProbations() {
  const members = await getCurrentMembers();
  const state = loadState();

  if (!state.initializedAt) {
    const baselineTime = nowISO();

    for (const member of members) {
      if (!probationDue(member.joinedAt)) continue;

      state.notified.push({
        key: membershipKey(member.tmpId, member.joinedAt),
        notifiedAt: null
      });
    }

    state.initializedAt = baselineTime;
    saveState(state);

    console.log(
      "Probation baseline initialized without sending old reminders."
    );

    return;
  }

  const known = new Set(
    state.notified.map(item => String(item.key || ""))
  );

  let remindersSent = 0;

  for (const member of members) {
    if (!probationDue(member.joinedAt)) continue;

    const key = membershipKey(member.tmpId, member.joinedAt);

    if (known.has(key)) continue;

    await sendProbationReminder(member);

    state.notified.push({
      key,
      notifiedAt: nowISO()
    });

    known.add(key);
    remindersSent++;
  }

  if (remindersSent > 0) {
    saveState(state);
  }

  console.log(`Probation reminders sent: ${remindersSent}`);
}

async function start() {
  console.log("====================================");
  console.log("Kings Logistics Probation Tracker");
  console.log("====================================");

  await checkProbations();

  console.log("Kings Probation Tracker completed successfully.");
}

start().catch(error => {
  console.error("Kings Probation Tracker failed:");
  console.error(error);
  process.exit(1);
});
