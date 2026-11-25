# Kings Event Calendar / History — live Leadership source bridge (25 November 2026)

## Purpose

The five fixed consolidated Leadership dashboards already exist. The Event dashboard previously called `readJson()` on an encrypted `data/event-leadership-report-state.json`. That returned a ciphertext container instead of Event records, leading to misleading empty-looking Event indicators. Daily Event Leadership reports were intentionally suppressed by `LEADERSHIP_CONSOLIDATED_ONLY=true`, so their old publication snapshot and change log also could not be assumed current.

This change fixes both source boundaries without creating a second dashboard or an Event Booking / Slot Management system.

## Actual flow

1. The existing daily/weekly/monthly Event Leadership workflow reads fresh Kings Convoy Center and Overview data in read-only mode.
2. `event-history-leadership-bridge.js` first validates snapshot generation times and reconciles the Center/Overview/Legacy inventories. If the source is inconsistent or stale, **no new observation** is recorded.
3. `event-leadership-observation.js` produces a **counts-only** source observation for the existing 12-month Calendar / 24-month History review. It includes an ISO observation timestamp, observed Center status counts, calendar warnings, historic source-coverage gaps and mandatory `historyVerified=false`, `staffApprovalsVerified=false`, `freeSlotsCertified=false`, `bookingsCreated=0`.
4. The existing Event Leadership report state saves this observation **inside the existing AES-256-GCM container**, even if a legacy Discord message is deliberately suppressed. This records an observed source, **not a published report**: no existing publication keys, historical snapshots, change logs, ticket states, roles, invites or Staff decisions are advanced.
5. `leadership-dashboard.js` decrypts that protected state with the existing configured `DRIVER_STATE_KEY` and validates the observation before displaying its aggregate in the **existing private Event Leadership dashboard**. The Management dashboard uses the same verified source to avoid treating encrypted or old state as live event counts.

## Fail-closed rules

- Source observations older than **36 hours**, generated in the future, outside source timestamp bounds, malformed, contradictory or missing remain `Unavailable`.
- Missing encrypted state is **not** interpreted as zero tracked Events. Invalid encryption or tampered ciphertext fails before publication.
- Old `lastSnapshot` data is never used for a new live Event count, even if it can be decrypted successfully.
- Historic source months with no claims are gaps needing review, **not proof that no Event took place**.
- Calendar figures are advisory source claims, **not** independently approved Events or certified available slots.
- No individual Event names, Discord IDs, Staff identities, invitations, original raw history or plaintext observation are written to the public repository or GitHub Actions logs.
- No new Discord message, role mutation, booking, partner invitation, staff approval or cancellation is created by this bridge.
- System #17 (Event Booking & Slot Management) remains explicitly out of scope.

## Production verification required

- Confirm the full isolated Node.js test suite is green on the PR.
- Confirm an actual **scheduled, non-preview** Event Leadership run can reconcile its source and save the encrypted observation.
- Confirm the subsequently refreshed consolidated Event and Management dashboard shows fresh advisory source counts, with no duplicate Discord message and no false publication keys.
- Full original 24-month Event History coverage, authorized Invitation Tracker sources and specific Calendar event details remain separate future requirements.
