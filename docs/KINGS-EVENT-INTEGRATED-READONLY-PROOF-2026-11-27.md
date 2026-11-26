# Kings Logistics — Combined Event source-to-Staff verification

**27 November 2026 — integrated read-only proof, not Event approval**

## Scope
One real source-only check joins existing Event systems **#12 Capacity**, **#14 History**, **#15 Invitation Tracker**, **#16 Calendar** and the **#18 Event Operations advisory Staff worklist**. Existing individual checks remain available; no new Booking/Slot Management #17 is created.

Start in GitHub Actions → **Kings Event Leadership Reports** → **Run workflow** → **integration-check**. The same isolated job runs on qualifying source-code pushes to `main`, using the existing protected tokens for **GET-only** Discord reads. It first builds fresh Convoy Center reports in local runner memory/files with Discord/Event writes disabled, then reads the private invitation forum with the approved optional tag-ID mapping. The probe compares source-level History/Calendar aggregates, Capacity thresholds, invitation anomalies and the corresponding human Staff worklist reason codes. Output to the public CI log is only a fixed code, never private Event titles, URLs, identities, counts, source IDs, tokens or message content.

Possible outcomes:
- `EVENT_SOURCE_TO_STAFF_TRIAGE_RECONCILED`: real original sources are currently readable and their *source claims* pass the combined, read-only validation. **Not** approval or original historical evidence.
- `INVITATION_TAG_SCHEMA_UNVERIFIED`: the invitation forum is readable but lifecycle tag mapping still needs manual confirmation. The check stays non-green.
- `SOURCE_UNVERIFIED`: source read, completeness, matching or worklist integrity could not be established; the check fails closed.

## Security and operational boundaries
The integration job has **contents: read**, no Git writes, no Discord sends, no Event/Slot booking and no staff role, personnel or approval changes. No automatic reclassification or invalid tag repair. In the invitation reader a reply must have a valid human Discord author ID and must not originate from a webhook; unverifiable formatted messages are counted as malformed for human review, rather than genuine VTC replies.

The first green result would **not** prove that the 24-month Event archive is complete, that a recorded acceptance is an authentic VTC response, or that a real later Staff command refreshed and was read back from Discord. These gates, recurring live stability, original decisions, Event-Team handover and CEO final acceptance remain open.

The numerical Capacity values in this check reflect the **existing implementation** (3 combined convoys per UTC day, 20 Partner and 20 External per UTC month, under-120-minute departure warning), **not a new CEO confirmation** of the separately open weekend/event policy question.
