# Kings Event Capacity — GitHub-only signed checkpoint witness

**Date:** 25 November 2026
**Status:** development-only, synthetic test coverage, Draft PR #143.
**Hosting:** GitHub Actions + outbound GitHub/Discord REST. No self-hosted bot, VPS, persistent runner or second scheduled workflow.

## What has been implemented

The private Event Capacity decision ledger can be paired with a **second, separately credentialed, private GitHub repository** to store a signed revision checkpoint.

1. **Private Data repository A** holds only the AES-256-GCM-encrypted decision ledger in a fixed file. The existing versioned Kings decision engine still governs classifications, UTC times, revocations and exceptions.
2. **Private Checkpoint repository B** holds only a cryptographically signed, scope-bound ledger **revision + SHA-256 digest of the exact encrypted ledger file**, plus the predecessor digest.
3. The two repositories require **distinct fine-grained GitHub tokens**; the composition factory also requires **different ledger encryption and checkpoint HMAC secrets**. The public Kings source repository and identical data/witness repository targets are rejected.
4. Checkpoint file writes use GitHub Contents file-SHA optimistic concurrency, only allow initial revision **0** and later increments of **exactly one**, and record the preceding digest in the signature. Unexpected signature, schema, scope, branch, Git blob SHA, revision, repository visibility or race results fail closed.
5. The data store checks the separate checkpoint on each read/write. The encrypted data commit occurs first, then the witness update. **If the witness update fails, future reads/writes must stop** pending independently authorized manual reconciliation. No automated rollback, resetting, guessing or accepting old quota slots.
6. This entire pair is a **library only**. It is not wired into the existing 15-minute Kings Convoy Checker, Discord Staff text input, or live event acceptance.

Files:
- event-capacity-github-private-checkpoint.js — signed witness contract and GitHub REST adapter
- event-capacity-github-private-storage.js — ensures distinct private-repo credentials/secrets and builds the pair
- event-capacity-github-private-vault.js — existing encrypted data store
- tests/event-capacity-github-private-checkpoint.test.cjs — synthetic two-repo E2E, rollback, crash-gap and tampering tests

## Important security limitation — not absolute independent monotonicity

**Two GitHub repositories are not automatically two independent trust providers.** A private repo and a signed record still can be rewound if an attacker or administrator can force-reset **both** private Git histories or replace both files with older *validly signed* contents. HMAC signatures prove provenance/integrity, not that a record is the highest-ever revision.

The synthetic tests explicitly demonstrate this boundary. The development pair is a **separately permissioned tamper-evident witness**, not yet a cryptographically guaranteed permanent append-only ledger.

A production design must:
- Put data and witness under intentionally **separate access/administration boundaries**, protected main branches, no force pushes and restrictive token permissions.
- Store or periodically verify the latest accepted checkpoint through a **third independently controlled highwater receipt**, for example an operator-owned secure offline record or a separate append-only authority. If it has been lost, fail closed.
- Record non-secret audit metadata and investigate ambiguous GitHub API timeouts; no blind retries after a possible commit.
- Verify actual GitHub organization policy and Discord staff permissions, and document an operator-approved recovery playbook.

This avoids paying for a bot server but **does not eliminate the need to protect credentials, repositories and the latest independently retained proof**.

## GitHub Actions setup — intentionally NOT performed

Before any approved launch, Kings needs a PRIVATE data repository and a second PRIVATE witness repository, different owner-controlled fine-grained credentials, distinct encryption/HMAC keys in repository secrets, reviewed branch protection, a secure independent highwater retention procedure and testable backups. Neither private repository was created, no real token/secret was accessed, no live Discord operation was executed.

The original public Kings repository still contains **only the implementation and synthetic fixture tests**, never actual staff entries or event evidence.

## Remaining release gates

- Secure final human authorization: Discord evidence proposals remain **non-approving**; verify current Staff role and explicit final decision with an independently audited provenance chain before writing.
- Reconcile real historical/current Convoy Center events and accepted status, UTC departures, reschedules and role-specific exceptions before computing free slots.
- Implement partitioned encrypted long-term retention, off-repository encrypted backups, tested recovery, secret rotation and deletion propagation.
- Obtain Kings CEO authorization to review/merge the draft and separately enable the GitHub-only workflow.
- Validate with real restricted Discord channel/roles and repositories, without leaking sensitive data into public GitHub Actions logs.

**No production Discord role, event, Convoy Center, token or workflow behavior changed.**
