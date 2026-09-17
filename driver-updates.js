const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ======================================================
// KINGS LOGISTICS — DRIVER UPDATES
// Public-safe history + encrypted current member baseline.
// ======================================================

const KINGS_VTC_ID = 64284;
const HISTORY_RETENTION_DAYS = 730;

const MEMBERS_URL =
  `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/members`;

const DISCORD_WEBHOOK_URL =
  process.env.DRIVER_UPDATES_WEBHOOK_URL;

const DRIVER_STATE_KEY =
  process.env.DRIVER_STATE_KEY;

const STATE_FILE =
  path.join(__dirname, "data", "driver-members.json");

const HISTORY_FILE =
  path.join(__dirname, "data", "driver-history.json");

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

function escapeMarkdown(text = "") {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    return fallback;
  }

  try {
    return JSON.parse(
      fs.readFileSync(file, "utf8")
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
    { recursive: true }
  );

  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2) + "\n",
    "utf8"
  );
}

// ======================================================
// ENCRYPTED DRIVER MEMBER STATE
// ======================================================

function getEncryptionKey() {
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
    .update("kings-driver-state-v1\0")
    .update(String(DRIVER_STATE_KEY))
    .digest();
}

function encryptState(state) {
  const iv =
    crypto.randomBytes(12);

  const cipher =
    crypto.createCipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      iv
    );

  const plaintext =
    Buffer.from(
      JSON.stringify(state),
      "utf8"
    );

  const ciphertext =
    Buffer.concat([
      cipher.update(plaintext),
      cipher.final()
    ]);

  const authTag =
    cipher.getAuthTag();

  return {
    version: 2,
    encrypted: true,
    algorithm: "aes-256-gcm",
    keyDerivation: "sha256-domain-separated-v1",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function decryptState(container) {
  if (
    !container ||
    container.encrypted !== true ||
    container.algorithm !== "aes-256-gcm" ||
    !container.iv ||
    !container.authTag ||
    !container.ciphertext
  ) {
    return null;
  }

  try {
    const decipher =
      crypto.createDecipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        Buffer.from(
          container.iv,
          "base64"
        )
      );

    decipher.setAuthTag(
      Buffer.from(
        container.authTag,
        "base64"
      )
    );

    const plaintext =
      Buffer.concat([
        decipher.update(
          Buffer.from(
            container.ciphertext,
            "base64"
          )
        ),
        decipher.final()
      ]);

    const state =
      JSON.parse(
        plaintext.toString("utf8")
      );

    if (
      !state ||
      !Array.isArray(state.members)
    ) {
      throw new Error(
        "Decrypted Driver state is invalid."
      );
    }

    return state;
  } catch (error) {
    throw new Error(
      "Could not decrypt Driver member state. Check DRIVER_STATE_KEY."
    );
  }
}

function loadState() {
  const raw =
    readJson(
      STATE_FILE,
      null
    );

  if (!raw) {
    return {
      state: null,
      needsMigration: false
    };
  }

  if (
    raw.encrypted === true &&
    raw.ciphertext
  ) {
    return {
      state: decryptState(raw),
      needsMigration: false
    };
  }

  /*
    Backward-compatible private migration path.
    If an older plaintext state exists while the
    repository is still private, load it once and
    rewrite it encrypted after this run.
  */

  if (
    Array.isArray(raw.members)
  ) {
    return {
      state: raw,
      needsMigration: true
    };
  }

  /*
    Public-safe uninitialized placeholder.
    The first real run creates an encrypted baseline
    without sending Join / Leave messages.
  */

  return {
    state: null,
    needsMigration: false
  };
}

function saveState(members) {
  const state = {
    version: 2,
    updatedAt: nowISO(),
    totalMembers: members.length,
    members
  };

  writeJson(
    STATE_FILE,
    encryptState(state)
  );

  console.log(
    "Encrypted Driver member state saved."
  );
}

// ======================================================
// LOAD CURRENT KINGS MEMBERS
// ======================================================

async function getCurrentMembers() {
  console.log(
    "Loading Kings Logistics VTC members..."
  );

  const response =
    await fetch(
      MEMBERS_URL,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Kings Logistics Driver Automation"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `TruckersMP members request failed: HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

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

  const members =
    data.response.members
      .map(member => ({
        tmpId:
          Number(member.user_id),

        vtcMemberId:
          Number(member.id),

        username:
          String(
            member.username || ""
          ).trim(),

        joinDate:
          normalizeDate(
            member.joinDate
          )
      }))
      .filter(member =>
        Number.isFinite(
          member.tmpId
        ) &&
        member.username
      )
      .sort(
        (a, b) =>
          a.tmpId - b.tmpId
      );

  console.log(
    `Current Kings members: ${members.length}`
  );

  return members;
}

// ======================================================
// PUBLIC-SAFE DRIVER HISTORY
// ======================================================

function loadHistory(currentDrivers) {
  const history =
    readJson(
      HISTORY_FILE,
      null
    );

  if (
    history &&
    history.version === 2 &&
    Array.isArray(
      history.events
    )
  ) {
    history.members = [];
    history.currentDrivers =
      currentDrivers;

    return history;
  }

  const createdAt =
    nowISO();

  return {
    version: 2,
    initializedAt: createdAt,
    updatedAt: createdAt,
    currentDrivers,
    members: [],
    events: []
  };
}

function saveHistory(
  history,
  currentDrivers
) {
  const cutoff =
    Date.now() -
    HISTORY_RETENTION_DAYS *
      24 *
      60 *
      60 *
      1000;

  history.events =
    history.events.filter(
      event => {
        const time =
          new Date(
            event.occurredAt
          ).getTime();

        return (
          Number.isFinite(time) &&
          time >= cutoff
        );
      }
    );

  history.members = [];
  history.currentDrivers =
    currentDrivers;
  history.updatedAt =
    nowISO();

  writeJson(
    HISTORY_FILE,
    history
  );

  console.log(
    "Public-safe Driver History saved."
  );
}

function appendAnonymousEvents(
  history,
  type,
  count,
  occurredAt
) {
  for (
    let i = 0;
    i < count;
    i++
  ) {
    history.events.push({
      type,
      occurredAt
    });
  }
}

// ======================================================
// MEMBER COMPARISON
// ======================================================

function compareMembers(
  oldMembers,
  currentMembers
) {
  const oldMap =
    new Map(
      oldMembers.map(
        member => [
          Number(member.tmpId),
          member
        ]
      )
    );

  const currentMap =
    new Map(
      currentMembers.map(
        member => [
          Number(member.tmpId),
          member
        ]
      )
    );

  const joined = [];
  const left = [];
  const renamed = [];

  for (
    const [tmpId, member]
    of currentMap
  ) {
    if (
      !oldMap.has(tmpId)
    ) {
      joined.push(member);
      continue;
    }

    const oldMember =
      oldMap.get(tmpId);

    if (
      oldMember.username !==
      member.username
    ) {
      renamed.push({
        tmpId,
        oldUsername:
          oldMember.username,
        newUsername:
          member.username
      });
    }
  }

  for (
    const [tmpId, member]
    of oldMap
  ) {
    if (
      !currentMap.has(tmpId)
    ) {
      left.push(member);
    }
  }

  return {
    joined,
    left,
    renamed
  };
}

function validateMemberChange(
  oldMembers,
  currentMembers
) {
  if (
    oldMembers.length >= 20 &&
    currentMembers.length <
      oldMembers.length * 0.5
  ) {
    throw new Error(
      `Safety stop: Member count suddenly changed from ` +
      `${oldMembers.length} to ${currentMembers.length}. ` +
      "No Driver Updates were processed."
    );
  }
}

// ======================================================
// DISCORD
// ======================================================

function getProfileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function buildJoinMessage(member) {
  const name =
    escapeMarkdown(
      member.username
    );

  const profile =
    getProfileUrl(
      member.tmpId
    );

  return (
    `<:kings_arrow:1466617263699267694> ` +
    `Please welcome **[${name}](${profile})** to the ` +
    `<:KingsLogisticsLogo:1394506239920177243> ` +
    `**Kings Family** ` +
    `<:KingsLogisticsLogo:1394506239920177243> ` +
    `as a **Driver**! ` +
    `<:Cute_kings:1465424971143708702> ` +
    `We’re happy to have you with us — enjoy your time in the Kings Family! ` +
    `<:pepe_king:1465424883679891586>`
  );
}

function buildLeaveMessage(member) {
  const name =
    escapeMarkdown(
      member.username
    );

  const profile =
    getProfileUrl(
      member.tmpId
    );

  return (
    `<:kings_arrow:1466617263699267694> ` +
    `Please note that **[${name}](${profile})** is no longer part of ` +
    `<:KingsLogisticsLogo:1394506239920177243> ` +
    `**Kings Logistics** ` +
    `<:KingsLogisticsLogo:1394506239920177243>.`
  );
}

async function sendDiscordMessage(
  content
) {
  if (
    !DISCORD_WEBHOOK_URL
  ) {
    throw new Error(
      "DRIVER_UPDATES_WEBHOOK_URL is missing."
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
              parse: []
            }
          })
      }
    );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Discord webhook failed: HTTP ${response.status} - ${errorText}`
    );
  }
}

// ======================================================
// MAIN
// ======================================================

async function checkDriverUpdates() {
  const currentMembers =
    await getCurrentMembers();

  const loadedState =
    loadState();

  const state =
    loadedState.state;

  const history =
    loadHistory(
      currentMembers.length
    );

  if (!state) {
    console.log(
      "First encrypted Driver Updates baseline run detected."
    );

    saveState(
      currentMembers
    );

    saveHistory(
      history,
      currentMembers.length
    );

    console.log(
      "No public Join or Leave messages were posted."
    );

    return;
  }

  const oldMembers =
    state.members;

  validateMemberChange(
    oldMembers,
    currentMembers
  );

  const changes =
    compareMembers(
      oldMembers,
      currentMembers
    );

  console.log(
    `Joined: ${changes.joined.length}`
  );

  console.log(
    `Left: ${changes.left.length}`
  );

  console.log(
    `Name changes: ${changes.renamed.length}`
  );

  const hasChanges =
    changes.joined.length > 0 ||
    changes.left.length > 0 ||
    changes.renamed.length > 0;

  if (!hasChanges) {
    if (
      history.currentDrivers !==
      currentMembers.length
    ) {
      saveHistory(
        history,
        currentMembers.length
      );
    }

    if (
      loadedState.needsMigration
    ) {
      console.log(
        "Migrating plaintext Driver member state to encrypted storage."
      );

      saveState(
        currentMembers
      );
    }

    console.log(
      "No Kings Driver changes detected."
    );

    return;
  }

  for (
    const member
    of changes.joined
  ) {
    await sendDiscordMessage(
      buildJoinMessage(
        member
      )
    );
  }

  for (
    const member
    of changes.left
  ) {
    await sendDiscordMessage(
      buildLeaveMessage(
        member
      )
    );
  }

  /*
    Permanent data is changed only after all required
    Discord Join / Leave messages succeeded.
  */

  const detectedAt =
    nowISO();

  appendAnonymousEvents(
    history,
    "join",
    changes.joined.length,
    detectedAt
  );

  appendAnonymousEvents(
    history,
    "leave",
    changes.left.length,
    detectedAt
  );

  appendAnonymousEvents(
    history,
    "name_change",
    changes.renamed.length,
    detectedAt
  );

  saveHistory(
    history,
    currentMembers.length
  );

  saveState(
    currentMembers
  );
}

async function start() {
  console.log(
    "=================================="
  );

  console.log(
    "Kings Logistics Driver Automation"
  );

  console.log(
    "=================================="
  );

  await checkDriverUpdates();

  console.log(
    "Kings Driver Automation completed successfully."
  );
}

start().catch(error => {
  console.error(
    "Kings Driver Automation failed:"
  );

  console.error(error);
  process.exit(1);
});
