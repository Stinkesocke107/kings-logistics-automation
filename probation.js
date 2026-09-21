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

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || "1114967437788577792";
const HR_LEADERSHIP_CHANNEL_ID = process.env.HR_LEADERSHIP_CHANNEL_ID || null;
const HR_LEADERSHIP_CHANNEL_NAME = process.env.HR_LEADERSHIP_CHANNEL_NAME || "hr-leadership";
const DISCORD_API = "https://discord.com/api/v10";

const STATE_FILE =
  path.join(__dirname, "data", "probation-state.json");

function nowISO() {
  return new Date().toISOString();
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function getProbationKey() {
  if (!DRIVER_STATE_KEY || String(DRIVER_STATE_KEY).length < 32) {
    throw new Error("DRIVER_STATE_KEY is missing or too short. Use at least 32 characters.");
  }

  return crypto
    .createHash("sha256")
    .update("kings-probation-state-v1\\0")
    .update(String(DRIVER_STATE_KEY))
    .digest();
}

function membershipKey(tmpId, joinedAt) {
  return crypto
    .createHmac("sha256", getProbationKey())
    .update(`${tmpId}:${joinedAt}`)
    .digest("hex");
}

function probationDue(joinedAt) {
  const time = new Date(joinedAt).getTime();
  if (!Number.isFinite(time)) return false;
  return Date.now() >= time + PROBATION_DAYS * 24 * 60 * 60 * 1000;
}

function toUnixTimestamp(dateString) {
  const time = new Date(dateString).getTime();
  return Number.isFinite(time) ? Math.floor(time / 1000) : null;
}

function getProfileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function escapeMarkdown(value = "") {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

async function getCurrentMembers() {
  const response = await fetch(MEMBERS_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Kings Logistics Probation Tracker/2.0"
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`TruckersMP members request failed: HTTP ${response.status}`);
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
  if (state && state.version === 3 && Array.isArray(state.notified)) return state;

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

async function discord(pathname, options = {}) {
  if (!DISCORD_BOT_TOKEN) throw new Error("DISCORD_BOT_TOKEN is missing.");
  const method = String(options.method || "GET").toUpperCase();

  // HARD SAFETY GUARD: Probation automation may only read Discord data and
  // post an advisory reminder. It cannot modify members, roles, kicks, bans,
  // permissions, or any other personnel setting.
  if (method !== "GET") {
    const allowedWrite = /^\/channels\/\d+\/messages$/.test(pathname) && method === "POST";
    if (!allowedWrite) throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    "User-Agent": "Kings Logistics Probation Tracker/2.0"
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${DISCORD_API}${pathname}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on ${method} ${pathname}: ${text.slice(0, 500)}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeChannelName(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-");
}

async function resolveHrChannel() {
  if (HR_LEADERSHIP_CHANNEL_ID) {
    const channel = await discord(`/channels/${HR_LEADERSHIP_CHANNEL_ID}`);
    if (channel.guild_id && channel.guild_id !== DISCORD_GUILD_ID) {
      throw new Error(`HR Leadership channel ${HR_LEADERSHIP_CHANNEL_ID} is not in the configured guild.`);
    }
    return channel;
  }

  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const textChannels = (channels || []).filter(channel => [0, 5].includes(channel.type));
  const wanted = normalizeChannelName(HR_LEADERSHIP_CHANNEL_NAME).replace(/^-+|-+$/g, "");
  const exact = textChannels.find(channel =>
    normalizeChannelName(channel.name).replace(/^-+|-+$/g, "") === wanted
  );
  if (exact) return exact;

  const fuzzy = textChannels.filter(channel => {
    const name = normalizeChannelName(channel.name);
    return name.includes("hr") && name.includes("leadership");
  });
  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) {
    throw new Error(`Multiple HR Leadership channels found: ${fuzzy.map(channel => channel.name).join(", ")}`);
  }
  throw new Error(`Could not find HR Leadership channel "${HR_LEADERSHIP_CHANNEL_NAME}".`);
}

async function sendProbationReminder(member) {
  const channel = await resolveHrChannel();
  const joinedUnix = toUnixTimestamp(member.joinedAt);
  const joinedText = joinedUnix
    ? `<t:${joinedUnix}:F> (<t:${joinedUnix}:R>)`
    : member.joinedAt;

  const content = [
    "👥 **Probation Review Required**",
    "",
    `**[${escapeMarkdown(member.username)}](${getProfileUrl(member.tmpId)})** has reached the end of the **${PROBATION_DAYS}-day Driver probation period**.`,
    "",
    `**TruckersMP ID:** ${member.tmpId}`,
    `**Joined Kings:** ${joinedText}`,
    "**Status:** Active Kings Driver",
    "",
    "Please complete the internal HR review. Use `!probation complete TMP-ID` when the review itself is finished, or `!probation extend TMP-ID YYYY-MM-DD` if more review time is needed.",
    "",
    "🛡️ **Advisory only:** Kings Systems does not make or execute personnel decisions."
  ].join("\n");

  await discord(`/channels/${channel.id}/messages`, {
    method: "POST",
    body: {
      content,
      allowed_mentions: { parse: [] }
    }
  });

  console.log(`Probation reminder sent to #${channel.name} for TMP ${member.tmpId}.`);
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
    console.log("Probation baseline initialized without sending old reminders.");
    return;
  }

  const known = new Set(state.notified.map(item => String(item.key || "")));
  let remindersSent = 0;

  for (const member of members) {
    if (!probationDue(member.joinedAt)) continue;

    const key = membershipKey(member.tmpId, member.joinedAt);
    if (known.has(key)) continue;

    // Only persist the reminder as notified after Discord succeeds. Failed
    // reminders are retried on the next run.
    await sendProbationReminder(member);

    state.notified.push({
      key,
      notifiedAt: nowISO()
    });

    known.add(key);
    remindersSent++;
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
  console.log("Safety: No automatic personnel actions are implemented.");
}

start().catch(error => {
  console.error("Kings Probation Tracker failed:");
  console.error(error);
  process.exit(1);
});
