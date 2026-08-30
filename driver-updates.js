const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — DRIVER UPDATES & DRIVER HISTORY
// ======================================================

const KINGS_VTC_ID = 64284;

const MEMBERS_URL =
  `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/members`;

const DISCORD_WEBHOOK_URL =
  process.env.DRIVER_UPDATES_WEBHOOK_URL;

const STATE_FILE =
  path.join(
    __dirname,
    "data",
    "driver-members.json"
  );

const HISTORY_FILE =
  path.join(
    __dirname,
    "data",
    "driver-history.json"
  );

// ======================================================
// HELPERS
// ======================================================

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

function getProfileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function nowISO() {
  return new Date().toISOString();
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

  return date.toISOString();
}

function ensureDataDirectory() {
  fs.mkdirSync(
    path.join(
      __dirname,
      "data"
    ),
    {
      recursive: true
    }
  );
}

function readJson(
  file,
  fallback
) {
  if (
    !fs.existsSync(file)
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
  ensureDataDirectory();

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
          "Accept":
            "application/json",

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
          Number(
            member.user_id
          ),

        vtcMemberId:
          Number(
            member.id
          ),

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
      );

  console.log(
    `Current Kings members: ${members.length}`
  );

  return members;
}

// ======================================================
// CURRENT MEMBER BASELINE
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
      state.members
    )
  ) {
    return null;
  }

  return state;
}

function saveState(
  members
) {
  writeJson(
    STATE_FILE,
    {
      updatedAt:
        nowISO(),

      totalMembers:
        members.length,

      members:
        members
          .slice()
          .sort(
            (a, b) =>
              a.tmpId -
              b.tmpId
          )
    }
  );

  console.log(
    "Driver member state saved."
  );
}

function stateNeedsUpgrade(
  state
) {
  if (!state) {
    return true;
  }

  return state.members.some(
    member =>
      !Object.prototype.hasOwnProperty.call(
        member,
        "joinDate"
      ) ||
      !Object.prototype.hasOwnProperty.call(
        member,
        "vtcMemberId"
      )
  );
}

// ======================================================
// DRIVER HISTORY
// ======================================================

function loadHistory() {
  const history =
    readJson(
      HISTORY_FILE,
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
    return null;
  }

  return history;
}

function createHistoryBaseline(
  currentMembers
) {
  const createdAt =
    nowISO();

  return {
    version:
      1,

    initializedAt:
      createdAt,

    updatedAt:
      createdAt,

    members:
      currentMembers
        .map(member => ({
          tmpId:
            member.tmpId,

          currentVtcMemberId:
            member.vtcMemberId,

          currentName:
            member.username,

          status:
            "active",

          /*
            firstKnownJoinAt means the earliest
            Kings join date known to this system.

            We do not claim this is necessarily
            the member's first-ever Kings
            membership in their entire history.
          */

          firstKnownJoinAt:
            member.joinDate,

          lastJoinedAt:
            member.joinDate,

          lastLeftAt:
            null,

          /*
            Only changes detected AFTER this
            History system was introduced are
            counted here.
          */

          joinCountTracked:
            0,

          leaveCountTracked:
            0,

          trackingStartedAt:
            createdAt,

          nameHistory: [
            {
              name:
                member.username,

              firstSeenAt:
                createdAt,

              lastSeenAt:
                null
            }
          ]
        }))
        .sort(
          (a, b) =>
            a.tmpId -
            b.tmpId
        ),

    /*
      Events begin from the introduction
      of this History system.

      Existing members are NOT added as
      fake historical Join events.
    */

    events:
      []
  };
}

function saveHistory(
  history
) {
  history.updatedAt =
    nowISO();

  history.members.sort(
    (a, b) =>
      a.tmpId -
      b.tmpId
  );

  writeJson(
    HISTORY_FILE,
    history
  );

  console.log(
    "Driver History saved."
  );
}

function findHistoryMember(
  history,
  tmpId
) {
  return history.members.find(
    member =>
      Number(
        member.tmpId
      ) ===
      Number(
        tmpId
      )
  );
}

function updateMemberName(
  historyMember,
  newName,
  detectedAt
) {
  if (
    historyMember.currentName ===
    newName
  ) {
    return;
  }

  const openName =
    historyMember.nameHistory
      .slice()
      .reverse()
      .find(
        item =>
          item.lastSeenAt ===
          null
      );

  if (openName) {
    openName.lastSeenAt =
      detectedAt;
  }

  historyMember.nameHistory.push({
    name:
      newName,

    firstSeenAt:
      detectedAt,

    lastSeenAt:
      null
  });

  historyMember.currentName =
    newName;
}

// ======================================================
// HISTORY — JOIN
// ======================================================

function recordJoin(
  history,
  member,
  detectedAt
) {
  let historyMember =
    findHistoryMember(
      history,
      member.tmpId
    );

  if (!historyMember) {
    historyMember = {
      tmpId:
        member.tmpId,

      currentVtcMemberId:
        member.vtcMemberId,

      currentName:
        member.username,

      status:
        "active",

      firstKnownJoinAt:
        member.joinDate ||
        detectedAt,

      lastJoinedAt:
        member.joinDate ||
        detectedAt,

      lastLeftAt:
        null,

      joinCountTracked:
        1,

      leaveCountTracked:
        0,

      trackingStartedAt:
        detectedAt,

      nameHistory: [
        {
          name:
            member.username,

          firstSeenAt:
            detectedAt,

          lastSeenAt:
            null
        }
      ]
    };

    history.members.push(
      historyMember
    );
  } else {
    updateMemberName(
      historyMember,
      member.username,
      detectedAt
    );

    historyMember.status =
      "active";

    historyMember.currentVtcMemberId =
      member.vtcMemberId;

    historyMember.lastJoinedAt =
      member.joinDate ||
      detectedAt;

    historyMember.joinCountTracked =
      Number(
        historyMember.joinCountTracked
      ) + 1;
  }

  history.events.push({
    type:
      "join",

    tmpId:
      member.tmpId,

    username:
      member.username,

    occurredAt:
      member.joinDate ||
      detectedAt,

    detectedAt:
      detectedAt
  });

  console.log(
    `History Join recorded: ${member.username}`
  );
}

// ======================================================
// HISTORY — LEAVE
// ======================================================

function recordLeave(
  history,
  member,
  detectedAt
) {
  let historyMember =
    findHistoryMember(
      history,
      member.tmpId
    );

  if (!historyMember) {
    historyMember = {
      tmpId:
        Number(
          member.tmpId
        ),

      currentVtcMemberId:
        member.vtcMemberId ||
        null,

      currentName:
        member.username,

      status:
        "left",

      firstKnownJoinAt:
        member.joinDate ||
        null,

      lastJoinedAt:
        member.joinDate ||
        null,

      lastLeftAt:
        detectedAt,

      joinCountTracked:
        0,

      leaveCountTracked:
        1,

      trackingStartedAt:
        detectedAt,

      nameHistory: [
        {
          name:
            member.username,

          firstSeenAt:
            detectedAt,

          lastSeenAt:
            detectedAt
        }
      ]
    };

    history.members.push(
      historyMember
    );
  } else {
    historyMember.status =
      "left";

    historyMember.lastLeftAt =
      detectedAt;

    historyMember.leaveCountTracked =
      Number(
        historyMember.leaveCountTracked
      ) + 1;
  }

  history.events.push({
    type:
      "leave",

    tmpId:
      Number(
        member.tmpId
      ),

    username:
      member.username,

    occurredAt:
      detectedAt,

    detectedAt:
      detectedAt
  });

  console.log(
    `History Leave recorded: ${member.username}`
  );
}

// ======================================================
// HISTORY — NAME CHANGE
// ======================================================

function recordNameChange(
  history,
  rename,
  detectedAt
) {
  const historyMember =
    findHistoryMember(
      history,
      rename.tmpId
    );

  if (historyMember) {
    updateMemberName(
      historyMember,
      rename.newUsername,
      detectedAt
    );
  }

  history.events.push({
    type:
      "name_change",

    tmpId:
      rename.tmpId,

    oldUsername:
      rename.oldUsername,

    newUsername:
      rename.newUsername,

    occurredAt:
      detectedAt,

    detectedAt:
      detectedAt
  });

  console.log(
    `History Name Change recorded: ` +
    `${rename.oldUsername} -> ${rename.newUsername}`
  );
}

// ======================================================
// DISCORD JOIN MESSAGE
// ======================================================

function buildJoinMessage(
  member
) {
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

// ======================================================
// DISCORD LEAVE MESSAGE
// ======================================================

function buildLeaveMessage(
  member
) {
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

// ======================================================
// SEND PUBLIC DRIVER UPDATE
// ======================================================

async function sendDiscordMessage(
  content
) {
  if (!DISCORD_WEBHOOK_URL) {
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
// COMPARE OLD + CURRENT MEMBER LIST
// ======================================================

function compareMembers(
  oldMembers,
  currentMembers
) {
  const oldMap =
    new Map(
      oldMembers.map(
        member => [
          Number(
            member.tmpId
          ),
          member
        ]
      )
    );

  const currentMap =
    new Map(
      currentMembers.map(
        member => [
          Number(
            member.tmpId
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
      tmpId,
      member
    ]
    of currentMap
  ) {
    if (
      !oldMap.has(
        tmpId
      )
    ) {
      joined.push(
        member
      );

      continue;
    }

    const oldMember =
      oldMap.get(
        tmpId
      );

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
    const [
      tmpId,
      member
    ]
    of oldMap
  ) {
    if (
      !currentMap.has(
        tmpId
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

// ======================================================
// SAFETY PROTECTION
// ======================================================

function validateMemberChange(
  oldMembers,
  currentMembers
) {
  /*
    Prevent a broken/incomplete TruckersMP
    response from generating dozens of
    false Leave messages.
  */

  if (
    oldMembers.length >= 20 &&
    currentMembers.length <
      oldMembers.length * 0.5
  ) {
    throw new Error(
      `Safety stop: Member count suddenly changed from ` +
      `${oldMembers.length} to ${currentMembers.length}. ` +
      `No Driver Updates or History changes were processed.`
    );
  }
}

// ======================================================
// MAIN DRIVER CHECK
// ======================================================

async function checkDriverUpdates() {
  const currentMembers =
    await getCurrentMembers();

  const state =
    loadState();

  let history =
    loadHistory();

  let historyCreated =
    false;

  // ====================================================
  // FIRST DRIVER HISTORY INITIALIZATION
  // ====================================================

  if (!history) {
    console.log("");
    console.log(
      "First Driver History run detected."
    );

    console.log(
      "Creating Driver History from current Kings members."
    );

    history =
      createHistoryBaseline(
        currentMembers
      );

    saveHistory(
      history
    );

    historyCreated =
      true;

    console.log(
      "Existing Drivers were added as the History baseline."
    );

    console.log(
      "No fake historical Join events were created."
    );
  }

  // ====================================================
  // FIRST DRIVER-UPDATES BASELINE
  // ====================================================

  if (
    !state ||
    !Array.isArray(
      state.members
    )
  ) {
    console.log("");
    console.log(
      "First Driver Updates baseline run detected."
    );

    saveState(
      currentMembers
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

  console.log("");
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

  const needsStateUpgrade =
    stateNeedsUpgrade(
      state
    );

  // ====================================================
  // NO CHANGES
  // ====================================================

  if (
    !hasChanges
  ) {
    console.log("");
    console.log(
      "No Kings Driver changes detected."
    );

    /*
      Existing driver-members.json was created
      before Join Dates were stored.

      Upgrade it once so future History data
      has the additional information.
    */

    if (
      needsStateUpgrade
    ) {
      console.log(
        "Upgrading Driver member baseline with TruckersMP Join Dates."
      );

      saveState(
        currentMembers
      );
    }

    if (
      historyCreated
    ) {
      console.log(
        "Driver History initialization completed."
      );
    }

    return;
  }

  // ====================================================
  // PUBLIC JOIN MESSAGES
  // ====================================================

  for (
    const member
    of changes.joined
  ) {
    console.log(
      `New Driver: ${member.username} (${member.tmpId})`
    );

    await sendDiscordMessage(
      buildJoinMessage(
        member
      )
    );
  }

  // ====================================================
  // PUBLIC LEAVE MESSAGES
  // ====================================================

  for (
    const member
    of changes.left
  ) {
    console.log(
      `Driver left: ${member.username} (${member.tmpId})`
    );

    await sendDiscordMessage(
      buildLeaveMessage(
        member
      )
    );
  }

  /*
    Only after all required Discord messages
    succeeded do we update our permanent data.
  */

  const detectedAt =
    nowISO();

  // ====================================================
  // HISTORY JOIN EVENTS
  // ====================================================

  for (
    const member
    of changes.joined
  ) {
    recordJoin(
      history,
      member,
      detectedAt
    );
  }

  // ====================================================
  // HISTORY LEAVE EVENTS
  // ====================================================

  for (
    const member
    of changes.left
  ) {
    recordLeave(
      history,
      member,
      detectedAt
    );
  }

  // ====================================================
  // HISTORY NAME CHANGES
  // ====================================================

  for (
    const rename
    of changes.renamed
  ) {
    console.log(
      `Name change: ${rename.oldUsername} -> ${rename.newUsername} ` +
      `(TMP ID ${rename.tmpId})`
    );

    recordNameChange(
      history,
      rename,
      detectedAt
    );
  }

  // ====================================================
  // SAVE PERMANENT DATA
  // ====================================================

  saveHistory(
    history
  );

  saveState(
    currentMembers
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
    "Kings Logistics Driver Automation"
  );

  console.log(
    "=================================="
  );

  console.log("");

  await checkDriverUpdates();

  console.log("");
  console.log(
    "Kings Driver Automation completed successfully."
  );
}

start().catch(error => {
  console.error("");

  console.error(
    "Kings Driver Automation failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
