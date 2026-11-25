# Kings Event Capacity — Authenticated historical source gateway, owner receipts and Workboard snapshot (DRAFT)

**25 November 2026 — NOT DEPLOYED.** Work remains exclusively in Draft PR #143; no private repo was provisioned or modified, no GitHub Actions workflow was dispatched, and no production Discord/event/Staff changes were made. Existing main Convoy Checker remains untouched.

## A. Double-read authenticated historical cross-check

Module: `event-capacity-historical-authenticated-crosscheck.js`.

The previous pure signed-history discrepancy checker accepted three inputs supplied by its caller. The new **development-only read-only gateway** composes the existing fixed public Kings GitHub Actions source authenticator, the existing owner-pinned private decision-ledger contract, and the existing read-only private historical encrypted GitHub archive reader. It fetches the private ledger and historical signed archive, obtains the validated current scheduled Convoy Checker report, computes discrepancy/HMAC task summaries, then **re-reads all three** and requires exact unchanged source content, ledger state/checkpoint and history data/index fingerprint.

It uses the old `reconcileSignedHistoricalSource` to flag missing archived events, unexpected current accepted events, duplicate IDs, contradictory current statuses/categories/departure dates, and legacy calendar gaps. **Completed without a historical signed complete transition now has a separate required human review reason.** This is NOT evidence of attendance and it does not free a slot.

The exported `createStableHistoricalCrosscheck` is intentionally composable with fake providers **for offline tests only** and returns `sourceAuthenticationEstablishedByThisComposer:false`. The concrete `createGithubOnlyAuthenticatedHistoricalCrosscheck` instead instantiates the fixed authenticated GitHub reader and the owner-signed historical archive GitHub reader. It reports `currentGithubSourceAuthenticatedByGateway:true` and `historicalArchivePrivateReaderVerified:true` only after that full read contract succeeds. The owner-pinned ledger supplied by the caller remains an externally enforced contract, not independently provable from a flag.

**All results remain `historicalCoverageCertified:false`, `independentLatestOwnerHighwaterVerified:false` and `freeSlotsCertified:false`.** A successful double read only limits an observable change/race during these requests; it is **not atomic** across GitHub repositories and does not authenticate events missing from current artifacts. Credentials and private Event data must never enter the public Git repository or CI logs.

## B. Signed historical owner receipt revision inspection

Module: `event-capacity-historical-owner-receipt-audit.js`.

A new offline no-I/O inspector validates a previously verified owner-signed historical journal, then checks a bounded ordered sequence of **offline Ed25519 owner-signed private archive checkpoint receipts**. Each receipt's scope, signature, revision, expected historical entry tip, and issue time are checked. Missing intermediate receipts (up to first 100 revision positions in an internal report), duplicate/out-of-order revisions, fabricated tips, future issue dates and conflicting owner key or scope cause a rejection or an explicit gap.

It can compare the newest supplied signed receipt against a separately **supplied** expected checkpoint. This does not prove the checkpoint is truly from independent custody or that another newer revision exists: the output deliberately says `externalOwnerReceiptCustodyAuthenticated:false`, `latestIndependentOwnerHighwaterVerified:false`, `fullHistoricalSourceCoverageVerified:false`, `freeSlotsCertified:false` regardless of apparent receipt continuity. **The Ed25519 private key is not used in this inspector.**

## C. Stable private Workboard review snapshot

Module: `event-capacity-historical-review-workboard-bundle.js`.

A final read-only bundler reads the private workboard state, obtains a historical issue report from the supplied cross-check reader, then re-reads the workboard. A changed revision OR changed task content at the same revision aborts the entire proposal. If stable, it runs the existing strict `proposeHistoricalWorkboardTasks`, which produces generic HMAC-only private task suggestions, never creates an executable workboard transaction and does not automatically reopen Done tasks.

It has **no authenticated Discord actor or private workboard storage by itself**; the caller must later verify the source, effective Staff/Leadership role, event evidence, workboard revision, private storage and human approval before any actual task could be committed. Its flags explicitly state `privateWorkboardStorageAuthenticatedByThisBundle:false`, `staffTasksCreated:0`, `commandsReadyToExecute:false`, `historicalCoverageCertified:false`, `freeSlotsCertified:false`.

## Verification

Three modules and focused tests:
- `tests/event-capacity-historical-authenticated-crosscheck.test.cjs`: consistent double reads, changed source run/status, ledger revision and checkpoint races, archive swap/forgery, missing source history, generic error redaction and constructor permission refusal.
- `tests/event-capacity-historical-owner-receipt-audit.test.cjs`: signed revision continuity, missing/latest receipts, old or forged independent checkpoint, reordered and future receipts, scope/signature mismatch, tampered journal and no exposed Event IDs.
- `tests/event-capacity-historical-review-workboard-bundle.test.cjs`: stable private proposals, done-task dedupe, concurrent workboard changes, forged completeness, scope mismatch and non-leaking failure.
- Existing `tests/event-capacity-historical-source-crosscheck.test.cjs` adds a regression for current Completed status lacking historical signed completion.
- Existing live-workflow gating test confirms all modules remain isolated from `scripts/event-capacity-github-actions.js` and the live `convoy-checker.yml`.

**Do not claim latest GitHub CI passed without a green test for the exact current PR head.** Tests with synthetic private source fixtures are not a real private GitHub E2E or complete historical source attestation.

## Still required for actual release

- Real complete authenticated Convoy Center history (past deleted/archived records, staff acceptance/cancellation/rescheduling proofs, 24-month temporal coverage and source identity reconciliation).
- Provisioned permission-separated private history data, decision/witness and independently controlled offsite backup repositories with narrowly scoped secrets.
- Durable monotonic external owner receipt custody and recovery operator approval; verified independent retention enforcement and genuine isolated host restore.
- Private Workboard transaction gateway with effective Discord roles and private-channel permission proof on every real Staff operation.
- Full same-HEAD repository CI, live-like read-only privacy E2E, security review and explicit CEO activation approval. No `capacity_preview` manual dispatch requested now.

**This draft neither certifies capacity nor activates a bot, command or production workflow.**
