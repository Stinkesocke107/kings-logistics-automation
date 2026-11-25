# Kings Event Invitation Tracker #15 — private read-only source bridge

**25 November 2026 — GitHub Free; initial source audit and Leadership integration**

## Existing Kings decisions (not changed)

- Existing private Discord Event Invitation Tracker channel (owner-corrected 26 November 2026): `1457797580703531143` (previously assumed `1567471010436087949`; that earlier identifier must no longer be used by the integration). Existing official invitation template channel: `1567583339752333492`.
- **One forum thread per convoy. One invited VTC per reply**, including invitations later accepted or declined.
- Document `[VTC Name] — TMP VTC page: [TruckersMP VTC URL] — Invited by: @Name`; an optional, explicitly labelled `Response: Accepted / Declined / Pending / No Response` is interpreted only as a *recorded claim*.
- Required forum tags (one per thread): `Invites Ongoing`, `Invites Done`, `Convoy Completed`.
- Search existing replies before sending another invitation; do not document duplicate VTCs twice in the same convoy. No unrelated discussion in the tracker.
- External event users may send **previously approved** invitations and document them; no internal Staff access, forum thread/tag management, event approvals or other authority are introduced by this code.

## New implementation

`event-invitation-tracker-source.js` is a GET-only Discord source reader. It verifies the expected Kings Guild and existing private Forum, fetches visible active and archived forum threads, reads reply messages within strict pagination caps and rejects inaccessible/incomplete source scans.

`readEntry()` parses the agreed one-VTC-per-reply format. The private in-memory scanner performs a **per-convoy VTC-ID duplicate check**; the same VTC invited to a different convoy is not incorrectly treated as a duplicate. It checks exactly one tag per tracked thread and counts malformed reply records, missing or duplicate event links, accepted/declined/pending labels, and potential matches with the already validated Convoy Center Event IDs.

A claimed invitation, or response label, is **not** an independently verified recipient, confirmed attendance, human acceptance decision, booking, reserved capacity or participation. Tags are documented workflow states, not approval. The reader does **not** create or change Discord posts, members, roles, tags, invites, tickets or Event data.

Only an allowlisted **aggregate observation** is returned, without event IDs, VTC links/names, message bodies, inviter identities, or private thread details. The existing non-preview Event Leadership workflow stores successful observations exclusively within the existing encrypted AES-256-GCM Event state. The existing consolidated Event Leadership and Management dashboards display the advisory counters when fresh; missing/old/invalid source reads show **Unavailable**, never a made-up zero.

## Integration boundaries

- **#13 Convoy Checker:** current checked Event IDs can be correlated in memory for source-review counts only.
- **#14 Event History / #16 Event Calendar:** coexist with invitation counts in the same private Event Leadership observation state and dashboards; no invitation-based calendar approvals.
- **#12 Capacity / #18 Operations:** no automatic capacity, invitation send, approval, cancellation, reserve, schedule, or event staff assignment.
- **#17 Event Booking & Slot Management remains excluded** from the active Kings roadmap.
- This bridge does not elevate `External event` permissions and does not create a second Discord forum.

## Production gates

1. CI Node.js syntax and isolated regression tests succeed.
2. A real scheduled, non-preview Event Leadership report checks the **existing** forum with authorized bot read access. Access denied, unavailable tags, incomplete pagination, missing original thread starter or inconsistent source => **SOURCE_UNAVAILABLE**; leave previous observation untouched (it expires after 36 hours).
3. Following a genuine successful source scan, verify the existing encrypted state contains only the aggregate source and the consolidated private dashboards display it; inspect Discord permissions without making changes.
4. If an existing invite reply format differs from the template, review the actual forum privately with responsible Staff before adjusting the parser. Never infer VTC acceptance or erase older records automatically.
5. No new public GitHub data, raw Discord messages, or personally identifying content in GitHub Actions logs.

**Known limit:** This is a safe **source inventory** of visible forum threads; it cannot prove full historical invitation coverage or independent acceptance confirmations. An unchanged forum remains the authoritative place where human Event Coordination documents each invitation.

## Separate production read-only evidence gate

The existing `Kings Event Leadership Reports` workflow now has a separate `invitation_source_verify` push-only job, independent from Event report publication, Event state migration and the Convoy Checker. It uses the existing Discord bot token solely for GET access to the configured Kings private invitation forum and its visible active/archived replies. `event-invitation-tracker-readonly-proof.js` emits **only one fixed status**: `READ_ONLY_SOURCE_VERIFIED` or `SOURCE_UNAVAILABLE`, followed by a public-safe statement that invitations/acceptance/historic completeness are not approved or certified. No thread counts, person identities, VTC URLs or raw messages are logged.

The job has a limited `contents: read` GitHub permission, is bounded to eight minutes, writes nothing, and uses job-level `continue-on-error: true`: an unavailable forum yields visible evidence without interrupting existing Convoy/Leadership operations. **A green offline test is not real Discord availability proof.** Only the completed independent job can establish read-only accessibility, not full historical completeness or automatic authority. The scheduled non-preview Event Leadership report separately updates the encrypted summary when its main Convoy source is also valid.

## Safe diagnosis after initial live check

The first genuine `invitation_source_verify` job returned `SOURCE_UNAVAILABLE`. Do **not** treat this as a verified-live invitation inventory. The follow-up diagnostic keeps the same fail-closed behavior but attaches a fixed, allowlisted category (for example `ACCESS_DENIED`, `FORUM_MISMATCH`, `FORUM_TAGS_MISSING`, `ARCHIVE_PAGE_INCOMPLETE`, `MESSAGE_PAGE_INCOMPLETE`, `STARTER_NOT_FOUND`). It never emits response bodies, forum messages, VTC names, IDs or raw exceptions. The operator may then examine the specific access/configuration gap privately and must not enable write permissions just to silence the diagnostic.

### Narrowing an Access Denied source

Live read-only production check returned `ACCESS_DENIED` on 25 November 2026. The diagnostic now differentiates *which GET endpoint* was denied: `ACCESS_DENIED_FORUM` (Forum metadata), `ACCESS_DENIED_ACTIVE` (Guild active threads), `ACCESS_DENIED_ARCHIVE` (archived forum threads), or `ACCESS_DENIED_MESSAGES` (individual thread replies). These are fixed codes without channel/thread IDs or raw API details. Resolving access remains a separate authorized Discord configuration action; no automation is permitted to grant itself additional roles or permissions.
