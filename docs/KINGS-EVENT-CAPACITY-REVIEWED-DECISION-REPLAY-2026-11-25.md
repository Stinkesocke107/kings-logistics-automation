# Kings Event Capacity — Durable two-person review replay protection

**Date:** 25 November 2026
**Status:** Draft PR #143 — isolated code and synthetic tests only; not enabled in the GitHub worker.
**Execution model:** existing Kings Convoy Checker on GitHub Actions, with no rented VPS, long-running bot or additional schedule.

## New durable audit protection

The existing private versioned Kings Event Capacity ledger now accepts an **optional, strictly validated two-person review proof** for category, departure and planned-end decisions. The proof is encrypted with the rest of the ledger using AES-256-GCM before the separate private GitHub data repository receives any bytes.

For a reviewed entry, its audit record stores:
- Original Discord Staff evidence-message ID.
- Separate reviewer-confirmation message ID.
- Submitter and reviewer Discord IDs; these must differ.
- Verified Kings Convoy Checker run and attempt.
- SHA-256 of the checked source report package.
- Exact verification time, action, Event reference and expected ledger revision.
- Reviewer must have current Event Leadership or CEO authorization as derived by a trusted Discord guild/member checker.

The ledger **rejects reused evidence-message IDs and reused reviewer-message IDs**, even if a later caller changes the ledger revision, Event ID or confirmation message. It rejects a forged Discord-style evidence reference without a structured proof. Both initial writes and read-back validation enforce these rules. A corrupt stored ledger with duplicated review proofs is rejected after decrypting, not quietly repaired.

Existing legacy internal decisions continue to read normally; they are not silently relabeled as two-person-reviewed decisions. Quota exceptions retain the separate Event Management or CEO approval route and are **not authorized by the current review-proof grammar**.

## Non-mutating integration staging

Module: event-capacity-reviewed-staging.js.

1. Read the owner-pinned, encrypted ledger using its protected read-only interface.
2. Read a fresh, **authenticated** Convoy Checker source through a trusted first-party callback. Reject a missing/ambiguous Event ID, source conflict, expired report or mismatched category/time.
3. Re-verify the two-person private Discord review through the existing guild/channel/role-checked message reader. Retrieve both original messages and current membership; submitter cannot review their own evidence.
4. Re-fetch the source **again** and re-read the owner-pinned ledger. If either changes mid-review, fail closed rather than preparing a mixed-version command.
5. Only in memory, construct the exact review proof and run the existing decision-ledger validator. Return **ReadyForOwnerControlledCommit, readOnly:true, decisionCommitted:false, availabilityCertified:false**. Do not write the ledger or publish verified free slots.

**Trust boundary:** The injected readVerifiedSource callback must itself use the authenticated GitHub source/artifact reader with strict provenance; a caller-provided boolean like sourceVerified:true is never authorization. This staging library, if called using a mocked/untrusted callback, is NOT a trusted commit service. The actual GitHub workflow does not yet call it.

## Tests

- tests/event-capacity-reviewed-ledger-replay.test.cjs: reviewed-proof encryption, persistence after sealing/unsealing across fresh process state, duplicate source evidence and reviewer confirmations, forged proof, wrong source digest/run/age, missing leadership and legacy-history compatibility.
- tests/event-capacity-reviewed-staging.test.cjs: authenticated-source fixture, exact two-human message challenge, current Discord roles, pinned ledger, source and ledger changes during review, mismatch/unknown source and no writes.

## Remaining release blockers

- Securely create the two private repositories and configure access-limited different GitHub tokens, encryption secrets and signing keys.
- Implement independently retained offline owner highwater receipt with a practical custody/signing/rotation procedure; **never place its private signing key inside GitHub Actions**.
- Implement an explicitly authorized **durable transaction writer** with full current Discord source verification, optimistic concurrency, strict Event-state reconciliation and recorded owner receipt updates; do not wire unreviewed text commands directly into private ledger commits.
- Add protected partitioned long-term audit and 90-day independent encrypted backups with recovery exercises. One encrypted GitHub Contents file has a size cap and is not the final 24-month archival solution.
- Test with genuine private Discord channel, roles, real source history and explicit CEO release approval.
- Delayed GitHub Actions polling is not a real-time slash-command Gateway. No additional bot hosting has been introduced.

**No new event acceptance, exception, Discord publication, real staff approval or deployment occurred in this draft.**
