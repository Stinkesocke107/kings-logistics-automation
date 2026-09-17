const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ======================================================
// KINGS LOGISTICS — AUTOMATION CORE & SAFETY
// BACKUP + BACKUP HEALTH CHECK
// ======================================================

const ROOT = __dirname;

const BACKUP_DIRECTORY =
  path.join(
    ROOT,
    "backup-staging"
  );

// ======================================================
// BACKUP SOURCES
// ======================================================

const BASE_PATHS = [
  "data",
  ".github/workflows",
  "README.md"
];

// ======================================================
// CRITICAL KINGS FILES
// ======================================================

const CRITICAL_FILES = [
  // ----------------------------------------------------
  // LIVE & COMMUNITY INTELLIGENCE
  // ----------------------------------------------------

  "tracker.js",
  "statistics.js",
  "central-overview.js",

  "data/live-tracker-snapshot.json",
  "data/statistics.json",
  "data/central-overview.json",

  ".github/workflows/live-tracker.yml",
  ".github/workflows/statistics.yml",

  // ----------------------------------------------------
  // PEOPLE MANAGEMENT
  // ----------------------------------------------------

  "driver-updates.js",
  "probation.js",
  "hr-weekly-summary.js",

  "data/driver-members.json",
  "data/driver-history.json",
  "data/probation-state.json",

  ".github/workflows/driver-updates.yml",
  ".github/workflows/probation.yml",
  ".github/workflows/hr-weekly-summary.yml",

  // ----------------------------------------------------
  // INFORMATION & REPORTING
  // ----------------------------------------------------

  "news.js",
  "milestones.js",
  "changelog.js",
  "add-changelog-entry.js",
  "monthly-report.js",
  "management-weekly-overview.js",

  "data/last-news.json",
  "data/milestones.json",
  "data/changelog-state.json",
  "data/changelog-history.json",
  "data/changelog-queue.json",

  ".github/workflows/news.yml",
  ".github/workflows/milestones.yml",
  ".github/workflows/changelog.yml",
  ".github/workflows/add-changelog-entry.yml",
  ".github/workflows/monthly-report.yml",
  ".github/workflows/management-weekly-overview.yml",

  // ----------------------------------------------------
  // AUTOMATION CORE & SAFETY
  // ----------------------------------------------------

  "core-backup.js",
  "core-recovery.js",

  ".github/workflows/core-backup.yml",
  ".github/workflows/core-recovery.yml"
];

// ======================================================
// NEVER BACK UP
// ======================================================

const EXCLUDED_PREFIXES = [
  ".git",
  "node_modules",
  "backup-staging",
  "restore-source",
  "data/backups"
];

const EXCLUDED_EXTENSIONS = [
  ".pem",
  ".key",
  ".p12",
  ".pfx"
];

// ======================================================
// HELPERS
// ======================================================

function nowISO() {
  return new Date().toISOString();
}

function normalizePath(value) {
  return value
    .split(path.sep)
    .join("/");
}

function ensureDirectory(directory) {
  fs.mkdirSync(
    directory,
    {
      recursive: true
    }
  );
}

function removeDirectory(directory) {
  if (
    fs.existsSync(
      directory
    )
  ) {
    fs.rmSync(
      directory,
      {
        recursive: true,
        force: true
      }
    );
  }
}

function writeJson(
  file,
  data
) {
  ensureDirectory(
    path.dirname(file)
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

function isExcluded(relativePath) {
  const normalized =
    normalizePath(
      relativePath
    );

  const basename =
    path.basename(
      normalized
    );

  // ====================================================
  // ENVIRONMENT FILES
  // ====================================================

  if (
    basename === ".env" ||
    basename.startsWith(".env.")
  ) {
    return true;
  }

  // ====================================================
  // EXCLUDED PATHS
  // ====================================================

  for (
    const prefix
    of EXCLUDED_PREFIXES
  ) {
    if (
      normalized === prefix ||
      normalized.startsWith(
        `${prefix}/`
      )
    ) {
      return true;
    }
  }

  // ====================================================
  // PRIVATE KEY FILES
  // ====================================================

  const extension =
    path.extname(
      basename
    ).toLowerCase();

  if (
    EXCLUDED_EXTENSIONS.includes(
      extension
    )
  ) {
    return true;
  }

  return false;
}

function sha256(file) {
  const hash =
    crypto.createHash(
      "sha256"
    );

  hash.update(
    fs.readFileSync(
      file
    )
  );

  return hash.digest(
    "hex"
  );
}

// ======================================================
// FILE COLLECTION
// ======================================================

function walkPath(
  absolutePath,
  results
) {
  if (
    !fs.existsSync(
      absolutePath
    )
  ) {
    return;
  }

  const relativePath =
    normalizePath(
      path.relative(
        ROOT,
        absolutePath
      )
    );

  if (
    isExcluded(
      relativePath
    )
  ) {
    return;
  }

  const stat =
    fs.statSync(
      absolutePath
    );

  if (
    stat.isDirectory()
  ) {
    for (
      const name
      of fs.readdirSync(
        absolutePath
      )
    ) {
      walkPath(
        path.join(
          absolutePath,
          name
        ),
        results
      );
    }

    return;
  }

  if (
    stat.isFile()
  ) {
    results.add(
      relativePath
    );
  }
}

function collectFiles() {
  const files =
    new Set();

  // ====================================================
  // IMPORTANT DIRECTORIES
  // ====================================================

  for (
    const relativePath
    of BASE_PATHS
  ) {
    walkPath(
      path.join(
        ROOT,
        relativePath
      ),
      files
    );
  }

  // ====================================================
  // ROOT AUTOMATION FILES
  // ====================================================

  for (
    const name
    of fs.readdirSync(
      ROOT
    )
  ) {
    const absolutePath =
      path.join(
        ROOT,
        name
      );

    if (
      !fs.statSync(
        absolutePath
      ).isFile()
    ) {
      continue;
    }

    if (
      name.endsWith(".js") ||
      name === "package.json" ||
      name === "package-lock.json"
    ) {
      walkPath(
        absolutePath,
        files
      );
    }
  }

  return Array.from(
    files
  ).sort();
}

// ======================================================
// JSON VALIDATION
// ======================================================

function validateJson(file) {
  try {
    JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );

    return {
      valid: true,
      error: null
    };
  } catch (error) {
    return {
      valid: false,

      error:
        String(
          error.message ||
          error
        )
    };
  }
}

// ======================================================
// CRITICAL FILE HEALTH CHECK
// ======================================================

function checkCriticalFiles(
  collectedFiles
) {
  const collected =
    new Set(
      collectedFiles
    );

  const present = [];
  const missing = [];
  const missingFromBackup = [];

  for (
    const relativePath
    of CRITICAL_FILES
  ) {
    const absolutePath =
      path.join(
        ROOT,
        relativePath
      );

    if (
      !fs.existsSync(
        absolutePath
      )
    ) {
      missing.push(
        relativePath
      );

      continue;
    }

    present.push(
      relativePath
    );

    if (
      !collected.has(
        relativePath
      )
    ) {
      missingFromBackup.push(
        relativePath
      );
    }
  }

  return {
    expected:
      CRITICAL_FILES.length,

    present:
      present.length,

    missing,

    missingFromBackup
  };
}

// ======================================================
// CREATE BACKUP
// ======================================================

function prepareBackup() {
  console.log(
    "===================================="
  );

  console.log(
    "Kings Automation Core & Safety"
  );

  console.log(
    "Backup + Health Check"
  );

  console.log(
    "===================================="
  );

  console.log("");

  // ====================================================
  // CLEAN OLD STAGING AREA
  // ====================================================

  removeDirectory(
    BACKUP_DIRECTORY
  );

  ensureDirectory(
    BACKUP_DIRECTORY
  );

  // ====================================================
  // COLLECT FILES
  // ====================================================

  const files =
    collectFiles();

  console.log(
    `Files selected for backup: ${files.length}`
  );

  console.log("");

  // ====================================================
  // CHECK CRITICAL FILES
  // ====================================================

  const criticalCheck =
    checkCriticalFiles(
      files
    );

  console.log(
    `Critical files expected: ${criticalCheck.expected}`
  );

  console.log(
    `Critical files present: ${criticalCheck.present}`
  );

  if (
    criticalCheck.missing.length > 0
  ) {
    console.warn("");

    console.warn(
      "WARNING: Critical files are missing from the repository:"
    );

    for (
      const file
      of criticalCheck.missing
    ) {
      console.warn(
        `- ${file}`
      );
    }
  }

  if (
    criticalCheck.missingFromBackup.length > 0
  ) {
    console.warn("");

    console.warn(
      "WARNING: Critical files exist but were not selected for backup:"
    );

    for (
      const file
      of criticalCheck.missingFromBackup
    ) {
      console.warn(
        `- ${file}`
      );
    }
  }

  // ====================================================
  // COPY + VALIDATE FILES
  // ====================================================

  const manifestFiles = [];

  const invalidJson = [];

  let jsonFiles = 0;

  for (
    const relativePath
    of files
  ) {
    const source =
      path.join(
        ROOT,
        relativePath
      );

    const destination =
      path.join(
        BACKUP_DIRECTORY,
        relativePath
      );

    ensureDirectory(
      path.dirname(
        destination
      )
    );

    fs.copyFileSync(
      source,
      destination
    );

    const stat =
      fs.statSync(
        source
      );

    const fileInfo = {
      path:
        relativePath,

      size:
        stat.size,

      sha256:
        sha256(
          source
        )
    };

    // ==================================================
    // JSON HEALTH CHECK
    // ==================================================

    if (
      relativePath
        .toLowerCase()
        .endsWith(
          ".json"
        )
    ) {
      jsonFiles++;

      const validation =
        validateJson(
          source
        );

      fileInfo.jsonValid =
        validation.valid;

      if (
        !validation.valid
      ) {
        fileInfo.jsonError =
          validation.error;

        invalidJson.push({
          path:
            relativePath,

          error:
            validation.error
        });

        console.warn(
          `Invalid JSON: ${relativePath}`
        );
      }
    }

    manifestFiles.push(
      fileInfo
    );
  }

  // ====================================================
  // VERIFY COPIED FILES
  // ====================================================

  const copyErrors = [];

  for (
    const fileInfo
    of manifestFiles
  ) {
    const copiedFile =
      path.join(
        BACKUP_DIRECTORY,
        fileInfo.path
      );

    if (
      !fs.existsSync(
        copiedFile
      )
    ) {
      copyErrors.push({
        path:
          fileInfo.path,

        reason:
          "File missing from backup staging area."
      });

      continue;
    }

    const copiedHash =
      sha256(
        copiedFile
      );

    if (
      copiedHash !==
      fileInfo.sha256
    ) {
      copyErrors.push({
        path:
          fileInfo.path,

        reason:
          "SHA-256 checksum mismatch."
      });
    }
  }

  // ====================================================
  // HEALTH RESULT
  // ====================================================

  const healthy =
    criticalCheck.missing.length === 0 &&
    criticalCheck.missingFromBackup.length === 0 &&
    invalidJson.length === 0 &&
    copyErrors.length === 0;

  const health = {
    version: 1,

    checkedAt:
      nowISO(),

    status:
      healthy
        ? "HEALTHY"
        : "UNHEALTHY",

    healthy,

    criticalFiles: {
      expected:
        criticalCheck.expected,

      present:
        criticalCheck.present,

      missing:
        criticalCheck.missing,

      missingFromBackup:
        criticalCheck.missingFromBackup
    },

    json: {
      checked:
        jsonFiles,

      valid:
        jsonFiles -
        invalidJson.length,

      invalid:
        invalidJson
    },

    copies: {
      checked:
        manifestFiles.length,

      errors:
        copyErrors
    }
  };

  // ====================================================
  // BACKUP MANIFEST
  // ====================================================

  const manifest = {
    version: 2,

    system:
      "Kings Automation Core & Safety",

    type:
      "Repository Backup",

    createdAt:
      nowISO(),

    repository:
      process.env.GITHUB_REPOSITORY ||
      null,

    branch:
      process.env.GITHUB_REF_NAME ||
      null,

    commit:
      process.env.GITHUB_SHA ||
      null,

    workflowRunId:
      process.env.GITHUB_RUN_ID ||
      null,

    workflowRunNumber:
      process.env.GITHUB_RUN_NUMBER ||
      null,

    health: {
      status:
        health.status,

      healthy:
        health.healthy
    },

    summary: {
      files:
        manifestFiles.length,

      jsonFiles,

      validJsonFiles:
        jsonFiles -
        invalidJson.length,

      invalidJsonFiles:
        invalidJson.length,

      criticalFilesExpected:
        criticalCheck.expected,

      criticalFilesPresent:
        criticalCheck.present,

      missingCriticalFiles:
        criticalCheck.missing.length,

      copyErrors:
        copyErrors.length
    },

    files:
      manifestFiles
  };

  // ====================================================
  // WRITE HEALTH + MANIFEST
  // ====================================================

  writeJson(
    path.join(
      BACKUP_DIRECTORY,
      "backup-health.json"
    ),
    health
  );

  writeJson(
    path.join(
      BACKUP_DIRECTORY,
      "backup-manifest.json"
    ),
    manifest
  );

  // ====================================================
  // TERMINAL SUMMARY
  // ====================================================

  console.log("");

  console.log(
    "===================================="
  );

  console.log(
    "Backup Health Summary"
  );

  console.log(
    "===================================="
  );

  console.log(
    `Status: ${health.status}`
  );

  console.log(
    `Files backed up: ${manifestFiles.length}`
  );

  console.log(
    `Critical files: ${criticalCheck.present}/${criticalCheck.expected}`
  );

  console.log(
    `JSON files valid: ${jsonFiles - invalidJson.length}/${jsonFiles}`
  );

  console.log(
    `Backup copy errors: ${copyErrors.length}`
  );

  console.log("");

  if (
    healthy
  ) {
    console.log(
      "✅ Kings Backup Health Check passed."
    );
  } else {
    console.warn(
      "⚠️ Kings Backup Health Check found problems."
    );

    console.warn(
      "The backup is still kept for investigation and recovery."
    );
  }

  console.log("");

  console.log(
    "Backup package ready for upload."
  );

  console.log(
    "Kings Automation Core backup preparation completed."
  );
}

// ======================================================
// START
// ======================================================

try {
  prepareBackup();
} catch (error) {
  console.error("");

  console.error(
    "Kings Automation Core backup preparation failed:"
  );

  console.error(
    error
  );

  process.exit(1);
}
