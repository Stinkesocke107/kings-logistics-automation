# Kings Logistics — #15 Invitation Tracker & #18 Event Staff handover
**Prepared 27 November 2026 — not an operational sign-off**

## Scope and authority
This handover covers the **existing**, private Event Invitation Tracker forum and its read-only visibility in the consolidated Event Leadership dashboard. It also documents the authentic human action needed to complete #18 Event Operations. The Event Coordinators and Event Coordination Lead own ordinary forum work; Kings CEO provides final policy/release acceptance. This is not an invitation sender and not #17 Event Booking & Slot Management (explicitly excluded).

## Before review
- Confirm the intended Kings Discord guild and real **Invitation Tracker forum**, including the exact active Forum tag names or a separately owner-approved mapping in the existing private `DISCORD_INVITATION_TAG_IDS` secret. Never guess IDs or expose tokens in public GitHub Issues/logs.
- Check that the existing `Invites Ongoing`, `Invites Done` and `Convoy Completed` modes are unambiguous. `Event Team Guide` is informational, not an invitation status.
- One convoy thread should contain its original event reference; each human reply must use the documented one-VTC-per-reply VTC link, inviter and optional response label. The system records **source claims**, not independently confirmed sent messages, RSVPs, event attendance or Staff approval.
- The operator must have the correct private channel and Event Coordinator authorization. Do not bypass Discord permissions or fabricate a real Staff decision to satisfy a checklist.

## Safe verification procedure
1. Use the existing **Kings Event Leadership Reports** workflow in GitHub Actions, on `main`, with `report=invitation-check`. This is a **GET-only** inspection. Inspect the specific *Invitation Tracker source verification* step, not merely the overall green workflow state: its job currently has `continue-on-error` and therefore an underlying read failure must still be treated as unresolved.
2. Use the same workflow with `report=integration-check` to compare the real Convoy Center/History/Calendar/Invitation source and proposed Staff triage. It does not post an invitation, create a slot, approve events, or sign off real historical decisions.
3. In the original Discord forum, manually reconcile any **missing event links, duplicate VTC replies, repeated convoy event references, malformed replies, unrecorded responses, and conflicting/unknown lifecycle tags**. A recorded response `Accepted` is not independent acceptance/attendance evidence.
4. Use the normal authorized Event Leadership report source refresh and the existing consolidated dashboard publication route. Check the **Invitation Tracker — Source Review** field in the private dashboard, and inspect a relevant genuine source change. The independent `event-review-dashboard-readonly-proof.js` compares **both** the Invitation Tracker and Manual Staff Progress fields against their corresponding current encrypted source state and the actual stored owner-bot Discord message.
5. For #18, when a **new real authorized Staff action** is performed, follow the existing private `!kings-review` code/command workflow or owner-authorized manual review workflow. Record only permitted evidence category, never personal source text in public Action inputs. Confirm that the encrypted journal was persisted, that dashboard refresh was dispatched, and that the actual stored bot-authored Event dashboard fields match. An offline test or unchanged field is **not** proof of a new human action.
6. Record the run IDs, date/time, source freshness, responsible human reviewer, documented exception handling, retry/recovery, and final private leadership verification in the private team evidence register. Do not upload raw invitation names, VTC identities, Discord private messages, Staff personal data or tokens to public GitHub.
7. An authorized Event Coordination Lead performs operational handover; the CEO separately signs off **only** those individually evidenced functions. A working read-only inventory does **not** equal final #15/#18 signoff.

## Failure handling
- **Source unavailable / access denied / rate limited:** keep the item open; never interpret missing scans as zero invitations.
- **Unverified Forum tags or duplicated thread/archive page:** manually inspect original records and retry read-only scan after the source is stable. Do not infer a lifecycle from labels or override an authentic tag decision automatically.
- **Missing/duplicate VTC reply or event reference:** human Event Coordinator resolves the original thread. No automated deletion, new invitation or reply.
- **Dashboard stored message not matching encrypted source:** block the dashboard acceptance gate, examine publish/persist/GET verification in order, recover through the existing authorized workflow; never fabricate a green result.
- **Staff action unverified:** keep original Staff decision proof open even if the journal or offline tests succeed.
- **Policy unclear:** daily/monthly convoy limits and spacing thresholds remain their existing advisory semantics until the CEO explicitly confirms final rules.

## Proof status
- **Code-level guards:** duplicate thread identity rejection; non-decreasing archive cursor rejection; lifecycle counts withheld when tag mapping unverified; shared, privacy-safe Invitation dashboard projection; actual stored message read-back of both Invitation and Staff progress fields.
- **Synthetic offline tests:** exercise these failures, missing fields and changed encrypted snapshots.
- **Live operations not performed by this handover:** no new message sent, no Staff decision, no live original reply reconciliation, no observed post-change private dashboard publication, no authorized human signoff.
- **Release:** DRAFT / **NO PRODUCTION ACCEPTANCE**. #17 Event Booking & Slot Management remains excluded.
