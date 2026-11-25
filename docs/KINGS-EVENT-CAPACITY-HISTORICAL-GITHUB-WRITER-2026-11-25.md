# Kings Event Capacity — Owner-pinned private historical GitHub CAS writer (DRAFT)

**25 November 2026. Development-only.** No live workflow activation, Discord posting, merge, repo creation, credential provisioning or historical event writes were performed. All test data and tokens are synthetic.

## Purpose

`event-capacity-historical-github-writer.js` implements an isolated, controlled **one-revision-at-a-time** historical archive update using GitHub Contents REST. It is not wired to the existing Convoy Checker. The existing read-only `event-capacity-historical-github-reader.js` is reused to authenticate the old encrypted history before updating it and to verify the exact new history after a successful update.

### Preconditions

1. The old archive must already exist in an explicitly configured **PRIVATE** GitHub repository, with a valid offline owner-signed **previous** receipt retained outside the GitHub storage.
2. The candidate archive must be encrypted and prepared *before* the write. The owner must approve and sign a **new receipt over that archive's exact checkpoint** in an independent offline environment. Generating fresh ciphertext again changes its digest: the writer must use the exact approved bytes. Never supply the owner's Ed25519 private key to a GitHub runner, GitHub repository or Discord.
3. The new archive must contain the entire prior signed journal plus **exactly one new correctly signed event transition**, with the prior lifecycle chain unchanged. Signed previous-tip continuity, journal creation timestamp, guild, forum and source revision must match.
4. The new receipt must advance the old revision by exactly one. An archive receipt is **not** proof that an event was really accepted, cancelled, rescheduled or attended; it is evidence that the owner signed the recorded transition and archive. Source authenticity and completeness need separate verification.
5. Only a specifically authorized, minimum-scope private data-repository token may access that repo. Private repository metadata and branch identities are checked before any changes.

### Crash-aware update order

1. Authenticate both offline receipts, decrypt and verify the candidate archive **before network writes**.
2. Read and verify the old owner-pinned archive, the current private repository identity, journal chain and exact Git blob SHA plus SHA-256 of its current manifest.
3. For each new encrypted segment, derive its filename from its SHA-256 ciphertext digest. If an object already exists, read it and require an **exact byte match**. Otherwise, create the content-addressed object once, with no overwrite SHA, and immediately re-read and verify the Git blob, SHA-256 and exact bytes.
4. Recheck private repository identity and the same old current manifest. Switch only `capacity-history/current.json` using GitHub Contents **SHA compare-and-swap**. Any conflict fails closed; no retries, destructive reset or silent rewriting of previously approved decisions.
5. Re-read and independently verify the newly pinned full encrypted archive using the **new owner receipt**. Only then return `repositoryWriteVerified:true`.

The resulting state is `StoredPendingIndependentOwnerHighwater`, and still has `historicalCoverageCertified:false`, `sourceEvidenceAuthenticityVerified:false` and `freeSlotsCertified:false`.

**Ambiguous outcome:** If a segment or manifest write succeeds remotely but GitHub times out, returns a bad response or the final verification fails, the wrapper returns only a generic failure. A partially prepared update may leave encrypted orphan segments. The manifest itself may already have switched. The operator must reconcile the exact state against retained, independently signed receipts. **Never retry automatically or auto-delete orphan files.**

### Safety and authorization limitations

- Two private repositories with ordinary Git commit history alone do **not** constitute tamper-proof rollback prevention. An external owner-controlled, independently retained highwater and separate witness must be required before release.
- This writer is a library prototype. It takes explicitly provided receipts and encrypted archive bytes. It does not authenticate the original Discord source archive, Staff decision validity, owner custody of receipt storage, token permission scope, live role membership or real Convoy Center coverage.
- This writer is **not a fully implemented production recovery or private-storage orchestration service**. It does not create initial storage or restore a missing index. No user action or manual `capacity_preview` is requested.
- New archives currently re-encrypt the entire signed journal. That is bounded by the existing archive size limits but is expensive and produces new content-addressed segments; future production storage must include retention, garbage-collection policy with independent approval, storage-cost evaluation and encrypted long-term partition lifecycle.
- The ordinary GitHub API does not guarantee uninterrupted 15-minute scheduling or a trusted external highwater. Release requires branch protection and independently maintained private receipt history.

### Verification

`tests/event-capacity-historical-github-writer.test.cjs` supplies a synthetic, in-memory GitHub Contents HTTP backend and owner Ed25519 keys. It covers a valid one-transition write and verify; repeated/stale attempts; invalid owner signature or wrong archive; refusal of public repos; Git CAS conflict; ambiguous post-commit failure without retry/rollback; and failure to create an encrypted segment. The workflow-gating test also ensures the library cannot be imported into the live Convoy Checker from this PR.

These are **mock integration fixtures**. They are not real private GitHub repository end-to-end tests and cannot establish 24-month storage, monthly restore, actual Event participation, safe real Staff permissions, or verified free slots. The **full latest-head GitHub CI has not yet been confirmed**.

### Still blocking release

- Explicitly provision two permission-separated private repositories, minimum-scope data and witness tokens, protected branches, and independently controlled owner checkpoint receipts.
- Real immutable history/evidence intake and source completeness with strict Event identity resolution.
- Independent rollback-proof checkpoint, two-phase recovery and operator alerting for ambiguous commits.
- 24-month history and 90-day separately encrypted backups, key rotation, deletion propagation, monthly isolated restores and privacy/security review.
- Full same-HEAD Node suite plus authenticated read-only production-like E2E and explicit CEO permission before any merge, token activation or Discord posts.

**Production remains disabled.**

**Additional local verification (25 November 2026):** 26 focused Node tests passed under Node.js 22 using the local archive/journal/reader/tracker implementations and the byte-for-byte verified writer source from this PR. This includes 7 direct read/write mock-GitHub writer integration checks. The GitHub-committed 8-case writer fixture and the complete repository suite still need same-HEAD GitHub Actions CI verification (the local writer test file is a separate but equivalent focused harness); no live repository test or release evidence is implied.
