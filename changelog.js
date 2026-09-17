const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — AUTOMATIC CHANGELOG SYSTEM
// ======================================================

const DISCORD_WEBHOOK_URL =
  process.env.CHANGELOG_DISCORD_WEBHOOK_URL;

const STATE_FILE =
  path.join(
    __dirname,
    "data",
    "changelog-state.json"
  );

const QUEUE_FILE =
  path.join(
    __dirname,
    "data",
    "changelog-queue.json"
  );

const HISTORY_FILE =
  path.join(
    __dirname,
    "data",
    "changelog-history.json"
  );

const KINGS_HEART =
  "<:kings_heart:1500949819110326352>";

const MAX_DISCORD_LENGTH = 2000;


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
// DATE
// ======================================================

function getDiscordDate() {
  const now =
    new Date();

  const day =
    now.getUTCDate();

  const month =
    now.toLocaleString(
      "en-GB",
      {
        month: "long",
        timeZone: "UTC"
      }
    );

  const year =
    now.getUTCFullYear();

  return `${day} ${month} ${year}`;
}


// ======================================================
// CHANGELOG STATE
// ======================================================

function loadState() {
  const state =
    readJson(
      STATE_FILE,
      null
    );

  if (!state) {
    /*
      KL04 is currently the latest existing
      Kings Logistics changelog.

      Therefore the first automatic changelog
      will become KL05.
    */

    return {
      season:
        "S01",

      nextNumber:
        5
    };
  }

  return {
    season:
      state.season ||
      "S01",

    nextNumber:
      Number(
        state.nextNumber
      ) || 5
  };
}


function saveState(
  state
) {
  writeJson(
    STATE_FILE,
    state
  );
}


// ======================================================
// CHANGELOG QUEUE
// ======================================================

function loadQueue() {
  const queue =
    readJson(
      QUEUE_FILE,
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

  return queue;
}


function clearQueue() {
  writeJson(
    QUEUE_FILE,
    {
      entries: []
    }
  );
}


// ======================================================
// HISTORY
// ======================================================

function loadHistory() {
  const history =
    readJson(
      HISTORY_FILE,
      {
        changelogs: []
      }
    );

  if (
    !Array.isArray(
      history.changelogs
    )
  ) {
    history.changelogs = [];
  }

  return history;
}


function saveHistory(
  history
) {
  writeJson(
    HISTORY_FILE,
    history
  );
}


// ======================================================
// NORMALIZE QUEUE ENTRIES
// ======================================================

function normalizeEntries(
  entries
) {
  return entries
    .map(entry => ({
      category:
        String(
          entry.category ||
          "Other Changes"
        ).trim(),

      text:
        String(
          entry.text ||
          ""
        ).trim(),

      source:
        String(
          entry.source ||
          "manual"
        ).trim(),

      addedAt:
        entry.addedAt ||
        null
    }))
    .filter(
      entry =>
        entry.text.length > 0
    );
}


// ======================================================
// GROUP ENTRIES BY CATEGORY
// ======================================================

function groupEntries(
  entries
) {
  const groups =
    new Map();

  for (
    const entry
    of entries
  ) {
    if (
      !groups.has(
        entry.category
      )
    ) {
      groups.set(
        entry.category,
        []
      );
    }

    groups
      .get(
        entry.category
      )
      .push(
        entry
      );
  }

  return groups;
}


// ======================================================
// BUILD CHANGELOG
// ======================================================

function buildChangelog(
  state,
  entries
) {
  const number =
    String(
      state.nextNumber
    ).padStart(
      2,
      "0"
    );

  const changelogId =
    `${state.season}-KL${number}`;

  const title =
    `**Kings Logistics / Discord & Other Services / ` +
    `Changelog – ${state.season} – KL${number} | ${getDiscordDate()}**`;

  const intro =
    `Hello everyone,\n` +
    `the following new features and changes have been implemented across ` +
    `**Kings Logistics**:`;

  const groups =
    groupEntries(
      entries
    );

  const sections = [];

  for (
    const [
      category,
      categoryEntries
    ]
    of groups
  ) {
    let section =
      `**${category}**\n\n`;

    section +=
      categoryEntries
        .map(
          entry =>
            `> * ${entry.text}`
        )
        .join(
          "\n"
        );

    sections.push(
      section
    );
  }

  const footer =
    `**Kings Logistics — Connecting the world, creating friendships.** ` +
    `${KINGS_HEART}`;

  return {
    changelogId,
    number:
      state.nextNumber,

    title,
    intro,
    sections,
    footer
  };
}


// ======================================================
// SPLIT INTO DISCORD-SAFE MESSAGES
// ======================================================

function buildDiscordMessages(
  changelog
) {
  const messages = [];

  let current =
    `${changelog.title}\n\n` +
    `${changelog.intro}`;

  for (
    const section
    of changelog.sections
  ) {
    const addition =
      `\n\n${section}`;

    /*
      Leave enough room for the footer.
    */

    const footerSpace =
      `\n\n${changelog.footer}`;

    if (
      (
        current.length +
        addition.length +
        footerSpace.length
      ) <= MAX_DISCORD_LENGTH
    ) {
      current +=
        addition;

      continue;
    }

    /*
      Current message is full.
    */

    messages.push(
      current
    );

    current =
      `**Kings Logistics Changelog — Continued**\n\n` +
      section;

    /*
      Protection if one individual section
      is extremely long.
    */

    if (
      current.length >
      1850
    ) {
      current =
        current.slice(
          0,
          1800
        ) +
        "\n\n*Additional details were shortened to stay within Discord limits.*";
    }
  }

  /*
    Add footer to final message.
  */

  const footerAddition =
    `\n\n${changelog.footer}`;

  if (
    current.length +
    footerAddition.length <=
    MAX_DISCORD_LENGTH
  ) {
    current +=
      footerAddition;
  } else {
    messages.push(
      current
    );

    current =
      changelog.footer;
  }

  messages.push(
    current
  );

  return messages;
}


// ======================================================
// SEND TO DISCORD
// ======================================================

async function sendDiscordMessage(
  content
) {
  if (
    !DISCORD_WEBHOOK_URL
  ) {
    throw new Error(
      "CHANGELOG_DISCORD_WEBHOOK_URL is missing."
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

  if (
    !response.ok
  ) {
    const errorText =
      await response.text();

    throw new Error(
      `Discord changelog post failed: HTTP ${response.status} - ${errorText}`
    );
  }
}


// ======================================================
// PUBLISH CHANGELOG
// ======================================================

async function publishChangelog() {
  const state =
    loadState();

  const queue =
    loadQueue();

  const entries =
    normalizeEntries(
      queue.entries
    );

  console.log(
    `Queued Changelog entries: ${entries.length}`
  );

  // ====================================================
  // NOTHING TO PUBLISH
  // ====================================================

  if (
    entries.length === 0
  ) {
    console.log("");
    console.log(
      "No Changelog entries are waiting."
    );

    console.log(
      "Nothing will be posted to Discord."
    );

    return;
  }

  // ====================================================
  // BUILD CHANGELOG
  // ====================================================

  const changelog =
    buildChangelog(
      state,
      entries
    );

  const messages =
    buildDiscordMessages(
      changelog
    );

  console.log("");
  console.log(
    `Publishing ${changelog.changelogId}`
  );

  console.log(
    `Discord messages required: ${messages.length}`
  );

  // ====================================================
  // SEND
  // ====================================================

  for (
    let i = 0;
    i < messages.length;
    i++
  ) {
    console.log(
      `Sending Changelog message ${i + 1}/${messages.length}...`
    );

    await sendDiscordMessage(
      messages[i]
    );
  }

  // ====================================================
  // ARCHIVE
  // ====================================================

  const history =
    loadHistory();

  history.changelogs.push({
    id:
      changelog.changelogId,

    season:
      state.season,

    number:
      changelog.number,

    publishedAt:
      new Date().toISOString(),

    entries:
      entries,

    discordMessageCount:
      messages.length
  });

  saveHistory(
    history
  );

  // ====================================================
  // NEXT KL NUMBER
  // ====================================================

  state.nextNumber +=
    1;

  saveState(
    state
  );

  // ====================================================
  // CLEAR QUEUE
  // ====================================================

  clearQueue();

  console.log("");
  console.log(
    `${changelog.changelogId} published successfully.`
  );

  console.log(
    `Next Changelog: ${state.season}-KL${String(state.nextNumber).padStart(2, "0")}`
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
    "Kings Logistics Changelog System"
  );

  console.log(
    "=================================="
  );

  console.log("");

  await publishChangelog();

  console.log("");
  console.log(
    "Kings Changelog process completed successfully."
  );
}


start().catch(error => {
  console.error("");

  console.error(
    "Kings Changelog System failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
