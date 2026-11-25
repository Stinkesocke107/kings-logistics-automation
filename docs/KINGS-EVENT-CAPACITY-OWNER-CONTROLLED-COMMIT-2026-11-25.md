# Kings Event Capacity — Owner-Controlled Single Decision Commit (Draft)

**Development:** 25 November 2026. **Status:** NOT DEPLOYED, unmerged Draft PR #143.
**Runtime:** existing GitHub Actions Kings Convoy Checker. **No separate bot server**.

## What this isolated library does

The new \`event-capacity-owner-controlled-commit.js\` connects the existing non-mutating Staff proof stager, the offline owner-signed highwater receipt, and the owner-pinned encrypted private GitHub decision vault into a **strictly bounded ONE-decision commit path**.

It does **not** run automatically, does **not** parse arbitrary Discord messages as authorizations, does **not** approve Convoy Center attendance/status, and does **not** grant quota exceptions.

### Offline permit and online check

1. An independently verified Kings Convoy Checker source, current Discord role/author messages and a previously owner-pinned private ledger are reviewed via \`stageReviewedDecision\`. A valid stage has \`readOnly:true\`, \`decisionCommitted:false\` and a unique signed-review evidence pair; it is NOT yet an approval.
2. The CEO separately examines the exact prepared decision and creates a **short-lived Ed25519-signed OWNER PERMIT**, **offline**, bound to: guild/forum, encrypted ledger checkpoint revision and digest, Event reference, category/departure/end action and value, original/reviewer evidence IDs, submitter and reviewer, exact Convoy Checker run/attempt/source digest, unique 128-bit nonce and 15-minute maximum validity.
3. The offline private signing key **NEVER enters GitHub Actions, the public/private GitHub repositories, Discord or the bot**. The runner only receives the signed permit, the independently retained owner receipt and the PUBLIC verification key.
4. The writer verifies both signatures and expiry, current exact owner-pinned ledger state, recent Convoy Checker source, current private Discord permissions and BOTH Staff identities. A different current Event Leadership or CEO reviewer remains mandatory; no self-review.
5. The source and owner-pinned ledger are reviewed **again** immediately before the commit, and the signed permit must still match the exact decision. Mismatch or withdrawn Staff permission fails closed.
6. Only then does the underlying private vault perform one optimistic GitHub Contents SHA conditional write, followed by a separately credentialed signed checkpoint update. No blind retry on ambiguous GitHub failures. The returned state is \`StoredPendingOwnerResign\` and \`availabilityCertified:false\`.
7. The owner must independently sign, verify and **retain the NEW highwater receipt** before any further trusted read/write. The old receipt is unusable for a second decision. This is an intentional manual control in the no-self-hosting architecture.

A signed permit is **one decision only**. It does not authorize any additional categories, dates, exception flags, role changes or other events. A replay of the original source evidence or reviewer Discord message is rejected by the encrypted ledger, regardless of the next revision.

## Offline tests

\`tests/event-capacity-owner-controlled-commit.test.cjs\` simulates:
- A valid reviewer-confirmed decision with a separate owner permit recorded exactly once.
- Replaying the same signed permit with an outdated owner checkpoint.
- Wrong or forged owner signature, scope, Event category, source digest and checkpoint.
- Expired/future permit; oversized validity window; malformed nonce.
- Reviewer role withdrawal between permit signing and commit.
- Source report modification and owner-pinned ledger changes during the processing window.
- Ambiguous private GitHub commit acknowledgement (write may have occurred) must not trigger a blind retry.
- Absent permit always blocks the write.

All identities and events in tests are synthetic. No real private GitHub data repository, secrets, permissions, Discord message or live Convoy Center event is affected.

## Known gaps — NOT production ready

- The library uses an injected \`readVerifiedSource\` callback. A self-claimed \`sourceKind: authenticated-kings-convoy-checker\` flag is **not cryptographic proof**; the production caller MUST connect the existing independently authenticated GitHub scheduled run / archive reader. Only that trusted adapter can supply the source.
- Current two-private-GitHub-repository storage and witness are isolated prototypes; real repositories, separate fine-grained tokens, secrets, branch protection, credential scopes and offline receipt custody are NOT configured.
- The offline permit is a **human/manual prerequisite for each individual write**, not a fully automated acceptance pipeline. GitHub Actions can execute the approved task, but cannot possess the offline owner's signing key.
- Checking source/roles before a private GitHub CAS write does not create an atomic transaction across Discord, GitHub reports and separate repos. Source or roles can change immediately afterwards. A full production reconciliation and final operator review remain necessary.
- A GitHub Contents conflict or timeout can leave a private data commit without a witness, or both commits without a returned acknowledgement. It must trigger a private recovery investigation, not automatic retries.
- Durable 24-month history, 90-day encrypted backup, isolated restore exercises, historical event statuses and genuine verified free-slot computation remain unfinished.
- The new commit function is **NOT imported by the existing live or optional GitHub Actions worker**; no new scheduling, Discord controls, role or Event change is enabled.
- A successful offline test is **not** a permission audit of actual Discord or GitHub and not a production release.

**Owner release decision:** Keep PR #143 DRAFT and disabled until all security and operational gates are independently reviewed. The architecture continues to require **no self-hosted bot server**.
