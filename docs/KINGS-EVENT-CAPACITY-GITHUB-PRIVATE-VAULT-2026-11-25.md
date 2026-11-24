# Kings Event Capacity — GitHub-only encrypted decision vault

**Date:** 25 November 2026. **Status:** isolated DRAFT code in PR #143. No real private GitHub repository, token, staff data or Discord deployment has been created or activated.

## No self-hosted bot

The Kings Convoy Checker continues running on the existing 15-minute GitHub Actions schedule. Long-lived encrypted event decisions can persist in a **separate PRIVATE GitHub repository**, rather than on the ephemeral GitHub runner or inside the public Kings code repository. No VPS or permanently running Discord Gateway is required for this storage design.

The default GITHUB_TOKEN of the public code repo cannot automatically access a different private repo. Before any approved deployment a carefully scoped, fine-grained token with Contents permission for **only** that private repository must be configured as an Actions secret. No token or secret is included in the code or this documentation.

## New isolated adapter

- File: event-capacity-github-private-vault.js
- Fixed private path: capacity-data/decisions.encrypted.json
- Target: a separately configured private, non-archived GitHub repo with main as default branch; the public Kings source repo is explicitly rejected
- Encryption: reuses existing scoped AES-256-GCM seal/unseal of the versioned Staff decision ledger. Only ciphertext is sent through GitHub Contents REST.
- Concurrency: uses GitHub Contents file SHA compare-and-swap on every update. Older/stale writes fail rather than overwriting accepted history.
- Historic audit: the domain ledger checks expected revision, individual Staff authorization roles, event identity and retained decision history.
- Independent rollback guard: required callback to a **separately protected durable checkpoint** storing ledger revision plus SHA-256 of the actual encrypted file. If either local state or checkpoint differs, stop all reads and writes.
- Interrupted remote anchor update: the GitHub commit may already exist, so an inconsistent checkpoint fails closed and requires independently audited human reconciliation. No automatic retry, reset or silent rollback is allowed.
- Only explicit initialization creates an empty ledger. Missing state is not treated as empty accepted capacity.
- This module is not connected to Discord text commands or the public Convoy Checker runtime. The recent Staff evidence messages remain REVIEW PROPOSALS, not approvals.

## Test coverage

Tests use only synthetic events, simulated GitHub REST and simulated independent checkpoint authority. They check encrypted persistence across new GitHub Actions-style process instances, exact SHA conflicts, source scope and wrong-key rejection, denial of public repository storage, reschedule revision history, tampered ciphertext, rejected unauthorized decisions and crash gap behavior.

A simulated independent checkpoint is NOT a production anti-rollback provider. No real private repo was modified.

## Production gaps and release gates

1. Set up a separately permissioned PRIVATE GitHub data repo and protected branch. None was created in the Draft.
2. Configure a dedicated read/write fine-grained token and ledger key in reviewed GitHub Actions secrets only. Protect the main workflow, token permissions and allowlisted repository.
3. Provide a genuinely independent persistent checkpoint authority. GitHub blob SHA alone cannot prevent history rollback.
4. Independently authenticate current Staff roles and explicit approval/review of every proposed source decision; no caller-supplied role metadata is sufficient.
5. Add encrypted archives/partitioning for 24-month audits, 90-day separately encrypted backups, tested recovery, retention/deletion and key rotation. This initial adapter deliberately caps a single file to 850 KiB; it does NOT satisfy the full history storage requirements.
6. Reconcile all real Kings source events and past decisions and confirm real Discord privacy permissions before any verified free-slot counts are published.
7. Require explicit CEO review, merge and launch approval. No autonomous approvals, role writes or live Discord messages are performed by this code.

**Kings master requirement remains GitHub Actions FIRST: no self-hosted bot as a prerequisite for scheduled Event Capacity operations.**
