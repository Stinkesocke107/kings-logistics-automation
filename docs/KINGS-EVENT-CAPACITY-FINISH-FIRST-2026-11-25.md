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


## Larger protected historical-read integration development (25 November 2026, DRAFT only)

Three further draft-side components have been added, with a signed-completion evidence gap closed:

1. `event-capacity-historical-authenticated-crosscheck.js` composes fixed-source GitHub scheduled Convoy Checker verification, the caller-provided owner-pinned private decision-ledger reader, and the independently owner-signed private historical encrypted archive reader. It double-reads all three and aborts on source/report drift, ledger checkpoint changes, or changed historical archive index and signed records. Test-injectable pure composition **does not claim source origin authentication**. The concrete gateway only labels its fixed trusted source and private archive paths after successful verification; it still cannot attest complete history or independent **latest** owner highwater.
2. `event-capacity-historical-owner-receipt-audit.js` detects missing, out-of-order, forged and stale Ed25519 offline owner-signed historical archive receipts; an externally **supplied** checkpoint is only a structural match, NOT proof of separate real custody or latest freshness.
3. `event-capacity-historical-review-workboard-bundle.js` produces already-deduplicated read-only human-review task previews and discards the result if the private Workboard changes between reads, but no actor/permission is authenticated and no task is created.
4. A current Convoy Center `Completed` status **without a historical signed `complete` transition** is now explicitly flagged for review; this neither proves actual attendance nor releases an event slot.

New tests check double-read race rejection, poisoned source/archive/ledger, receipt gaps and forged signatures, Workboard changed revisions or changed same-revision content, and no automatic production imports. Detailed documentation: `docs/KINGS-EVENT-CAPACITY-TRIPLE-READ-HISTORY-WORKBOARD-2026-11-25.md`.

**No merge, production workflow/Discord/real private repo change, real key provisioning or manual `capacity_preview` was performed.** The latest CI must finish green on the *exact* latest PR head before this integration can be considered regression-tested. Real authentic complete historical evidence, independent monotonic external owner highwater, private data and backup governance, 24m/90d operations, actual effective Discord permissions, and CEO launch authorization remain unsatisfied.


## Private three-repository setup, scalable encrypted backup and owner handoff (25 November 2026)

A new **GET-only, never-activating private setup preflight** (`event-capacity-private-storage-preflight.js`) checks three distinct PRIVATE GitHub repositories with distinct credential strings, their real `main` branch metadata and stable double-read SHA. Observed branch protection booleans are only reported; the code **does not** verify token privileges, actual branch protection policies, independent ownership, owner offline signing key custody or readiness to deploy.

An **offline encrypted segmented backup** codec (`event-capacity-historical-segmented-backup.js`) now prepares bounded SHA-256-labelled chunks (default 256 KiB, maximum 512 KiB) and re-verifies full original archive ciphertext, owner receipt and AES-GCM authentication on reconstruction. A separately isolated **private segmented GitHub backup vault** (`event-capacity-historical-segmented-github-vault.js`) stages content-addressed ciphertext files once, publishes the daily manifest *last* without overwrite rights, re-reads and verifies the entire backup; it never deletes, repairs or retries on an ambiguous write. This addresses the previous 850-KiB **single-file** codec limitation at the protocol level, **not** production-scale storage/retention or separate disaster-recovery custody. The earlier small-file backup remains unchanged.

A concrete CEO handoff checklist in `docs/KINGS-EVENT-CAPACITY-PRIVATE-STORAGE-OWNER-HANDOFF-2026-11-25.md` now records what is done, what an administrator must approve (three private repositories, separate token rights, independently held signing and encryption keys, authentic archived source evidence), and which deployment checks still block release. **No private repos, tokens, secrets, real history or production changes were made.** These are draft modules with synthetic GitHub API regression tests and live workflow gating. Current-head full CI must pass before claiming code regression validation.


## Final owner-approved storage decision — GitHub Free and THREE dedicated PRIVATE repos (25 November 2026)

**This current decision overrides the temporary one-public-repository idea and any older claims that three private repos are unnecessary.** The code and public-safe metadata remain in the PUBLIC `Stinkesocke107/kings-logistics-automation`; private Event histories, witness receipts, and encrypted backups belong respectively in `Stinkesocke107/kings-event-capacity-history`, `Stinkesocke107/kings-event-capacity-witness`, and `Stinkesocke107/kings-event-capacity-backups`. The owner reports having created the three private repos; this has NOT yet been independently verified because GitHub App installation `162599792` is still configured with a selected-repository list containing only the previous three existing Kings repositories.

**Owner's ONE immediate action:** Visit https://github.com/settings/installations/162599792, choose `Configure`, keep `Only select repositories`, add the three `kings-event-capacity-*` repos, and Save. **No secrets, tokens, private signing key or public archive upload should be performed yet.** The assistant can then check actual private repo metadata/access, decide minimum repository-scoped keys and proceed through a controlled read-only security pilot. The existing connector cannot extend its installation privileges by itself.

**GitHub Free constraints:** Unlimited private repositories and repository-level Actions Secrets are available; do NOT assume paid private branch protection/rulesets or paid private Environment Secrets/reviewer gates. External signed highwater, separate key custody, limited-scope credentials, non-secret public code and manual approvals remain mandatory. The offline public ciphertext packing prototype was deleted; the strict anonymous public metadata guard was retained and tested. Three GitHub repos belonging to one account are **not** independently administered disaster-recovery storage.

See `docs/KINGS-EVENT-CAPACITY-GITHUB-FREE-SECRETS-AND-ACCESS-2026-11-25.md` for the exact up-to-date key/access boundary. PR #143 remains DRAFT; real data movement, paid feature activation, live Discord writes, merge and `capacity_preview` are NOT authorized.


## Three GitHub Free PRIVATE repositories — Access verified and safely initialized (25 November 2026)

The owner completed the GitHub App authorization. The live connected GitHub repository metadata and selected-installation listing **independently confirmed all three** exact private repositories, their existing `main` branches and unarchived state:

- `Stinkesocke107/kings-event-capacity-history` — PRIVATE, `main`, purpose README and accidental-secret `.gitignore` verified.
- `Stinkesocke107/kings-event-capacity-witness` — PRIVATE, `main`, purpose README and accidental-secret `.gitignore` verified.
- `Stinkesocke107/kings-event-capacity-backups` — PRIVATE, `main`, purpose README and accidental-secret `.gitignore` verified.

Installation `162599792` remains **selected-repositories**, not unrestricted all-repo access. No archived/disabled repo was encountered. The private repos' `main` branches were changed **only to install non-secret purpose/readme/ignore guardrails**, no real Event data. The PUBLIC `main` and running Convoy Checker are unchanged.

The connected actor currently reports **admin/maintain/push rights** over all three, which are NOT a safe minimum-permission future worker identity. No private Ed25519 owner signing keys, archive/backup decryption secrets, cross-repo PATs or Actions secrets were provisioned. GitHub Free private repo paid branch protection is NOT assumed.

A fixed-role **offline verification module**, `event-capacity-github-free-topology-audit.js`, rejects missing/reordered/non-private/archived/wrong-default-branch repositories and missing selected installation access; reports observed broad actor write privileges but NEVER claims safe release, least-privilege runtime credentials or certified free slots. Added synthetic tests and live-workflow isolation gating.

**Canonical owner register is now updated:** `docs/KINGS-EVENT-CAPACITY-PRIVATE-STORAGE-OWNER-HANDOFF-2026-11-25.md`. **No additional CEO setup action is required immediately.** Next engineering phase is minimum-permission runtime identity design and independent owner-highwater handling, then an explicitly approved *synthetic-only* private test; authenticated historical completeness, independent backup, retention/restore, privacy, effective Discord roles and CEO launch signoff remain release blockers.

