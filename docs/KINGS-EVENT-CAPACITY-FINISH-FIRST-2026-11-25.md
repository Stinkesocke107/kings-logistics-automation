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

