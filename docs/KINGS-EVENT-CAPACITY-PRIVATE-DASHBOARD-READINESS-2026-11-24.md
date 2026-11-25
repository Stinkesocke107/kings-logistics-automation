# Kings Event Capacity — Private Dashboard Read Service (2026-11-24)

**Status: development branch only. No command registration, real dashboard message, Discord channel creation, deployment, or production state mutations.**

## Source files

- event-capacity-dashboard.js: pure UTC 3-month preview projection, daily policy statuses, month totals, independent quota/exception flag, private Discord embed rendering with MessageFlags.Ephemeral (64).
- event-capacity-read-service.js: read-only integration prototype: validate signed /event-capacity command, re-verify real Discord member/role/channel through the existing capacity auth module, obtain privately sourced Convoy Center report/overview and decrypted ledger, enforce guild/forum binding, evaluate through current adapter and policy engine, and return an ephemeral response object.
- tests/event-capacity-dashboard.test.cjs and tests/event-capacity-read-service.test.cjs: calendar/period boundaries, quotas and Kings-owned unlimited events, stale status and unverified end, exception indicators, no private content in embeds, command signature/auth and wrong-scope errors.
- event-capacity-discord-auth.js: now also blocks unrelated Administrator roles in the inspected guild-role snapshot, since Administrator bypasses channel overwrites. **A separate private audit of actual administrator membership and guild-owner bypass is still required.**

## Read-only service contract

The prototype handler is:

    handlePrivateCapacityRead({
      signed: { rawBody, signature, signatureTimestamp, publicKey },
      authorization: {
        guildId, forumId, channelId,
        roleIds, botToken, transport, consumeInteractionId
      },
      loadTrustedSnapshot,
      nowMs
    })

No real values are included in this repository. A production backend must supply these from trusted configuration and server secrets, **not from Discord slash-command options**. The signed command name is precisely event-capacity. Unsupported commands fail closed before private data is requested.

The privileged in-process loadTrustedSnapshot function must return:

    {
      integrityVerified: true,
      report: trustedFinalizedConvoyCenterReport,
      overview: trustedConvoyOverview,
      ledger: decryptedAuthenticatedScopedLedger
    }

**A JavaScript boolean integrityVerified is only a contract claim, not a signature.** Before setting true, the external trusted service must authenticate source identity and integrity, match the right guild/forum, verify full source inventory and freshness, prevent tampering/replay/rollback, and load the scoped ledger from secured storage. Current read service checks scope and ledger shape but is **not yet connected to a trusted production provider**.

The output is an ephemeral private Discord response object only; this module does **not** send it over the network. The future Discord gateway must acknowledge/defer within required interaction deadlines, verify response visibility, and fail safely on network problems without printing secrets or event details.

## Calendar status safety

- UTC departure calendar and rolling current month plus two months.
- Available only with verified fresh records and provably remaining daily and category monthly quota.
- Limited where one combined daily slot remains or one monthly category is exhausted.
- Full when combined daily capacity or both monthly category quotas are exhausted.
- Unverified whenever a source is stale, a relevant accepted event is unresolved, or the intended UTC date/month has uncertain data.
- Accepted Kings-owned events are displayed separately and do not occupy a Partner/External slot.
- Approved exception counters never expand the base limit of two.
- Completed is planning status, never actual attendance evidence.
- No per-event names, links, staff identifiers, proof references, classification logs, private task descriptions, or original source records appear in the aggregate month embeds.
- The preview does not yet implement interactive day views, event details, warning deduplication, milestones, a permanent pinned message, or the 15-minute live refresh. It should not be misrepresented as the complete requested dashboard.

## Deployment blockers before any production use

1. Configure and privately audit the actual new capacity channel and exact role IDs (Event Coordination, Event Leadership, CEO) against guild roles and administrator bypass.
2. Deploy a trusted Discord application host, valid public-key verification, private bot token, durable atomic replay claim service, and an ACK/defer strategy.
3. Deploy a private transactional encrypted store and anti-rollback trusted revision; prove deletion propagation and encrypted 90-day backup/restore with 24-month activity data retention.
4. Implement attested/private snapshot ingestion, historic event reconciliation, reliable departure/end evidence and platform-neutral sources without inventing unsupported events.
5. Verify a read-only E2E prototype with the actual Discord server in a controlled environment, then deliberate owner-approved release gates. No automatic public event posts, acceptance, cancellations, or overwrites.
6. Preserve the old live advisory Convoy Checker until migration is intentionally approved; the new calendar engine must not be wired to production by merging a preview module alone.

**Release: DRAFT ONLY / READ-ONLY PREVIEW / SOURCE AND LIVE AUTH NOT DEPLOYED.**
