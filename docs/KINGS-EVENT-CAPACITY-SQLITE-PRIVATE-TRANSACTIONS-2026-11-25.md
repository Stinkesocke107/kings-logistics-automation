# Kings Event Capacity — Encrypted SQLite Snapshot Transactions

**Development status:** DRAFT / ISOLATED TEST PROTOTYPE, not a deployed Kings private database. The public GitHub repository contains **code and synthetic test data only**, not a production database, snapshot, credential, role list, or human decision record.

## Why this exists

The protected import contract requires **one durable transaction** for both the authenticated Convoy Center snapshot and the import cursor. A cursor stored by itself could cause a permanent missed report if a process failed before storing the snapshot.

The new \`event-capacity-private-sqlite.js\` implements this atomic boundary for **one protected local instance** using Node's built-in \`node:sqlite\` \`DatabaseSync\` and a private SQLite database. It does not connect to an actual Discord bot, workflow, event-management system, or real Kings data.

## Security properties tested

- Requires absolute, already-created private storage directory *outside* the Git checkout, with restrictive Unix permissions; refuses symlinks and unsafe existing database mode.
- Keeps the complete snapshot, decision ledger, source cursor and import metadata inside a single AES-256-GCM encrypted envelope. Scope identity is bound to authenticated encryption (AAD), and lookup uses a hashed scope key.
- Keeps encryption and source signing as **separate secrets**. No secret is hardcoded in runtime modules.
- Checks the cryptographically attested source, matching guild/forum, current source freshness, matching run/attempt, ledger revision and source metadata before beginning a transaction.
- In one \`BEGIN IMMEDIATE\` / \`COMMIT\` transaction compares the expected cursor, checks monotonic run/attempt/ledger progression, and stores both encrypted source+cursor atomically. On failure, issues \`ROLLBACK\`; stale revision returns false without replacement.
- Uses SQLite's synchronous FULL and DELETE journal; restricts local file permissions. This does **not** by itself ensure independent availability, tested recovery or crash protection on every disk/filesystem.
- On private reads, decrypts and checks the stored record, independently anchored minimum revision if provided, and separately verifies that the source attestation is still fresh before labeling it usable for a dashboard.
- A private \`checkpoint()\` exposes a minimal revision+digest, **not the private event data**, for a future independently protected anti-rollback service.

## Contract integration — still needed

The importer already expects \`commitSnapshot({scope,expected,next,snapshot,metadata})\` and awaits a true/false result. The SQLite store exposes this method, plus \`readCursor()\`, \`readLatest()\`, \`checkpoint()\`, \`close()\`. A trusted authenticated issuer could inject these methods *after* all real service identity and permissions have been proven.

**Do not** wire the draft module directly to a public GitHub Action, store secrets in the public repo or assume a synthetic \`authenticatedService:true\` flag authenticates a live request.

## Unresolved critical release gates

1. **Independent anti-rollback authority**: a trusted protected monotonic checkpoint outside the database must be checked before accepting data. The optional \`externalMinimumRevision\` callback verifies a floor *when provided*, but this code does not implement or manage that independent anchor. A local SQLite transaction cannot atomically commit to an unrelated external anchor without a designed reconciliation/recovery protocol. Do not label standalone SQLite production-ready.
2. **Private host and durable identity**: authenticated caller, genuine GitHub API access, protected secret distribution and rotation, per-operation authorization, safe logs/metrics.
3. **Backups and lifecycle**: 90-day encrypted backups with monthly isolated restore tests, version migration, 24-month personal retention, erasure and backup deletion propagation.
4. **Availability**: single-host SQLite has no high availability/multi-region failover. Do not use it on ephemeral public Actions runners.
5. **True live intake**: source proofs from successful main-branch Convoy Checker runs, correct historical approvals/legacy states, current real Discord channel/roles, real end-to-end assertions.
6. **Protected storage beyond source snapshots**: task workboard, publication reviews, saved filters, milestone confirmations, notification receipts, reports and human audit trails need their own versioned, authorized transactions and retention rules.

## Release gate

Require green current-head CI, separate live-source/privacy/permission review, protected persistence+restore proof, end-to-end Discord proof, then **explicit CEO approval**. Do not merge this draft or alter main-branch convoy admission rules based on this isolated prototype alone.
