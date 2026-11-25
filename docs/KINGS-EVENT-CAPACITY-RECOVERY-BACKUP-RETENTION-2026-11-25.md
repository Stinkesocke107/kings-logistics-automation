# Kings Event Capacity — ambiguous commit recovery, offsite backup & retention review (DRAFT)

**25 November 2026. OFFLINE development only.** PR #143 remains Draft and unmerged. No real private archive storage, offsite bucket, GitHub secrets, production runner, Discord channel, Convoy Center source or signed owner receipts have been provisioned or altered.

## 1. Read-only reconciliation after a risky GitHub commit

**Module:** `event-capacity-historical-github-recovery.js`

A GitHub Contents CAS write can have an ambiguous result: GitHub may have committed the new manifest even if the request timed out or the response returned a server error. An automatic retry in that situation could overwrite or duplicate historical decisions.

The new read-only inspector accepts the old and new **independently retained Ed25519 owner-signed receipts**, validates them before network access, and attempts a full private read of the candidate, then the predecessor. Before recognizing the new candidate, its final signed historical transition must reference the **exact previous owner-signed history tip**, not merely an earlier revision number. Results are deliberately limited to:

- `CANDIDATE_ARCHIVED_OWNER_HIGHWATER_PENDING`: candidate exists and was cryptographically verified. Independent operator highwater retention and review are still required.
- `PREVIOUS_ARCHIVE_OBSERVED_REVIEW_STAGED_SEGMENTS`: previous archive was verified. Candidate segments might have been staged, and manual review of the remote state is still required.
- `RECONCILIATION_REQUIRED`: neither claimed state could be verified; do not guess whether data is absent or whether GitHub is temporarily inaccessible.

**Every result is observational, read-only, and marked `humanReconciliationRequired:true` and `freeSlotsCertified:false`.** It never tries a write, clears orphan segments, advances the owner receipt, changes a Discord event, or automatically repairs a live failure. It is not a live operator runbook or a guaranteed monotonic storage authority.

## 2. Independent AES-256-GCM encrypted backup envelope

**Module:** `event-capacity-historical-offsite-backup.js`

The backup codec requires the independently owner-signed original historical archive checkpoint, verifies/decrypts the source archive, then encrypts a separate backup envelope using a different key derived for a domain-separated backup format. The restore-inspection path checks the external expected owner receipt, ciphertext digest and GCM authentication, scoped guild/forum, UTC date, 90-day review date and original archive signatures.

The returned `isolatedRestoreVerified:true` means only that **this offline test was able to decrypt and verify the supplied archive bytes**. The result explicitly says `productionRestorePerformed:false` and `freeSlotsCertified:false`.

**This does NOT write the envelope to independent offsite storage, schedule daily backups, configure retention, rotate keys, or prove an isolated restore performed on another host or account.** Those steps remain release blockers. Backup and archive encryption keys must be independently controlled; the offline Ed25519 signing PRIVATE key must never run inside GitHub Actions.

## 3. 24-month history and 90-day backup review planning

**Module:** `event-capacity-historical-retention-plan.js`

The pure planner lists exactly the **current and preceding 23 UTC months** for historical review. It accepts bounded, strictly shaped *reported* review metadata without interpreting that metadata as proof of complete Convoy Center coverage.

For backups, it calculates their **90-day retention-review date**, shows recorded isolated monthly restores as *reported*, identifies legal holds, and flags records due for **manual review**. It does **not** delete a file or issue an automated retention approval, including when a backup is older than 90 days. It always returns `historyCompletenessCertified:false`, `monthlyRestoreIndependentProofVerified:false`, `retentionActionsAutomated:false`, `deletedBackups:0`, `freeSlotsCertified:false`.

This is NOT the 24-month actual private audit repository or the 90-day backup worker. Real authenticated source coverage, independent human review evidence, legal/privacy erasure propagation, offsite retention and third-party restore verification remain required.

## Verification

Three new development modules plus new regression tests and a workflow-isolation gate were added. The latest focused **local** test command was `node --test tests/*.test.cjs` in the standalone Kings development work directory containing the relevant checked-out archive/reader/writer/tracker modules and focused fixtures. It completed with **52 tests passed, zero failed** (Node 22). These include the older code and **26 new tests in this development batch** (9 recovery, 9 offsite backup, 8 retention-planner). GitHub's complete original repository regression suite and current-PR-head CI are **not** yet confirmed. The GitHub tests use a synthetic in-memory GitHub API, not an actual newly provisioned private repository.

## Blocking real deployment

1. Complete full current-head repository CI; investigate GitHub PR #143 merge conflicts and verify any required branch updates without touching production. Do **not** merge this Draft automatically.
2. Provision actual permission-separated private data, checkpoint/witness and **independent** offsite backup stores with separately scoped tokens and keys, after authorization.
3. Add a durable, tamper-resistant owner-controlled highwater service and independent receipt custody. Two GitHub repositories alone are not irrevocable rollback protection.
4. Add **real, authenticated, complete** Convoy Center history and Staff approvals; reconcile archived posts, cancellations and event identity. Signatures on a newly assembled journal do not prove source completeness.
5. Implement a daily private backup worker, actual 90-day retention and erasure controls, a tested monthly truly isolated recovery process and privacy/legal review.
6. Integrate verified private data into a restricted Staff capacity dashboard and end-to-end role verification while keeping the live map optional.
7. Run production-like safety and rollback tests and obtain **explicit CEO approval** before a release or Discord publication.

**No `capacity_preview` manual run, bot activation, Discord write, repo provisioning or public deployment was performed.**
