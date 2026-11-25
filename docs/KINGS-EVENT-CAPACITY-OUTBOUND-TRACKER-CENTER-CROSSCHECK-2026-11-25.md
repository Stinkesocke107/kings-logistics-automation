# Kings Event Capacity — Outbound Tracker × Convoy Center Crosscheck

**25 November 2026. DRAFT PR #143. Private offline inspection only. No live Discord, no secrets, no actual Event decisions.**

## Why we need this connection

Kings has two operationally different systems:

- **Convoy Center & Checker**: incoming Event requests, human approvals, reschedules, cancellations and the authoritative acceptance lifecycle once its original records are independently authenticated.
- **Event Invitation Tracker**: *outgoing* invitations to other VTCs and their replies. An `Accepted` reply from a VTC **does not** mean the Kings Event Coordination team approved the event for an incoming Kings Convoy Center capacity slot.

Older monthly/archived Convoy channels and the existing frozen `data/legacy-convoys.json` provide **historical evidence**, not new independent event bookings. The original Discord messages have not been fetched in this ChatGPT session; all current crosschecks consume **synthetic or caller-supplied claim data**.

## New technical components

### Outbound ↔ Center lifecycle consistency audit

`event-capacity-outbound-center-link-audit.js` calls the existing strict `reconcileKingsMultiSourceConvoys` validator, then compares a claimed outbound Tracker inventory with the current and historical records of an explicit **canonical Event ID**.

The human review queue flags:

1. An outbound invitation with no Event ID, or an Event ID not found in Convoy Center/legacy sources. **Never guess by date, title or route.**
2. A departure time that disagrees with **all** known center/legacy dates.
3. An outbound date matching a **legacy date only**, when the current Center already shows a different date. A previous confirmed date still requires a human release review.
4. Outbound `Accepted` when the current Center is `Cancelled`, `Unknown`, `Submitted`, `Needs Information` or `Ready for Approval`.
5. An outbound `Declined`/`Withdrawn` while the current Center claims an event is scheduled: this is a **review hint**, not automatic cancellation, since a declined outgoing invitation may simply belong to one invited organization.
6. Multiple outgoing invitations linked to one Event. This is **not necessarily a duplicate**; Kings may invite many organizations to one convoy. Recipient identities and consent must be verified in a private authorized system. No recipient data is returned by this audit.
7. An invitation linked **only to an old legacy record**, without a current Convoy Center counterpart.

All issue references are HMAC-keyed; no Event IDs, outbound invitation IDs, Discord message/channel identifiers, names or raw evidence digests appear in the output. A provided `tracker.connected=true` or `claimsComplete=true` is *not* independent provider attestation.

### Unified private Event-Team review

`event-capacity-unified-team-review.js` composes the already tested **private year/month/day calendar bridge** with the separate outbound/center crosscheck. It independently verifies that the number of claimed outbound invitations and canonical links agrees between both audits. If they disagree, it **fails closed**.

The unified result contains only aggregate source counts and separate counters for:

- Current Convoy Center and older-channel claims
- Existing frozen legacy records when supplied
- Outbound invitations and explicit canonical links
- Missing/outdated Event links, date mismatches and suspicious lifecycle combinations
- Multiple outbound invitations potentially going to distinct recipients
- Archive/deletion claim-count discrepancies
- Original source-review issues **and separately** outbound-link review issues

**Do not add issue counts across the two reports as if they were distinct issues.** Multiple source checks may refer to the same Event. More importantly, never sum Convoy Center, older channels and Tracker records into accepted bookings. The private ephemeral renderer is a *preview only*: no live Discord command is registered.

## Tested vs. not tested

**Offline tests:** matching links, missing IDs, mismatched dates, legacy-only stale dates, cancelled or unapproved Center events, distinct multiple invite recipients, duplicated invitation ID rejection, secret-field rejection, HMAC redaction, isolated renderer and source bridge integration.

**Not tested externally:** live Convoy Center availability, deleted/edited history recovery, real outbound Tracker connectivity, Staff effective permissions, complete 24-month source history, independently retained owner highwater, genuine off-host encrypted recovery, real Discord end-to-end message writes or CEO production approval.

**Update — 25 November 2026:** The archive/deletion subcount gap is now also checked directly in `event-capacity-convoy-multi-source-intake.js` (Draft PR #143 only). Per-channel `claimedArchivedCount` and `claimedDeletedCount` are compared against the observed row subsets independently of the total thread count. A discrepancy yields a private HMAC-keyed **Urgent** review issue, not an event booking or slot release. Two regression tests cover mismatched and matching subtotals. The independent bridge/source assurance remains in place. This change does **not** authenticate Discord history or certify free capacity; live verification and CI on the updated commit remain separate checks.

**Additional draft Event Invitation Tracker review:** the outbound audit now records bounded aggregate counts for `Draft`, `Sent`, `Accepted`, `Declined`, `Withdrawn` and `Unknown` replies. An `Unknown` reply becomes an explicit private human-review item. The unified private staff review validates that the status totals match the number of supplied outgoing invitation claims and renders a redacted subset of statuses; a forged inconsistent summary is refused. These are untrusted metadata claims, not real outbound provider connectivity, actual reply authentication, automatic Event approval or available capacity. Synthetic regression tests cover ambiguous status, privacy and tampered totals.

**Release status:** `freeSlotsCertified:false`, `safeToActivate:false`, zero Events imported, zero Staff decisions, zero Discord messages. PR #143 remains DRAFT and unmerged, public `main` and the live Convoy Checker remain untouched.
