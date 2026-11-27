require('./kings-branding').installDiscordBranding();
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
  } catch {
    // A damaged existing state or history is NOT a first-run file.
    // Returning a default could republish an old KL number.
    throw new Error(`Changelog source file invalid: ${path.basename(file)}`);
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
  const state=readJson(STATE_FILE,null);
  if(state===null&&!fs.existsSync(STATE_FILE)){
    // Existing Kings S01-KL04 predates the first automated changelog.
    return {season:'S01',nextNumber:5};
  }
  if(!state||typeof state!=='object'||Array.isArray(state)||
     !/^S\d{2,3}$/.test(state.season)||
     !Number.isSafeInteger(state.nextNumber)||
     state.nextNumber<5||state.nextNumber>9999)
    throw Error('Existing Changelog numbering state unverified');
  return {season:state.season,nextNumber:state.nextNumber};
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
  // Accept the current array format and the legacy { entries: [] } format.
  // Invalid data must stop publication rather than silently hide entries.
  const raw = fs.existsSync(QUEUE_FILE)
    ? JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"))
    : [];

  if (Array.isArray(raw)) {
    return { entries: raw };
  }

  if (raw && Array.isArray(raw.entries)) {
    return { entries: raw.entries };
  }

  throw new Error("Changelog Queue has an unsupported format.");
}


function clearQueue() {
  writeJson(
    QUEUE_FILE,
    []
  );
}


// ======================================================
// HISTORY
// ======================================================

function loadHistory() {
  const history=readJson(HISTORY_FILE,{changelogs:[]});
  if(!history||typeof history!=='object'||Array.isArray(history)||
     !Array.isArray(history.changelogs))throw Error('Changelog history unverified');
  const ids=new Set();
  for(const row of history.changelogs){
    if(!row||typeof row!=='object'||Array.isArray(row)||
       typeof row.id!=='string'||!/^[Ss]\d{2,3}-KL\d{2,4}$/.test(row.id)||
       ids.has(row.id)||!Array.isArray(row.entries))
      throw Error('Changelog history contains invalid or duplicate release');
    ids.add(row.id);
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

function normalizeEntries(entries) {
  if(!Array.isArray(entries))throw Error('Changelog Queue unverified');
  return entries.map(entry=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||
       typeof entry.text!=='string'||!entry.text.trim()||
       entry.text.length>1000||
       (entry.category!==undefined&&typeof entry.category!=='string')||
       (entry.source!==undefined&&typeof entry.source!=='string'))
      throw Error('Changelog Queue contains an invalid entry');
    return {
      category:(entry.category||'Other Changes').trim()||'Other Changes',
      text:entry.text.trim(),
      source:(entry.source||'manual').trim()||'manual',
      addedAt:entry.addedAt||null
    };
  });
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

    // Never silently discard already-approved changes when a category
    // section exceeds Discord's limit. Fail before sending ANY messages.
    if(current.length + footerSpace.length > MAX_DISCORD_LENGTH)
      throw Error('Changelog section too long: divide the queued changes before publishing');
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
    // Discord error bodies can contain private values and should never be
    // echoed into a public GitHub Actions log.
    throw new Error(`Discord changelog post failed: HTTP ${response.status}`);
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

  // Preflight the entire archive BEFORE posting to Discord. Invalid or
  // duplicate release numbering can otherwise lead to a successful public
  // post followed by a failed archival write (and another post on retry).
  const history=loadHistory();
  const duplicateId=state.season+'-KL'+String(state.nextNumber).padStart(2,'0');
  if(history.changelogs.some(x=>x.id===duplicateId)||
    history.changelogs.some(x=>x.season===state.season&&
      Number(x.number)>=state.nextNumber))
    throw Error('Changelog release numbering conflicts with existing history');

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
