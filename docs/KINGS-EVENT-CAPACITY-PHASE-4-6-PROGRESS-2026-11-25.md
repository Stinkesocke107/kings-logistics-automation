# Kings Event Capacity – Phase 4–6 Development Progress (25 November 2026)

**Release state: DRAFT ONLY, isolated and read-only in production.** This note is a truthful scope inventory of feature branch PR #143. Do not infer a deployed Discord channel, authenticated private host, protected database, production integration, operational task assignments, or real event participation from passing offline tests.

## New isolated domain modules

### event-capacity-workboard.js
- Private, revisioned task and cross-department-request lifecycle.
- Open, In Progress, On Hold, Done, Reopened; exclusive claim, release and Leadership assignment.
- On Hold reason and follow-up date; friendly 24-hour reminder and 48-hour Leadership overview **proposals only**.
- Department assistance requests: Pending, Clarification Needed, Accepted, Declined, Completed and Withdrawn. A department-completed request never completes the original task.
- Required task N/A requires Leadership/CEO role evidence; coordinator may mark optional N/A with evidence.
- Role information is a library-level contract; authenticated gateway, durable CAS and encrypted storage are still required.
- No automatic Discord pings or role writes.

### event-capacity-preparation.js
- Source-gated, category-specific Kings / Partner / Other External checklist proposal.
- Uses canonical source event identities; duplicate event identities are blocked before new work is proposed.
- Distinguishes verifiable source proof from open tasks and prevents Ready when required data are missing.
- Milestone-specific checklists only after Event Coordination verifies the milestone; suggestions are not approvals.
- Already Completed historic events do not receive surprise new tasks.
- The module **does not** automatically create its proposals in the protected workboard; a trusted host must reconcile authorized checklists transactionally with the existing Convoy Center task identities.

### event-capacity-publication-review.js
- Private, versioned Publication Impact Review: Update Required, Needs Verification, No Update Needed, Verified Updated.
- Unknown or unreachable publication is not treated as deleted or correct.
- Requires independently verified event change and human-authorized evidence for resolution/closure.
- Later relevant publication errors reopen the same review; prior completion summaries are retained as historic snapshots.
- Does not call Discord, edit a published post, access private external platforms, or assert that monitoring is live.

### event-capacity-reporting.js
- Pure UTC month/year aggregate projection with separate Kings/Partner/External categories and accepted, pending, cancelled, exception, conflict and verified-attendance counts.
- Completed planning status is NOT attendance; verified attendance needs a separate independent evidence source.
- Verified reports can be versioned while previous records become Superseded; no deletion of history.
- Scheduled report candidates: following month on day 2 at 09:00 UTC, prior year on 3 January at 09:00 UTC.
- Aggregate-only CSV projection; no people, private event IDs, staff records or timestamps embedded.
- Actual PDF generation, protected delivery, 24-month retention and encrypted archive require the private backend.


### event-capacity-milestones.js
- Private chronological Upcoming Milestones view, 10 per page, confirmed milestone tags only.
- Read-only reminder proposals for open preparations at the 14-day and 3-day UTC departure windows; no reminders for Ready, Completed or Cancelled events.
- Stable milestone reminder dedupe keys include verified event identity, milestone type, stage and approved departure time so reschedules are independently reviewable.
- No actual assigned-person lookup, Discord ping, send history or notification delivery occurs in the module. Those require verified private integrations.

## Remaining launch blockers (not simulated away)

1. Authenticated and independently attested **real** Convoy Center report ingestion with current production data, permission review and legacy reconciliation.
2. Private, production-grade durable encrypted database with transactional snapshot+cursor CAS, independent anti-rollback revision, encryption keys, audit history, 24-month personal retention/deletion propagation, 90-day encrypted backups and tested isolated restoration.
3. Real Discord HTTP interaction host: ACK/defer, registered commands, current guild/role/channel permission checks, replay prevention and privacy-restricted channel. The draft-only read service is not a hosted Discord bot.
4. Authenticated command authorization for task, classification, exception, publication and report mutations; prevent user-controlled "trusted" role flags from satisfying authentication on their own.
5. Reliable event identity, original acceptance decisions, actual historical data, slot proofs, route/meeting/end times and the archived-Convoy-Thread policy.
6. Authorized publication source monitoring integrations, asset/version provenance, idempotent notifications, reminder delivery state and cross-department requests.
7. Remaining comprehensive dashboard/search/calendar/filter/interactive controls, protected reports, PDF export and full production E2E tests.
8. Explicit CEO authorization after a reviewed deployment plan. Do not automatically change legacy advisory limits, existing Discord messages or Convoy Center statuses.

## Security model

All new modules are pure domain logic and/or proposals. They must receive only validated, scope-bound private data from the future authenticated service. The repository is public: **never put real human decision records, private source ZIP content, access credentials, private staff data, Discord identity registers, or report details in Git-tracked files or public CI logs**. Do not treat a green CI result as a successful permission/restore/live-source audit.

## Release posture

The masterplan remains authoritative. Existing PR #143 stays **Draft**, not merged. The older production Convoy Checker and event planning limits continue operating without changes from these new modules.
