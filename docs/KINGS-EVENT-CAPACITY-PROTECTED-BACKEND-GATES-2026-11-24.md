# Kings Event Capacity — Private Store & Discord Access Gate (2026-11-24)

**Release status: development-only / not connected to production.** This document describes new safeguards in draft PR #143, not a live Kings service.

## Added modules (not production-wired)

- event-capacity-private-store.js: local **development** adapter for the AES-256-GCM decision ledger. Requires a pre-existing private directory outside the public repository with restrictive POSIX permissions; performs single-writer O_EXCL locking, fsync/atomic rename, encrypted-only reads, scope validation and optimistic expectedRevision checks. Does not create directories, Discord messages, roles or public Git state. It does **not** perform key distribution, backup, retention, cross-host failover or protection from replacing the entire directory with a previously valid encrypted snapshot.
- event-capacity-discord-auth.js: verifies HTTP interactions using the Discord Ed25519 application public key + signed raw body + bounded timestamp; extracts the actor only from verified content and then independently fetches current member role IDs, role metadata and the specific target channel via Discord REST with the Bot token. It refuses unknown roles, wrong guild/channel, missing private visibility gates and unsafe extra explicit view permissions. It does **not** mutate Discord or store events.
- Tests exercise encryption, wrong secret/scope, filesystem symlinks/permissions, writer lock, stale revision, Discord signatures and forged interactions, actual role membership, unauthorized channel grants, and replay rejection.

## Exact authorization boundaries

The future Kings backend must configure **verified Discord snowflake IDs** for:
- DISCORD_GUILD_ID and the intended private 📊│event-capacity channel;
- Event Coordination, Event Leadership, and CEO roles (required);
- Event Management role (optional only when genuinely available and separately confirmed).

**Do not use names or old management hierarchy IDs as inferred permissions.** Role IDs are currently unconfigured. Channel membership verification is required at **every interaction**, not only initial registration. The Event Management exception role alone is intentionally **not** a permitted dashboard viewer, in accordance with the accepted channel access policy; additional exception approval workflows must have their own authenticated approved route.

The gateway requires a **durable, atomic, per-interaction replay claim service** passed as consumeInteractionId. A local in-memory Set is sufficient only for tests and must not be used for a deployed multi-instance service. Discord retry processing, command response/ACK deadlines, user revocation and privacy-safe audit must be designed in the real host.

The gateway cannot prove all administrator role assignments from one individual channel lookup. **Independent private Discord permission audit is a launch blocker**, including any administrator bypass, channel overwrite and bot-access exceptions.

## File-storage boundary

The file store accepts only a directory that already exists as a private mount **outside the Git checkout**. On Unix it refuses group/world-accessible directories or state files. It fails closed on damaged or invalid encrypted content, writes a randomly named temporary file, calls fsync and atomically renames under a filesystem-exclusive lock. A stale lock is **never stolen automatically**. This is deliberately simpler than a production database.

**Do not store real Kings decision records in GitHub Actions workspace, artifacts, or public repository files.** Do not run the file store on a public CI runner with real member identities or secrets; test cases use only synthetic fixtures.

For real production, select a private transactional database/service with:
- independently authenticated service identity, secret management, encrypted storage and transport;
- atomic compare-and-swap and **externally protected monotonic revision** or equivalent anti-rollback;
- 24-month personal activity retention with deletion, historical anonymization, 90-day encrypted backups, tested isolated restore and erasure propagation;
- bounded audit query scope, centralized privacy-safe monitoring and recovery procedures.

## Trust chain for a future real command

1. Verify the Discord application signature over the exact raw payload, timestamp, command identity and requested guild/channel.
2. Verify current member identity and effective permissions using the REST API and the private channel.
3. Atomically claim interaction ID in protected persistent state to block replays.
4. Validate event belongs to the authoritative Kings Convoy Center; verify event/approval evidence references and actual decision authority.
5. Load authenticated encrypted private ledger from protected state, check expectedRevision and make the staff action within a transactional boundary.
6. Publish *only* the existing permitted private activity status if individually authorized, and never auto-accept, cancel, modify or repost an event.
7. Capture privacy-minimal audit and reconciliation evidence; deduplicate retries without losing genuine actions.

A source string trusted-server-gateway inside a passed actor object is **not authentication**. Do not call event-capacity-decision-ledger.applyDecision() directly with user-supplied actor fields; the future backend must ensure the actor came from verified authorization and event scope.

## Known limitations before deployment

- No real host for Discord interactions, real event approval buttons or private channel has been provisioned.
- Current role IDs and full protected-channel permissions have not been safely validated.
- No durable encrypted DB, independent revision anchor, backup-retention/erasure and restore workflow.
- No live adapter run against real historical or archived Convoy Center entries.
- Current capacity core is *not* imported by production convoy-planning-limits.js; the old advisory limits remain live.

**The explicit release gate remains: Draft PR → green CI → private real-world source+permission review → real end-to-end evidence → owner approval.**
