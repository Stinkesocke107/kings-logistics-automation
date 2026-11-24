# Kings Event Capacity — Private Search and Saved Filters

**Implementation date:** 25 November 2026  
**Status:** isolated draft modules and signed *read-only* Discord command handler; no registered live slash command, private host, persisted saved filters or real Kings data.

## Private staff search — implemented in the draft

- \`event-capacity-search.js\` projects only normalized, separately attested Convoy Center events. It never publishes a message, assigns tasks, accepts an invitation or edits an event.
- Filter combinations: verified UTC \`dateFrom\`/\`dateTo\`, event category (Kings / Partner / External / Unverified), staff event status, data quality (Verified / Needs Verification / Data Conflict), conflict, approved quota exception and exact Event ID. All input is strictly bounded/validated; unknown filter keys fail closed.
- Sort options: upcoming UTC departure first, UTC date, verified category priority, or status. Past records remain searchable; default pagination **10 records per page**.
- Duplicate event identity is not counted as multiple accepted events in search; mark the single row \`Data Conflict\` and \`accepted:false\`. Missing identity is recorded as a source-uncertainty count, not invented.
- Pending and cancelled records remain searchable as planning data, with no quota consumption implied. Completed planning status never means attendance.
- Only fixed status/type labels, verified Discord timestamps and safe numeric Convoy Center thread links reach the synthesized private Discord embed. Never echo free-form descriptions, private evidence references, staff identities or untrusted organizer text.
- Search results **do not certify quota availability**. Only the core capacity engine may answer availability, and it must fail closed on source uncertainty.
- \`event-capacity-read-service.js\` adds the \`event-capacity search\` branch to the already signed, guild/channel/role-checked handler. It validates the option names and values **before** accessing private source data, then emits an ephemeral response with disabled mentions.
- Real Discord command schema registration and Discord interaction response hosting remain separate deployment gates.

### Limitations for accurate scope tracking

- Organizer-specific search and last-updated sorting require **new independently verified private provenance**. The current normalized adapter does not securely export either field; the search does not guess one from public TruckersMP host or free-form thread names. These filters are **not yet implemented**.
- Historical records with no confirmed UTC departure cannot be placed inside a date-bounded result without additional verification; identity-unknown records are flagged but cannot provide an Event-ID hit.
- Global source freshness and conflict uncertainty is retained. No confident free slots from a filtered view.
- Search is ephemeral read-only; it does not load stored personal filters from a live private database.

## Per-user saved filters — draft domain module

- \`event-capacity-saved-filters.js\` provides versioned private personal saved-filter decisions.
- Up to **5** named filter profiles per authorized Event Coordination / Event Leadership / CEO member.
- Mandatory independently verified gateway identity and roles for every read or mutation, author-only listing, revisions/CAS for conflicting updates, audit history and strict name/filter validation.
- User A cannot list or remove user B's private filter via this module, even if both are eligible staff. Nothing is shared publicly or by default.
- The module contains no actual persistence mechanism; production requires separate private, access-controlled **encrypted transactional saved-filter storage**, independently attested Discord membership and lawful retention/deletion management.

## Verification

Focused synthetic Node tests cover combinations, stale/duplicate source behavior, privacy, unauthorized/invalid command rejection, pagination, role verification and saved-filter ownership. The GitHub offline CI run at the current commit should be checked before reporting the whole branch as green.

## Still required for launch

A real protected host + workload authentication, independent checkpoint service, authorized source and event history reconciliation, private database for tasks/filters/audit, real Discord command registration and role/channel permissions, operational E2E/privacy tests, backup/restore evidence and explicit Kings CEO approval. **Do not merge PR #143 into main or run it against real Kings staff records until these gates pass.**


## Async anchored read integration regression

The signed private read-service provider now **awaits** the externally anchored store's asynchronous \`readLatest()\` call before allowing the snapshot into the command handler. This closes a mismatch between the original synchronous local SQLite prototype and the real external highwater wrapper's Promise-based API. Synthetic tests cover a valid asynchronous checkpoint, rejected asynchronous anchor errors with sanitized messages, and the complete encrypted SQLite → externally checked read → signed Discord \`event-capacity search\` path.

**Important:** These synthetic tests exercise the interface and enforce the gate, not real Discord roles, a deployed independent anchor or a live private host.
