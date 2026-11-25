# Kings Event Capacity — Authenticated GitHub Source for Owner-Controlled Decisions

**Date:** 25 November 2026
**Status:** Unmerged Draft PR #143, offline tests only. No real Discord data, live decision or GitHub private ledger modified.

## Why this is needed

The previous owner-controlled write engine depended on a caller-injected \`readVerifiedSource\` callback. A caller-provided object containing \`sourceKind: "authenticated-kings-convoy-checker"\` was **NOT** evidence that GitHub actually produced that source. Before a real approval workflow can be contemplated, the implementation needs a fixed first-party GitHub API reader.

## Implemented trusted route — no self-hosted bot

1. \`event-capacity-github-authenticated-source.js\` constructs the existing fixed-repository \`createPrivateGitHubReader\`, using a scoped GitHub API token. It does not accept an arbitrary source repository or a sourceVerified flag.
2. It selects a recent **successful, scheduled, main-branch Kings Convoy Checker** run. Manually dispatched and push runs cannot silently count as scheduled live authority.
3. It verifies exact repo, workflow path, completed status, commit SHA, run attempt, run ID, run start/completion age and artifact identity, including only one unexpired \`kings-convoy-reports\` artifact.
4. It downloads the archive via the fixed GitHub API. The existing reader handles a permitted GitHub artifact CDN redirect without forwarding the GitHub token, and caps archive size to 25 MiB.
5. It parses the ZIP with the existing bounded CRC/size/path/symlink/duplicate-name guards and validates exact Kings Guild/Forum, report/overview inventory agreement, finalization and current UTC report timeline.
6. Immediately **after download**, it retrieves the GitHub run again and discovers the latest scheduled run again. A new source run, replaced run attempt, SHA or altered run identity invalidates the result.
7. The adapter returns a *private in-memory* authenticated source with exact run/attempt/commit/artifact identity, parsed report and overview, and a **SHA-256 digest of the raw ZIP bytes**.
8. \`event-capacity-reviewed-staging.js\` binds this archive digest, GitHub HEAD SHA and artifact ID into its one-decision source proof (as well as the source report). A changed ZIP package, even with identical parsed event fields, invalidates the permit.
9. \`event-capacity-github-reviewed-gateway.js\` constructs \`prepare\` and \`commitWithOfflineOwnerPermit\` using this fixed authenticated GitHub source. It does **not** accept arbitrary source objects or a boolean saying a source was verified.

**This remains isolated.** Neither new module is imported by the live or optional 15-minute Convoy Checker workflow. It does NOT schedule Discord writes, import accepted decisions or certify free slots.

## Security, trust and operational caveats

- The authenticated GitHub connection requires the existing trusted workflow \`GITHUB_TOKEN\` with **Actions: read**; it does not need a dedicated bot host. Real secrets are not embedded in the code.
- The gateway still takes a \`protectedVault\` and Discord REST \`client\` constructed by a trusted runtime. Those objects must be bound to the **real owner-pinned, encrypted, private two-repo storage** and actual Discord role/member endpoints before it is safe to enable a write. A test double is not a trusted owner vault.
- A later scheduled Convoy Checker run may arrive while a review is in progress. The source adapter refuses a changed latest run, and the stage re-reads the source again. A permit is tied to the exact source fingerprint; it must not be silently transferred to another run.
- Comparing fresh sources before a GitHub CAS write cannot make GitHub/Discord updates one atomic transaction. An instant change after the final check remains a production reconciliation risk; one-shot CEO permit and owner re-signing still apply.
- The ZIP SHA-256 is an **integrity fingerprint of the GitHub API response**, NOT an independent cryptographic attestation signed by Kings staff. GitHub API token scope, branch provenance and GitHub trust are still required.
- The source module cannot fix missing historical accepted-event classifications, cancellations, exceptions or verified UTC slots. The GUI stays **Needs Verification** until historical reconciliation and explicit CEO release.
- Private raw report, staff identities and archive bytes are never printed or committed to the public source code repository.

## Synthetic integration tests

\`tests/event-capacity-github-authenticated-source.test.cjs\` uses a simulated real GitHub REST transport, scheduled run discovery, matching artifact metadata, actual bounded synthetic ZIP and private Discord role/read-only staging fixtures. It covers source success, no token forwarding to CDN, spoofed manual dispatch, new run arriving during download, stale/wrong guild, status mismatch, corrupt ZIP, bad artifact SHA/size and changed package between staging reads. No network or real keys are used.

## Remaining release gates

A production operator must securely configure two private data/witness repos, independent offline owner highwater custody and per-decision signing, a protected actual Discord channel and live role checks, long-term encrypted history and real historical source reconciliation, then explicitly approve deployment. No automatic acceptance is enabled by this draft.

**Kings requirements remain: GitHub Actions as the primary execution runtime; no privately hosted 24/7 bot server.**
