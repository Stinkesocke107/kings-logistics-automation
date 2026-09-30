"use strict";

// Stage 1: read-only inspection. No Discord writes or repository state updates.
const fs = require("node:fs");
const crypto = require("node:crypto");
const config = require("./convoy-preview-config.json");

class PreviewError extends Error {}
const snowflake = value => typeof value === "string" && /^\d{17,20}$/.test(value);

function validateConfig(settings) {
  if (!snowflake(settings.guildId) || !snowflake(settings.forumId) ||
      !Array.isArray(settings.staffRoleIds) || !settings.staffRoleIds.length ||
      !settings.staffRoleIds.every(snowflake)) {
    throw new PreviewError("Invalid preview configuration.");
  }
}

function reportKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new PreviewError("CONVOY_REPORT_KEY must be a base64-encoded random 32-byte key.");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new PreviewError("Invalid CONVOY_REPORT_KEY.");
  }
  return key;
}

function encryptReport(report, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("kings-convoy-preview-v1"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(report), "utf8"), cipher.final()]);
  return {
    version: 1, algorithm: "aes-256-gcm", purpose: "kings-convoy-preview-v1",
    iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function discordReader(token, fetchFn = fetch, sleep = ms => new Promise(r => setTimeout(r, ms))) {
  if (!token || /\s/.test(token)) throw new PreviewError("DISCORD_BOT_TOKEN is missing or invalid.");
  return async function get(route, missingOK = false) {
    if (!/^\/(channels|guilds)\/\d{17,20}(?:[/?]|$)/.test(route)) {
      throw new PreviewError("Unsupported Discord read route.");
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      try {
        response = await fetchFn(`https://discord.com/api/v10${route}`, {
          method: "GET", redirect: "error", signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bot ${token}`, "User-Agent": "KingsConvoyPreview/1.0" }
        });
      } catch { throw new PreviewError("Discord request failed or timed out; preview incomplete."); }
      if (response.status === 404 && missingOK) return null;
      if (response.status === 429) {
        let data;
        try { data = await response.json(); } catch { throw new PreviewError("Discord rate limit response unreadable."); }
        const delay = Number(data.retry_after);
        if (!Number.isFinite(delay) || delay < 0 || delay > 10 || attempt === 2) {
          throw new PreviewError("Discord rate limited the preview; retry later.");
        }
        await sleep(Math.ceil(delay * 1000) + 100);
        continue;
      }
      if (!response.ok) throw new PreviewError(`Discord returned HTTP ${response.status}; check bot access.`);
      try { return await response.json(); }
      catch { throw new PreviewError("Invalid Discord response; preview incomplete."); }
    }
  };
}

const labels = {
  "event type": "type", "eventtyp": "type",
  "truckersmp event link": "event", "truckersmp-eventlink": "event",
  "responsible event team member": "responsible", "zuständiges event-team-mitglied": "responsible",
  "confirmed kings slot": "slot", "bestätigter kings-slot": "slot",
  "slot confirmation": "confirmation", "slotbestätigung": "confirmation",
  "kings route": "route", "kings-route": "route",
  "kings meetup / assembly location": "location", "kings-treffpunkt / aufstellplatz": "location",
  "kings meetup time": "meetup", "kings-treffzeit": "meetup",
  "additional notes": "notes", "zusätzliche hinweise": "notes"
};

function parseFields(content) {
  const fields = {};
  for (const line of String(content || "").split(/\r?\n/)) {
    const match = line.replace(/\*\*/g, "").match(/^\s*([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = labels[match[1].trim().toLowerCase()];
    if (key) fields[key] = match[2].trim();
  }
  return fields;
}

function filled(value) {
  return Boolean(value && !/^(?:[-—]|n\/?a|none|tbd|unknown|pending|\[.*\])$/i.test(value) &&
    !/^(?:required for|bei fremden|link to the confirmation|link zur bestätigungs|specify our|unsere zugewiesene|preferably|möglichst|special instructions|besondere anweisungen)/i.test(value));
}

function eventId(value) {
  const match = String(value || "").match(/^<?https:\/\/(?:www\.)?truckersmp\.com\/events\/(\d+)(?:-[^\s<>/?#]+)?\/?(?:[?#][^\s<>]*)?>?$/i);
  return match ? match[1] : null;
}

function inspectSubmission(starter, messages, authorized, tagNames) {
  const fields = parseFields(starter.content);
  const type = /^(external|fremder convoy)$/i.test(fields.type || "") ? "external" :
    /^(kings-hosted|eigener kings-convoy)$/i.test(fields.type || "") ? "kings" : null;
  const issues = [];
  const authorId = starter.author?.id;
  if (starter.author?.bot || starter.webhook_id || !authorized.has(authorId)) issues.push("unauthorized_submitter");
  if (!starter.content) issues.push("starter_content_unavailable_check_message_content_intent");
  if (!type) issues.push("event_type_missing_or_invalid");
  const id = eventId(fields.event);
  if (!id) issues.push("truckersmp_event_link_missing_or_invalid");
  if (!filled(fields.responsible)) issues.push("responsible_staff_missing");
  if (!filled(fields.location)) issues.push("assembly_location_missing");
  if (!filled(fields.meetup)) issues.push("meetup_missing");
  else if (!/^<t:\d{1,12}(?::[tTdDfFR])?>$/.test(fields.meetup)) issues.push("meetup_requires_manual_date_time_timezone_review");

  // Only staff-authored attachments count. Images remain on Discord; no URL is fetched.
  const images = messages.filter(m => !m.author?.bot && !m.webhook_id && authorized.has(m.author?.id))
    .flatMap(m => (m.attachments || []).filter(a => /^image\//.test(a.content_type || ""))
      .map(a => ({ messageId: m.id, attachmentId: a.id })));
  if (type === "external") {
    if (!filled(fields.slot)) issues.push("confirmed_slot_missing");
    if (!images.length) issues.push("slot_image_missing");
    if (!filled(fields.confirmation)) issues.push("slot_confirmation_reference_missing");
  }
  return {
    eventId: id, type, fields, issues, images, tagNames,
    checks: ["slot_evidence_not_verified", "route_and_event_data_not_verified",
      "convoy_limits_and_time_gaps_not_checked", "approval_actor_not_verified"],
    // A Scheduled tag never becomes authorization or an active event in this preview.
    automaticPublicationAllowed: false
  };
}

async function listThreads(get, settings) {
  const active = await get(`/guilds/${settings.guildId}/threads/active`);
  if (!Array.isArray(active.threads)) throw new PreviewError("Invalid active thread list.");
  const threads = new Map(active.threads.filter(t => t.parent_id === settings.forumId).map(t => [t.id, t]));
  let before;
  for (let page = 0; page < 20; page++) {
    const archived = await get(`/channels/${settings.forumId}/threads/archived/public?limit=100${before ? `&before=${encodeURIComponent(before)}` : ""}`);
    if (!Array.isArray(archived.threads) || typeof archived.has_more !== "boolean") throw new PreviewError("Invalid archived thread list.");
    for (const thread of archived.threads) {
      if (thread.parent_id !== settings.forumId) throw new PreviewError("Unexpected forum in archived response.");
      threads.set(thread.id, thread);
    }
    if (threads.size > 1000) throw new PreviewError("Thread limit exceeded; preview incomplete.");
    if (!archived.has_more) return [...threads.values()];
    const next = archived.threads.at(-1)?.thread_metadata?.archive_timestamp;
    if (!next || (before && next >= before)) throw new PreviewError("Archived pagination did not advance.");
    before = next;
  }
  throw new PreviewError("Archived pagination limit reached; preview incomplete.");
}

async function listMessages(get, threadId) {
  const messages = new Map();
  let before;
  for (let page = 0; page < 10; page++) {
    const batch = await get(`/channels/${threadId}/messages?limit=100${before ? `&before=${before}` : ""}`);
    if (!Array.isArray(batch)) throw new PreviewError("Invalid message list.");
    for (const message of batch) {
      if (!snowflake(message.id)) throw new PreviewError("Invalid message identifier.");
      messages.set(message.id, message);
    }
    if (batch.length < 100) return [...messages.values()];
    const next = batch.reduce((min, m) => BigInt(m.id) < BigInt(min) ? m.id : min, batch[0].id);
    if (before && BigInt(next) >= BigInt(before)) throw new PreviewError("Message pagination did not advance.");
    before = next;
  }
  throw new PreviewError("Message pagination limit reached; preview incomplete.");
}

async function runPreview(get, settings = config) {
  validateConfig(settings);
  const forum = await get(`/channels/${settings.forumId}`);
  if (forum.type !== 15 || forum.guild_id !== settings.guildId) throw new PreviewError("Configured channel is not a forum in the configured server.");
  const roles = await get(`/guilds/${settings.guildId}/roles`);
  if (!Array.isArray(roles) || settings.staffRoleIds.some(id => !roles.some(r => r.id === id))) {
    throw new PreviewError("One or more configured Event Team roles do not exist on this server.");
  }
  const threads = await listThreads(get, settings);
  const authorized = new Set();
  const checked = new Set();
  const posts = [];
  for (const thread of threads) {
    if (!snowflake(thread.id)) throw new PreviewError("Invalid thread identifier.");
    const starter = await get(`/channels/${thread.id}/messages/${thread.id}`, true);
    if (!starter) {
      posts.push({ threadId: thread.id, issues: ["starter_missing"], automaticPublicationAllowed: false });
      continue;
    }
    const messages = await listMessages(get, thread.id);
    if (!messages.some(m => m.id === starter.id)) messages.push(starter);
    for (const message of messages) {
      const id = message.author?.id;
      if (message.author?.bot || message.webhook_id || !snowflake(id) || checked.has(id)) continue;
      const member = await get(`/guilds/${settings.guildId}/members/${id}`, true);
      if (member && !Array.isArray(member.roles)) throw new PreviewError("Invalid member roles response.");
      if (member?.roles.some(role => settings.staffRoleIds.includes(role))) authorized.add(id);
      checked.add(id);
    }
    const tagNames = (thread.applied_tags || []).map(id => forum.available_tags?.find(t => t.id === id)?.name || "Unknown tag");
    posts.push({ threadId: thread.id, archived: Boolean(thread.thread_metadata?.archived),
      ...inspectSubmission(starter, messages, authorized, tagNames) });
  }
  const counts = new Map();
  for (const post of posts) if (post.eventId) counts.set(post.eventId, (counts.get(post.eventId) || 0) + 1);
  for (const post of posts) if (counts.get(post.eventId) > 1) post.issues.push("duplicate_event_id");
  return { version: 1, mode: "read-only-preview", generatedAt: new Date().toISOString(),
    guildId: settings.guildId, forumId: settings.forumId, posts };
}

async function main() {
  try {
    // Require encryption before reading any internal data.
    const key = reportKey(process.env.CONVOY_REPORT_KEY);
    const report = await runPreview(discordReader(process.env.DISCORD_BOT_TOKEN));
    fs.mkdirSync("tmp", { recursive: true });
    fs.writeFileSync("tmp/convoy-preview.enc.json", JSON.stringify(encryptReport(report, key)) + "\n", { mode: 0o600 });
    // Public logs contain no post titles, IDs, text, images, URLs or individual results.
    console.log("Read-only convoy preview complete. No Discord changes were made.");
    console.log(`Posts checked: ${report.posts.length}. Posts requiring attention: ${report.posts.filter(p => p.issues.length).length}.`);
    console.log("Detailed results are encrypted. This is not an approval or an active schedule.");
  } catch (error) {
    console.error(error instanceof PreviewError ? error.message : "Convoy preview failed; no detailed data was logged.");
    process.exitCode = 1;
  }
}

module.exports = { validateConfig, reportKey, encryptReport, discordReader, parseFields, eventId,
  inspectSubmission, listThreads, listMessages, runPreview };
if (require.main === module) main();
