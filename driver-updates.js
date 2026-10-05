require('./kings-branding').installDiscordBranding();
const { resilientFetchJson } = require('./api-resilience');
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

const DISCORD_BOT_TOKEN =
  process.env.DISCORD_BOT_TOKEN || null;

const DISCORD_GUILD_ID =
  process.env.DISCORD_GUILD_ID || '1114967437788577792';

const DISCORD_API =
  'https://discord.com/api/v10';

const DRIVER_STATE_KEY =
  process.env.DRIVER_STATE_KEY;

const STATE_FILE =
  path.join(__dirname, "data", "driver-members.json");

const HISTORY_FILE =
  path.join(__dirname, "data", "driver-history.json");

const SUMMARY_FILE =
  path.join(__dirname, "data", "driver-updates-summary.json");

const CHANGE_GUARD_FILE =
  path.join(__dirname, "data", "driver-change-guard.json");

const LOYALTY_MAPPING_FILE =
  path.join(__dirname, "data", "driver-loyalty-roles.json");

const DRIVER_AUTHORITY =
  'discord-driver-role';

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


function getDomainEncryptionKey(domain) {
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
    .update(`${domain}\0`)
    .update(String(DRIVER_STATE_KEY))
    .digest();
}

function decryptDomainState(container, domain) {
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

  const decipher =
    crypto.createDecipheriv(
      "aes-256-gcm",
      getDomainEncryptionKey(domain),
      Buffer.from(container.iv, "base64")
    );

  decipher.setAuthTag(
    Buffer.from(container.authTag, "base64")
  );

  const plaintext =
    Buffer.concat([
      decipher.update(
        Buffer.from(container.ciphertext, "base64")
      ),
      decipher.final()
    ]);

  return JSON.parse(
    plaintext.toString("utf8")
  );
}

function loadLoyaltyMappings() {
  const raw =
    readJson(
      LOYALTY_MAPPING_FILE,
      null
    );

  if (!raw) return [];

  try {
    const state =
      decryptDomainState(
        raw,
        'kings-driver-loyalty-roles-v1'
      );

    return Array.isArray(state?.mappings)
      ? state.mappings
      : [];
  } catch (error) {
    console.warn(
      `Could not read verified Driver Loyalty mappings: ${error.message}`
    );

    return [];
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
    version: 3,
    authority: DRIVER_AUTHORITY,
    truckersmpCrossCheckMode: 'advisory-only',
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
    "Loading Kings Logistics VTC members with API resilience..."
  );

  const data = await resilientFetchJson(
    MEMBERS_URL,
    {
      label: 'truckersmp-vtc-members',
      retries: 3,
      timeoutMs: 15000,
      fetchOptions: {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Kings Logistics Driver Automation"
        }
      },
      validateJson: (payload) =>
        Boolean(
          payload &&
          payload.response &&
          Array.isArray(payload.response.members)
        )
    }
  );

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

  if (members.length === 0) {
    throw new Error(
      "Safety stop: TruckersMP returned an empty Kings member list."
    );
  }

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

function saveDriverUpdatesSummary(currentMembers, tmpMembers, driverRole) {
  const core = {
    version: 1,
    authority: DRIVER_AUTHORITY,
    currentDrivers: currentMembers.length,
    discordDriverRoleId: String(driverRole?.id || ''),
    discordDriverRoleName: String(driverRole?.name || ''),
    truckersmpAdvisoryDrivers: tmpMembers.length,
    safelyMatchedToTruckersmp: currentMembers.filter((member) => member.truckersmpVerified).length
  };

  const previous = readJson(SUMMARY_FILE, null);
  const previousCore = previous && typeof previous === 'object'
    ? {
        version: previous.version,
        authority: previous.authority,
        currentDrivers: previous.currentDrivers,
        discordDriverRoleId: previous.discordDriverRoleId,
        discordDriverRoleName: previous.discordDriverRoleName,
        truckersmpAdvisoryDrivers: previous.truckersmpAdvisoryDrivers,
        safelyMatchedToTruckersmp: previous.safelyMatchedToTruckersmp
      }
    : null;

  if (previousCore && JSON.stringify(previousCore) === JSON.stringify(core)) {
    return false;
  }

  writeJson(SUMMARY_FILE, {
    ...core,
    updatedAt: nowISO(),
    note: 'Discord Driver role is authoritative for Driver Updates. TruckersMP roster is advisory/cross-check only.'
  });

  console.log(
    `Driver Updates summary saved: Discord ${core.currentDrivers}; TruckersMP advisory ${core.truckersmpAdvisoryDrivers}; matched ${core.safelyMatchedToTruckersmp}.`
  );

  return true;
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


function memberSnapshotFingerprint(currentMembers) {
  const stable = currentMembers
    .map((member) =>
      member.discordUserId
        ? `discord:${member.discordUserId}`
        : Number.isFinite(Number(member.tmpId))
          ? `tmp:${Number(member.tmpId)}`
          : null
    )
    .filter(Boolean)
    .sort()
    .join(',');

  return crypto
    .createHash('sha256')
    .update(`kings-driver-change-guard-v1\0${stable}`)
    .digest('hex');
}

function clearChangeGuard() {
  if (!fs.existsSync(CHANGE_GUARD_FILE)) return;

  try {
    fs.unlinkSync(CHANGE_GUARD_FILE);
  } catch (error) {
    console.warn(`Could not clear Driver change guard: ${error.message}`);
  }
}

function destructiveChangeConfirmed(oldMembers, currentMembers, changes) {
  const oldCount = oldMembers.length;
  const currentCount = currentMembers.length;
  const leftCount = changes.left.length;
  const significant =
    leftCount >= 3 ||
    (oldCount >= 10 && leftCount / oldCount >= 0.10);

  if (!significant) {
    clearChangeGuard();
    return true;
  }

  const fingerprint = memberSnapshotFingerprint(currentMembers);
  const previous = readJson(CHANGE_GUARD_FILE, null);
  const now = Date.now();
  const previousObserved = previous?.observedAt
    ? new Date(previous.observedAt).getTime()
    : 0;
  const stillFresh =
    Number.isFinite(previousObserved) &&
    previousObserved > 0 &&
    now - previousObserved <= 2 * 60 * 60 * 1000;

  if (
    previous?.fingerprint === fingerprint &&
    previous?.oldCount === oldCount &&
    previous?.currentCount === currentCount &&
    stillFresh
  ) {
    console.warn(
      `Driver destructive-change guard confirmed the same ${leftCount}-leave snapshot on a second poll.`
    );
    clearChangeGuard();
    return true;
  }

  writeJson(
    CHANGE_GUARD_FILE,
    {
      version: 1,
      observedAt: nowISO(),
      oldCount,
      currentCount,
      leftCount,
      fingerprint
    }
  );

  console.warn(
    `Safety hold: ${leftCount} Driver leave(s) detected (${oldCount} -> ${currentCount}). ` +
    'No leave messages or permanent state changes will be made until the same snapshot is confirmed by the next poll.'
  );

  return false;
}

// ======================================================
// DISCORD DRIVER AUTHORITY
// ======================================================

function normalizeIdentity(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeRoleName(value = "") {
  return String(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function discordGet(pathname) {
  if (!DISCORD_BOT_TOKEN) {
    throw new Error(
      "DISCORD_BOT_TOKEN is missing for Discord-authoritative Driver Updates."
    );
  }

  const response =
    await fetch(
      `${DISCORD_API}${pathname}`,
      {
        method: "GET",
        headers: {
          Authorization:
            `Bot ${DISCORD_BOT_TOKEN}`,
          "User-Agent":
            "Kings Logistics Driver Updates/3.0"
        },
        signal:
          AbortSignal.timeout(15000)
      }
    );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Discord API ${response.status} on GET ${pathname}: ${text.slice(0, 500)}`
    );
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function listDiscordMembers() {
  const members = [];
  let after = null;

  for (
    let page = 0;
    page < 20;
    page++
  ) {
    const query =
      new URLSearchParams({
        limit: "1000"
      });

    if (after) {
      query.set(
        "after",
        after
      );
    }

    const batch =
      await discordGet(
        `/guilds/${DISCORD_GUILD_ID}/members?${query.toString()}`
      );

    if (!Array.isArray(batch)) {
      throw new Error(
        "Discord guild member response is invalid."
      );
    }

    members.push(...batch);

    if (batch.length < 1000) {
      break;
    }

    after =
      batch[
        batch.length - 1
      ]?.user?.id || null;

    if (!after) {
      throw new Error(
        "Discord member pagination cursor is missing."
      );
    }
  }

  return members.filter(
    member =>
      member?.user?.id &&
      !member.user.bot
  );
}

function driverRoleScore(
  role,
  members
) {
  const assigned =
    members.filter(
      member =>
        (member.roles || [])
          .map(String)
          .includes(
            String(role.id)
          )
    ).length;

  const raw =
    String(role.name || "");

  let score =
    assigned * 100;

  if (/^\s*[|｜]/.test(raw)) {
    score += 25;
  }

  if (/[━─═]{2,}/.test(raw)) {
    score -= 25;
  }

  return {
    role,
    assigned,
    score
  };
}

function resolveKingsDriverRole(
  roles,
  members
) {
  const candidates =
    (roles || [])
      .filter(role => {
        const normalized =
          normalizeRoleName(
            role.name
          );

        return (
          normalized === "kings drivers" ||
          normalized === "kings driver"
        );
      })
      .map(role =>
        driverRoleScore(
          role,
          members
        )
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(
            b.role.position || 0
          ) -
            Number(
              a.role.position || 0
            )
      );

  if (!candidates.length) {
    throw new Error(
      'Could not find the Kings Driver Discord role.'
    );
  }

  if (
    candidates.length > 1 &&
    candidates[0].score ===
      candidates[1].score &&
    candidates[0].assigned ===
      candidates[1].assigned
  ) {
    throw new Error(
      "Kings Driver Discord role is ambiguous: " +
      candidates
        .map(
          item =>
            `${item.role.name} (${item.role.id}, assignments ${item.assigned})`
        )
        .join(", ")
    );
  }

  const selected =
    candidates[0];

  console.log(
    `Discord Driver authority role: "${selected.role.name}" (${selected.role.id}) with ${selected.assigned} assignment(s).`
  );

  if (
    candidates.length > 1
  ) {
    console.log(
      "Ignored same-name Driver role candidate(s): " +
      candidates
        .slice(1)
        .map(
          item =>
            `"${item.role.name}" (${item.role.id}, assignments ${item.assigned})`
        )
        .join(", ")
    );
  }

  return selected.role;
}

function memberIdentityValues(
  member
) {
  return [
    member?.nick,
    member?.user?.global_name,
    member?.user?.username
  ]
    .map(
      normalizeIdentity
    )
    .filter(Boolean);
}

function buildTmpEnrichment(
  tmpMembers,
  loyaltyMappings,
  discordMembers
) {
  const byDiscord =
    new Map();

  const tmpById =
    new Map(
      tmpMembers.map(
        member => [
          Number(member.tmpId),
          member
        ]
      )
    );

  for (
    const mapping
    of loyaltyMappings
  ) {
    const tmpId =
      Number(
        mapping?.tmpId
      );

    const discordUserId =
      String(
        mapping?.discordUserId || ""
      );

    if (
      !Number.isFinite(tmpId) ||
      !/^\d{15,22}$/.test(
        discordUserId
      ) ||
      !tmpById.has(tmpId)
    ) {
      continue;
    }

    byDiscord.set(
      discordUserId,
      {
        ...tmpById.get(tmpId),
        matchSource:
          "verified-driver-mapping"
      }
    );
  }

  const identityIndex =
    new Map();

  for (
    const member
    of discordMembers
  ) {
    for (
      const identity
      of new Set(
        memberIdentityValues(
          member
        )
      )
    ) {
      const ids =
        identityIndex.get(
          identity
        ) ||
        new Set();

      ids.add(
        String(
          member.user.id
        )
      );

      identityIndex.set(
        identity,
        ids
      );
    }
  }

  for (
    const tmp
    of tmpMembers
  ) {
    if (
      [...byDiscord.values()]
        .some(
          entry =>
            Number(entry.tmpId) ===
            Number(tmp.tmpId)
        )
    ) {
      continue;
    }

    const matches =
      [
        ...(
          identityIndex.get(
            normalizeIdentity(
              tmp.username
            )
          ) ||
          []
        )
      ];

    if (
      matches.length === 1 &&
      !byDiscord.has(
        String(
          matches[0]
        )
      )
    ) {
      byDiscord.set(
        String(
          matches[0]
        ),
        {
          ...tmp,
          matchSource:
            "unique-exact-name-match"
        }
      );
    }
  }

  return byDiscord;
}

async function getDiscordAuthoritativeDrivers(
  tmpMembers
) {
  const [
    roles,
    discordMembers
  ] =
    await Promise.all([
      discordGet(
        `/guilds/${DISCORD_GUILD_ID}/roles`
      ),
      listDiscordMembers()
    ]);

  const driverRole =
    resolveKingsDriverRole(
      roles,
      discordMembers
    );

  const enrichment =
    buildTmpEnrichment(
      tmpMembers,
      loadLoyaltyMappings(),
      discordMembers
    );

  const drivers =
    discordMembers
      .filter(
        member =>
          (member.roles || [])
            .map(String)
            .includes(
              String(
                driverRole.id
              )
            )
      )
      .map(member => {
        const discordUserId =
          String(
            member.user.id
          );

        const tmp =
          enrichment.get(
            discordUserId
          ) ||
          null;

        return {
          discordUserId,
          username:
            String(
              member.nick ||
              member.user.global_name ||
              member.user.username ||
              discordUserId
            ).trim(),
          tmpId:
            Number.isFinite(
              Number(
                tmp?.tmpId
              )
            )
              ? Number(
                  tmp.tmpId
                )
              : null,
          vtcMemberId:
            Number.isFinite(
              Number(
                tmp?.vtcMemberId
              )
            )
              ? Number(
                  tmp.vtcMemberId
                )
              : null,
          joinDate:
            tmp?.joinDate ||
            null,
          truckersmpUsername:
            tmp?.username ||
            null,
          truckersmpVerified:
            Boolean(tmp),
          truckersmpMatchSource:
            tmp?.matchSource ||
            null
        };
      })
      .sort(
        (a, b) =>
          a.discordUserId.localeCompare(
            b.discordUserId
          )
      );

  return {
    drivers,
    driverRole,
    discordMembers,
    enrichment
  };
}

function compareDiscordDrivers(
  oldMembers,
  currentMembers
) {
  const oldMap =
    new Map(
      oldMembers
        .filter(
          member =>
            member.discordUserId
        )
        .map(
          member => [
            String(
              member.discordUserId
            ),
            member
          ]
        )
    );

  const currentMap =
    new Map(
      currentMembers.map(
        member => [
          String(
            member.discordUserId
          ),
          member
        ]
      )
    );

  const joined = [];
  const left = [];
  const renamed = [];

  for (
    const [
      discordUserId,
      member
    ]
    of currentMap
  ) {
    if (
      !oldMap.has(
        discordUserId
      )
    ) {
      joined.push(
        member
      );
      continue;
    }

    const oldMember =
      oldMap.get(
        discordUserId
      );

    if (
      oldMember.username !==
      member.username
    ) {
      renamed.push({
        discordUserId,
        oldUsername:
          oldMember.username,
        newUsername:
          member.username
      });
    }
  }

  for (
    const [
      discordUserId,
      member
    ]
    of oldMap
  ) {
    if (
      !currentMap.has(
        discordUserId
      )
    ) {
      left.push(
        member
      );
    }
  }

  return {
    joined,
    left,
    renamed
  };
}

function logTruckersMpAdvisories(
  changes,
  tmpMembers
) {
  const currentTmpIds =
    new Set(
      tmpMembers
        .map(
          member =>
            Number(
              member.tmpId
            )
        )
        .filter(
          Number.isFinite
        )
    );

  for (
    const member
    of changes.joined
  ) {
    if (
      !member.truckersmpVerified
    ) {
      console.warn(
        `ADVISORY SOURCE MISMATCH: Discord-authoritative Driver join for ${member.username} is not safely matched to TruckersMP yet.`
      );
    }
  }

  for (
    const member
    of changes.left
  ) {
    const tmpId =
      Number(
        member.tmpId
      );

    if (
      Number.isFinite(
        tmpId
      ) &&
      currentTmpIds.has(
        tmpId
      )
    ) {
      console.warn(
        `ADVISORY SOURCE MISMATCH: Discord-authoritative Driver leave for ${member.username}, while TruckersMP still lists TMP ${tmpId} as a current Kings member.`
      );
    }
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
      "This is treated as an untrusted API snapshot. No Driver Updates were processed."
    );
  }

  if (
    oldMembers.length >= 10 &&
    currentMembers.length === 0
  ) {
    throw new Error(
      "Safety stop: TruckersMP returned zero Kings members. No Driver Updates were processed."
    );
  }
}

// ======================================================
// DISCORD
// ======================================================

function getProfileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function driverDisplay(member) {
  const displayName =
    escapeMarkdown(
      member.truckersmpUsername ||
      member.username ||
      "Kings Driver"
    );

  if (
    Number.isFinite(
      Number(
        member.tmpId
      )
    )
  ) {
    return `**[${displayName}](${getProfileUrl(Number(member.tmpId))})**`;
  }

  if (
    member.discordUserId
  ) {
    return `<@${member.discordUserId}>`;
  }

  return `**${displayName}**`;
}

function buildJoinMessage(member) {
  return (
    `<:kings_arrow:1466617263699267694> ` +
    `Please welcome ${driverDisplay(member)} to the ` +
    `<:Kings_Logistics_Logo:1545254529648431124> ` +
    `**Kings Family** ` +
    `<:Kings_Logistics_Logo:1545254529648431124> ` +
    `as a **Driver**! ` +
    `We’re happy to have you with us — enjoy your time in the Kings Family! ` +
    `<:pepe_king:1465424883679891586>`
  );
}

function buildLeaveMessage(member) {
  return (
    `<:kings_arrow:1466617263699267694> ` +
    `Please note that ${driverDisplay(member)} is no longer part of ` +
    `<:Kings_Logistics_Logo:1545254529648431124> ` +
    `**Kings Logistics** ` +
    `<:Kings_Logistics_Logo:1545254529648431124>.`
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
  const tmpMembers =
    await getCurrentMembers();

  const discordAuthority =
    await getDiscordAuthoritativeDrivers(
      tmpMembers
    );

  const currentMembers =
    discordAuthority.drivers;

  console.log(
    `Driver authority: Discord role "${discordAuthority.driverRole.name}" (${discordAuthority.driverRole.id}).`
  );

  console.log(
    `Current Discord-authoritative Kings Drivers: ${currentMembers.length}`
  );

  console.log(
    `TruckersMP advisory roster: ${tmpMembers.length}`
  );

  console.log(
    `Discord Drivers safely matched to TruckersMP: ${currentMembers.filter(member => member.truckersmpVerified).length}/${currentMembers.length}`
  );

  saveDriverUpdatesSummary(
    currentMembers,
    tmpMembers,
    discordAuthority.driverRole
  );

  const loadedState =
    loadState();

  const state =
    loadedState.state;

  const history =
    loadHistory(
      currentMembers.length
    );

  if (
    !state ||
    state.authority !==
      DRIVER_AUTHORITY ||
    !state.members.every(
      member =>
        member.discordUserId
    )
  ) {
    console.log(
      "Creating Discord-authoritative Driver Updates baseline."
    );

    saveState(
      currentMembers
    );

    if (
      history.currentDrivers !==
      currentMembers.length
    ) {
      saveHistory(
        history,
        currentMembers.length
      );
    }

    console.log(
      "Authority migration completed. No public Join or Leave messages were posted."
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
    compareDiscordDrivers(
      oldMembers,
      currentMembers
    );

  console.log(
    `Discord-authoritative Joined: ${changes.joined.length}`
  );

  console.log(
    `Discord-authoritative Left: ${changes.left.length}`
  );

  console.log(
    `Discord name changes: ${changes.renamed.length}`
  );

  logTruckersMpAdvisories(
    changes,
    tmpMembers
  );

  const hasChanges =
    changes.joined.length > 0 ||
    changes.left.length > 0 ||
    changes.renamed.length > 0;

  if (
    !destructiveChangeConfirmed(
      oldMembers,
      currentMembers,
      changes
    )
  ) {
    return;
  }

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

    console.log(
      "No Discord-authoritative Kings Driver changes detected."
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
