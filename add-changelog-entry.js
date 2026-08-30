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
  } catch (error) {
    throw new Error(
      `Could not read ${path.basename(file)}: ${error.message}`
    );
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

  if (Array.isArray(raw)) {
    return raw;
  }

  if (
    raw &&
    Array.isArray(raw.entries)
  ) {
    return raw.entries;
  }

  throw new Error(
    "Changelog Queue has an unsupported format."
  );
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

  console.log(
    `Category: ${category}`
  );

  console.log(
    `Change: ${text}`
  );

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
