# Kings Logistics — Event Operations #18: Staff Review (read-only integration)

**26 November 2026 | Existing Event/Management Leadership dashboards; first operational triage bridge**

The existing Kings Event systems already provide separate evidence and workflows:

- **#12 Capacity / #13 Convoy Checker:** advisory source reports, type classification and date-spacing warnings under the current **3 total convoys per UTC day, 20 Partner and 20 External convoys per UTC month, no monthly Kings cap** policy.
- **#14 Event History / #16 Calendar:** read-only source inventories, checked against current Convoy Center and frozen Legacy, with original 24-month historical completeness explicitly **not verified**.
- **#15 Invitation Tracker:** protected GET-only inventory of the existing private Discord invitation forum, encrypted aggregate only. The CEO corrected the channel ID to `1457797580703531143` on 26 November 2026; its live read succeeded far enough to identify a **forum-tag policy mismatch**, so invitation status claims are not yet promoted as verified data.

## What #18 now connects

The small pure `event-operations-staff-triage.js` composes only **fresh and separately validated** existing Event and Invitation observations. It creates human-readable, aggregate tasks for responsible Event Coordination staff, in the **same fixed private Event Leadership dashboard** with a compact source-status field in the existing Management dashboard. It does not create an extra channel, database, dashboard or automatic Event action.

Current staff review tasks are: unclassified Event types; UTC calendar days requiring manual review; days exceeding three *source-claimed* Convoys; months missing historical source claims; Invitation Tracker missing/duplicate Event links; duplicate VTC replies; malformed entries; unresolved Forum tags; and pending/undocumented invitation responses. Every task is advisory. A month without historical claims is not proof of zero Convoys.

**Event Coordinators and the Event Coordination Lead** retain autonomy over ordinary invitations and documentation. Leadership receives exceptional source-access and policy escalations only; the CEO is **not** required to approve everyday invitation decisions.

## Strict fail-closed rules

- If the Event or Invitation observation is absent, stale or invalid, that domain is shown as **Unavailable**, *never* as zero pending work or as verified free capacity.
- Every output is aggregate-only. No Event titles, channel IDs, invitation recipients, Driver identities, Staff names, message text or source URLs are rendered.
- No changes to confirmed Convoys, already documented invitations, Staff assignments, Discord roles, Ticket Center, Events, source tags or channels.
- No automatic Event approvals, cancellations, invite sends, bookings or reserving. **System #17 Event Booking & Slot Management remains excluded.**
- #18 is **not complete**: real staff appointment/assignment authority, independently approved historical lifecycle decisions and the Forum-tag mismatch are separate outstanding prerequisites.

## Release checks

1. Run offline GitHub Actions regression suite, including missing/stale source tests and Discord field-length check.
2. After merge, verify the existing consolidated Event and Management Leadership dashboard workflow succeeds without duplicate messages and the new advisory sections match source availability.
3. Check current `#15` Forum tags privately, without trying to create or change Tags automatically. Statuses remain unverified until the correct names and permissions are reconciled with the user-approved workflow.

## Phase 2 — Priority-ordered Event Coordination worklist

`operationsWorklist()` now turns the **same** already-validated #12/#13/#14/#15/#16 aggregate into an advisory, ordered human review queue (no separate task database or Discord messages).

- **BLOCKED**: Convoy/Calendar source unavailable, or the private Invitation source unavailable. Assigned function for review: *Event Coordination Lead*; no Staff/role assignment is executed.
- **HIGH**: >3 source-claimed convoys on any UTC day and unclassified Kings/Partner/External event categories. Staff check; no cancellation or rescheduling.
- **NORMAL**: unresolved calendar days, missing/mismatched private Forum lifecycle tag schema, duplicate VTC invitations, duplicated/missing event links and malformed entries. Routine invitation coordination belongs to *Event Coordinators*; exceptional source configuration to the Lead.
- **FOLLOW_UP**: pending/unrecorded reply labels and 24-month historical source gaps. These represent review work only, not confirmed RSVP or certified historical completeness.

The queue uses fixed internal reason codes and optional aggregate counts. Its `owner` field denotes a **suggested functional reviewer**, never an actual individual, appointment, approval or notification. Existing **Event Leadership** displays up to seven ordered items in a new field, and the existing **Management Leadership** shows just the top suggested issue plus source readiness. It does not introduce another channel or board.

Missing source creates an explicit *BLOCKED* work item, not a green "no action" outcome. **Forum lifecycle tags unverified** is a separate *NORMAL* work item even when the private invitation replies themselves are readable. All tasks remain human-controlled, with no CEO sign-off for routine invitations and no Booking #17.


## Neuer Echtbetriebsnachweis vom 27. November 2026

Die früher auf dieser Seite genannte Forum-Tag-Abweichung war ein **damaliger** Befund. Der aktuelle [Event Leadership Lauf #45911909091](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45911909091) meldete `READ_ONLY_SOURCE_VERIFIED` für die private Einladungsliste sowie `EVENT_SOURCE_TO_STAFF_TRIAGE_RECONCILED` für die gemeinsame Quellen- und Aufgabenlistenprüfung von #12/#14/#15/#16/#18. Der Test verändert keine Event-, Staff-, Discord- oder Rollen-Daten. Historische Vollständigkeit, Originalantworten, Genehmigungen, neue menschliche Review-Kommandos und alle abschließenden Abnahmen bleiben offen.
