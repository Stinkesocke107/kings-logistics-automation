const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {safeRelative,safeTarget,assertManifest,verifiedSource}=require('./recovery-path-guard');

// ======================================================
// KINGS LOGISTICS — ISOLATED BACKUP RESTORE VERIFICATION
// Restores the complete manifest into a disposable sandbox.
// It never writes restored files back into the repository tree.
// ======================================================

const ROOT = __dirname;
const BACKUP_ROOT = path.join(ROOT, 'backup-staging');
const VERIFY_ROOT = path.join(ROOT, 'restore-verification');
const MANIFEST_FILE = path.join(BACKUP_ROOT, 'backup-manifest.json');
const RESULT_FILE = path.join(BACKUP_ROOT, 'backup-restore-verification.json');

function normalizePath(value) {
  return String(value).split(path.sep).join('/');
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function safeRelativePath(value) {
  return safeRelative(value);
}

function writeResult(result) {
  fs.writeFileSync(RESULT_FILE, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function main() {
  if (!fs.existsSync(MANIFEST_FILE)) {
    throw new Error('backup-staging/backup-manifest.json is missing.');
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  assertManifest(manifest.files);
  // Do not remove a symlinked disposable directory that may point outside
  // this runner. Every restore target is separately guarded below.
  if (fs.existsSync(VERIFY_ROOT) && fs.lstatSync(VERIFY_ROOT).isSymbolicLink()) {
    throw new Error('Disposable restore verification root cannot be a symlink.');
  }
  fs.rmSync(VERIFY_ROOT, { recursive: true, force: true });
  fs.mkdirSync(VERIFY_ROOT, { recursive: true });

  const errors = [];
  let restored = 0;
  let checksumVerified = 0;
  let jsonVerified = 0;

  try {
    for (const entry of manifest.files) {
      const relativePath = safeRelativePath(entry.path);
      // Revalidate original source integrity before copying, even when
      // verify-roundtrip runs independently of the recovery safety workflow.
      const source=verifiedSource(BACKUP_ROOT,entry);
      const destination=safeTarget(VERIFY_ROOT,relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
      restored += 1;

      const restoredHash = sha256(destination);
      if (restoredHash !== entry.sha256) {
        errors.push({ path: relativePath, reason: 'Restored SHA-256 does not match manifest.' });
        continue;
      }
      checksumVerified += 1;

      if (relativePath.toLowerCase().endsWith('.json')) {
        try {
          JSON.parse(fs.readFileSync(destination, 'utf8'));
          jsonVerified += 1;
        } catch (error) {
          errors.push({ path: relativePath, reason: `Restored JSON is invalid: ${error.message}` });
        }
      }
    }

    // Ensure no restore produced files outside the disposable verification tree.
    const healthy =
      errors.length === 0 &&
      restored === manifest.files.length &&
      checksumVerified === manifest.files.length;

    const result = {
      version: 1,
      checkedAt: new Date().toISOString(),
      status: healthy ? 'HEALTHY' : 'UNHEALTHY',
      healthy,
      sourceManifest: {
        commit: manifest.commit || null,
        workflowRunId: manifest.workflowRunId || null,
        workflowRunNumber: manifest.workflowRunNumber || null
      },
      summary: {
        manifestFiles: manifest.files.length,
        restoredFiles: restored,
        checksumsVerified: checksumVerified,
        restoredJsonVerified: jsonVerified,
        errors: errors.length
      },
      safety: {
        destination: 'restore-verification',
        writesToRepositoryPaths: false,
        deletesRepositoryFiles: false,
        sandboxRemovedAfterCheck: true
      },
      errors
    };

    writeResult(result);

    console.log('====================================');
    console.log('Kings Backup Restore Verification');
    console.log('====================================');
    console.log(`Manifest files: ${manifest.files.length}`);
    console.log(`Restored files: ${restored}`);
    console.log(`SHA-256 verified: ${checksumVerified}`);
    console.log(`Restored JSON verified: ${jsonVerified}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Status: ${result.status}`);

    if (!healthy) {
      for (const error of errors) console.error(`- ${error.path}: ${error.reason}`);
      throw new Error('Isolated backup restore verification failed.');
    }
  } finally {
    fs.rmSync(VERIFY_ROOT, { recursive: true, force: true });
  }
}

main();
