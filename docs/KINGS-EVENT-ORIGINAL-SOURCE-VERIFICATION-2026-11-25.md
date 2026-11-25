# Kings Logistics — Event Invitation original-source and historical review gate

25 November 2026. Development scope: Event Systems #14/#15, stacked draft PR #149 on existing Event Capacity Draft PR #143. GitHub Free only.

## Integrated, but NOT live-verified

The new event-capacity-invitation-source-handoff.js reuses rather than duplicates:

- event-invitation-discord-readonly-source.js: permission-checked, bounded, GET-only private source reader;
- event-invitation-discord-forum-readonly.js: candidate entries from the existing internal invite-tracker forum, including active/archived Discord forum threads;
- event-capacity-invitation-lifecycle-bridge.js: status validated in-memory handoff for **structured** outbound invitation records to the EXISTING Convoy Center / Staff Calendar review;
- event-capacity-convoy-system-calendar-bridge.js and event-capacity-discord-history-pagination-audit.js: existing Calendar and historical 24-month source-claim audit.

The manual option on the EXISTING Convoy Checker remains OFF by default and source-only; never includes a full Calendar or raw history. This change makes that manual path invoke the shared safe handoff. No additional scheduled job, external host, Discord write, role change, or budget required.

## What each source can establish

| Input | Internal review purpose | Still NOT proven |
| --- | --- | --- |
| Existing invite-tracker forum | Counts candidate VTC invitation rows, reviews missing and ambiguous Event links | Original organizer reply or invitation delivery, canonical identity, 24-month completeness, staff historical roles |
| Structured private text-channel records | Claims of Draft/Sent/Accepted/Declined with ordered Discord message timestamps, exact Event-ID cross-reference to Convoy Center review where available | Actual reply by genuine VTC organizer, Kings acceptance, booking, original deleted/edited history |
| Convoy Center | Existing statuses, categories and UTC Calendar planning (not replaced) | Real 24-month source history and approval if source/Staff evidence remains incomplete |
| Historical Discord pagination audit | Missing streams, failed pages and inconsistent archive pagination as private review counts | Deleted messages recovered, historical source authenticity, full inventory of past channels |
| Private history/witness/backup GitHub repos | Future protected history and recovery destinations; separately prepared | Production durable storage, signed highwater, independent disaster recovery |

A textual “Accepted” is an **unverified source claim**, not evidence of an authorized Kings approval. Repeated forum mentions are **not extra convoys**. A candidate VTC row is NOT automatically an Event ID or a booking.

## Preconditions for an actual verified source read

1. Kings Event Coordination/CEO independently confirms the actual current Discord private invite-tracker forum (or selected dedicated private structured channel) ID, that it belongs to the configured Kings guild, and that it contains authorized Event data.
2. Independently verify exact current Event Coordination/Leadership role IDs, global Administrator exceptions, bot identity and effective source-channel permissions. Do NOT expose the token, private channel/user IDs or records in public GitHub, PR comments, logs or chat.
3. Approve the use of the existing bot token and the protected manual-only source reader; the existing code PR remains Draft and must not be deployed or run with private data until reviewed.
4. Verify original invitation message IDs, original external organizer responses and authorized organizer identity separately. Current Kings Staff roles are NOT proof of their historical membership.
5. Enumerate every old Convoy Center/legacy channel and archived threads with bounded pagination, identify missing/deleted/edited evidence honestly, reconcile source IDs and dates without duplicating booked Events.
6. Review protected private history retention, signed checkpoints, independent latest-highwater custody and an actual backup restore before production automation.
7. Only then consider a distinct release of validated read-only summaries and later separately reviewed human-driven approvals. Never mark certified free slots based on source-claim counts.

The new handoff deliberately returns only anonymized aggregate counts, flags and unresolved case totals; neither raw Discord content nor invitation IDs are returned from this orchestration. There is NO live Discord API execution in this PR.

## Project state

- PR #148 was merged into the PR #143 **development branch only**. PR #147 was closed as superseded. This PR #149 is the next small addition and is likewise **not aimed at main**.
- Main, the existing live Convoy Checker, Discord and production History repositories remain unchanged.
- Test success means offline software acceptance only. The authentic source/channel/roles and full historical archive are still explicit release blockers.
