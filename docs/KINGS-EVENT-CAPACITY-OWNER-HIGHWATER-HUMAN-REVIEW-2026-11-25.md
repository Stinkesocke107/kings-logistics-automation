# Kings Event Capacity — Offline Owner Highwater & Two-Person Review

**Development date:** 25 November 2026
**Status:** Draft PR #143, offline synthetic tests, NOT deployed.
**Execution:** Existing 15-minute GitHub-hosted Kings Convoy Checker, no self-hosted bot server.

## 1. Independently retained owner-signed highwater

The two-private-GitHub-repository checkpoint witness already implemented is tamper-evident but NOT immutable. Both GitHub histories can be maliciously reset together. This new draft adds a separate owner-retained highwater receipt:

- File: event-capacity-owner-highwater.js — Ed25519 digital signatures over an exact scope-bound revision, encrypted-ledger SHA-256 digest and UTC issuance time.
- The signing private key MUST stay OFFLINE with the Kings owner, outside all GitHub repos, GitHub Actions, Discord, bot secrets and service accounts. GitHub can use the corresponding PUBLIC verification key and a securely pinned signed receipt.
- Read guard denies a witness revision below the pinned receipt or different content digest at the same revision. A higher revision can be read for inspection but DOES NOT prove uninterrupted ancestry or justify accepting a new write.
- A new decision write must start at EXACTLY the owner-signed revision and digest. After one successful write, additional writes are blocked until the owner signs and retains an updated receipt.
- Changes in the external witness while reading fail closed.
- An owner-signed receipt establishes only a previously witnessed minimum state. Lost receipts or keys cannot be silently repaired by resetting the witness.

### Practical trade-off

No separate rented bot server is required, but owner-signed receipts demand a manual out-of-band signing and retention procedure. The code does NOT automatically provision an independent signer or secure offline location. This is a conservative pilot design, not fully automated or permanently rollback-proof historical authority.

The signing PRIVATE key must never enter the GitHub Actions runner. This module is not connected to production secrets, repositories or Discord, and this draft created no real private keys or owner receipts.

## 2. Independent Staff review candidate

File: event-capacity-human-review.js — read-only, two-person verification for authenticated private Discord evidence proposals.

- Only a uniquely source-matched Needs Human Review proposal from verified Kings Convoy Center reports qualifies. Unknown/conflicting events, duplicate identities, changed category/departure values and already accepted information must never auto-approve.
- Supported non-exception fields are category, UTC departure and planned end.
- The reviewer code is HMAC-bound to the original Discord message ID, submitter, event ID, exact field/value, checked source GitHub run ID, protected ledger revision and challenge time.
- A DIFFERENT person currently in Event Leadership or CEO must confirm using the exact text command:
  !capacity review MESSAGE_ID CODE
- Both original and review messages must be re-fetched, unedited and within the validity window. Current channel privacy and both members' current Discord roles must be checked independently at review time.
- Proof expires after 90 minutes, and changed source run/revision invalidates it.
- Success only emits a PRIVATE, in-memory, READ-ONLY HumanReviewVerified candidate (classification/departure/end) with decisionCommitted:false, availabilityCertified:false and ownerReceiptRequired:true.
- This is not the final approval/recording engine; no external quota exception, accepted Convoy, schedule change, role modification or publication is made.

### Important limitations

The GitHub Actions worker DOES NOT YET post review codes, poll review messages, or invoke real private vault decision commits. Enabling those actions requires a durable review inbox, source authentication, idempotency, owner-pinned highwater, verified current Discord roles, complete audit backups and explicit CEO authorization.

Event Management / CEO special quota exceptions remain a separate higher-privilege decision type and are not enabled by the draft review syntax.

## 3. Synthetic tests

- tests/event-capacity-owner-highwater.test.cjs: offline Ed25519 signature, tampering/wrong signer/scope, coordinated dual-repository rewind under signed floor, unexpected digest, one owner-authorized revision, read races and no unreviewed second write.
- tests/event-capacity-human-review.test.cjs: role separation, source/message/version challenge binding, revoked reviewer, source conflict, edited messages, unapproved Administrator channel bypass, old/replayed confirmation and read-only results.

**Production blockers:** two securely provisioned private GitHub repos and distinct restricted tokens, offline owner receipt custody, independent protected keys, live source reconciliation, durable final Staff approval receipts and 24-month audit storage, encrypted backups, actual Discord permissions tests and CEO release sign-off.

**PR #143 stays Draft and unmerged. No production changes, secrets or real Kings data.**
