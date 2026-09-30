'use strict';

const API = 'https://api.github.com';
const REFERENCE = 'refs/heads/baseline/final-core-point23';
const LOOKUP_REF = 'heads/baseline/final-core-point23';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function request(url, options = {}) {
  const token = required('GITHUB_TOKEN');
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Kings Logistics Final Freeze Ref Guard',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); }
    catch { body = { raw: text.slice(0, 300) }; }
  }
  return { response, body };
}

async function readReference(repo) {
  const { response, body } = await request(`${API}/repos/${repo}/git/ref/${LOOKUP_REF}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Unable to read final baseline ref: HTTP ${response.status}.`);
  return body;
}

async function createReference(repo, sha) {
  const { response, body } = await request(`${API}/repos/${repo}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: REFERENCE, sha })
  });
  if (response.ok) return body;

  // A concurrent final-gate run may have created the immutable ref first.
  if (response.status === 422) {
    const existing = await readReference(repo);
    const existingSha = String(existing?.object?.sha || '');
    if (existingSha === sha) return existing;
  }
  throw new Error(`Unable to create final baseline ref: HTTP ${response.status}.`);
}

async function main() {
  const repo = required('GITHUB_REPOSITORY');
  const sha = required('FINAL_FREEZE_COMMIT');
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('FINAL_FREEZE_COMMIT must be a full 40-character commit SHA.');

  const existing = await readReference(repo);
  if (existing) {
    const existingSha = String(existing?.object?.sha || '');
    if (existingSha !== sha) {
      throw new Error(
        `Immutable final baseline ref already exists at ${existingSha || 'unknown'}, ` +
        `not ${sha}. Refusing to rewrite it.`
      );
    }
    console.log(`Final baseline ref already exists at verified commit ${sha}; no change required.`);
    return;
  }

  const created = await createReference(repo, sha);
  if (String(created?.object?.sha || '') !== sha) {
    throw new Error('GitHub returned an unexpected SHA after final baseline ref creation.');
  }
  console.log(`Created immutable ${REFERENCE} at verified commit ${sha}.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Final baseline ref guard failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { readReference, createReference };
