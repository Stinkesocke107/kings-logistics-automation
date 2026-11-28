'use strict';
// Verify GitHub Actions artifact metadata after the backup uploader finishes.
// Metadata is not proof of recoverability; manifest and isolated restore are
// independently validated by the existing core backup / restore checks.
const fs = require('node:fs');

function assertUploadedBackupArtifact(payload, { name, runId }) {
  if (typeof name !== 'string' || !/^kings-(?:automation-backup|restore-point)-[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error('Expected backup artifact identity is invalid.');
  }
  if (!/^[1-9]\d*$/.test(String(runId || ''))) {
    throw new Error('Originating backup run ID is invalid.');
  }
  if (!payload || !Array.isArray(payload.artifacts) ||
      !Number.isSafeInteger(payload.total_count) || payload.total_count < 0 ||
      payload.total_count > 100 || payload.total_count !== payload.artifacts.length) {
    throw new Error('GitHub backup artifact inventory is incomplete or invalid.');
  }
  const matching = payload.artifacts.filter(item => item?.name === name);
  if (matching.length !== 1) {
    throw new Error('Exactly one matching backup artifact is required in this GitHub run.');
  }
  const item = matching[0];
  if (!Number.isSafeInteger(item.id) || item.id < 1 ||
      !Number.isSafeInteger(item.size_in_bytes) || item.size_in_bytes <= 0 ||
      item.expired !== false ||
      String(item.workflow_run?.id || '') !== String(runId) ||
      typeof item.archive_download_url !== 'string' ||
      !item.archive_download_url.startsWith('https://api.github.com/repos/')) {
    throw new Error('GitHub backup artifact is expired, empty, or lacks same-run provenance.');
  }
  return { id: item.id, name: item.name, bytes: item.size_in_bytes, runId: String(runId) };
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Artifact inventory path required.');
    const inventory = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const proof = assertUploadedBackupArtifact(inventory, {
      name: process.env.KINGS_BACKUP_ARTIFACT_NAME,
      runId: process.env.KINGS_BACKUP_SOURCE_RUN_ID
    });
    console.log('Verified backup artifact '+proof.name+' in original run '+proof.runId+' ('+proof.bytes+' bytes).');
  } catch (error) {
    console.error('Backup upload verification failed: '+error.message);
    process.exitCode = 1;
  }
}
module.exports = { assertUploadedBackupArtifact };
