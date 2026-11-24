# Kings Event Capacity & Management System — Masterplan v1.0

**Status:** approved functional scope; technical rollout NOT completed. **Date:** 2026-11-24.
**Owner:** Kings Logistics CEO (final authority). **Integration target:** existing Kings Convoy Center, not a replacement.
**Policy:** Real Life First; platform-neutral ETS2/ATS support (currently officially TruckersMP and HaulMP); no automatic acceptance, cancellation, approval or publication.

> This specification consolidates the Kings decisions taken before implementation. It does **not** claim features are already live. The rules in this document supersede older proposed capacity limits when the new system is formally activated, but do not silently rewrite production or historical commitments.

## 1. Authoritative rules and invariants

1. Maximum **2 accepted Official Partner + Other External Convoys combined per UTC departure calendar day**. No weekly quota.
2. Maximum **20 accepted Official Partner Convoys per UTC departure month** and **20 accepted Other External Convoys per UTC departure month**, as separate buckets.
3. **Kings-owned events have unlimited capacity** and do not use external/partner quotas.
4. Decision priority: **Kings-owned > Official Partner > Other External**; all official partners are treated equally.
5. A higher-priority event never silently cancels a confirmed lower-priority commitment. Event Management or CEO evaluates and explicitly authorizes any withdrawal; external communication remains respectful.
6. **Exceptions over quota** can be authorized only by Event Management or CEO. Retain the limit and show e.g. "3/2, 1 Approved Exception"; never secretly increase the quota or treat the exception as a free slot.
7. Departure separation under **120 minutes** is an **advisory**, not an automatic refusal.
8. Only **officially accepted** events consume quotas. In Convoy Center, Scheduled is accepted; Completed retains its historical allocation and **does not prove Kings actually attended**. Pending, Submitted, Needs Information and Ready for Approval do not consume quota. Cancelled releases capacity. Rescheduled moves to the verified new UTC departure day/month after staff-confirmed acceptance of the change; unresolved reschedules remain uncertain rather than fabricating a free space.
9. Classification **Kings / Official Partner / Other External** is controlled by Event Coordination in the internal Convoy Center. A public TruckersMP host alone does not establish private Kings partnership status. Missing or contradictory classification must be reviewed.
10. Deduplicate exact same Event ID. Ambiguous identities or conflicting duplicates require human review and must never create falsely verified availability.
11. New policy must reconcile all existing historical, active and future records. No auto-acceptance, mass change of old forum statuses, or replay of historical notifications.

## 2. Time, validation and conflicts

- Capacity uses the **UTC date of verified departure**, **not** meeting date nor the old "Event Date" field.
- Meeting, departure and planned end must be distinct timestamps, displayed to Discord users via dynamic timestamps (\`<t:UNIX:F>\`).
- Check full **meeting → planned end** overlap separately from the two-hour departure-spacing advisory.
- Planned end may come from a reliably verified official source or Event Coordination's approved internal correction. If absent, display **End Time Unknown** and flag scheduling feasibility for manual review. Never invent an end.
- Internal Convoy Center data remains the working authoritative source on external disagreement, but display **Data Conflict**, restrict verified-free assertions, and offer access-controlled Keep Internal / Accept External / Correct Manually choices in a private interaction.
- Do not expose confidential decisions in a public forum thread. Re-evaluate after source updates, deduplicate warnings and changes.
- Reviewed–Accepted temporal overlap remains **an actual overlap**, distinct from Resolved and from permission to exceed capacity.
- An accepted Scheduled event can be marked Completed after a reliably known planned end at the next successful check; this is a *planning lifecycle status only*, not proof of attendance. Without a dependable end, staff confirmation is needed.
- Unknown critical data is **Incomplete Data**; availability must fail closed (not be labeled confidently free). Show the best known count alongside the uncertainty.

## 3. Capacity dashboard and UX

- Private channel: **📊│event-capacity**, access **Event Coordination, Event Leadership, CEO** only; verify current permissions for each interaction.
- Rolling dashboard for **current UTC month + next two months**; refresh approximately every 15 minutes subject to real scheduler execution; other months opened privately on demand.
- Monthly totals plus calendar: available / limited / full / unverified, Kings/Partner/External indicators, separate flags for approved quota exceptions and active priority/time conflicts.
- Interactive private **Daily View**: all confirmed and pending convoys, quota usage, meeting/departure/end Discord timestamps, exceptions, conflicts and Convoy Center links.
- Private month/year selection, event details, history/search, Needs Attention and Refresh Capacity.
- Private search across historic/current/future events with combinable date, organizer, category, Event ID, status, conflict, exception and data-quality filters; **10 results per page**, 5 private saved filters per eligible staff member.
- Search sorting: upcoming UTC departure by default; optional last updated, priority, organizer, status; past events chronological.
- Pending/tentative events appear as non-consuming planning entries.
- Needs Attention priorities: **Urgent, Review, Advisory**. The display does not create staff sanctions.
- Important new priority conflicts and unapproved over-quota events alert/ping the authorized Event Coordination role. Two-hour advisory has **no ping**. Dedupe, resolve confirmed-fixed warnings on successful sync; preserve evidence.
- Shared 5-minute cooldown for manual **Refresh Capacity**; no overlapping runs; return private diagnostics only.

## 4. Tasks, decisions and cross-department collaboration

- Event Coordination can claim/release its tasks; Leadership may assign/reassign. State: Open / In Progress / On Hold / Done; prevent double claims.
- Open task inactivity: friendly private reminder after **24h** and Leadership overview after **48h**; never automatically remove or punish staff.
- On Hold reasons: Organizer Response, Management Decision, Missing Event Information, Scheduling Coordination, Other, with optional note. Follow-up: 1, 3, 7 days, custom, or none. Pause standard inactivity reminders, not critical conflict monitoring. At due time: one reminder and Needs Attention until manually handled.
- Automatically resolve tasks only when the actual underlying issue is reliably fixed. Human approvals, contacts and decisions need genuine human completion.
- Reopen a previously closed task as **Reopened** when the actual issue recurs; preserve audit history, no automatic reassignment. Recently Completed lasts **7 days**, followed by searchable private archive (10/page).
- Cross-department assistance is a **request**, never a forced assignment. Keep one underlying Convoy Center task; attach request with **Pending / Clarification Needed / Accepted / Declined / Completed / Withdrawn**.
- Department leadership/authorized responsible person accepts, declines or requests information. Completion needs evidence; Declined/Withdrawn do not close the original task.
- New requests and significant changes trigger single protected notification; Pending still unanswered after **24h** gets one friendly reminder; after **48h** enters protected Leadership overview; deduplicate with existing task reminders.
- Optional deadlines and verified event times can mark **Time-Sensitive** 48 hours before deadline. **Urgent** only with a substantiated threat to important event preparation; no new ping merely for urgency. Team may correct an assessment.
- Declined/Withdrawn: offer internal continuation, alternative accepted-by-department request, or On Hold; Event Coordination chooses manually; never duplicate active requests.
- Rescheduled: review linked requests; recalculate event-relative times, **not** independently agreed personal due dates. Cancelled: mark Review Required, pause ordinary related reminders; no auto-completion, withdrawal or deletion.

## 5. Event Preparation Checklists

- Automatically create a category-specific checklist for **every officially accepted convoy**: comprehensive Kings-owned; substantial partner; lean other external; extra tasks for confirmed milestone events.
- Mandatory essential event dates, official acceptance and required meeting/start information; optional media, convoy control, invitations and support only when relevant.
- Match/link existing tasks, never create duplicates. Automatically mark Done only with demonstrable proof; otherwise Event Coordination updates tasks.
- Preparation status **Not Started / In Progress / Needs Attention / Ready** is derived independently of event and department-request status. Required missing data or unresolved critical preparation conflict blocks Ready; optional work does not.
- Event Coordination may adjust individual checklists, create/edit/complete/remove **optional** tasks with title, description, assignee and optional deadline. Event Leadership + CEO own global templates and required points.
- Newly created checklists use the newest template. Existing confirmed events only receive template updates upon targeted Event Leadership/CEO review; preserve valid completed work.
- N/A is **not Done**. Event Coordination may set optional items N/A; required items need Leadership/CEO authorization and logged justification/decision. Properly approved N/A does not block Ready.
- No checklist operation can silently accept/cancel an event, waive quota, change official priority or override existing approval privileges.

## 6. Verified milestones and reminders

- Optional tags: Kings Anniversary, Partnership Anniversary, Special Kings Event, Special Collaboration and Other Milestone (named).
- Suggest possible tags automatically, but Event Coordination must confirm them before treating as **verified**; tags never modify quota, event type or priority.
- Verified milestones: star in calendar, exact name/type in private Daily View and Event Details, and Annual Management Summary.
- Private **Upcoming Milestones** view within dashboard, chronological, combinable filters, **10 per page**, statuses and Convoy Center links; no extra channel.
- At **14 days and 3 days before UTC departure**, remind only where open preparations/unknown information remain. Assigned Event Coordinators receive a private reminder; Event Leadership sees a protected overview; CEO no routine milestone reminder, existing critical escalation unchanged. No repeat spam, no reminder for cancelled/completed event.
- Scheduled and Completed do not assert actual attendance.

## 7. Event deliverables, asset approval and publications

- Link finished banners, graphics, documents and other deliverables to existing Convoy Center tasks via **private references**, avoid file duplication; track responsible department, status, version and restricted link.
- **Completed**, **Approved**, **Published** are separate facts. Nothing automatically publishes.
- Ordinary internal material: Event Coordination or competent Department Lead can approve. Official public Kings banners, important announcements, brand materials: **Event Leadership or CEO**. Already held Kings partner-logo/use rights require **no routine repeat partner consent or repeated documentation**, while use must remain within existing rights.
- Substantive revisions of official event information/date/route/logo/brand require approval at the relevant level; minor cosmetic corrections may be reviewed by existing authorized approvers.
- Superseded versions remain in permitted historical records; outdated versions not recommended for future publication. Already-published posts are never automatically edited/deleted/reposted.
- Publication evidence: automatically detect/verify from supported authorized Kings integrations where possible; external platform + URL + exact asset version may be recorded manually. Verification: **Verified / Unverified / Unavailable**. Mere inaccessible link is **not** deletion evidence.
- Verified changes in event date/time/route/important info create a **private Publication Impact Review** listing potential effects, platform, links, version and evidence; label **Update Required / No Update Needed / Needs Verification**. Unknown is never misrepresented as outdated or resolved.
- Event Coordination coordinates update work; only authorized publishers actually edit/repost. Finish the Review only when all items have verifiably been updated or documented No Update Needed.
- For unavailable/unedittable content: verify again, arrange approved replacement, or document *proven* absence as No Update Needed. Link replacements to originals. Incorrect still-public information remains action needed.
- On valid closure, generate private **Publication Completion Summary** with reviewed updates, justified no-update items, asset versions, evidence, staff and closure time; available in Center/dashboard, not public and **not a convoy-attendance certificate**.
- A new relevant verified event change automatically **reopens the same review**, with versioned new review cycle; previous completion summaries remain immutable historical snapshots for their original valid time.
- Compare known verifiable content with changed event fields: **Update Required / Unaffected / Needs Verification**. Reuse reliable unaffected proofs; do not close uncertain items.
- Monitor post-review edits to publications on supported authorized Kings systems when technically possible, with event-relevant verification only for external platforms lacking trustworthy access.
- If a later relevant publication error or specific unresolved indication is detected, reopen the same review (new version, only affected records), notify Event Coordination once, and escalate truly critical imminent issues to Leadership per existing policy. Harmless cosmetic edits need not reopen it.

## 8. Reports, lifecycle, auditing and reliability

- Monthly and annual private statistics broken down by Kings, Partner, External, accepted, scheduled, completed, cancelled, pending, exceptions, reviewed/unresolved conflicts and actual verified participation **only where independently evidenced**.
- Monthly internal report: **2nd day of following month, 09:00 UTC**. Annual: **3 January, 09:00 UTC** with concise Annual Management Summary and prior-year comparisons.
- Event Management/CEO may export protected PDF/CSV for arbitrary periods. Do not claim a report fully verified without fresh, reconciled source data.
- Late historic edits cause report re-versioning: prior **Superseded**, new verified **Current**, deduplicated leadership/CEO updates. Keep versions **24 months from creation**, then delete as required; anonymized aggregate metrics may outlive personal records.
- Private Activity Log on individual event and central dashboard: who/system, when, before/after and linked event; relevant changes and human approvals; no verbose forced justification. Personal entries generally retained **24 months** then deleted; deletions must propagate to related history/backups in accordance with privacy policy.
- Encrypted **daily private backup** and before major changes, keep **90 days**. Check encryption/completeness/integrity on every run; perform a **monthly isolated restore test**. No secret exposure, no unapproved production restore.
- On failed sync: immediately mark **Data Outdated** with the actual last successful sync; never assert verified free spots. After two consecutive failed 15-minute cycles, alert Development+Event Management+CEO through authorized private paths; security/integrity-critical issues alert immediately. Recovery only after full reconciliation, with single protected recovery notice and deduplicated catch-up alerts.
- Official statuses, all exception approvals, staff privacy, current partner equality and Real Life First remain authoritative.
- **No new Discord channels** except the agreed protected capacity channel; no uncontrolled Discord PINGs, unknown role IDs, automatic public announcements or forced historical migrations.

## 9. Technical integration map (verified repository audit, 2026-11-24)

**Repository:** \`Stinkesocke107/kings-logistics-automation\`, default branch \`main\`, public source code. Do not put private member IDs, staff names, task details, protected report snapshots or secrets in public Git-tracked files.

- \`convoy-checker.js\`: reads Convoy Center forum threads, extracts staff status/fields.
- \`convoy-truckersmp-sync.js\` and \`convoy-finalize.js\`: official-source enrichment and controlled finalization.
- \`convoy-overview.js\`, \`convoy-overview-discord.js\`: pre-existing summary and publication, **not** a new capacity calendar.
- \`convoy-planning-limits.js\` currently contains **old advisory-only** \`externalMonthly:20\`, \`externalDaily:2\`, \`partnerDaily:3\`, departure 120 minutes. It also uses parsed Event Date and lacks the agreed separate partner-month limit and combined daily cap. It must **not** be mislabeled as compliant.
- \`convoy-planning-alerts.js\` sends historical advisory warnings to Event Leadership, NOT yet the new protected capacity channel.
- \`.github/workflows/convoy-checker.yml\` is scheduled every ~15 minutes, can be delayed. Existing production path and safety rules must remain intact until isolated tests and explicit rollout gates pass.
- Existing tests include \`tests/convoy-planning-limits.test.cjs\` and \`tests/convoy-pipeline.test.cjs\`; old tests correctly describe existing old behavior, **not** the new policy. Keep them until planned migration.
- Prior repository privacy audit identifies confidential event/staff data risks in publicly committed state. New capacity event details, staff assignments, approvals, publication evidence and reports must have **a private encrypted storage boundary**. Never commit raw private state to this public repository.

### Proposed production architecture

1. **Read-only normalized event adapter** from verified Convoy Center state + official external evidence, with clear source provenance, explicit approval and conflicts.
2. **Pure capacity policy engine** (no Discord writes), with UTC dates, explicit accepted statuses, secure manual exception flags, uncertainty fail-closed, deduplication and priority/time warnings.
3. **Private encrypted state / audit / backup layer**, separately access-controlled Discord interactions; no raw personal data in public Git or CI artifacts.
4. **Dashboard renderer and authorized commands** in protected capacity channel with existing Convoy Center deep links.
5. **Tasks / templates / milestones** built on existing event identities; data minimization and deduplication.
6. **Deliverable/publication layer** on references + manual authorized approval, not autonomous publication.
7. **Versioned statistics and verified reporting** on reconciled sources.

## 10. Delivery phases and acceptance gates

| Phase | Scope | Blocking acceptance gates |
|---|---|---|
| 0 | This masterplan + repo baseline/audit | No live side effects; policy discrepancies documented |
| 1 | Isolated, tested capacity policy core | Mixed daily cap 2, both monthly 20, UTC departure, accepted-only, duplicates, uncertain data, time warnings, manual exceptions |
| 2 | Read-only event adapter, historical reconciliation | Correct source precedence, all legacy/archived events reviewed, no invented staff decisions, no private data leakage |
| 3 | Protected dashboard and Discord permission checks | Channel access verified; safe 15-min refresh, no false free availability, working buttons and private errors |
| 4 | Alerts, conflict decisions, tasks, checklists and milestones | Dedup/recovery/Real Life First, human gates, no duplicate tasks or unauthorized updates |
| 5 | Department requests, deliverables, publication tracking | Rights checks on every interaction, source and version evidence, no autonomous publication |
| 6 | Reports, retention, backups, chaos/recovery, rollout | E2E integration + private backup restore test + permission audit + live proofs |

**Operational boundaries:** Initial feature branch changes must not modify running workflows, Discord messages, stored personal state, existing limits used by live alerts, or historical event data. Production activation requires explicit owner review, regression tests and observed genuine live verification; an offline green test suite alone is not production proof.

## 11. Non-decision technical questions to resolve during implementation

These are *implementation evidence*, not a request to reopen product decisions:

- Find the exact **authorized Discord roles** for Event Coordination, Event Leadership and CEO; validate actual private channel permissions before first write.
- Determine which existing records have reliable **UTC departure**, meeting and end timestamps, and which old cases are only advisory or ambiguous.
- Verify whether HaulMP/source coverage and actual planned end times can be obtained via an authorized connector. Never hardcode or guess unsupported sources.
- Choose a private encrypted event-state/backup store that genuinely supports required retention, revisions, restoration and person-specific erasure; don't assume public Git Actions artifacts satisfy it.
- Confirm Discord component interaction hosting, token scopes, timeouts, deduplication and rate limits before launching interactive controls.
- Define acceptance evidence for reported actual participation separately from completed planning status.

**Release posture: DESIGN CONFIRMED / IMPLEMENTATION IN PROGRESS / LIVE NOT ENABLED.**


## Owner update – Hosting constraint (25 November 2026)

The Kings CEO cannot run or host a 24/7 bot server. **GitHub Actions is the required first-choice runtime** for Kings Event Capacity. No independently paid VPS/hosted Discord Gateway is a release prerequisite for scheduled read-only channel summaries, outgoing reminders, periodic source verification or report generation.

The existing Kings Convoy Checker scheduled GitHub workflow is reused via a **default-off optional Event Capacity step**, avoiding duplicate schedules and keeping system workflow inventory stable. It runs only on main after reviewed release and explicit GitHub repository-variable opt-in. The private Discord dashboard uses the Bot REST API to edit one preexisting bot-owned message in the restricted channel, never a public post.

**Important Discord limitation:** real-time application slash commands, dropdowns, modals and interaction callbacks require an always-running Gateway or reachable HTTPS interaction endpoint. GitHub Actions cannot itself receive those interaction events. An unhosted alternative is scheduled polling of carefully verified private Discord staff text commands and posting delayed replies; this is separately gated and does not yet implement mutating management commands.

The first Github-only status preview deliberately shows **Needs Verification** or **Data Outdated**, without certified free slots, until real approved classifications, accepted status history and signed decisions can be reconciled using a durable GitHub/Discord-compatible private storage design. Standalone SQLite on an ephemeral GitHub runner is not persistent. Do not commit plaintext staff/organizer/acceptance data to this public source repository.

Implementation and rollout details: docs/KINGS-EVENT-CAPACITY-GITHUB-ONLY-OPERATIONS-2026-11-25.md. Earlier private-host architecture is optional research/prototype for features needing stronger state, not a mandatory separate server for routine GitHub-only operations.
