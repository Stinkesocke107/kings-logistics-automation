const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — DRIVER PROBATION TRACKER
// ======================================================

const PROBATION_DAYS = 7;

const HR_WEBHOOK_URL =
  process.env.HR_AUTOMATION_WEBHOOK_URL;

const HISTORY_FILE =
  path.join(
    __dirname,
    "data",
    "driver-history.json"
  );

const STATE_FILE =
  path.join(
    __dirname,
    "data",
    "probation-state.json"
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
    console.error(
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

function getProfileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function toUnixTimestamp(dateString) {
  const time =
    new Date(dateString).getTime();

  if (
    !Number.isFinite(time)
  ) {
    return null;
  }

  return Math.floor(
    time / 1000
  );
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

function buildMembershipKey(
  tmpId,
  joinedAt
) {
  return `${tmpId}:${joinedAt}`;
}

// ======================================================
// LOAD DRIVER HISTORY
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
    throw new Error(
      "Driver History does not exist or is invalid."
    );
  }

  return history;
}

// ======================================================
// PROBATION STATE
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
      state.notified
    )
  ) {
    return {
      version: 1,
      initializedAt: nowISO(),
      updatedAt: nowISO(),
      notified: []
    };
  }

  return state;
}

function saveState(state) {
  state.updatedAt =
    nowISO();

  writeJson(
    STATE_FILE,
    state
  );

  console.log(
    "Probation state saved."
  );
}

// ======================================================
// FIND ACTIVE DRIVER
// ======================================================

function findCurrentMember(
  history,
  tmpId
) {
  return history.members.find(
    member =>
      Number(member.tmpId) ===
      Number(tmpId)
  );
}

// ======================================================
// CHECK WHETHER JOIN IS CURRENT MEMBERSHIP
// ======================================================

function isCurrentMembership(
  historyMember,
  joinEvent
) {
  if (!historyMember) {
    return false;
  }

  if (
    historyMember.status !==
    "active"
  ) {
    return false;
  }

  const currentJoin =
    normalizeDate(
      historyMember.lastJoinedAt
    );

  const eventJoin =
    normalizeDate(
      joinEvent.occurredAt
    );

  if (
    !currentJoin ||
    !eventJoin
  ) {
    return false;
  }

  return (
    currentJoin ===
    eventJoin
  );
}

// ======================================================
// PROBATION CALCULATION
// ======================================================

function probationDue(
  joinedAt
) {
  const joined =
    new Date(joinedAt);

  if (
    Number.isNaN(
      joined.getTime()
    )
  ) {
    return false;
  }

  const dueAt =
    joined.getTime() +
    (
      PROBATION_DAYS *
      24 *
      60 *
      60 *
      1000
    );

  return (
    Date.now() >=
    dueAt
  );
}

// ======================================================
// DISCORD HR MESSAGE
// ======================================================

async function sendProbationReminder(
  historyMember,
  joinEvent
) {
  if (!HR_WEBHOOK_URL) {
    throw new Error(
      "HR_AUTOMATION_WEBHOOK_URL is missing."
    );
  }

  const joinedUnix =
    toUnixTimestamp(
      joinEvent.occurredAt
    );

  const profileUrl =
    getProfileUrl(
      historyMember.tmpId
    );

  const joinedText =
    joinedUnix
      ? `<t:${joinedUnix}:F>\n<t:${joinedUnix}:R>`
      : joinEvent.occurredAt;

  const payload = {
    embeds: [
      {
        title:
          "👑 Kings Driver Probation Review",

        description:
          `**[${historyMember.currentName}](${profileUrl})** ` +
          `has reached the end of the **${PROBATION_DAYS}-day Driver probation period**.`,

        color:
          1584639,

        fields: [
          {
            name:
              "TruckersMP ID",

            value:
              String(
                historyMember.tmpId
              ),

            inline:
              true
          },
          {
            name:
              "Status",

            value:
              "Active Kings Driver",

            inline:
              true
          },
          {
            name:
              "Joined Kings",

            value:
              joinedText,

            inline:
              false
          },
          {
            name:
              "HR Action",

            value:
              "Please review the Driver's probation period and complete the appropriate internal decision.",

            inline:
              false
          }
        ],

        footer: {
          text:
            "Kings Logistics • HR Automation"
        },

        timestamp:
          nowISO()
      }
    ],

    allowed_mentions: {
      parse: []
    }
  };

  const response =
    await fetch(
      HR_WEBHOOK_URL,
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
    const errorText =
      await response.text();

    throw new Error(
      `HR Discord webhook failed: HTTP ${response.status} - ${errorText}`
    );
  }
}

// ======================================================
// MAIN
// ======================================================

async function checkProbations() {
  console.log(
    "Loading Kings Driver History..."
  );

  const history =
    loadHistory();

  const state =
    loadState();

  const joinEvents =
    history.events.filter(
      event =>
        event.type ===
        "join"
    );

  console.log(
    `Tracked Join events: ${joinEvents.length}`
  );

  let remindersSent =
    0;

  for (
    const joinEvent
    of joinEvents
  ) {
    const joinedAt =
      normalizeDate(
        joinEvent.occurredAt
      );

    if (!joinedAt) {
      continue;
    }

    const key =
      buildMembershipKey(
        joinEvent.tmpId,
        joinedAt
      );

    const alreadyNotified =
      state.notified.some(
        item =>
          item.key ===
          key
      );

    if (alreadyNotified) {
      continue;
    }

    const historyMember =
      findCurrentMember(
        history,
        joinEvent.tmpId
      );

    if (
      !isCurrentMembership(
        historyMember,
        joinEvent
      )
    ) {
      console.log(
        `Skipping old/inactive membership: ${joinEvent.username}`
      );

      continue;
    }

    if (
      !probationDue(
        joinedAt
      )
    ) {
      continue;
    }

    console.log(
      `Probation review due: ${historyMember.currentName}`
    );

    await sendProbationReminder(
      historyMember,
      joinEvent
    );

    state.notified.push({
      key,

      tmpId:
        historyMember.tmpId,

      username:
        historyMember.currentName,

      joinedAt,

      notifiedAt:
        nowISO()
    });

    remindersSent++;
  }

  if (
    remindersSent > 0
  ) {
    saveState(
      state
    );
  } else if (
    !fs.existsSync(
      STATE_FILE
    )
  ) {
    /*
      Creates the state file on the first run
      without creating fake probation reminders.
    */

    saveState(
      state
    );
  }

  console.log("");
  console.log(
    `Probation reminders sent: ${remindersSent}`
  );
}

// ======================================================
// START
// ======================================================

async function start() {
  console.log(
    "===================================="
  );

  console.log(
    "Kings Logistics Probation Tracker"
  );

  console.log(
    "===================================="
  );

  console.log("");

  await checkProbations();

  console.log("");
  console.log(
    "Kings Probation Tracker completed successfully."
  );
}

start().catch(error => {
  console.error("");

  console.error(
    "Kings Probation Tracker failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
