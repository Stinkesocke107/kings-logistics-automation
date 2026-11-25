# CURRENT OWNER DECISION — GitHub Free, three PRIVATE repositories (25 November 2026)

**This section supersedes any older alternative below that proposed one public data repository, paid GitHub features, or creating/replacing the three repos.** All project code and public-safe metadata stay in `Stinkesocke107/kings-logistics-automation` (PUBLIC). Actual confidential histories, offline-reviewed checkpoint copies and separately encrypted backup objects must stay exclusively in the following three dedicated PRIVATE repositories:

1. `Stinkesocke107/kings-event-capacity-history`
2. `Stinkesocke107/kings-event-capacity-witness`
3. `Stinkesocke107/kings-event-capacity-backups`

**Owner reports all three were created. They are NOT yet independently verified.** The connected GitHub App installation `162599792` is configured for **selected repositories** and currently only exposes the existing `kings-logistics-automation`, `kings-logistics-automation-archive` and `kings-logistics-automation-public` repos. This is an ACCESS/GITHUB APP INSTALLATION BLOCKER, not proof the new repositories are absent.

**Action for CEO now (no keys or tokens):** Visit https://github.com/settings/installations/162599792 and configure this existing installation, keep `Only select repositories`, add the exact three `kings-event-capacity-*` repositories, and save. If they do not appear in the chooser, check the logged-in GitHub account and repository ownership/spelling. This action is done in GitHub UI by the owner; the linked connector cannot modify its own installation scope. After granting access, re-check exact names, PRIVATE visibility, `main` and available permissions through GitHub and confirm; **do not write any live historical data until a separately approved privacy/security pilot.**

**GitHub Free compatibility:** Unlimited private repositories and repository-level Actions secrets are available. Do **not** require private branch protection/rulesets, paid Environment Secrets or paid deployment-reviewer rules. The absence of those premium controls is NOT proof of repository trust; compensate with strictly scoped tokens, offline owner Ed25519 private signing key and independently held latest highwater, separate encrypted backup key, verification before writes and human approval. Do not put the owner signing private key or all archive+backup secrets on one Actions runner. Repository secrets are created later via each PRIVATE repository's `Settings > Secrets and variables > Actions > New repository secret`, only after deciding the minimum required permissions and actual workflow boundary.

**Next owner task after App authorization:** none until the assistant confirms the three private repos are visible and proposes the exact minimum-permission secret layout. Never paste tokens, encryption secrets, or keys in chat or into a git commit.

**Production state:** PR #143 is DRAFT. No production workflow, Discord, event decisions, calendar data, `capacity_preview`, private repository writes or credentials have been changed.

---

## CEO decision — THREE NEW dedicated PRIVATE repositories (25 November 2026)

**Approved design choice:** create **three entirely new, individually PRIVATE GitHub repositories** under the owner's `Stinkesocke107` account; do **NOT** repurpose either of the existing private `kings-logistics-automation-archive` or `kings-logistics-automation-public` repositories.

**Dedicated repositories (CEO reports all three created; connector visibility still pending):**

- `Stinkesocke107/kings-event-capacity-history` — encrypted historical Event data and owner-signed lifecycle journal records.
- `Stinkesocke107/kings-event-capacity-witness` — independently reviewed checkpoint/witness records, separated from the data repository.
- `Stinkesocke107/kings-event-capacity-backups` — separately encrypted daily archive backup objects.

**Provisioning status (owner reports creation; linked GitHub App currently sees only the three previously authorized repositories):**
- [x] Three new, separate repository roles explicitly approved by CEO.
- [x] Dedicated names and account selected; existing repos remain untouched.
- [x] CEO reports the three repositories were created on GitHub. **Still unverified by GitHub App; do not mark private visibility or `main` as independently verified.**
- [ ] CEO grants the installed GitHub App access to these three selected repositories via https://github.com/settings/installations/162599792 while retaining `Only select repositories`. After this, verify exact private visibility, real `main` branch and authorized collaborators through live GitHub metadata.
- [ ] **GitHub Free:** Do not require paid branch protection or private deployment-environment reviewer gates. Substitute externally held owner highwater/signatures, minimal per-repository credentials, read-after-write verification and manual release approval. Branch protection reported flags remain informational only.
- [ ] Plan separate minimal repository-restricted credentials, with independent owner custody and public verification key; **do not place tokens or offline owner signing private key in chat/public source/GitHub Actions**.
- [ ] Approve narrow real private repository metadata verification and a synthetic-data-only pilot **after** permission review; no real historical Event writes until a separate release authorization.

**Safe one-time owner setup steps:** Open GitHub's new repository page for each of the three exact names, choose `Stinkesocke107` as owner, `Private` visibility, turn on `Add README`, keep other initialization defaults simple, and click `Create repository`. Never make the repositories public. The assistant can verify repo metadata through the existing connected GitHub integration **after** they are created and accessible, but cannot create GitHub repositories or grant installation access from this conversation.

**Safety status:** approved architecture does NOT mean deployed infrastructure. `main`, PR #143 release status, Discord, existing private repositories and the running Convoy Checker remain unchanged. No `capacity_preview`, source migration, key provisioning or production activation has been approved.

---

# Kings Event Capacity — Private Storage Owner Handoff / Einrichtungsplan

**25 November 2026 — Draft PR #143, NOT enabled.**

This document is an actionable handoff. It does **not** authorize provisioning, production tokens, deployments, Discord changes, PR merge or a manual `capacity_preview` run. No private material should be committed to the PUBLIC Kings code repository or pasted into an open chat.

## Already implemented in the draft (no owner action needed for code/tests)

- Signed, append-only historical Event transition journal, encrypted archive and owner-signed archive checkpoint verifier.
- Private GitHub read/CAS-write and fail-closed reconciliation prototypes.
- Separate AES-256-GCM private backup envelope and the earlier sub-850-KiB daily backup adapter.
- **NEW:** `event-capacity-private-storage-preflight.js`: read-only validation of three **distinct named private GitHub repos** with three distinct credential strings. It reads repo metadata and the `main` branch twice; reports observed branch protection flags, but does **not** prove exact token scopes, a secure owner account, actual repository contents or branch rule configuration. It always returns `safeToActivate:false`. No secrets or private repository names are returned in its report.
- **NEW:** `event-capacity-historical-segmented-backup.js`: fully verified, encrypted backup envelope split into content-addressed ciphertext chunks. Default 256 KiB, max 512 KiB per chunk; max 256 parts / 38 MiB logical backup. All segment SHA-256 digests, encryption authentication, original signed history, and external offline owner receipts are checked again on reconstruction.
- **NEW:** `event-capacity-historical-segmented-github-vault.js`: isolated PRIVATE GitHub Contents adapter using **immutable per-ciphertext-digest segments**, then **one immutable per-UTC-day manifest written last**. It reads back the full encrypted signed archive to verify what was stored. Any partial upload, conflict, timeout or ambiguous index commit fails closed and requires manual recovery: **no retries, overwrites or auto-deletes**.
- Safety gate tests prove none of these modules is imported by the live Convoy Checker or GitHub Actions runner.

**Limitations:** These modules are still isolated draft code. No real private repositories, tokens or signing keys were provisioned, and no real Event data was copied to storage. GitHub Contents JSON limits and GitHub repository storage growth remain operational constraints. A distinct private GitHub repo is **not** a truly provider-independent offsite disaster-recovery backup; an independently controlled second provider/account or removable encrypted offline media must also be evaluated before production.

## Owner actions — explicitly required before a REAL private integration pilot

### CEO / GitHub account administrator — not needed just to keep developing draft code

- [x] **Approved:** three dedicated new PRIVATE repositories under `Stinkesocke107` for (1) encrypted Event history, (2) independent checkpoint/witness and (3) encrypted daily backups. Owner reports they exist. GitHub App access and metadata verification still missing; do not use pre-existing private automation repos.
- [ ] Approve an appropriately narrow **credential policy**. Use separate GitHub App installation tokens or fine-grained repository-restricted credentials for each role. Data write token must not be a convenient master token for witness and backup as well. The code-level distinct-token-string check is **not** proof of token scope, independent administration or revocation ability.
- [ ] Keep a deliberately separate **offline Ed25519 OWNER PRIVATE signing key** under CEO control, and keep the independently retained **latest signed highwater receipt** outside BOTH data and witness repos. Export and deliver only the public verifier key through a protected process. Never store the signing private key or all encryption/backup secrets in Actions, Discord or the public repo.
- [ ] Confirm a safe mechanism for keeping the **archive encryption secret** distinct from the **backup encryption secret**, including recovery, rotation and restricted access; ideally isolate the backup from the same account/operator compromise.
- [ ] Designate who can perform confidential evidence reviews (Event Coordination / Leadership), the final approving CEO, and the authorized second reviewer. Real Discord effective role/channel permission checks must be performed in a private test/pilot before any Staff action.
- [ ] Provide or authorize the authentic **historical Convoy Center inventory** for the required 24-month lookback, including cancelled, rescheduled, completed, archived/deleted and legacy events. Current snapshots alone cannot prove the historical register is complete. All evidence must be treated as sensitive PRIVATE data.

### Additional security and operational acceptance — not yet implemented

- [ ] Verify actual PRIVATE repo/branch metadata with the preflight using credentials in a controlled execution environment. Verify exact fine-grained permissions, repo rulesets, separate actor custody and secret rotations independently; the preflight cannot do those things.
- [ ] Build/approve a scheduled, least-privilege encrypted backup worker with separate key custody, **90-day retention policy**, applicable legal holds, and a **monthly recovery drill on genuinely isolated infrastructure**. The current backup codec and storage adapter do NOT schedule backups, enforce retention or physically isolate restore hosts.
- [ ] Test interruption, duplicate daily writes, receipt rollover, stale owner highwater, revocation, re-encryption/key rotation, GitHub API conflicts and full 24-month history volume on actually provisioned private test repositories.
- [ ] Confirm privacy notice, access controls, archive deletion and backup erasure propagation with a privacy/security review.
- [ ] Complete authenticated original source coverage, real Staff identity and effective permission E2E, unchanged production Convoy Checker tests, same-HEAD full CI, security review and separate **explicit CEO launch authorization**.

## What the CEO does NOT need to do now

No private repositories or tokens are required for the offline implementation, mocked tests and documentation phase. **Do not run `capacity_preview`, merge PR #143, change production workflows, send private keys in chat or publish archive contents.**

### First blocking decision for a real pilot

The only CEO decision required to move from *mocked private storage* to *REAL private storage* is: **approve the three-repository private test setup, identify which GitHub account/organization should own it, and approve a safe separate-token/key-custody approach.** After that, the real repository metadata check, permission inspection and read-only storage pilot can be performed with authorized access. Until then, drafting and CI may continue, but claiming a real deployed or complete historical Event system would be inaccurate.

## Verification markers

See PR #143 and the latest successful same-HEAD GitHub Actions regression run for exact test counts. A green CI suite proves code regression behavior under synthetic data, **not** real private storage, source completeness, effective Discord permissions, separately held signing keys, enforced backup retention or certified free Event Capacity slots.

**Release state remains: DRAFT / PRODUCTION DISABLED / HUMAN AND OWNER APPROVAL REQUIRED.**
