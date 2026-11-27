# Kings Logistics — Event Leadership Discord embed-size hardening

**27 November 2026 — technical patch, not Event/CEO sign-off.**

## Real observed problem

The consolidated Leadership dashboard run on main, [run 45926182626](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45926182626), successfully PATCHed Driver, HR and Staff, then Discord rejected the following PATCH with HTTP 400. The original failure body is intentionally not logged because it can contain private information. The precise remote validation field is therefore not independently known; an oversized Event embed is a plausible cause, not a proven diagnosis.

## Mitigation

- The Event Leadership dashboard now enforces Discord embed limits before POST/PATCH: at most 25 fields, 256 characters per field name, 1,024 per field value, and 6,000 characters in the total embed payload (also title, description and footer limits).
- If the **Event** embed is too large, only preselected **secondary and advisory** sections are replaced with shorter, explicit caution summaries. Protected `Manual Staff Progress`, `Private Review Codes` and `Invitation Tracker — Source Review` must remain byte-identical, to preserve original-source/readback comparison and actionable private review codes.
- Source history gaps, absence of original approvals, and absence of certified available slots must remain explicitly clear in compacted secondary sections. No source becomes a fabricated zero, and no Staff decision, slot or invitation is created.
- Oversize protected evidence, unknown invalid content, duplicate field count and all other invalid shapes **fail closed before any Discord write**, instead of generating an opaque rejected API PATCH. The five-dashboard architecture and existing 46 GitHub workflows are unchanged.

## Acceptance

1. Synthetic regression tests cover ordinary, oversized, malformed and protected fields; full offline CI must succeed before merge.
2. Only after code review, inspect an **actual authorized** consolidated Leadership dashboard run on `main`; require all five POST/PATCH operations and independent GET-only stored-message verification. An HTTP 400 after this fix means the cause must be investigated further rather than claiming resolution.
3. Event #18 authentic Staff command, original 24-month History/Invitation checks, source gaps, disabled Operations Notifications, and final CEO signoff remain separate gates.

**Scope:** fail-closed Discord embed formatting only; no credentials, automatic role changes, personal Event decisions or destructive recovery.
