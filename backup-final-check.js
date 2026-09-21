const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const STAGING = path.join(ROOT, 'backup-staging');
const MANIFEST_FILE = path.join(STAGING, 'backup-manifest.json');
const OUTPUT_FILE = path.join(STAGING, 'backup-final-health.json');

const ENCRYPTED_STATE_FILES = [
  'data/driver-members.json',
  'data/driver-management.json',
  'data/driver-loa.json',
  'data/hr-probation.json',
  'data/driver-achievements.json',
  'data/staff-management.json'
];

const REQUIRED_CORE_FILES = [
  'core-backup.js',
  'core-recovery.js',
  'backup-final-check.js',
  'system-monitoring.js',
  'system-alerts.js',
  '.github/workflows/core-backup.yml',
  '.github/workflows/core-recovery.yml',
  '.github/workflows/system-monitoring.yml'
];

const FORBIDDEN_PREFIXES = [
  '.git/',
  'node_modules/',
  'backup-staging/',
  'restore-source/',
  'data/backups/'
];

const FORBIDDEN_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx']);

function normalize(value) {
  return String(value || '').split(path.sep).join('/').replace(/^\.\//, '');
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function walk(directory, predicate, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const name of fs.readdirSync(directory)) {
    const absolute = path.join(directory, name);
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) walk(absolute, predicate, output);
    else if (stat.isFile() && predicate(absolute)) output.push(normalize(path.relative(ROOT, absolute)));
  }
  return output;
}

function expectedRepositoryCoverage() {
  const expected = new Set();

  for (const name of fs.readdirSync(ROOT)) {
    const absolute = path.join(ROOT, name);
    if (fs.statSync(absolute).isFile() && (name.endsWith('.js') || name === 'package.json' || name === 'package-lock.json')) {
      expected.add(name);
    }
  }

  for (const file of walk(path.join(ROOT, '.github', 'workflows'), (absolute) => /\.ya?ml$/i.test(absolute))) {
    expected.add(file);
  }

  for (const file of walk(path.join(ROOT, 'data'), (absolute) => absolute.toLowerCase().endsWith('.json'))) {
    if (!file.startsWith('data/backups/')) expected.add(file);
  }

  if (fs.existsSync(path.join(ROOT, 'README.md'))) expected.add('README.md');
  return [...expected].sort();
}

function isForbidden(relativePath) {
  const normalized = normalize(relativePath);
  const basename = path.posix.basename(normalized);
  if (basename === '.env' || basename.startsWith('.env.')) return true;
  if (FORBIDDEN_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  if (FORBIDDEN_EXTENSIONS.has(path.posix.extname(basename).toLowerCase())) return true;
  return false;
}

function main() {
  console.log('====================================');
  console.log('Kings Backup Final Integrity Check');
  console.log('====================================');

  const errors = [];
  const warnings = [];

  if (!fs.existsSync(MANIFEST_FILE)) {
    throw new Error('backup-manifest.json is missing.');
  }

  const manifest = readJson(MANIFEST_FILE);
  if (!Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('Backup manifest contains no files.');
  }

  const manifestByPath = new Map(manifest.files.map((item) => [normalize(item.path), item]));
  const expected = expectedRepositoryCoverage();
  const missingCoverage = expected.filter((file) => !manifestByPath.has(file));

  for (const file of missingCoverage) {
    errors.push({ type: 'missing-coverage', file, message: 'Current repository file is not included in the backup manifest.' });
  }

  for (const required of REQUIRED_CORE_FILES) {
    if (!fs.existsSync(path.join(ROOT, required))) {
      errors.push({ type: 'required-core-missing-repo', file: required, message: 'Required Kings core file is missing from the repository.' });
    } else if (!manifestByPath.has(required)) {
      errors.push({ type: 'required-core-missing-backup', file: required, message: 'Required Kings core file is missing from the backup.' });
    }
  }

  const forbidden = [...manifestByPath.keys()].filter(isForbidden);
  for (const file of forbidden) {
    errors.push({ type: 'forbidden-file', file, message: 'Forbidden/sensitive file must never be included in a backup.' });
  }

  let checksumChecked = 0;
  for (const [relativePath, info] of manifestByPath) {
    const staged = path.join(STAGING, relativePath);
    if (!fs.existsSync(staged) || !fs.statSync(staged).isFile()) {
      errors.push({ type: 'staged-file-missing', file: relativePath, message: 'Manifest file is missing from backup staging.' });
      continue;
    }
    if (!info.sha256) {
      errors.push({ type: 'manifest-hash-missing', file: relativePath, message: 'Manifest entry has no SHA-256 hash.' });
      continue;
    }
    checksumChecked++;
    if (sha256(staged) !== String(info.sha256)) {
      errors.push({ type: 'checksum-mismatch', file: relativePath, message: 'Staged backup SHA-256 does not match manifest.' });
    }
  }

  const encryptedChecks = [];
  for (const relativePath of ENCRYPTED_STATE_FILES) {
    if (!fs.existsSync(path.join(ROOT, relativePath))) {
      encryptedChecks.push({ file: relativePath, ok: false, reason: 'missing-in-repository' });
      errors.push({ type: 'encrypted-state-missing', file: relativePath, message: 'Expected sensitive state file is missing from repository.' });
      continue;
    }
    const staged = path.join(STAGING, relativePath);
    if (!fs.existsSync(staged)) {
      encryptedChecks.push({ file: relativePath, ok: false, reason: 'missing-in-backup' });
      errors.push({ type: 'encrypted-state-not-backed-up', file: relativePath, message: 'Sensitive encrypted state is missing from backup.' });
      continue;
    }
    try {
      const data = readJson(staged);
      const ok = data?.encrypted === true && data?.algorithm === 'aes-256-gcm';
      encryptedChecks.push({ file: relativePath, ok, reason: ok ? null : 'unexpected-format' });
      if (!ok) errors.push({ type: 'encrypted-state-format', file: relativePath, message: 'Sensitive state is not AES-256-GCM encrypted in backup.' });
    } catch (error) {
      encryptedChecks.push({ file: relativePath, ok: false, reason: 'invalid-json' });
      errors.push({ type: 'encrypted-state-invalid', file: relativePath, message: String(error.message || error) });
    }
  }

  const health = {
    version: 1,
    checkedAt: new Date().toISOString(),
    status: errors.length ? 'UNHEALTHY' : 'HEALTHY',
    healthy: errors.length === 0,
    summary: {
      repositoryFilesExpected: expected.length,
      repositoryFilesCovered: expected.length - missingCoverage.length,
      manifestFiles: manifest.files.length,
      checksumsChecked: checksumChecked,
      encryptedStatesChecked: encryptedChecks.length,
      encryptedStatesHealthy: encryptedChecks.filter((item) => item.ok).length,
      forbiddenFiles: forbidden.length,
      errors: errors.length,
      warnings: warnings.length
    },
    coverage: {
      missing: missingCoverage
    },
    encryptedStates: encryptedChecks,
    forbiddenFiles: forbidden,
    errors,
    warnings,
    note: 'Final dynamic backup validation. All current Kings root JS files, workflows, and data JSON files must be covered; sensitive states must remain encrypted; secret/key files are forbidden.'
  };

  writeJson(OUTPUT_FILE, health);

  console.log(`Status: ${health.status}`);
  console.log(`Repository coverage: ${health.summary.repositoryFilesCovered}/${health.summary.repositoryFilesExpected}`);
  console.log(`Manifest files: ${health.summary.manifestFiles}`);
  console.log(`Checksums verified: ${health.summary.checksumsChecked}`);
  console.log(`Encrypted states: ${health.summary.encryptedStatesHealthy}/${health.summary.encryptedStatesChecked}`);
  console.log(`Forbidden files: ${health.summary.forbiddenFiles}`);
  console.log(`Errors: ${health.summary.errors}`);

  for (const error of errors.slice(0, 50)) {
    console.log(`[ERROR] ${error.file}: ${error.message}`);
  }
}

main();
