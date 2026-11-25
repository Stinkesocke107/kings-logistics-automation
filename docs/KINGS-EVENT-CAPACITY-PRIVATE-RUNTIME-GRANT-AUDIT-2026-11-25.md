# Kings Event Capacity — Private runtime installation scope and pilot HOLD audit

**25 November 2026 — DRAFT #143 ONLY. NO LIVE SYSTEM CHANGES.**

This document supersedes any assumption that a connected GitHub **setup** actor is a correctly scoped runtime credential. The existing installation access to six Kings repositories and its broad push/admin capabilities is for initial configuration only. It is **not permitted** as a general runtime writer.

## Implemented DRAFT software boundaries

| Module | Purpose | What it cannot prove |
| --- | --- | --- |
| `event-capacity-private-runtime-grant-policy.js` | Validates the zero-secret requested five-identity plan | Effective GitHub grants or actual issuance |
| `event-capacity-private-runtime-installation-scope-probe.js` | GET-only, twice-read GitHub installation repository inventory with a pre-supplied token | Exact effective Contents permission, provider authenticity under a fake transport, key custody |
| `event-capacity-private-runtime-scope-bundle.js` | Runs five individually supplied, distinct token inventories sequentially; refuses broad/shared/wrong-repo scope | Runner isolation or independent secret custody |
| `event-capacity-private-issued-grant-metadata-audit.js` | Pure parser for a *sanitized* token-issuance metadata projection without the original raw token | That GitHub truly issued the response, authentic token provenance, revocation, independent signoff |
| `event-capacity-synthetic-pilot-hold-audit.js` | Human-readable HOLD report with explicit offline and external blockers | Authorization of synthetic private writes or real Event capacity |

The scope probe uses only the official GitHub installation repository listing `GET /installation/repositories?per_page=100&page=1` with **no redirects**, no other API operations, bounded responses, and two consistent reads. **Exactly one** designated PRIVATE repository with `main` is required. If a token sees six existing Kings repositories or any unexpected repository, the probe fails. It does not issue the token, persist the token, try any write or call Discord. The transport is supplied by a future separately approved private pilot and MUST be independently authenticated.

GitHub documents repository-specific installation tokens using `repositories` / `repository_ids` plus an explicit `permissions` restriction. Without these parameters, an installation token can inherit access to the whole App installation. Consequently, the planned token issuance path **must** specify exactly one required repository and only its minimal permissions. A one-repository inventory alone is insufficient to prove the effective Contents permissions.

**Official references:** GitHub Docs, REST API endpoints for GitHub App installations and GitHub App installation access-token generation.

## Roles and required effective permissions

| Distinct role | Exact permitted repository | Required Contents permission | Other permissions |
| --- | --- | --- | --- |
| historyReader | `Stinkesocke107/kings-event-capacity-history` | read | metadata=read only |
| historyWriter | `Stinkesocke107/kings-event-capacity-history` | write | metadata=read only |
| witnessReader | `Stinkesocke107/kings-event-capacity-witness` | read | metadata=read only |
| backupReader | `Stinkesocke107/kings-event-capacity-backups` | read | metadata=read only |
| backupWriter | `Stinkesocke107/kings-event-capacity-backups` | write | metadata=read only |

The witnessed checkpoint remains read-only for automated jobs. No broad all-repositories token, PAT workaround, admin-capable setup actor reuse, public workflow secret, or owner offline Ed25519 signing key in Actions is allowed. The proposed token-validation tests use synthetically generated strings and fake GET responses only.

## Redacted issuance metadata review

For a future externally authorized pilot, the trusted operator must strip the actual GitHub App installation token from any issuance response before a structured metadata audit. The parser accepts ONLY:

- `tokenOmitted: true`
- Canonical `expiresAt` timestamp with no more than 60 minutes remaining
- `repositorySelection: selected`
- Exactly one expected private repository on the `main` branch
- Exactly `permissions: {metadata: read, contents: read|write}` matching the planned role

The metadata validator **must not** receive the raw `token` property, any private key, sensitive Event data, or extra fields. A well-formed sanitized snapshot is not a live GitHub trust anchor and must be reconciled by a trusted private provisioning operator with the actual provider grant. Actual token expiration and revocation controls are still unverified.

## Private synthetic pilot STOP conditions

The `event-capacity-synthetic-pilot-hold-audit.js` report intentionally remains blocked even when all offline software evidence fields are supplied. It explicitly retains eight external blockers:

1. Explicit CEO approval for the *specific* synthetic-only private pilot.
2. A separately reviewed issuer and real least-privilege GitHub App credentials; actual one-repository scope and permission checks.
3. Isolated execution, ephemeral credential lifecycle, revocation and log redaction.
4. Owner-controlled offline Ed25519 signer plus truly independently retained current signed highwater.
5. Independent disaster-recovery custody and isolated restore proof (same GitHub account is insufficient).
6. Authenticated complete original 24-month Convoy Center history, including archived/deleted/cancelled/rescheduled/legacy records.
7. Live effective Discord permission checks and second human approval.
8. Privacy, logging, retention/legal-hold and security signoff.

A future separately authorized **synthetic** pilot can be narrower than a production launch. Its signoff must enumerate which tests are allowed, and must not be treated as production approval or as proof that all history/retention gates are complete. No code in this batch allows private synthetic writes or real event-slot decisions.

## Current action register

- **Completed in the draft:** Four new supporting audit modules, focused synthetic tests, production-workflow isolation tests, documentation and separate read-only scope design.
- **Still not done:** Real scoped credentials or Secrets, actual provider-side issued grant verification, external owner key custody, real independent storage, real 24-month Event archive, actual private pilot, Discord E2E checks, privacy approval and CEO production release.
- **CEO immediate configuration request:** NONE. Do not paste access tokens or signing keys into ChatGPT or PR comments.
- **PR #143:** Stay **DRAFT and unmerged**. Never run a production worker, issue unrestricted tokens or dispatch `capacity_preview` as part of this design work.

For release, require a **fresh exact-current-HEAD successful full GitHub Actions CI** plus all real-world security and evidence gates. No software-only audit can substitute for operational custody, completeness or signoff.
