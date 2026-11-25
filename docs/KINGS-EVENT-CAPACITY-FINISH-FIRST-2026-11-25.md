# Kings Event Capacity — Finish first, then activate

**Decision:** 25 November 2026 — development continues in Draft PR #143. No unfinished production Event Capacity activation.

## Immediate operational decision

The separate metadata-only preview merged through PR #144 remains manually opt-in and default OFF. No one needs to press Run now. It is not a substitute for proving the complete Event Capacity system ready. PR #143 remains Draft and unmerged. The established main Kings Convoy Checker is independent and should continue as before.

## Historical lifecycle journal (offline only)

The new event-capacity-historical-lifecycle-journal.js provides an independent, strictly checked, append-only OWNER-SIGNED history of individual historical Convoy Event decisions:

- accept: first evidence-backed historical acceptance
- reschedule: owner-reviewed UTC departure change after accepted/rescheduled
- cancel: owner-reviewed cancellation after accepted/rescheduled
- complete: owner-reviewed historical completion after accepted/rescheduled

Each entry is signed using Ed25519 and bound to exact Kings guild/forum, prior revision, prior hash, Event reference, category, UTC departure, separate evidence digest, archived source fingerprint and reviewed-at date. The source archive digest by itself does NOT authenticate an archive; the operator must independently verify its actual origin.

A missing or forged signature, re-used evidence digest, duplicate acceptance, invalid status transition, time reversal, modified source/category, altered initial timestamp, broken chain or concurrent stale revision fails closed. The owner PRIVATE signing key MUST remain outside GitHub, GitHub Actions, Discord and all bot secrets. This module is in-memory only: real archived source authentication, durable private storage, operator signing procedure and production integration remain missing.

Cancelled does NOT automatically certify when a previously occupied capacity slot was released. Neither signatures nor complete-looking source snapshots prove that no other historical Event is missing. All journal states explicitly retain historicalCoverageCertified:false and freeSlotsCertified:false.

Offline synthetic tests: tests/event-capacity-historical-lifecycle-journal.test.cjs.

## Definition of done — all must pass BEFORE live activation

1. **Full decision integration:** Authenticated current source, verified live Discord roles, independent second-human review, distinct CEO authority where required, private encrypted ledger write, independent owner highwater, strict replay denial and operator-managed ambiguous write recovery must work end to end without trusted test doubles.
2. **Complete historical review:** Independently authenticated accepted, completed, cancelled, rescheduled, legacy and no-longer-visible Event history, with manually resolved conflicts and independently reviewed UTC-month coverage. Fifteen-minute snapshots or fourteen-day GitHub ZIP retention cannot prove completeness.
3. **Private infrastructure:** Provision distinct PRIVATE GitHub data and checkpoint repositories, separate minimal-privilege credentials, branch/access controls, offline Ed25519 private key custody, key rotation/revocation and clear rollback recovery.
4. **Private archival durability:** Protected audit journal covering at least 24 months, partitioned storage, independent encrypted backups, retention/erasure rules, and real isolated restore drill. One small GitHub Contents blob is not enough.
5. **Discord field validation:** Verify true protected channel, Guild/Forum and Staff/Leadership role IDs; current membership and effective permissions; message edits; double processing after delayed scheduled runs; confidential case handling.
6. **Capacity correctness:** Combined 2 accepted Partner/Other External daily, separate 20 Partner and 20 Other External monthly, Kings unlimited, UTC departure dates, 120-minute advisory, exception authority and manual CEO oversight. Unknown legacy Events may never create apparently free capacity.
7. **Final operational review:** All offline integration tests pass, then an operator-controlled limited read-only preview, rollback/recovery and credential incident drills, independent security review, and explicit CEO go-live authorization.

Until these criteria are met: do NOT run Event Capacity commands, auto approvals, private Discord publication, capacity slot certification, scheduled data sync, or owner-approval writes.

All development continues using GitHub Actions. No new always-on VPS or privately hosted bot.

## Optional live-map fallback — development update (25 November 2026)

The Kings Event Capacity calendar must work with **no live player map available**. The optional live-map availability layer is isolated from the Event Capacity policy engine and from current production GitHub Actions:

- New draft module: `event-capacity-optional-tracker.js`, integrated in the **draft private calendar renderer** via `event-capacity-dashboard.js`.
- With no provider, an unavailable map, stale (>15 min) data, incomplete server coverage, unauthenticated data or a provider exception, the UI indicates `WITHOUT_MAP` / `Unavailable`. Calendar day/month quotas, Event decisions, report status and warnings are unchanged.
- An optional `WITH_MAP` feed-status indicator requires a caller-proven authenticated, complete, fresh provider status. These trust flags must **only** be set by a separately verified authorized adapter, NEVER from untrusted API output or cached last-known-good data. Status projection does **not** fetch/render a map or provide positions.
- Player positions and online counts are **never** invented or included in this status projection. A map outage cannot become an Event Capacity outage, but a stale Convoy Center source still correctly marks capacity as unverified.
- Draft unit and dashboard regression tests cover outage/partial/stale/faulty provider and independence from monthly Event Capacity calculations. The standalone optional tracker unit tests have been run locally; repository-wide current-head CI remains to be verified.
- No changes were made to main, running Kings Convoy Checker, public tracker, Discord messages, bot permissions, feature flags, private storage or staff approvals. PR #143 remains unmerged Draft. Provider authentication, real map visualization and complete Event Capacity launch gates remain open.


## Historical signed archive export — offline step (25 November 2026)

An **offline only encrypted archive codec** now segments historical owner-signed transition records by UTC review month, encrypts each segment with AES-256-GCM, checks integrity, owner signatures, revision continuity and a separately supplied manifest checkpoint, and reconstructs the original journal without claiming free slots. Seven focused local Node tests passed (including accepted, rescheduled, cancelled, completed records, corruption, stale checkpoints, 129-record partition boundary). See `docs/KINGS-EVENT-CAPACITY-HISTORICAL-ENCRYPTED-ARCHIVE-2026-11-25.md`.

**This is NOT 24-month durable GitHub storage, a trusted source-archive authenticator, independent owner-pinned checkpoint service, authorized history completion or permission to activate.** Actual private repositories, signed externally retained checkpoint, 90-day backups, retention/erasure, authentic real old Convoy Center evidence and full current-head GitHub CI remain mandatory. No runtime workflow imports this codec.


## Private historical GitHub read proof (25 November 2026, DRAFT only)

The offline historical journal and encrypted segmented archive are now joined to a **GET-only, private-repository historical archive reader** (`event-capacity-historical-github-reader.js`). It requires actual private GitHub repository metadata, exact scope, individually checked ciphertext segments, an offline owner-signed independent archive receipt, and a stable double-read manifest. No automatic or arbitrary caller-supplied `trusted` flag substitutes for an owner signature. Seven focused reader tests passed locally; across the current recent archive/optional map work, 19 local focused tests passed. See `docs/KINGS-EVENT-CAPACITY-HISTORICAL-GITHUB-READER-2026-11-25.md`.

This does **not** create a private GitHub repository, put real event data in storage, provide trusted owner highwater freshness, implement protected multi-file writes, recover lost commits or verify 24-month source coverage. The reader is intentionally **NOT** imported by the production GitHub Actions runner; the Event Capacity system remains disabled and PR #143 stays Draft. Full same-HEAD CI, private write + recovery protocol, real historical evidence, Discord permissions and explicit CEO authorization remain required.


## Owner-approved historical archive GitHub CAS writer (25 November 2026, DRAFT only)

A **one-signed-transition-at-a-time historical private archive write prototype** was added as `event-capacity-historical-github-writer.js`, with synthetic GitHub CAS tests in `tests/event-capacity-historical-github-writer.test.cjs`. It validates the prior and candidate **offline owner-signed archive receipts**, fully decrypts/validates the candidate, reads/verifies the old private archive, checks the entire old journal is an exact immutable prefix, stages content-addressed encrypted segments without overwriting them, and uses the old Git blob SHA as a last-step compare-and-swap on the private `current.json` manifest. The new archive is re-read and checked before a success state is returned. Changes to the read-only adapter provide the verified index Git SHA and SHA-256 for this guard. The draft source is **not imported by any scheduled workflow**.

An ambiguous GitHub write can already be durable despite the API throwing; the writer therefore fails closed without retry/rollback, possibly leaving orphan encrypted segments or a switched index awaiting independent human reconciliation. Its positive response explicitly says `StoredPendingIndependentOwnerHighwater`, not capacity-certified or historical source-complete. **It does not implement the independently retained owner receipt, checkpoint witness, real identity/source verification, 24-month retention, 90-day backups or crash-repair operator flow.** These remain mandatory release blockers.

Eight new synthetic GitHub writer test scenarios and a live-workflow isolation gate were added. **A full GitHub CI success for current PR HEAD has not been observed**, and no live or manual `capacity_preview` run, real private repo operation, Discord command or production activation took place. Detailed contract: `docs/KINGS-EVENT-CAPACITY-HISTORICAL-GITHUB-WRITER-2026-11-25.md`.


**Additional local verification (25 November 2026):** 26 focused Node tests passed under Node.js 22 using the local archive/journal/reader/tracker implementations and the byte-for-byte verified writer source from this PR. This includes 7 direct read/write mock-GitHub writer integration checks. The GitHub-committed 8-case writer fixture and the complete repository suite still need same-HEAD GitHub Actions CI verification (the local writer test file is a separate but equivalent focused harness); no live repository test or release evidence is implied.

## Larger offline recovery / offsite backup / retention batch (25 November 2026)

The draft now includes THREE further isolated modules:

- `event-capacity-historical-github-recovery.js`: verified, **GET-only** post-crash examination of prior versus candidate owner-signed historical archives. A candidate is recognized only when its last signed transition chains to the **exact previous signed tip**; ambiguous/unavailable states require private operator reconciliation. No retries, no slot claims.
- `event-capacity-historical-offsite-backup.js`: an independently encrypted AES-256-GCM offline backup envelope and isolated **inspection-only** recovery against separately retained owner receipt; no actual offsite storage, no production restore or scheduled backup.
- `event-capacity-historical-retention-plan.js`: pure 24-month UTC history review window plus 90-day backup review/hold planning. Recorded monthly restores are NOT proof of an independent restore; no automatic deletion.

New tests: 9 recovery, 9 encrypted backup, 8 retention, plus an existing workflow isolation gate. The latest **local focused** regression suite passed **52/52** using the stand-alone development copy; this is not the full original repository test suite and not a current-head GitHub Actions CI result. Full details: `docs/KINGS-EVENT-CAPACITY-RECOVERY-BACKUP-RETENTION-2026-11-25.md`.

The release **remains blocked** on actual separately permissioned private/offsite storage, confidential key provisioning, owner receipt custody, real source authenticity and historical completeness, live effective Discord-role verification, 24-month durable audit and 90-day backup/isolated restoration operations, privacy review, current-head full CI and **explicit CEO activation approval**. No changes to production Convoy Checker or `main`, no Discord actions, no manual `capacity_preview`.


## Current PR readiness diagnostic (25 November 2026)

GitHub's actual PR #143 API currently reports `mergeable:false` and `mergeable_state:dirty`, indicating that the draft branch does **not** merge cleanly with `main`. This is an explicit independent release blocker. **Do not override the base branch, force-push a blind merge, auto-resolve conflicting policy files or merge the PR while it is dirty.** Resolve each conflict with an individually reviewed diff that preserves existing main production Convoy Checker behavior and the complete draft's privacy gates, then run fresh full CI on the exact resolved HEAD.

No pull-request-triggered workflow run was reported for the latest HEAD when checked. The 52/52 local focused tests are not a substitute for same-HEAD full repository CI, source history verification, a private-token/permitted-repo end-to-end test or CEO launch approval.


## Reviewed branch sync and first full CI baseline (25 November 2026)

The blocking merge divergence was resolved by merging the then-current `main` into Draft PR #143 **without changing `main`**. The two distinct read-only workflow gates were preserved in `.github/workflows/system-tests.yml`: (1) existing manual `capacity_preview`, default `false`, no Discord event writes, and (2) PR #143 GitHub metadata-only preflight. Current main monitoring and HR state blobs and the already-merged read-only preview code/tests were brought into the draft instead of using stale data. GitHub subsequently reported PR #143 clean/mergeable.

GitHub Actions `Kings Offline System Verification` run `45528366798` completed **SUCCESS** at development commit `5181dc5c1d97fde3ed431bd9f103a23d233ebda6`, **1,111 / 1,111 tests passed**, after correcting two test-file mistakes discovered by actual Node 24 CI. The successful run also passed JS/shell syntax, Driver/Integrity authority and the safe GitHub metadata preflight. This proves only software tests, not historic source completeness or live permissions.

## Later opt-in private daily backup adapter — draft still incomplete

A standalone `event-capacity-historical-github-backup-vault.js` and nine synthetic HTTP tests extend offline preparation for a **third, distinct private GitHub repository**. It offers write-once per UTC day and reverified read of a separate owner-pinned encrypted backup. It is NOT connected to production Actions, cannot delete/overwrite existing backups, and does not implement retention enforcement or independent token/key custody. The GitHub Contents 850-KiB per-file safety cap is **not sufficient for a complete 24-month archive**; eventual partitioning and real long-term storage remain required. Details: `docs/KINGS-EVENT-CAPACITY-PRIVATE-DAILY-BACKUP-VAULT-2026-11-25.md`.

Because this adapter was committed *after* the successful 1,111-test run, **a new same-HEAD complete CI pass is required** before treating the latest draft as regression-green. No user manual `capacity_preview`, Discord write, private repo creation, merge or feature activation has occurred.

