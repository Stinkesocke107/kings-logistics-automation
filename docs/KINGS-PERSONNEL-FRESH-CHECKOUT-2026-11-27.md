# Kings protected Driver, HR, Staff — queued event SHA / same-file conflict hardening

**27 Nov 2026.** Technical repair; no new personnel decision or automated data overwrite.

## Real observed failures and cause

Multiple `workflow_dispatch` jobs were queued close together on the same GitHub `main` event SHA. A preceding run committed genuine current state to `main`. A later queued job was still checking out its **old trigger commit**, recalculating the **same state files** and then failed safe-push rebase with a protected JSON content conflict:

- [Driver Management #45926173839](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45926173839), despite the previous independent completed Driver Management success #45926172196: conflict in Driver encrypted state, summary, LOA and namespace-scoped ETS2Map API-health.
- [Staff Management #45926178360](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45926178360), after #45926175718 success: conflicting Staff public updates state and summary.
- [HR Leadership #45926172021](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45926172021), after #45926168576 success: conflicting encrypted HR probation state.

This is **not** evidence that the Git rebase guard is broken: refusing to overwrite a now-authoritative source is the correct behavior. The action checkout without `ref:` used the stale trigger SHA even when execution began after earlier runs had committed.

## Fix

All three existing workflows now specify `actions/checkout.with.ref: main` while retaining `fetch-depth: 0`, `github.ref == refs/heads/main`, workflow-level `cancel-in-progress: false`, the existing producer logic, the protected `git-safe-push.sh` fail-closed rebase, and their private audit safeguards.

This resolves **one known source** of same-file conflicts: starting a queued producer from yesterday's/stale trigger rather than main's latest head at its checkout time. It **does not guarantee** conflict-free operation during a long API call if another workflow changes the exact same protected source later. Such genuine races must still stop without discarding HR decisions, LOA commands, source observations or Staff changes. An operator can start a subsequent fresh production run once the state conflict has been assessed.

## Acceptance

1. Full offline CI including new checks for each fresh-main checkout / no force-push / fail-closed safeguards.
2. After merge, separately inspect genuine scheduled Driver, Staff and HR runs, their producer stage, and successful state push. A run with no data changes is not a full join/LOA/promotion proof.
3. Test a genuine future authorized join/leave, LOA/return, HR probation and Staff personnel event only with correct real source/authority and private approvals; never synthesize actions for a technical test.
4. Continue monitoring external ETS2Map / map-live original-provider outage. Unknown online presence remains **unknown**, not zero. Current critical Core E2E and Final Freeze remain OPEN.

**Scope:** exactly 3 existing workflow checkout configurations, one regression test, and documentation; no new workflow, secret, member action, roles, event bookings or outbound messages.
