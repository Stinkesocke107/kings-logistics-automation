# Kings Event Operations — GitHub Free Reminder Delivery Audit

**Status:** DRAFT / OFFLINE / READ-ONLY / NOT DEPLOYED  
**Date:** 25 November 2026  
**Systems:** #1 Core Scheduler, #2 Monitoring, #15 Invitation Tracker future handoff, #18 Event Operations / Workboard  
**Infrastructure:** GitHub Free Actions only; no hosting, VPS, paid storage or continuously running Discord Gateway.

## Why a receipt audit is required

GitHub Actions executes separate ephemeral jobs. A successful Actions job does **not** prove that a Discord REST call was actually delivered, that the intended member had current access, or that a protected revision survived a lost response.

The existing \`event-capacity-workboard.js\` produces stable reminder **suggestions**, not sends. \`event-capacity-reminder-delivery-audit.js\` adds an isolated private synthetic receipt reconciliation for that future pipeline.

### Contract

Input: a caller-supplied Workboard snapshot, canonical UTC observation time, a **separately injected** high-entropy private HMAC secret and optional caller-supplied receipt **claims** \`{dedupeKey, state, claimedAtUtc}\`. States: \`Delivered\`, \`Pending\`, \`Unknown\`.

The module checks snapshot key/ID and timestamp coherence, derives HMAC-obfuscated logical reminder keys from the private Workboard attention proposals, and compares receipt claims for exact matches, duplicates, impossible timestamps, unrelated stale receipts and pending/unknown outcomes.

The result is **aggregate-only**: counts by reminder kind and claimed receipt status. No raw task ID, Discord user ID, assignment, event identity, raw reminder key, token, HMAC digest or key material is returned. The synthetic Discord renderer is ephemeral, suppresses mentions and explicitly says that delivery was **not proven**.

A \`Delivered\` receipt is still a **caller assertion**, not a proven network acknowledgment, because the receipt was not independently authenticated by this function. \`Pending\` and \`Unknown\` never authorize automatic retry.

**Never put the HMAC secret, receipt metadata containing private task identities, raw Workboard states or protected records in the public source repository or GitHub Actions logs.**

## Remaining production requirements

1. Verify current effective Discord staff permissions on every protected read and outbound action.
2. Re-read authenticated Convoy Center history and protected Workboard state with version/revision constraints.
3. Use a private encrypted GitHub Free store with compare-and-swap, signed revision claims, conflict detection, isolated backup/restore and independently held owner checkpoint.
4. Design a durable outbox with states **Prepared → Attempting → Delivered/Unknown**, and record a verified Discord response; crash/lost-ACK replay goes to a human reconciliation queue rather than sending twice. Never claim exactly-once delivery across GitHub and Discord, which do not share a transaction boundary.
5. Deduplicate by actual task revision/time and verified protected staff/recipient scope; ensure untrusted Discord content cannot select arbitrary recipients or mention everyone.
6. Keep all live code default-off; require final CEO approval, full E2E testing and regression checks before activation.

## Test coverage

\`tests/event-capacity-reminder-delivery-audit.test.cjs\` covers 12 isolated scenarios: overdue task and department summaries, untrusted claimed delivery, pending/unknown, malformed/duplicate receipts, replaced task state, hold follow-up, spoofed identifiers/time, aggregate-only renderer, forged success flags and production isolation.

**This is an offline development milestone, not real notification delivery.** Neither PR #143 nor a successful test run authorizes automatic messages, event approvals, or a live feature flag.
