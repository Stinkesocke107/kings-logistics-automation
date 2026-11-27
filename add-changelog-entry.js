const fs = require("fs");
const path = require("path");

// ======================================================
// KINGS LOGISTICS — CHANGELOG QUEUE MANAGER
// ======================================================

const CATEGORY =
  String(
    process.env.CHANGELOG_CATEGORY || ""
  ).trim();

const TEXT =
  String(
    process.env.CHANGELOG_TEXT || ""
  ).trim();

const QUEUE_FILE =
  path.join(
    __dirname,
    "data",
    "changelog-queue.json"
  );

// ======================================================
// HELPERS
// ======================================================

function nowISO() {
  return new Date().toISOString();
}

function ensureDataDirectory() {
  fs.mkdirSync(
    path.dirname(QUEUE_FILE),
    {
      recursive: true
    }
  );
}

function readJson(
  file,
  fallback
) {
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
  } catch {
    // JSON parser details can include sensitive human-entered content.
    throw new Error(`Could not read ${path.basename(file)}: invalid JSON`);
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

function cleanText(value) {
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

// ======================================================
// LOAD QUEUE
// ======================================================

function loadQueue() {
  const raw =
    readJson(
      QUEUE_FILE,
      []
    );

  /*
    Current Kings Changelog Queue normally
    uses a simple array.

    The fallback below also protects us if
    an older queue version used:
    { "entries": [...] }
  */

  const entries=Array.isArray(raw)?raw:
    raw&&Array.isArray(raw.entries)?raw.entries:null;
  if(!entries||entries.some(entry=>
    !entry||typeof entry!=='object'||Array.isArray(entry)||
    typeof entry.category!=='string'||!entry.category.trim()||
    typeof entry.text!=='string'||!entry.text.trim()||
    entry.category.length>100||entry.text.length>1000))
    throw Error('Existing Changelog Queue content unverified');
  return entries;
}

// ======================================================
// VALIDATION
// ======================================================

function validateInput() {
  if (!CATEGORY) {
    throw new Error(
      "CHANGELOG_CATEGORY is missing."
    );
  }

  if (!TEXT) {
    throw new Error(
      "CHANGELOG_TEXT is missing."
    );
  }

  if (CATEGORY.length > 100) {
    throw new Error(
      "Changelog category is too long. Maximum: 100 characters."
    );
  }

  if (TEXT.length > 1000) {
    throw new Error(
      "Changelog entry is too long. Maximum: 1000 characters."
    );
  }
}

// ======================================================
// DUPLICATE PROTECTION
// ======================================================

function alreadyExists(
  queue,
  category,
  text
) {
  const normalizedCategory =
    category.toLowerCase();

  const normalizedText =
    text.toLowerCase();

  return queue.some(
    entry =>
      String(
        entry.category || ""
      )
        .trim()
        .toLowerCase() ===
        normalizedCategory &&

      String(
        entry.text || ""
      )
        .trim()
        .toLowerCase() ===
        normalizedText
  );
}

// ======================================================
// ADD ENTRY
// ======================================================

function addEntry() {
  validateInput();

  const category =
    cleanText(CATEGORY);

  const text =
    cleanText(TEXT);

  const queue =
    loadQueue();

  console.log(
    `Current Changelog Queue entries: ${queue.length}`
  );

  // Manual GitHub Actions logs can be public: never echo arbitrary
  // operator-supplied release text or private information.
  console.log('Manual Changelog entry validated; content omitted from log.');

  if (
    alreadyExists(
      queue,
      category,
      text
    )
  ) {
    console.log("");
    console.log(
      "This Changelog entry already exists in the queue."
    );

    console.log(
      "No duplicate entry was added."
    );

    return false;
  }

  const timestamp =
    nowISO();

  const source =
    `manual-${Date.now()}`;

  queue.push({
    category,
    text,
    source,
    addedAt:
      timestamp
  });

  writeJson(
    QUEUE_FILE,
    queue
  );

  console.log("");
  console.log(
    "Changelog entry added successfully."
  );

  console.log(
    `Queue entries now: ${queue.length}`
  );

  console.log(
    `Source: ${source}`
  );

  return true;
}

// ======================================================
// START
// ======================================================

function start() {
  console.log(
    "===================================="
  );

  console.log(
    "Kings Logistics Changelog Queue Manager"
  );

  console.log(
    "===================================="
  );

  console.log("");

  const added =
    addEntry();

  console.log("");

  if (added) {
    console.log(
      "Kings Changelog Queue updated successfully."
    );
  } else {
    console.log(
      "Kings Changelog Queue remained unchanged."
    );
  }
}

try {
  start();
} catch (error) {
  console.error("");

  console.error(
    "Kings Changelog Queue Manager failed:"
  );

  console.error(
    error
  );

  process.exit(1);
}
