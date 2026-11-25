# Kings Event Capacity — Discord GET-Only History Adapter Contract

**25 November 2026 · Feature branch + DRAFT PR #143 only · Private, injected SYNTHETIC replay · NOT deployed**

## Why this is the next step

Kings Event Capacity needs to work with the existing **Convoy Center & Checker**, older month/archived channels and the planned outbound **Event Invitation Tracker**, without losing past Events or counting the same convoy multiple times. The existing software verifies 24-month *claimed* histories and private Staff calendar summaries. This development adds a lower-level, **strictly bounded GET-only Discord REST contract** with a sandbox-only callback so those verifiers can be exercised against realistic response shapes.

**The contract contains no bot token and never itself opens a connection.** The current callback is only used by synthetic tests. Existing production Convoy Checker workflows, Discord permissions, actual bookings, Staff decisions and public main remain untouched.

## REST v10 routes by source type

| Source | Endpoint shape | Pagination | Security/limitations |
| --- | --- | --- | --- |
| Current or legacy forum — active | `GET /guilds/{guild.id}/threads/active` | No before cursor in this endpoint | Scope returned guild thread list to the configured parent channel; list only currently visible active threads |
| Forum — archived public | `GET /channels/{channel.id}/threads/archived/public?limit=100&before=<ISO UTC>` | `has_more` plus the last thread's archive timestamp | Requires appropriate history visibility; missing/denied archives block completeness |
| Ordinary thread parent — archived private | `GET /channels/{channel.id}/threads/archived/private?limit=100&before=<ISO UTC>` | Same archived timestamp pagination | Requires `READ_MESSAGE_HISTORY` **and** `MANAGE_THREADS`; it is not a routine private stream for a forum post channel |
| Old text channel | `GET /channels/{channel.id}/messages?limit=100&before=<message id>` | Oldest message snowflake in descending message ID order | Requires effective channel access and readable message history; a short/empty page is **not proof that deleted messages were recovered** |

Route semantics were checked against current official Discord developer documentation: [Discord Channel API](https://github.com/discord/discord-api-docs/blob/main/developers/resources/channel.mdx), [Discord Guild API](https://github.com/discord/discord-api-docs/blob/main/developers/resources/guild.mdx), and [Discord Message API](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx).

**Important existing compatibility follow-up:** The earlier generic `event-capacity-discord-history-pagination-audit.js` still models `archived-private` as required on forum-type sources. A genuine forum source adapter cannot safely invent private forum posts to make that checkbox pass. Before a real source pilot, the generic report's *required streams* must be reconciled against the actual channel type and permission model, while keeping inaccessible material explicitly unknown. The new planner correctly refuses private archived routes for `current-forum` / `legacy-forum`.

## Source files and runtime boundaries

- `event-capacity-discord-rest-readonly-contract.js`:
  - Builds explicit GET-only canonical paths with strict guild/channel IDs and bounded page size.
  - Validates injected response shapes without storing message `content`, names, authors, attachments, roles, or raw message bodies.
  - Handles 403, 404, 429, 5xx as **failure receipts**, not as zero known events.
  - Rejects invalid cursor types, non-progressive timestamps, duplicate/out-of-order messages, unsupported stream types and forged routes.
  - Only returns a count, hash of minimal metadata, timestamp and in-memory continuation cursor. Every result remains `freeSlotsCertified:false` and `safeToActivate:false`.
- `event-capacity-discord-injected-source-replay.js`:
  - Requires `mode:'INJECTED_SYNTHETIC_ONLY'`, explicit injected callback, and bounded 1–50 pages, so the default cannot run a live scan.
  - Stops on unhandled provider error, forbidden scope, rate limit, exhausted page budget or no remaining pages.
  - Its **`privateReceiptDoNotLog`** is an **internal private ephemeral receipt** containing raw channel IDs and internal continuation cursors necessary to connect the existing pagination audit. **Never print, copy, persist to public GitHub/Discord, or expose in any public card or endpoint.**
  - A rate-limited reply is recorded as a gap; no unapproved retry loop and no accidental aggressive API traffic.
  - No actual Discord HTTP client/credentials are imported, even indirectly.

These functions do **not** attest that the caller owns a real bot token or sees all old channels. `providerResponseAuthenticated:false` always holds. No real Event Capacity booking, cancellation, attendance or previous reservation is certified by these receipts.

## Tests and known external boundaries

Focused integration tests cover GET-only paths, active guild thread filtering, public/private archived route permissions, old text before-cursor paging, invalid IDs and limits, duplicate/cross-channel responses, malformed response shape, page-budget exhaustion, 403/404/429/5xx, metadata redaction, replay determinism and a passing synthetic receipt into the **existing 24-month source audit**.

These are **not** real-world end-to-end Discord tests. Further actual acceptance gates require:

1. Explicitly authorized **read-only** pilot and a securely hosted, least-privileged authenticated source collector (not a token pasted into chat).
2. The *actual* old-channel inventory, which is not available from the current GitHub-only connection; separate authentic edit/deletion evidence where feasible, and a documented record of unretained messages.
3. A verified full 24-month historical lifecycle reconciliation, independent signed owner highwater and real off-host encrypted backup/isolated restore.
4. Staff and Management role/visibility verification, privacy review, separate human review of consequential event capacity decisions and explicit CEO production approval.

**CEO action now:** none for these offline tests. If and when the separately approved private real Discord-source pilot becomes the next blocker, the maintainer must provide a concrete setting/permission instruction. Do **not** request raw Discord bot tokens or signing keys in this conversation.

**Note:** User-reported reduced Kings system availability through **30 November 2026** is not independently verified here; no automatic live mode begins on 1 December.
