const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — AUTOMATIC DRIVER UPDATES
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
          "Accept": "application/json",
          "User-Agent":
            "Kings Logistics Driver Updates"
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

        username:
          String(
            member.username || ""
          ).trim()
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
// LOAD PREVIOUS MEMBER STATE
// ======================================================

function loadState() {
  if (
    !fs.existsSync(
      STATE_FILE
    )
  ) {
    return null;
  }

  try {
    const raw =
      fs.readFileSync(
        STATE_FILE,
        "utf8"
      );

    const state =
      JSON.parse(
        raw
      );

    if (
      !Array.isArray(
        state.members
      )
    ) {
      return null;
    }

    return state;
  } catch (error) {
    console.error(
      "Could not read previous Driver Updates state."
    );

    return null;
  }
}

// ======================================================
// SAVE MEMBER STATE
// ======================================================

function saveState(members) {
  const directory =
    path.dirname(
      STATE_FILE
    );

  fs.mkdirSync(
    directory,
    {
      recursive: true
    }
  );

  const state = {
    updatedAt:
      new Date().toISOString(),

    totalMembers:
      members.length,

    members:
      members
        .slice()
        .sort(
          (a, b) =>
            a.tmpId - b.tmpId
        )
  };

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      state,
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(
    "Driver member state saved."
  );
}

// ======================================================
// JOIN MESSAGE
// ======================================================

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

// ======================================================
// LEAVE MESSAGE
// ======================================================

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

// ======================================================
// SEND DISCORD MESSAGE
// ======================================================

async function sendDiscordMessage(content) {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error(
      "DRIVER_UPDATES_WEBHOOK_URL is missing."
    );
  }

  const response =
    await fetch(
      DISCORD_WEBHOOK_URL,
      {
        method: "POST",

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
// COMPARE MEMBER LISTS
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

  // JOINED + NAME CHANGES

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

  // LEFT

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
    If TruckersMP ever returns a broken or
    incomplete member list, this protection
    prevents dozens of false Leave messages.
  */

  if (
    oldMembers.length >= 20 &&
    currentMembers.length <
      oldMembers.length * 0.5
  ) {
    throw new Error(
      `Safety stop: Member count suddenly changed from ` +
      `${oldMembers.length} to ${currentMembers.length}. ` +
      `No Driver Updates were posted.`
    );
  }
}

// ======================================================
// MAIN CHECK
// ======================================================

async function checkDriverUpdates() {
  const currentMembers =
    await getCurrentMembers();

  const state =
    loadState();

  // ====================================================
  // FIRST RUN
  // ====================================================

  /*
    First run only creates the baseline.

    Existing Kings members are NOT posted
    as new Drivers.
  */

  if (
    !state ||
    !Array.isArray(
      state.members
    )
  ) {
    console.log("");
    console.log(
      "First Driver Updates run detected."
    );

    console.log(
      "Saving current Kings members without posting Discord updates."
    );

    saveState(
      currentMembers
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

  // ====================================================
  // NO CHANGES
  // ====================================================

  /*
    VERY IMPORTANT:

    If nothing changed, the state file is
    NOT rewritten.

    This prevents unnecessary GitHub commits
    every few minutes.
  */

  if (
    changes.joined.length === 0 &&
    changes.left.length === 0 &&
    changes.renamed.length === 0
  ) {
    console.log("");
    console.log(
      "No Kings Driver changes detected."
    );

    return;
  }

  // ====================================================
  // NEW DRIVERS
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
  // DRIVERS WHO LEFT
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

  // ====================================================
  // NAME CHANGES
  // ====================================================

  /*
    A name change does NOT create a public
    Join or Leave message because the same
    TruckersMP ID identifies the same member.

    The new name is still saved for future checks.
  */

  for (
    const rename
    of changes.renamed
  ) {
    console.log(
      `Name change: ${rename.oldUsername} -> ${rename.newUsername} ` +
      `(TMP ID ${rename.tmpId})`
    );
  }

  // ====================================================
  // SAVE NEW BASELINE
  // ====================================================

  /*
    Only save AFTER required Discord messages
    were successfully sent.
  */

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
    "Kings Logistics Driver Updates"
  );

  console.log(
    "=================================="
  );

  console.log("");

  await checkDriverUpdates();

  console.log("");
  console.log(
    "Kings Driver Updates completed successfully."
  );
}

start().catch(error => {
  console.error("");

  console.error(
    "Kings Driver Updates failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
