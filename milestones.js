const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — AUTOMATIC MILESTONE DETECTOR
// ======================================================

const KINGS_VTC_ID = 64284;

const MEMBERS_URL =
  `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/members`;

const DISCORD_WEBHOOK_URL =
  process.env.MILESTONE_DISCORD_WEBHOOK_URL;

const NEWS_ROLE_ID =
  process.env.NEWS_NOTIFICATIONS_ROLE_ID;

const STATE_FILE =
  path.join(
    __dirname,
    "data",
    "milestones.json"
  );

const CHANGELOG_QUEUE_FILE =
  path.join(
    __dirname,
    "data",
    "changelog-queue.json"
  );

// ======================================================
// MILESTONES — EVERY 50 MEMBERS UNTIL 1000
// ======================================================

const MILESTONES = [];

for (
  let milestone = 150;
  milestone <= 1000;
  milestone += 50
) {
  MILESTONES.push(
    milestone
  );
}

// ======================================================
// HELPERS
// ======================================================

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
// LOAD CURRENT MEMBER COUNT
// ======================================================

async function getMemberCount() {
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
            "Kings Logistics Milestone Detector"
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

  const count =
    data.response.members.length;

  if (
    !Number.isFinite(count) ||
    count < 1
  ) {
    throw new Error(
      `Invalid Kings member count: ${count}`
    );
  }

  console.log(
    `Current Kings members: ${count}`
  );

  return count;
}

// ======================================================
// MILESTONE STATE
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
      state.reachedMilestones
    )
  ) {
    return null;
  }

  return state;
}

function saveState(
  reachedMilestones,
  memberCount,
  firstRun = false
) {
  const existingState =
    loadState();

  const state = {
    initializedAt:
      existingState?.initializedAt ||
      new Date().toISOString(),

    lastMilestoneUpdate:
      firstRun
        ? null
        : new Date().toISOString(),

    memberCountAtLastUpdate:
      memberCount,

    reachedMilestones:
      [
        ...new Set(
          reachedMilestones.map(
            Number
          )
        )
      ].sort(
        (a, b) =>
          a - b
      )
  };

  writeJson(
    STATE_FILE,
    state
  );

  console.log(
    "Milestone state saved."
  );
}

// ======================================================
// CHANGELOG QUEUE
// ======================================================

function addMilestoneToChangelog(
  milestone
) {
  const queue =
    readJson(
      CHANGELOG_QUEUE_FILE,
      {
        entries: []
      }
    );

  if (
    !Array.isArray(
      queue.entries
    )
  ) {
    queue.entries = [];
  }

  /*
    Every automatic milestone gets a unique
    source value.

    This prevents the same milestone from
    being added to the Changelog queue twice.
  */

  const source =
    `milestone-${milestone}`;

  const alreadyQueued =
    queue.entries.some(
      entry =>
        entry.source ===
        source
    );

  if (alreadyQueued) {
    console.log(
      `Milestone ${milestone} is already in the Changelog queue.`
    );

    return;
  }

  queue.entries.push({
    category:
      "Kings Milestones",

    text:
      `Kings Logistics reached ${milestone.toLocaleString("en-US")} members on TruckersMP.`,

    source:
      source,

    addedAt:
      new Date().toISOString()
  });

  writeJson(
    CHANGELOG_QUEUE_FILE,
    queue
  );

  console.log(
    `Milestone ${milestone} added to the Changelog queue.`
  );
}

// ======================================================
// NORMAL MILESTONE MESSAGE
// ======================================================

function buildMilestoneMessage(
  milestone
) {
  return (
    `<@&${NEWS_ROLE_ID}>\n\n` +

    `👑🎉 **${milestone.toLocaleString("en-US")} KINGS LOGISTICS MEMBERS**\n\n` +

    `We have officially reached another major milestone — ` +
    `**${milestone.toLocaleString("en-US")} members on TruckersMP!**\n\n` +

    `Thank you to every member of the ` +
    `**Kings Logistics Family** for being part of our journey ` +
    `and helping Kings continue to grow. 🌍🚛\n\n` +

    `This is another important step forward — ` +
    `and there is still much more ahead of us.\n\n` +

    `Thank you for being part of Kings. 👑\n\n` +

    `**Kings Logistics — Connecting the world, creating friendships.** ` +
    `<:kings_heart:1500949819110326352>`
  );
}

// ======================================================
// SPECIAL 1000 MEMBER MESSAGE
// ======================================================

function build1000Message() {
  return (
    `<@&${NEWS_ROLE_ID}>\n\n` +

    `👑🎉 **1,000 KINGS LOGISTICS MEMBERS** 🎉👑\n\n` +

    `Today, Kings Logistics has reached an extraordinary milestone — ` +
    `**1,000 members on TruckersMP.**\n\n` +

    `What started as a community has continued to grow into a ` +
    `worldwide Kings Family built around trucking, friendship, ` +
    `community and unforgettable moments. 🌍🚛\n\n` +

    `A huge thank you to every Driver, Staff member, partner, friend ` +
    `and community member who has been part of this journey.\n\n` +

    `**1,000 members is not simply another number — it is a major chapter ` +
    `in the history of Kings Logistics.**\n\n` +

    `And our journey is far from over. 👑\n\n` +

    `**Kings Logistics — Connecting the world, creating friendships.** ` +
    `<:kings_heart:1500949819110326352>`
  );
}

// ======================================================
// SEND MILESTONE TO DISCORD
// ======================================================

async function sendMilestone(
  milestone
) {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error(
      "MILESTONE_DISCORD_WEBHOOK_URL is missing."
    );
  }

  if (!NEWS_ROLE_ID) {
    throw new Error(
      "NEWS_NOTIFICATIONS_ROLE_ID is missing."
    );
  }

  const content =
    milestone === 1000
      ? build1000Message()
      : buildMilestoneMessage(
          milestone
        );

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

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Discord milestone post failed: HTTP ${response.status} - ${errorText}`
    );
  }

  console.log(
    `Milestone ${milestone} announcement posted successfully.`
  );
}

// ======================================================
// CHECK MILESTONES
// ======================================================

async function checkMilestones() {
  const memberCount =
    await getMemberCount();

  const state =
    loadState();

  // ====================================================
  // FIRST RUN
  // ====================================================

  if (!state) {
    console.log("");
    console.log(
      "First Milestone Detector run detected."
    );

    const alreadyReached =
      MILESTONES.filter(
        milestone =>
          milestone <=
          memberCount
      );

    console.log(
      `Marking ${alreadyReached.length} previous milestone(s) as already reached.`
    );

    saveState(
      alreadyReached,
      memberCount,
      true
    );

    console.log(
      "No old milestone announcements were posted."
    );

    return;
  }

  const reached =
    new Set(
      state.reachedMilestones.map(
        Number
      )
    );

  // ====================================================
  // FIND NEW MILESTONES
  // ====================================================

  const newMilestones =
    MILESTONES.filter(
      milestone =>
        memberCount >= milestone &&
        !reached.has(
          milestone
        )
    );

  console.log("");
  console.log(
    `New milestones detected: ${newMilestones.length}`
  );

  // ====================================================
  // NOTHING NEW
  // ====================================================

  if (
    newMilestones.length === 0
  ) {
    console.log(
      "No new Kings Logistics milestone reached."
    );

    return;
  }

  // ====================================================
  // HANDLE EACH NEW MILESTONE
  // ====================================================

  for (
    const milestone
    of newMilestones
  ) {
    console.log("");
    console.log(
      `New milestone reached: ${milestone}`
    );

    // 1. Public Kings News announcement
    await sendMilestone(
      milestone
    );

    // 2. Add to next Kings Changelog
    addMilestoneToChangelog(
      milestone
    );

    // 3. Permanently remember milestone
    reached.add(
      milestone
    );

    saveState(
      Array.from(
        reached
      ),
      memberCount
    );
  }
}

// ======================================================
// START
// ======================================================

async function start() {
  console.log(
    "=================================="
  );

  console.log(
    "Kings Logistics Milestone Detector"
  );

  console.log(
    "=================================="
  );

  console.log("");

  await checkMilestones();

  console.log("");
  console.log(
    "Kings Milestone check completed successfully."
  );
}

start().catch(error => {
  console.error("");

  console.error(
    "Kings Milestone Detector failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
