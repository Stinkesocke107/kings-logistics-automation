# Kings Logistics — #18 Event Operations Manual Review Journal

**26 November 2026 | Addendum to existing Event Leadership / Event Operations**

## Scope and non-negotiable boundaries

This adds **human-recorded progress states** for the existing #12 Capacity, #13 Checker, #14 History, #15 Invitation Tracker, #16 Calendar and #18 Staff review findings. It is **not** a new Booking or Event approval system; #17 remains cancelled. Nothing in this journal automatically changes confirmed Events, invitations, roles, parking slots, dates, Staff assignments or source approval flags.

The original Event / VTC sources remain strictly **read-only**. A manual reviewer marking a source issue "checked" is **not independent proof** that a historic event was approved, attended, completed, cancelled, or released from a hold. Aggregate source conflicts remain displayed even after a check has been recorded.

## Workflow and permissions

The existing AES-256-GCM protected `data/event-leadership-report-state.json` is the **only** persistent review store (inside `operationReviews`); no new public task file, separate database or Discord message is created.

A repository owner must separately configure the private **GitHub Actions secret `KINGS_EVENT_REVIEW_OPERATORS`** with a comma-separated, explicitly authorized list of GitHub account usernames. No value or a missing account means **no manual journal write is allowed**. Staff operating this action must also have adequate GitHub Actions workflow permissions. GitHub identity, rerun identity and `main` workflow dispatch are checked before decrypting the file. Do **not** grant repository write access to ordinary Event Coordinators merely to use the system; this GitHub operator path can be restricted to already authorized technical/Event Coordination leads. Routine invitations remain independently handled by Event Coordinators through Discord.

The owner / authorized operator uses **Actions → Kings Event Operations — Manual Staff Review → Run workflow** on `main`. The reviewer selects the issue by an **opaque, short-lived code** displayed ONLY in the existing private `Event Leadership → Event Operations — Private Review Codes` dashboard field. The code hides the underlying review category, source count and historical month from public GitHub Actions input metadata:

1. Open the existing **private** Event Leadership dashboard and select the relevant source issue. Copy its neutral `KR…` review code; the private dashboard displays up to five immediately actionable issues, reserving one place for a historic month when available. The code is valid only for the **current UTC date** and the matching latest Event/Invitation source observations. A refreshed source or next UTC day requires a new code.
2. In GitHub Actions, enter **only** that opaque `review_token`. **Never enter the original UTC month, issue category, Event/Staff/VTC name, Discord link or evidence text into public GitHub Actions fields.** The backend resolves the token against fresh encrypted observations and refuses unknown, expired or source-stale codes.
3. Choose `start` → records **IN_REVIEW**; `block` → **NEEDS_EVIDENCE**; `record_check` (permitted only from current `IN_REVIEW`) → **STAFF_CHECK_RECORDED**; or `reopen` → **OPEN**.
4. For `record_check`, the reviewer must have checked an original record separately and choose the **kind** of original evidence (`ORIGINAL_DISCORD`, `ORIGINAL_EVENT_PAGE` or `STAFF_RECORD`) and explicitly enter `ORIGINAL_RECORDS_CHECKED`. No actual evidence URL, VTC, Discord user, Event ID, screenshot, original message or private text may be entered in GitHub Actions inputs. The source itself is not cryptographically verified by the journal.
5. The Actions job commits **only the re-encrypted existing Event Leadership state**, after validating the currently live source finding. It uses the existing protected safe-push script and the Event Leadership concurrency group to avoid competing state writes.

A missing/stale source, invalid or expired opaque review code, unapproved operator, invalid transition, or missing original-check confirmation refuses the write with the fixed public-safe result **MANUAL_REVIEW_NOT_SAVED**. Success emits only **MANUAL_REVIEW_JOURNAL_SAVED**; it never logs usernames, sources, exact counts, secrets or submitted values.

## Evidence integrity and lifecycle

- Every entry stores exactly a version, source-review category and UTC month or overall scope, source-claim fingerprint, actor GitHub username, status, selected *type* of evidence, created/updated timestamps and a bounded audit trail, **only inside encrypted state**.
- An audit is never silently deleted because a source count disappears. A previously checked source finding is no longer shown as an active conflict once no longer observed, but the journal retains the previous human action; the source disappearance does **not** become a confirmed staff cancellation or booking release.
- If the current issue count changes (even while the same issue category remains active), or a check is older than **seven days**, dashboard status changes to **RECHECK_REQUIRED**. The fingerprint only covers category/month and aggregate count; it is not a per-Event identity match. Human checking remains necessary.
- The existing fixed **Event Leadership** dashboard shows aggregate Staff progress and a separate **private** mapping of up to five currently actionable source review reasons to cryptographic opaque codes. **Management Leadership** gets the aggregate recorded-check count. No Staff usernames, links or exact Event identities appear in either.
- The Consolidated Leadership dashboard now also watches the encrypted Event state file on GitHub pushes, so a successful protected manual entry can refresh the existing one-message dashboard without creating a new publication. This does not bypass normal Discord read/write protections for that fixed dashboard.

## Acceptance and what remains

Green offline tests prove role authorization, read-only source matching, auditable transitions, expired/different-count recheck, strict journal schema, encrypted storage, and dashboard safety. **Production use requires the separate owner-configured `KINGS_EVENT_REVIEW_OPERATORS` GitHub Actions secret.** No owner or Staff review action should be described as having happened merely because the workflow was merged. An actual Discord-native Event Coordinator interface / original-evidence validation service is **not** created by this increment; it would require separately reviewed role checks and private source handling.

System #17 Event Booking & Slot Management stays excluded.
## Privacy hardening — public GitHub Actions metadata

GitHub Actions workflow dispatch inputs can be visible in a public repository's run history. Earlier code collected the source-review category and, for History, the exact UTC month in those inputs. That could expose private operational metadata even though the AES-GCM state and CI logs were protected. The current manual workflow **does not ask for those values**. It now accepts only the cryptographically opaque `KR` token and safe generic action/evidence-kind choices; the private Event Leadership dashboard contains the source-linked token mapping. Tokens are HMAC-SHA256-derived using the private state key, the active source timestamps, the issue fingerprint and current UTC date. A token cannot certify original historical Staff approvals or source completeness and cannot bypass the GitHub actor allowlist.
