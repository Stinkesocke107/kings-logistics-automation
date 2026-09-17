const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ======================================================
// KINGS LOGISTICS — AUTOMATION CORE & SAFETY
// SAFE RECOVERY SYSTEM
// ======================================================

const ROOT = __dirname;

const RESTORE_SOURCE =
  path.join(
    ROOT,
    "restore-source"
  );

const MANIFEST_FILE =
  path.join(
    RESTORE_SOURCE,
    "backup-manifest.json"
  );

const HEALTH_FILE =
  path.join(
    RESTORE_SOURCE,
    "backup-health.json"
  );

const RESTORE_POINT_FILE =
  path.join(
    RESTORE_SOURCE,
    "restore-point.json"
  );

const RECOVERY_PLAN_FILE =
  path.join(
    ROOT,
    "recovery-plan.json"
  );

const RECOVERY_RESULT_FILE =
  path.join(
    ROOT,
    "recovery-result.json"
  );

const RECOVERY_MODE =
  String(
    process.env.RECOVERY_MODE ||
    "preview"
  )
    .trim()
    .toLowerCase();

const RECOVERY_CONFIRMATION =
  String(
    process.env.RECOVERY_CONFIRMATION ||
    ""
  )
    .trim();

const REQUIRED_CONFIRMATION =
  "RESTORE_KINGS";

// ======================================================
// HELPERS
// ======================================================

function nowISO() {
  return new Date().toISOString();
}

function normalizePath(value) {
  return String(value)
    .split(path.sep)
    .join("/");
}

function readJson(file) {
  if (
    !fs.existsSync(
      file
    )
  ) {
    throw new Error(
      `Required file missing: ${normalizePath(
        path.relative(
          ROOT,
          file
        )
      )}`
    );
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
      `Invalid JSON in ${normalizePath(
        path.relative(
          ROOT,
          file
        )
      )}: ${error.message}`
    );
  }
}

function writeJson(
  file,
  data
) {
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

function ensureDirectory(
  directory
) {
  fs.mkdirSync(
    directory,
    {
      recursive: true
    }
  );
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
// SAFE PATH VALIDATION
// ======================================================

function validateRestorePath(
  relativePath
) {
  if (
    typeof relativePath !==
      "string" ||
    !relativePath.trim()
  ) {
    throw new Error(
      "Empty restore path detected."
    );
  }

  const raw =
    normalizePath(
      relativePath.trim()
    );

  const normalized =
    path.posix.normalize(
      raw
    );

  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    path.isAbsolute(
      relativePath
    )
  ) {
    throw new Error(
      `Unsafe restore path detected: ${relativePath}`
    );
  }

  const destination =
    path.resolve(
      ROOT,
      normalized
    );

  const rootResolved =
    path.resolve(
      ROOT
    );

  if (
    destination !==
      rootResolved &&
    !destination.startsWith(
      rootResolved +
      path.sep
    )
  ) {
    throw new Error(
      `Restore path escapes repository: ${relativePath}`
    );
  }

  return normalized;
}

// ======================================================
// RECOVERY MODE
// ======================================================

function validateMode() {
  if (
    RECOVERY_MODE !==
      "preview" &&
    RECOVERY_MODE !==
      "apply"
  ) {
    throw new Error(
      `Invalid RECOVERY_MODE: ${RECOVERY_MODE}`
    );
  }

  if (
    RECOVERY_MODE ===
      "apply" &&
    RECOVERY_CONFIRMATION !==
      REQUIRED_CONFIRMATION
  ) {
    throw new Error(
      "Recovery APPLY mode requires explicit confirmation."
    );
  }
}

// ======================================================
// LOAD + VALIDATE RESTORE POINT
// ======================================================

function validateBackup() {
  console.log(
    "===================================="
  );

  console.log(
    "Kings Automation Core & Safety"
  );

  console.log(
    "Recovery Validation"
  );

  console.log(
    "===================================="
  );

  console.log("");

  validateMode();

  if (
    !fs.existsSync(
      RESTORE_SOURCE
    )
  ) {
    throw new Error(
      "restore-source directory does not exist."
    );
  }

  const manifest =
    readJson(
      MANIFEST_FILE
    );

  const health =
    readJson(
      HEALTH_FILE
    );

  const restorePoint =
    readJson(
      RESTORE_POINT_FILE
    );

  if (
    health.healthy !== true ||
    health.status !==
      "HEALTHY"
  ) {
    throw new Error(
      "Selected Restore Point is not marked HEALTHY."
    );
  }

  if (
    restorePoint.type !==
      "restore-point"
  ) {
    throw new Error(
      "Selected artifact is not a valid Restore Point."
    );
  }

  if (
    !Array.isArray(
      manifest.files
    ) ||
    manifest.files.length ===
      0
  ) {
    throw new Error(
      "Backup manifest contains no files."
    );
  }

  if (
    manifest.commit &&
    restorePoint.commit &&
    manifest.commit !==
      restorePoint.commit
  ) {
    throw new Error(
      "Restore Point commit does not match backup manifest."
    );
  }

  console.log(
    `Mode: ${RECOVERY_MODE.toUpperCase()}`
  );

  console.log(
    `Restore Point: ${restorePoint.name || "unnamed"}`
  );

  console.log(
    `Backup created: ${manifest.createdAt || "unknown"}`
  );

  console.log(
    `Backup commit: ${manifest.commit || "unknown"}`
  );

  console.log(
    `Files in manifest: ${manifest.files.length}`
  );

  console.log("");

  return {
    manifest,
    health,
    restorePoint
  };
}

// ======================================================
// VERIFY RESTORE POINT FILES
// ======================================================

function verifyBackupFiles(
  manifest
) {
  console.log(
    "Verifying Restore Point integrity..."
  );

  const errors = [];

  for (
    const fileInfo
    of manifest.files
  ) {
    const relativePath =
      validateRestorePath(
        fileInfo.path
      );

    const backupFile =
      path.join(
        RESTORE_SOURCE,
        relativePath
      );

    if (
      !fs.existsSync(
        backupFile
      )
    ) {
      errors.push({
        path:
          relativePath,

        reason:
          "File missing from Restore Point."
      });

      continue;
    }

    if (
      !fs.statSync(
        backupFile
      ).isFile()
    ) {
      errors.push({
        path:
          relativePath,

        reason:
          "Restore source path is not a file."
      });

      continue;
    }

    const hash =
      sha256(
        backupFile
      );

    if (
      hash !==
        fileInfo.sha256
    ) {
      errors.push({
        path:
          relativePath,

        reason:
          "SHA-256 checksum mismatch."
      });
    }
  }

  if (
    errors.length >
    0
  ) {
    console.error("");

    console.error(
      "Restore Point integrity verification FAILED."
    );

    for (
      const error
      of errors
    ) {
      console.error(
        `- ${error.path}: ${error.reason}`
      );
    }

    throw new Error(
      `${errors.length} Restore Point integrity error(s) detected.`
    );
  }

  console.log(
    "Restore Point integrity verified successfully."
  );

  console.log("");
}

// ======================================================
// BUILD RECOVERY PLAN
// ======================================================

function buildRecoveryPlan(
  manifest,
  restorePoint
) {
  const files = [];

  let unchanged = 0;
  let restoreRequired = 0;
  let missingCurrent = 0;

  for (
    const fileInfo
    of manifest.files
  ) {
    const relativePath =
      validateRestorePath(
        fileInfo.path
      );

    const currentFile =
      path.join(
        ROOT,
        relativePath
      );

    let status;

    let currentHash =
      null;

    if (
      !fs.existsSync(
        currentFile
      )
    ) {
      status =
        "MISSING_CURRENT";

      missingCurrent++;
    } else if (
      !fs.statSync(
        currentFile
      ).isFile()
    ) {
      status =
        "RESTORE_REQUIRED";

      restoreRequired++;
    } else {
      currentHash =
        sha256(
          currentFile
        );

      if (
        currentHash ===
        fileInfo.sha256
      ) {
        status =
          "UNCHANGED";

        unchanged++;
      } else {
        status =
          "RESTORE_REQUIRED";

        restoreRequired++;
      }
    }

    files.push({
      path:
        relativePath,

      status,

      currentSha256:
        currentHash,

      backupSha256:
        fileInfo.sha256,

      backupSize:
        fileInfo.size
    });
  }

  return {
    version: 2,

    createdAt:
      nowISO(),

    mode:
      RECOVERY_MODE.toUpperCase(),

    restorePoint: {
      name:
        restorePoint.name ||
        null,

      createdAt:
        restorePoint.createdAt ||
        null,

      commit:
        restorePoint.commit ||
        null,

      workflowRunNumber:
        restorePoint.workflowRunNumber ||
        null
    },

    sourceBackup: {
      createdAt:
        manifest.createdAt ||
        null,

      commit:
        manifest.commit ||
        null,

      workflowRunId:
        manifest.workflowRunId ||
        null,

      workflowRunNumber:
        manifest.workflowRunNumber ||
        null
    },

    summary: {
      totalFiles:
        files.length,

      unchanged,

      restoreRequired,

      missingCurrent,

      actionsRequired:
        restoreRequired +
        missingCurrent
    },

    safety: {
      deletesExtraFiles:
        false,

      restoresOnlyManifestFiles:
        true,

      checksumValidation:
        true
    },

    files
  };
}

// ======================================================
// DISPLAY PLAN
// ======================================================

function printPlan(
  plan
) {
  console.log(
    "===================================="
  );

  console.log(
    "Recovery Plan"
  );

  console.log(
    "===================================="
  );

  console.log("");

  console.log(
    `Total files: ${plan.summary.totalFiles}`
  );

  console.log(
    `Unchanged: ${plan.summary.unchanged}`
  );

  console.log(
    `Restore required: ${plan.summary.restoreRequired}`
  );

  console.log(
    `Missing current files: ${plan.summary.missingCurrent}`
  );

  console.log("");

  const actions =
    plan.files.filter(
      file =>
        file.status !==
        "UNCHANGED"
    );

  if (
    actions.length ===
    0
  ) {
    console.log(
      "✅ Current repository already matches this Restore Point."
    );
  } else {
    console.log(
      "Files requiring recovery:"
    );

    console.log("");

    for (
      const file
      of actions
    ) {
      console.log(
        `${file.status} | ${file.path}`
      );
    }
  }

  console.log("");
}

// ======================================================
// APPLY RECOVERY
// ======================================================

function applyRecovery(
  plan
) {
  if (
    RECOVERY_MODE !==
      "apply"
  ) {
    return null;
  }

  console.log(
    "===================================="
  );

  console.log(
    "Applying Kings Recovery"
  );

  console.log(
    "===================================="
  );

  console.log("");

  const actions =
    plan.files.filter(
      file =>
        file.status !==
        "UNCHANGED"
    );

  const restored = [];

  if (
    actions.length ===
    0
  ) {
    console.log(
      "No files require restoration."
    );

    return {
      version: 1,

      completedAt:
        nowISO(),

      status:
        "SUCCESS",

      restoredFiles:
        0,

      files:
        []
    };
  }

  for (
    const fileInfo
    of actions
  ) {
    const relativePath =
      validateRestorePath(
        fileInfo.path
      );

    const source =
      path.join(
        RESTORE_SOURCE,
        relativePath
      );

    const destination =
      path.join(
        ROOT,
        relativePath
      );

    if (
      !fs.existsSync(
        source
      ) ||
      !fs.statSync(
        source
      ).isFile()
    ) {
      throw new Error(
        `Recovery source file missing: ${relativePath}`
      );
    }

    if (
      fs.existsSync(
        destination
      ) &&
      fs.statSync(
        destination
      ).isDirectory()
    ) {
      fs.rmSync(
        destination,
        {
          recursive: true,
          force: true
        }
      );
    }

    ensureDirectory(
      path.dirname(
        destination
      )
    );

    fs.copyFileSync(
      source,
      destination
    );

    const restoredHash =
      sha256(
        destination
      );

    if (
      restoredHash !==
        fileInfo.backupSha256
    ) {
      throw new Error(
        `Post-recovery checksum failed: ${relativePath}`
      );
    }

    restored.push({
      path:
        relativePath,

      sha256:
        restoredHash
    });

    console.log(
      `RESTORED | ${relativePath}`
    );
  }

  console.log("");

  console.log(
    `Successfully restored ${restored.length} file(s).`
  );

  return {
    version: 1,

    completedAt:
      nowISO(),

    status:
      "SUCCESS",

    restorePoint:
      plan.restorePoint,

    restoredFiles:
      restored.length,

    files:
      restored
  };
}

// ======================================================
// FINAL VERIFICATION
// ======================================================

function verifyRecoveredRepository(
  manifest
) {
  console.log("");

  console.log(
    "Running post-recovery verification..."
  );

  const errors = [];

  for (
    const fileInfo
    of manifest.files
  ) {
    const relativePath =
      validateRestorePath(
        fileInfo.path
      );

    const currentFile =
      path.join(
        ROOT,
        relativePath
      );

    if (
      !fs.existsSync(
        currentFile
      ) ||
      !fs.statSync(
        currentFile
      ).isFile()
    ) {
      errors.push(
        `${relativePath}: missing after recovery`
      );

      continue;
    }

    const currentHash =
      sha256(
        currentFile
      );

    if (
      currentHash !==
        fileInfo.sha256
    ) {
      errors.push(
        `${relativePath}: checksum mismatch after recovery`
      );
    }
  }

  if (
    errors.length >
    0
  ) {
    console.error(
      "Post-recovery verification FAILED."
    );

    for (
      const error
      of errors
    ) {
      console.error(
        `- ${error}`
      );
    }

    throw new Error(
      `${errors.length} post-recovery verification error(s).`
    );
  }

  console.log(
    "✅ Post-recovery verification passed."
  );
}

// ======================================================
// MAIN
// ======================================================

function start() {
  const {
    manifest,
    restorePoint
  } =
    validateBackup();

  verifyBackupFiles(
    manifest
  );

  const plan =
    buildRecoveryPlan(
      manifest,
      restorePoint
    );

  writeJson(
    RECOVERY_PLAN_FILE,
    plan
  );

  printPlan(
    plan
  );

  if (
    RECOVERY_MODE ===
      "preview"
  ) {
    console.log(
      "PREVIEW ONLY — no repository files were modified."
    );

    console.log("");

    console.log(
      "Recovery plan saved to recovery-plan.json"
    );

    console.log(
      "Kings Recovery Preview completed successfully."
    );

    return;
  }

  const result =
    applyRecovery(
      plan
    );

  verifyRecoveredRepository(
    manifest
  );

  writeJson(
    RECOVERY_RESULT_FILE,
    result
  );

  console.log("");

  console.log(
    "Recovery result saved to recovery-result.json"
  );

  console.log(
    "Kings Recovery completed successfully."
  );
}

// ======================================================
// START
// ======================================================

try {
  start();
} catch (error) {
  console.error("");

  console.error(
    "Kings Recovery failed:"
  );

  console.error(
    error
  );

  process.exit(1);
}
