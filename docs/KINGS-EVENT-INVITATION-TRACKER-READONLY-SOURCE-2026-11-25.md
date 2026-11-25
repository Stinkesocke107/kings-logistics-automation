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

## 26 November 2026: partial tag-schema handling without guessing

The owner-corrected Forum ID `1457797580703531143` is reachable, but the real source check returned `FORUM_TAGS_MISSING`: the Forum's **actual** tag names have not been authoritatively mapped to the planned `Invites Ongoing`, `Invites Done`, and `Convoy Completed` lifecycle states.

A missing/mismatched status tag schema must **not** make all historic invitation reply content unavailable. The read-only reader now separates:

- **Source scan completeness**: expected Guild and Forum, all visible active/archived threads, all message pages, identifiable original starter, full-pagination bounds. Any failure continues to be `SOURCE_UNAVAILABLE`; do not silently infer zero invitations.
- **Invitation reply inventory**: only fully scanned replies matching the agreed exact VTC/TruckersMP/inviter shape, with per-convoy deduplication, missing links, malformed and response-label counters. Can be observed if tag schema differs; still an unverified source claim, not confirmed attendance or approval.
- **Forum lifecycle classification**: a separate `tagSchemaVerified` flag is `false` until all **three exact unique** agreed tag names exist. The existing Leadership views must then visibly say **Forum lifecycle tags UNVERIFIED**, **withhold ongoing/done/completed totals**, and request human tag reconciliation. No tag synonyms, remapping, creation, or automatic approval is invented.

The production proof keeps a **warning/failure** status `INVITATIONS_READABLE_TAG_SCHEMA_UNVERIFIED` (not green) if reply inventory was scanned but lifecycle tags could not be verified. Other errors retain their existing privacy-safe reason codes. The existing encrypted Event state can still hold only the allowlisted read-only aggregate; names, IDs and Discord message bodies remain private and are never written to the public repo or CI logs. Full Event Operations #18 remains human-controlled.

## 26 November 2026 — Final tag reconciliation gate (owner approval required)

The private Invitation Tracker Forum `1457797580703531143` is **fully GET-readable** in production, but its real lifecycle tag names differ from the originally proposed English names. To finish status classification safely **without renaming any existing tags**, the owner or authorised Event Coordination Lead can approve a mapping using the **existing Discord Forum tag IDs**. Do not infer a mapping from similar-looking names or private thread contents.

1. In Discord, open the existing Forum's **Edit Channel → Tags**, and obtain the tag IDs (Developer Mode / Copy ID) of the three tags that actually represent **Invites Ongoing**, **Invites Done**, and **Convoy Completed**, *in that order*. If none of the current tags has that meaning, there is no valid mapping yet; use the approved exact status names first through normal Discord administration, or leave lifecycle counts unverified.
2. In GitHub repository settings, create/update **Actions repository secret** named `DISCORD_INVITATION_TAG_IDS`. Its value is the three existing Discord **tag IDs** separated by commas, in order: `ONGOING_ID,DONE_ID,COMPLETED_ID` (replace placeholders with genuine IDs). Do not paste a Discord bot token or private replies into repository code or public logs.
3. The existing **Kings Event Leadership Reports** read-only probe and scheduled reports automatically use the mapping when present. The adapter accepts **only three distinct 16–21-digit IDs actually advertised in that exact Forum**. A malformed secret raises a safe, redacted error, and a stale mapping leaves `tagSchemaVerified:false`; neither is silently guessed.
4. After configuration, verify the read-only production source proof returns `READ_ONLY_SOURCE_VERIFIED` and existing private Leadership dashboard lifecycle counts no longer show `UNVERIFIED`. The completed source scan and recorded invitation replies are still **source claims**, not external confirmations or approval decisions.

When no secret exists, the source only recognises the three **exact** previously agreed tag names; otherwise response and duplicate inventory remain readable but Forum lifecycle is explicitly unverified. Only the existing Event Leadership jobs receive the secret. No Staff or Bot is granted new permissions, and no invitations, Discord tags, Roles, Events, or Bookings are changed automatically. **System #17 remains excluded.**

**Important release status:** Until the real tag-ID mapping is confirmed, #15 is *functional for existing invitation audit and integration*, but the lifecycle-status component is *not production-certified*.

## Manual production check without code changes

The existing **Kings Event Leadership Reports** workflow now offers a seventh manual **`invitation-check`** selection:

1. After an authorised Kings owner stores the reviewed status Tag IDs in GitHub Actions secret `DISCORD_INVITATION_TAG_IDS`, open **Actions → Kings Event Leadership Reports → Run workflow** on `main`.
2. Select **`invitation-check`**. This runs only the isolated **read-only** `invitation_source_verify` job. It does not execute the daily/weekly/monthly Event report, modify encrypted data, post Discord messages, or write/approve any Invitations/Events.
3. Read the fixed public-safe result: `READ_ONLY_SOURCE_VERIFIED` means a complete readable Forum scan *and* the configured tag schema matches existing Discord tags; `INVITATIONS_READABLE_TAG_SCHEMA_UNVERIFIED` means reply inventory works, but status tags need reconciliation; `SOURCE_UNAVAILABLE (<fixed-reason>)` means source access or configuration requires investigation.

This manual run is a **verification convenience**, not a webhook and not an automated invitation service. Source audit readiness does not prove that individual recipients accepted or attended, nor does it validate full historical completeness.
