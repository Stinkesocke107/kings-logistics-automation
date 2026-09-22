const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ======================================================
// KINGS LOGISTICS — RECOVERY SAFETY GATE
// Independent validation before core-recovery.js may run.
// ======================================================

const ROOT = __dirname;
const RESTORE_SOURCE = path.join(ROOT, "restore-source");
const TARGET_RUN = String(process.env.RECOVERY_TARGET_RUN || "").trim();
const MODE = String(process.env.RECOVERY_MODE || "preview").trim().toLowerCase();
const CURRENT_REPOSITORY = String(process.env.GITHUB_REPOSITORY || "").trim();
const CURRENT_BRANCH = String(process.env.GITHUB_REF_NAME || "main").trim();

const METADATA_FILES = new Set([
  "backup-manifest.json",
  "backup-health.json",
  "backup-final-health.json",
  "restore-point.json",
  "BACKUP-INFO.txt"
]);

const FORBIDDEN_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /(^|\/)\.git(?:\/|$)/i,
  /(^|\/)node_modules(?:\/|$)/i,
  /(^|\/)backup-staging(?:\/|$)/i,
  /(^|\/)restore-source(?:\/|$)/i,
  /(^|\/)restore-preview(?:\/|$)/i,
  /(^|\/)recovery-staging(?:\/|$)/i,
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i,
  /(?:^|\/)(?:id_rsa|id_ed25519)(?:\.|$)/i
];

function normalize(value) {
  return String(value || "").replace(/\\/g, "/");
}

function readJson(name, required = true) {
  const file = path.join(RESTORE_SOURCE, name);
  if (!fs.existsSync(file)) {
    if (!required) return null;
    throw new Error(`Required recovery metadata is missing: ${name}`);
  }

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${name}: ${error.message}`);
  }
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function isSafeRelativePath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) return false;

  const raw = normalize(relativePath.trim());
  const normalized = path.posix.normalize(raw);

  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    path.isAbsolute(relativePath)
  ) {
    return false;
  }

  return normalized === raw;
}

function isForbidden(relativePath) {
  const p = normalize(relativePath);
  return FORBIDDEN_PATTERNS.some(pattern => pattern.test(p));
}

function isAllowedRecoveryFile(relativePath) {
  const p = normalize(relativePath);

  if (p === ".gitignore" || p === "README.md") return true;
  if (p === "package.json" || p === "package-lock.json") return true;
  if (/^[^/]+\.js$/i.test(p)) return true;
  if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(p)) return true;
  if (/^data\/[^/]+\.json$/i.test(p)) return true;

  return false;
}

function assertSame(label, a, b) {
  if (a && b && String(a) !== String(b)) {
    throw new Error(`${label} mismatch: ${a} != ${b}`);
  }
}

function walkFiles(directory, base = directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = normalize(path.relative(base, absolute));

    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symbolic link is not allowed in Restore Point: ${relative}`);
    }

    if (entry.isDirectory()) {
      walkFiles(absolute, base, result);
    } else if (entry.isFile()) {
      result.push(relative);
    }
  }

  return result;
}

function validate() {
  console.log("====================================");
  console.log("Kings Recovery Safety Gate");
  console.log("====================================");

  if (!fs.existsSync(RESTORE_SOURCE) || !fs.statSync(RESTORE_SOURCE).isDirectory()) {
    throw new Error("restore-source directory is missing.");
  }

  if (MODE !== "preview" && MODE !== "apply") {
    throw new Error(`Invalid RECOVERY_MODE: ${MODE}`);
  }

  if (!/^\d+$/.test(TARGET_RUN)) {
    throw new Error("RECOVERY_TARGET_RUN must be a numeric backup run number.");
  }

  const manifest = readJson("backup-manifest.json");
  const health = readJson("backup-health.json");
  const finalHealth = readJson("backup-final-health.json", false);
  const restorePoint = readJson("restore-point.json");

  if (health.healthy !== true || health.status !== "HEALTHY") {
    throw new Error("Restore Point core backup health is not HEALTHY.");
  }

  if (MODE === "apply") {
    if (!finalHealth) {
      throw new Error("APPLY requires backup-final-health.json from the finalized backup system.");
    }

    if (finalHealth.healthy !== true || finalHealth.status !== "HEALTHY") {
      throw new Error("Restore Point final backup validation is not HEALTHY.");
    }
  } else if (finalHealth && (finalHealth.healthy !== true || finalHealth.status !== "HEALTHY")) {
    throw new Error("Restore Point final backup validation is not HEALTHY.");
  }

  if (restorePoint.type !== "restore-point") {
    throw new Error("Selected artifact is not marked as a restore-point.");
  }

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("Backup manifest contains no recoverable files.");
  }

  assertSame("Repository", manifest.repository, restorePoint.repository);
  assertSame("Branch", manifest.branch, restorePoint.branch);
  assertSame("Commit", manifest.commit, restorePoint.commit);
  assertSame("Workflow run ID", manifest.workflowRunId, restorePoint.workflowRunId);
  assertSame("Workflow run number", manifest.workflowRunNumber, restorePoint.workflowRunNumber);

  if (CURRENT_REPOSITORY) {
    if (manifest.repository && manifest.repository !== CURRENT_REPOSITORY) {
      throw new Error(`Restore Point belongs to another repository: ${manifest.repository}`);
    }
    if (restorePoint.repository && restorePoint.repository !== CURRENT_REPOSITORY) {
      throw new Error(`Restore Point metadata belongs to another repository: ${restorePoint.repository}`);
    }
  }

  if (CURRENT_BRANCH) {
    if (manifest.branch && manifest.branch !== CURRENT_BRANCH) {
      throw new Error(`Restore Point belongs to branch ${manifest.branch}, not ${CURRENT_BRANCH}.`);
    }
    if (restorePoint.branch && restorePoint.branch !== CURRENT_BRANCH) {
      throw new Error(`Restore Point metadata belongs to branch ${restorePoint.branch}, not ${CURRENT_BRANCH}.`);
    }
  }

  if (String(manifest.workflowRunNumber || "") !== TARGET_RUN) {
    throw new Error(
      `Manifest run number ${manifest.workflowRunNumber || "missing"} does not match selected backup run ${TARGET_RUN}.`
    );
  }

  if (String(restorePoint.workflowRunNumber || "") !== TARGET_RUN) {
    throw new Error(
      `Restore Point run number ${restorePoint.workflowRunNumber || "missing"} does not match selected backup run ${TARGET_RUN}.`
    );
  }

  const seen = new Set();
  const manifestPaths = new Set();

  for (const fileInfo of manifest.files) {
    const relativePath = normalize(fileInfo && fileInfo.path);

    if (!isSafeRelativePath(relativePath)) {
      throw new Error(`Unsafe or non-normalized restore path: ${relativePath || "<empty>"}`);
    }

    if (isForbidden(relativePath)) {
      throw new Error(`Forbidden secret/system path in Restore Point: ${relativePath}`);
    }

    if (!isAllowedRecoveryFile(relativePath)) {
      throw new Error(`File is outside the approved Kings recovery scope: ${relativePath}`);
    }

    if (seen.has(relativePath)) {
      throw new Error(`Duplicate path in backup manifest: ${relativePath}`);
    }
    seen.add(relativePath);
    manifestPaths.add(relativePath);

    if (!/^[a-f0-9]{64}$/i.test(String(fileInfo.sha256 || ""))) {
      throw new Error(`Invalid SHA-256 metadata for ${relativePath}`);
    }

    if (!Number.isSafeInteger(fileInfo.size) || fileInfo.size < 0) {
      throw new Error(`Invalid size metadata for ${relativePath}`);
    }

    const source = path.join(RESTORE_SOURCE, relativePath);
    if (!fs.existsSync(source)) {
      throw new Error(`Restore Point file is missing: ${relativePath}`);
    }

    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Restore Point entry is not a regular file: ${relativePath}`);
    }

    if (stat.size !== fileInfo.size) {
      throw new Error(`Size mismatch for ${relativePath}`);
    }

    if (sha256(source) !== String(fileInfo.sha256).toLowerCase()) {
      throw new Error(`SHA-256 mismatch for ${relativePath}`);
    }

    if (relativePath.toLowerCase().endsWith(".json")) {
      try {
        JSON.parse(fs.readFileSync(source, "utf8"));
      } catch (error) {
        throw new Error(`Invalid JSON in restore file ${relativePath}: ${error.message}`);
      }
    }
  }

  for (const actualPath of walkFiles(RESTORE_SOURCE)) {
    if (manifestPaths.has(actualPath) || METADATA_FILES.has(actualPath)) continue;

    if (isForbidden(actualPath)) {
      throw new Error(`Forbidden extra file found in Restore Point artifact: ${actualPath}`);
    }

    throw new Error(`Unexpected untracked file found in Restore Point artifact: ${actualPath}`);
  }

  console.log(`Mode: ${MODE.toUpperCase()}`);
  console.log(`Repository: ${CURRENT_REPOSITORY || manifest.repository || "unknown"}`);
  console.log(`Branch: ${CURRENT_BRANCH || manifest.branch || "unknown"}`);
  console.log(`Backup Run: #${TARGET_RUN}`);
  console.log(`Files verified: ${manifest.files.length}`);
  console.log(`Final backup health: ${finalHealth ? finalHealth.status : "legacy/not present"}`);
  console.log("Forbidden paths: 0");
  console.log("Unexpected artifact files: 0");
  console.log("✅ Recovery safety gate passed.");
}

try {
  validate();
} catch (error) {
  console.error("");
  console.error("❌ Kings Recovery safety validation failed:");
  console.error(error.message || error);
  process.exit(1);
}
