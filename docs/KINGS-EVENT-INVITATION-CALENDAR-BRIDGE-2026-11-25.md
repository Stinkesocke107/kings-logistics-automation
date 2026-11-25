# Kings Logistics — System #15 to Systems #12/#13/#14/#16: Offline Invitation Handoff

**25 November 2026 | DRAFT | GitHub Free only | NO live deployment**

## Avoid duplicate development

- Draft PR #147 already introduces event-invitation-tracker-offline.js and its 14 tests. This branch imports **exactly the same source files**, rather than creating a second Invitation Tracker implementation.
- Draft PR #143 already contains the single sourceIntake.tracker contract and projectKingsConvoySystemBridge. The new event-capacity-invitation-lifecycle-bridge.js reuses those exact modules. It does NOT replace the existing Calendar, Convoy Checker or booking engine.
- This integration PR is based on PR #143's feature branch, NOT production main. If #147 and #143 are later merged independently, preserve only one copy of the identical Invitation Tracker module when reconciling branches.

## New offline read-only handoff

Call projectKingsInvitationCalendarOffline({bridgeInput, invitationClaims}).
It:
1. Requires the original Convoy Center intake to have no tracker object, to prevent a second tracker source from being overwritten or counted twice.
2. Requires the Invitation review timestamp to exactly equal the existing sourceIntake.nowMs. A mismatch fails closed.
3. Runs the existing Invitation Tracker state machine as the only status-transition validator.
4. Derives the final claimed invitation status and source digest once, **in memory**, and passes each claim into the existing sourceIntake.tracker record format.
5. Forces tracker.connected=false and tracker.claimsComplete=false. The configured=true flag means only that an **offline synthetic review adapter** supplied the contract; it NEVER means an actual provider has been authenticated.
6. Lets the existing multi-source intake detect Event ID mismatches and duplicates, and the existing staff Calendar calculate its established current and historical counts without increasing them for invitation rows.
7. Returns private aggregate source reviews and an ephemeral-only, redacted Calendar/Invitation summary. Raw IDs/digests never appear in that returned preview.

Cases for Sent, overdue reply, Accepted, Declined, missing IDs, duplicates, source date mismatch, pre-existing tracker, invalid transitions and past/out-of-window Events have synthetic regression tests.

## Critical safety and authority limitations

- An organizer's **Accepted** reply is NOT Kings Event Leadership approval, a booking, a reserved parking slot or an available-capacity certificate.
- Calendar totals are inherited from the **existing** authenticated-or-unverified Convoy Center/Staff Calendar projection; the Invitation Tracker **does not** write additional events into Capacity.
- All claims and digest strings are **untrusted** until a separate authorized source authenticator is built. No original Discord invitations, responses, deleted threads or historical source messages are fetched here.
- No real Discord message/interaction, reminders, workflow schedules, API credentials, role changes, event approvals, bookings, cancelations, data persistence, backups or new paid services.
- Any mismatch, contradictory source, unknown lifecycle or incomplete historic coverage requires manual Event Coordination review. This integration never marks freeSlotsCertified or safeToActivate as true.
- No new GitHub Actions workflow is required; the existing PR test suite discovers tests in the ordinary tests directory.

## Remaining release gates

1. Authorized private outbound invitation source reader and verification of the organizer response, actor, original message IDs, edit/deletion history and event identity.
2. Protected, privacy-safe event-source integration with real Discord permissions and Staff authority, independent event history and rescheduled/archived Event review.
3. Approved durable private storage, human decisions, backup/recovery and anti-rollback controls without public personal data.
4. Cross-PR reconciliation of PR #143 and PR #147, full exact-HEAD CI and an explicit human review before any release.

This draft bridge is a development integration only; do NOT merge to main or activate live systems based solely on passing CI.
