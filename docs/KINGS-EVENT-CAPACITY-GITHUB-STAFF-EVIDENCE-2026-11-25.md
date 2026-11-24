# Kings Event Capacity — GitHub-only Staff Evidence Inbox (Draft)

**Date:** 25 November 2026
**Scope:** Draft PR #143, existing GitHub-hosted Kings Convoy Checker workflow. No VPS, permanent bot server or second cron needed.

## Purpose

Inspect recent Staff evidence submissions from the restricted private Discord Event Capacity channel and compare them against an **authenticated, current and reconciled** Kings Convoy Checker source.

A Staff message—even from a currently verified Event Coordination member—is **a submission for human review, not a final approved Kings decision**. No staff text becomes an accepted Convoy, quota exception, published announcement, verified attendance, cancellation or task completion.

## Strict read-only message forms

- !capacity evidence event:20270 category kings
- !capacity evidence event:20270 category partner
- !capacity evidence event:20270 category external
- !capacity evidence event:20270 departure 2027-03-21T16:00:00Z
- !capacity evidence thread:777777777777777777 end 2027-03-21T19:00:00Z

These are synthetic examples. Real IDs must uniquely refer to actual verified Convoy Center Event IDs or source-thread IDs. Times must be exact UTC.

## Existing GitHub Actions integration

1. The source reader first checks a successful scheduled main-branch Convoy Checker run, authenticates its artifact ZIP, matches exact Kings Guild/Forum, verifies freshness and reconciles source inventories.
2. Only with the additional explicit variable **KINGS_EVENT_CAPACITY_EVIDENCE_ENABLED=true**, the optional inspector receives the authenticated report and overview **in memory**. It never copies event source, Staff names or credentials to the public Git repository.
3. The inspector checks current private Discord guild/channel permissions and all role definitions. An unrelated Administrator bypass blocks processing.
4. It examines only up to 99 recent channel messages; a full 100-item page fails closed because history coverage is unknown. Only unedited human messages from the prior 35 minutes are eligible.
5. Before considering a proposal it re-fetches the original text and checks its author against Discord's **current** guild-member roles. The source Event ID or thread must match uniquely in the authoritative Convoy Center source.
6. Conflicts, missing source events, differing category/departure claims and competing proposals remain unresolved. The protected dashboard may show **only aggregate review counts** and the warning that no submissions are approvals.

The inspector never writes Discord messages, mutates the ledger or certifies free capacity. The optional private dashboard update is governed independently by the main Event Capacity enable variable.

## Distinct controls

- KINGS_EVENT_CAPACITY_ENABLED — main private dashboard publication; default disabled.
- KINGS_EVENT_CAPACITY_COMMANDS_ENABLED — prior read-only Staff replies; default disabled.
- KINGS_EVENT_CAPACITY_EVIDENCE_ENABLED — this new source-bound evidence review; default disabled.

All require the existing approved private channel, exact role IDs, current Discord permission audit and explicit owner deployment approval. GitHub Actions performs only scheduled outgoing Discord REST operations, not native instant slash command interactions.

## Important remaining gates

- **No durable audit:** 99 Discord messages and a 35-minute window are a short-lived inbox only. Busy channels, schedule delays, edits or deleted messages can lose evidence; no claim of a 24-month permanent archive or exactly-once accounting.
- **No historical acceptance proof:** official partnerships, old statuses, exceptions, planned ends and actual Kings convoy attendance must be reconciled separately. No free slot is confirmed by a Staff evidence submission.
- **No live authorization:** no real Discord role/channel IDs have been validated and no production event classification was updated.
- **No real bot hosting:** the design deliberately runs on the existing GitHub-hosted Convoy Checker runner.
- **No private plaintext in public CI:** user IDs, raw messages, event refs, internal case notes or decisions are not printed or committed.
- **Message Content:** Discord permission/privileged intent for reading member message bodies must be available and approved if needed. Blank human message bodies (which may indicate missing Message Content access) fail closed as an unavailable evidence inbox, not a fabricated zero-review result.
- **Actual decision promotion** requires independent durable event-source binding, explicit final human authorization, an audited revisioned private record, backup/restore verification and CEO launch approval.

Files: event-capacity-github-decision-evidence.js and tests/event-capacity-github-decision-evidence.test.cjs; read-only integration via event-capacity-github-only.js and scripts/event-capacity-github-actions.js.

**Status:** code in unmerged Draft PR #143. Existing production Convoy Checker and Discord remain unchanged.
