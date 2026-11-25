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

