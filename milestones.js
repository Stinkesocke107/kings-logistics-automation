const fs = require('fs');
const path = require('path');

const KINGS_VTC_ID = 64284;
const MEMBERS_URL = `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/members`;
const DISCORD_WEBHOOK_URL = process.env.MILESTONE_DISCORD_WEBHOOK_URL || null;
const NEWS_ROLE_ID = process.env.NEWS_NOTIFICATIONS_ROLE_ID || null;

const STATE_FILE = path.join(__dirname, 'data', 'milestones.json');
const CHANGELOG_QUEUE_FILE = path.join(__dirname, 'data', 'changelog-queue.json');

const MILESTONES = [];
for (let milestone = 150; milestone <= 1000; milestone += 50) {
  MILESTONES.push(milestone);
}

function nowISO() {
  return new Date().toISOString();
}

function ensureDataDirectory() {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.warn(`Could not read ${path.basename(file)}: ${error.message}`);
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDataDirectory();
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function getMemberCount() {
  const response = await fetch(MEMBERS_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Kings Logistics Milestone Detector/2.0'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`TruckersMP members request failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const members = data?.response?.members;
  if (!Array.isArray(members)) {
    throw new Error('Invalid TruckersMP VTC members response.');
  }

  const count = members.length;
  if (!Number.isFinite(count) || count < 1) {
    throw new Error(`Invalid Kings member count: ${count}`);
  }

  return count;
}

function loadState() {
  const state = readJson(STATE_FILE, null);
  if (!state || !Array.isArray(state.reachedMilestones)) return null;

  return {
    version: Number(state.version) || 1,
    initializedAt: state.initializedAt || null,
    updatedAt: state.updatedAt || state.initializedAt || null,
    lastMilestoneUpdate: state.lastMilestoneUpdate || null,
    memberCountAtLastUpdate: Number(state.memberCountAtLastUpdate) || 0,
    reachedMilestones: [...new Set(state.reachedMilestones.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
  };
}

function saveState(state) {
  writeJson(STATE_FILE, {
    version: 2,
    initializedAt: state.initializedAt || nowISO(),
    updatedAt: nowISO(),
    lastMilestoneUpdate: state.lastMilestoneUpdate || null,
    memberCountAtLastUpdate: Number(state.memberCountAtLastUpdate) || 0,
    reachedMilestones: [...new Set((state.reachedMilestones || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
  });
  console.log('Milestone state saved.');
}

function validateCountTransition(previousCount, currentCount) {
  if (!Number.isFinite(previousCount) || previousCount < 20) return;

  const lowerLimit = Math.floor(previousCount * 0.5);
  const upperLimit = previousCount + Math.max(50, Math.ceil(previousCount * 0.5));

  if (currentCount < lowerLimit) {
    throw new Error(
      `Milestone safety stop: member count fell from ${previousCount} to ${currentCount}. ` +
      'No milestone state or announcement was changed.'
    );
  }

  if (currentCount > upperLimit) {
    throw new Error(
      `Milestone safety stop: implausible member jump from ${previousCount} to ${currentCount}. ` +
      'No milestone announcement was posted.'
    );
  }
}

function addMilestoneToChangelog(milestone) {
  const raw = readJson(CHANGELOG_QUEUE_FILE, []);
  const queue = Array.isArray(raw)
    ? raw
    : raw && Array.isArray(raw.entries)
      ? raw.entries
      : null;

  if (!queue) throw new Error('Changelog Queue has an unsupported format.');

  const source = `milestone-${milestone}`;
  if (queue.some((entry) => entry?.source === source)) {
    console.log(`Milestone ${milestone} is already in the Changelog queue.`);
    return;
  }

  queue.push({
    category: 'Kings Milestones',
    text: `Kings Logistics reached ${milestone.toLocaleString('en-US')} members on TruckersMP.`,
    source,
    addedAt: nowISO()
  });

  writeJson(CHANGELOG_QUEUE_FILE, queue);
  console.log(`Milestone ${milestone} added to the Changelog queue.`);
}

function buildMilestoneMessage(milestone) {
  return (
    `<@&${NEWS_ROLE_ID}>\n\n` +
    `👑🎉 **${milestone.toLocaleString('en-US')} KINGS LOGISTICS MEMBERS**\n\n` +
    `We have officially reached another major milestone — **${milestone.toLocaleString('en-US')} members on TruckersMP!**\n\n` +
    'Thank you to every member of the **Kings Logistics Family** for being part of our journey and helping Kings continue to grow. 🌍🚛\n\n' +
    'This is another important step forward — and there is still much more ahead of us.\n\n' +
    'Thank you for being part of Kings. 👑\n\n' +
    '**Kings Logistics — Connecting the world, creating friendships.** <:kings_heart:1500949819110326352>'
  );
}

function build1000Message() {
  return (
    `<@&${NEWS_ROLE_ID}>\n\n` +
    '👑🎉 **1,000 KINGS LOGISTICS MEMBERS** 🎉👑\n\n' +
    'Today, Kings Logistics has reached an extraordinary milestone — **1,000 members on TruckersMP.**\n\n' +
    'What started as a community has continued to grow into a worldwide Kings Family built around trucking, friendship, community and unforgettable moments. 🌍🚛\n\n' +
    'A huge thank you to every Driver, Staff member, partner, friend and community member who has been part of this journey.\n\n' +
    '**1,000 members is not simply another number — it is a major chapter in the history of Kings Logistics.**\n\n' +
    'And our journey is far from over. 👑\n\n' +
    '**Kings Logistics — Connecting the world, creating friendships.** <:kings_heart:1500949819110326352>'
  );
}

async function sendMilestone(milestone) {
  if (!DISCORD_WEBHOOK_URL) throw new Error('MILESTONE_DISCORD_WEBHOOK_URL is missing.');
  if (!NEWS_ROLE_ID) throw new Error('NEWS_NOTIFICATIONS_ROLE_ID is missing.');

  const content = milestone === 1000 ? build1000Message() : buildMilestoneMessage(milestone);
  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      allowed_mentions: { parse: [], roles: [NEWS_ROLE_ID] }
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`Discord milestone post failed: HTTP ${response.status} - ${await response.text()}`);
  }

  console.log(`Milestone ${milestone} announcement posted successfully.`);
}

function nextMilestone(memberCount) {
  return MILESTONES.find((milestone) => milestone > memberCount) || null;
}

async function checkMilestones() {
  const memberCount = await getMemberCount();
  console.log(`Current Kings members: ${memberCount}`);

  let state = loadState();

  if (!state) {
    const alreadyReached = MILESTONES.filter((milestone) => milestone <= memberCount);
    state = {
      version: 2,
      initializedAt: nowISO(),
      updatedAt: nowISO(),
      lastMilestoneUpdate: null,
      memberCountAtLastUpdate: memberCount,
      reachedMilestones: alreadyReached
    };
    saveState(state);
    console.log(`First run initialized. ${alreadyReached.length} previous milestone(s) marked as already reached.`);
    console.log('No old milestone announcements were posted.');
    return;
  }

  validateCountTransition(state.memberCountAtLastUpdate, memberCount);

  const reached = new Set(state.reachedMilestones.map(Number));
  const newMilestones = MILESTONES.filter(
    (milestone) => memberCount >= milestone && !reached.has(milestone)
  );

  console.log(`New milestones detected: ${newMilestones.length}`);

  for (const milestone of newMilestones) {
    console.log(`New milestone reached: ${milestone}`);

    // Public output remains a one-way webhook by design.
    await sendMilestone(milestone);
    addMilestoneToChangelog(milestone);

    reached.add(milestone);
    state.reachedMilestones = [...reached];
    state.memberCountAtLastUpdate = memberCount;
    state.lastMilestoneUpdate = nowISO();

    // Persist after each successful public post so a later milestone can retry safely.
    saveState(state);
  }

  if (newMilestones.length === 0 && state.memberCountAtLastUpdate !== memberCount) {
    state.memberCountAtLastUpdate = memberCount;
    saveState(state);
  }

  const next = nextMilestone(memberCount);
  if (next) {
    console.log(`Next Kings milestone: ${memberCount}/${next} (${next - memberCount} remaining).`);
  } else {
    console.log('All configured Kings milestones up to 1,000 members have been reached.');
  }

  if (newMilestones.length === 0) {
    console.log('No new Kings Logistics milestone reached.');
  }
}

async function start() {
  console.log('==================================');
  console.log('Kings Logistics Milestone Detector');
  console.log('==================================');
  await checkMilestones();
  console.log('Kings Milestone check completed successfully.');
}

start().catch((error) => {
  console.error('Kings Milestone Detector failed:', error.message);
  process.exit(1);
});
