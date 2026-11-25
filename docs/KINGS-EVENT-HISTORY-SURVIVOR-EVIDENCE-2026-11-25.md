# Kings Event History — Archived & Deleted Convoy Survivor Evidence (System #14)

**Date:** 25 November 2026  
**Status:** DRAFT / PRIVATE / OFFLINE ONLY / NOT DEPLOYED  
**Infrastructure:** GitHub Free only; no paid hosting, VPS, persistent worker or external database.

## What we can and cannot prove

The existing multi-source Convoy Center intake records can contain \`sourceKind: "archived"\` or \`"deleted"\`. For an actual deleted Discord thread or edited/archived Event, these caller-supplied source claims are **not** a trustworthy recreation of the original event, its staff authorization, or its effect on quota.

\`event-capacity-historical-survivor-evidence-audit.js\` combines the existing historical channel/24-month pagination audit and the multi-source Convoy Center intake, adding a **strictly offline survivor receipt audit**. It counts:

- Claimed archived and deleted Convoy source records.
- Missing surviving evidence receipts by category.
- Linked receipts with matching channel/thread/kind/source digest.
- Unmatched orphan receipt claims and contradictory digests/kinds.
- Receipts allegedly captured before the corresponding record was modified.
- Disagreements in per-channel archived/deleted row counts, source inventory IDs, month ranges and pagination claims.

The optional input \`survivingReceiptClaims\` consists of *private claims only* with exactly \`channelId\`, \`threadId\`, \`sourceKind\`, \`sourceDigest\`, \`receiptDigest\`, \`capturedAtUtc\`; the receipt does **not** include message contents or tokens. Inputs must remain inside a protected review environment. **Matching receipts do not authenticate Discord, recover deleted messages, verify a deleted-thread tombstone, prove all historical channels were discovered or certify that any actual Event slot is free.**

Only HMAC-derived opaque issue keys and numeric aggregates enter the internal output. A private ephemeral Discord message *shape* shows aggregate counts only, with no raw Event/Staff/channel/thread/request IDs or sensitive content. No actual Discord message is sent.

## Important failure cases

1. The archive inventory claims two deleted Convoys but only one surviving record receipt: one remains **missing**, never silently released.
2. An older legacy channel has no matching 24-month page inventory: the discrepancy is **reported**, not interpreted as zero Event bookings.
3. A supplied receipt references an unknown thread: **orphan evidence** for human source reconciliation, not a new Event.
4. A receipt matches a channel and thread but has a wrong digest or wrong source kind: conflicting source claim remains unresolved.
5. Even if all claimed receipts match, independent original Discord/provider source authentication and complete historical inventory discovery are **still false**.
6. Historical invitation acceptance and external participation records cannot replace an internal Kings Event acceptance or a signed original lifecycle event.

## Further work before production

- Obtain an owner-approved, read-only and permission-limited original Discord REST scan for all relevant current, archived and known historical channels.
- Inventory known deleted/edited Event evidence from independent owner-held sources; understand that Discord may not expose deleted original content.
- Verify actual dates, effective Event Coordination permissions and unambiguous canonical event identities.
- Store protected snapshots and owner-signed lifecycle evidence in appropriately private, encrypted GitHub Free repositories with checked revisions and separately retained current high-water marks.
- Reconcile orphaned/unknown historical Event data manually; never infer free capacity from missing evidence.
- Test isolated restore and synthetic-to-live controlled handoff, then obtain explicit CEO approval before changing any active workflow.

**Do not merge or activate Draft PR #143 based on offline synthetic tests.** Production \`main\` and Convoy Checker remain untouched.
