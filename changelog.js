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

// Read-only proof against the existing webhook destination before any POST.
// Full prior delivery can recover after a Git push failure without reposting;
// partial or unverifiable delivery stops for an authorized operator.
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const KINGS_GUILD_ID = '1114967437788577792';
const RELEASE_MARKER = 'Kings Logistics Changelog release';
const WEBHOOK_URL = /^https:\/\/(?:discord\.com|discordapp\.com)\/api(?:\/v(?:9|10))?\/webhooks\/(\d{15,22})\/[A-Za-z0-9._-]+\/?$/;
const DISCORD_ID = /^\d{15,22}$/;


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
// PUBLICATION RECOVERY / DUPLICATE PROTECTION
// ======================================================

function releaseMarker(changelogId, index, total) {
  return '-# ' + RELEASE_MARKER + ' ' + changelogId + ' · ' + index + '/' + total;
}

function markedMessages(changelog, messages) {
  return messages.map((content, index) => {
    const marked = content + '\n\n' +
      releaseMarker(changelog.changelogId, index + 1, messages.length);
    if (marked.length > MAX_DISCORD_LENGTH)
      throw Error('Changelog exceeds Discord message limit after release marker');
    return marked;
  });
}

function stableReleaseContent(content) {
  // A completed Discord delivery can cross UTC midnight before Git persistence.
  // Ignore only the rendered title date, preserving every approved change.
  return String(content).replace(
    /\| \d{1,2} [A-Za-z]+ \d{4}\*\*/g, '| [DATE]**'
  );
}

async function getVerifiedDiscordJson(url, headers = {}) {
  let response;
  try {
    response = await fetch(url, {
      method:'GET', headers:{Accept:'application/json',...headers}
    });
  } catch {
    throw Error('Changelog Discord readback unavailable');
  }
  if(!response?.ok)throw Error('Changelog Discord readback unavailable');
  try { return await response.json(); }
  catch { throw Error('Changelog Discord readback invalid'); }
}

async function publishedReleaseState(changelog, messages) {
  // Never post if a trustworthy readback is unavailable.
  if (!DISCORD_WEBHOOK_URL || !WEBHOOK_URL.test(DISCORD_WEBHOOK_URL) ||
      !DISCORD_BOT_TOKEN)
    throw Error('Changelog Discord readback credentials unverified');
  const webhookId = DISCORD_WEBHOOK_URL.match(WEBHOOK_URL)[1];
  const webhook = await getVerifiedDiscordJson(DISCORD_WEBHOOK_URL);
  if(String(webhook?.id||'')!==webhookId ||
     String(webhook?.guild_id||'')!==KINGS_GUILD_ID ||
     !DISCORD_ID.test(String(webhook?.channel_id||'')))
    throw Error('Changelog Discord webhook target unverified');

  const channelId = String(webhook.channel_id);
  const expectedMarkers = messages.map((_,index)=>
    releaseMarker(changelog.changelogId,index+1,messages.length));
  const found = [];
  let before = '';
  let exhausted = false;
  // Paginate until complete; if history is inaccessible, never assume
  // there has been no previous public delivery.
  for(let pageNumber=0;pageNumber<60;pageNumber++){
    const url='https://discord.com/api/v10/channels/'+channelId+
      '/messages?limit=100'+(before?'&before='+before:'');
    const page=await getVerifiedDiscordJson(url,{
      Authorization:'Bot '+DISCORD_BOT_TOKEN
    });
    if(!Array.isArray(page)||page.length>100)
      throw Error('Changelog Discord history unverified');
    for(const message of page){
      if(!DISCORD_ID.test(String(message?.id||'')))
        throw Error('Changelog Discord message cursor invalid');
      if(String(message?.webhook_id||'')!==webhookId)continue;
      const content=String(message.content||'');
      if(content.includes(RELEASE_MARKER+' '+changelog.changelogId+' · '))
        found.push(content);
    }
    if(page.length<100){exhausted=true;break;}
    const last=String(page[page.length-1]?.id||'');
    if(!DISCORD_ID.test(last)||last===before)
      throw Error('Changelog Discord pagination unverified');
    before=last;
  }
  if(!exhausted)
    throw Error('Changelog Discord history exceeds verified read window');
  if(found.length===0)return 'NOT_POSTED';

  if(found.length!==messages.length)
    throw Error('Changelog partially published; authorized operator recovery required');
  for(let i=0;i<messages.length;i++){
    const matched=found.filter(content=>content.endsWith(expectedMarkers[i]));
    if(matched.length!==1||
       stableReleaseContent(matched[0])!==stableReleaseContent(messages[i]))
      throw Error('Changelog published content conflicts; operator review required');
  }
  return 'ALREADY_POSTED';
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
  if(!fs.existsSync(HISTORY_FILE)&&state.nextNumber>5)
    throw Error('Existing Changelog archive missing; do not reset release history');
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

  const messages = markedMessages(changelog, buildDiscordMessages(changelog));

  console.log("");
  console.log(
    `Publishing ${changelog.changelogId}`
  );

  console.log(
    `Discord messages required: ${messages.length}`
  );

  // Protect against repeated webhook POST after successful Discord delivery
  // followed by a Git-state persistence conflict.
  const delivery = await publishedReleaseState(changelog, messages);
  if (delivery === 'ALREADY_POSTED')
    console.log('Previous Changelog delivery verified; recovering state without reposting.');

  // ====================================================
  // SEND
  // ====================================================

  for (
    let i = 0;
    delivery === 'NOT_POSTED' && i < messages.length;
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
