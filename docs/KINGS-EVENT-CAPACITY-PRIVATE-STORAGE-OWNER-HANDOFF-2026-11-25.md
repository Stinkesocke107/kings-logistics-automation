## CEO decision — THREE NEW dedicated PRIVATE repositories (25 November 2026)

**Approved design choice:** create **three entirely new, individually PRIVATE GitHub repositories** under the owner's `Stinkesocke107` account; do **NOT** repurpose either of the existing private `kings-logistics-automation-archive` or `kings-logistics-automation-public` repositories.

**Planned repositories (explicit owner approval to create; NOT YET CREATED):**

- `Stinkesocke107/kings-event-capacity-history` — encrypted historical Event data and owner-signed lifecycle journal records.
- `Stinkesocke107/kings-event-capacity-witness` — independently reviewed checkpoint/witness records, separated from the data repository.
- `Stinkesocke107/kings-event-capacity-backups` — separately encrypted daily archive backup objects.

**Provisioning status (verified by the linked GitHub account repository list):**
- [x] Three new, separate repository roles explicitly approved by CEO.
- [x] Dedicated names and account selected; existing repos remain untouched.
- [ ] CEO creates EACH repository in the GitHub web interface with **Private** visibility and **Add README**, producing a `main` default branch. Repository creation is **not available in the currently connected GitHub action set**.
- [ ] Verify all three exact repositories are visible and private, have real `main` branch commits and no unexpected collaborators.
- [ ] Review branch protection/rulesets individually; reported GitHub `protected` flags alone do not prove security.
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

- [ ] **Approve actual provisioning** and choose the GitHub account/organization that will own the private Kings data. Confirm whether suitable existing PRIVATE repos can be reused, or create **three distinct PRIVATE repositories** for (1) encrypted Event history/decision data, (2) independent checkpoint/witness, and (3) encrypted daily backups. Each needs a real `main` branch and reviewed branch/ruleset restrictions.
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
