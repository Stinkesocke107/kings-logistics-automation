# Kings Logistics — Event Systems #12/#14/#15/#16/#18: Live integration evidence

**Evidence date:** 27 November 2026 (UTC). **Evidence scope:** actual code/deployment and technical GET-only source-to-dashboard chain, **not** original Event decision / CEO system acceptance.

## Code deployment and automated verification

| Gate | Real evidence | Result and limitation |
|---|---|---|
| Combined code deployed | [PR #232](https://github.com/Stinkesocke107/kings-logistics-automation/pull/232), squash main commit `eb34093d0803ff4cc09bee20861528c58679b618` | Merged; 18 changed files covering Event Capacity, History, Invitation Tracker, Calendar, Staff journal, dashboard and the existing read-only integration workflow. #17 Booking/Slots remains excluded; 46 existing workflows unchanged. |
| Code/contract tests on main | [Kings Offline System Verification #45914805572](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45914805572) | Node 24 **838 tests passed, 0 failed, 0 skipped**. Synthetic and contract tests; not Staff E2E evidence. |
| Real Invitation Tracker source | [Event Leadership Reports #45914805638](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45914805638), `invitation_source_verify` job | Actual Discord GET read returned `READ_ONLY_SOURCE_VERIFIED`. Recorded invitation replies are claims, not independent attendance or original invitation-sending proof. |
| Real combined original-source → Staff triage | Same [Event Leadership Reports #45914805638](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45914805638), `event_integrated_source_verify` job | Actual safe log: `EVENT_SOURCE_TO_STAFF_TRIAGE_RECONCILED`. Technical source combination for #12/#14/#15/#16/#18; does not certify all individual historical records or Staff approval. |
| Encrypted source ↔ actual stored Event dashboard message | Same integrated job, and [Consolidated Dashboard #45914805579](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45914805579) | Both logged `Kings Event Staff review-to-dashboard: VERIFIED`. Independent bot-authored Discord message GET verifies private Staff Progress and Invitation field against saved encrypted source. The integrated job additionally uses strict fresh-source/verified-tag preflight. No new human Staff command was created by these GET reads. |

## Separately failing Core checks — do not mask

- [Core E2E #45914805656](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45914805656) remained **UNHEALTHY**: `ETS2Map` and `truckersmp-map-live` map source/circuit unavailable; map-dependent Live Tracker and Statistics source data stale or invalid, plus independent scheduling warnings. No Kings-online figures may be invented.
- [Leadership Dashboard Verification #45914805624](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45914805624) failed independent **public Live Tracker / Statistics / Central Overview publication content** read-back (4 of 7 contracts verified). The private Event dashboard proof passing does not automatically pass this separate public Core verification.

## Still-required authentic human / business acceptance

1. Event Coordination Lead reconciles the original 24-month Event History and every relevant Legacy hold, actual cancellations, approvals and attendance against authoritative records. Missing source months never equal zero actual Events.
2. Event Coordinators confirm each original Invitation Tracker forum event link and individual VTC reply provenance, missing/duplicate records and correct permission/owner handover. The read-only aggregate alone cannot prove an invitation was actually sent externally.
3. A **new genuine, authorized** human Event Staff review command occurs through the established private channel and is verified **end to end**: Discord author/current role, replay protection, encrypted journal commit, dashboard workflow dispatch, and actual stored Discord message after the new action; include retry/recovery and a before/after audit.
4. CEO decides final 3/day vs proposed Friday–Sunday 5/day, category-specific thresholds and departure spacing; existing warning calculations remain advisory and do not create or free bookings.
5. Event Coordination Lead completes the real operational handover; CEO separately signs off each Event system. **No false `COMPLETE` designation** from CI or static read-back alone. The separate map/Core provider and freeze blockers remain open.

**Precise status:** Technical Event code deployed and five-system read-only live integration VERIFIED; original full historical/Staff-decision/business acceptance NOT COMPLETE.
