# Kings Event Capacity — independent private GitHub daily backup vault

**25 November 2026. DRAFT ONLY / NOT DEPLOYED.** PR #143; no real private GitHub repository was created, no secrets/tokens provisioned, no backup or retention worker activated, no public/Discord event message written.

## Scope

`event-capacity-historical-github-backup-vault.js` is a standalone optional GitHub-only adapter for placing an **already authenticated, separately encrypted offsite backup envelope** in a distinct private GitHub repository. It reuses `inspectEncryptedOffsiteHistoricalBackup` to verify the complete ciphertext, original signed archived journal and an independently retained offline Ed25519 owner receipt **before any network writes**.

The constructor requires **three different repository names**, for historical event data, witness checkpoint and offsite backup. The designated backup repository must be a real, unarchived, active private GitHub repository with `main` as the default branch. The public Kings repository is categorically refused.

An authorized caller would use the exact private backup path:

`capacity-backups/YYYY-MM-DD.enc.json`

The only accepted format is an encrypted envelope wrapper. The original event history and the owner receipt are encrypted inside it; plaintext event IDs, Staff notes and raw source events must never appear in this path. GitHub Contents response lengths, blob SHA and twice-verified repository metadata are checked.

## Read and write semantics

- `writeDailyOnce({envelope,ownerReceipt})`: the supplied envelope must belong to the **current UTC date** and pass private offline restore verification before the first remote access. The client checks that the exact date path does **not exist**, sends a single **GitHub Contents create** request without an overwrite SHA, then re-reads and compares exact stored bytes. If a date is already present, it refuses any overwrite, including a different encrypted backup.
- `readDaily({day,ownerReceipt})`: authenticates private repository metadata, reads the exact date, verifies Git blob and encrypted envelope, validates the expected **independent** owner signature and original historical journal, re-reads the same path, and checks repository metadata again. The returned status is a proof that this synthetic/library read verified ciphertext and signatures. No production restore occurs.
- Any GitHub conflict, timeout, role/permission uncertainty, stale receipt, bad ciphertext, concurrent modification or ambiguous commit causes a generic fail-closed exception. **A remote write may still be committed even if the API returns failure. The client never retries automatically or deletes files**; a human operator must reconcile with `readDaily` and independently retained receipts.

No `DELETE`, retention cleanup, file replacement, automated approval, Discord action, file logging or scheduled API call is implemented.

## Important limitations

GitHub's Contents endpoint is deliberately capped to **850 KiB per encrypted JSON backup**, far below the full 24-month Kings history that may eventually exist. An oversized backup is rejected rather than truncated. Production-scale encrypted partitioning, storage budget and retention/legal-hold enforcement are **not solved by this adapter**.

Although three distinct repository names are mandatory, naming separation does **not** validate the real fine-grained token scope or provide independent account/key custody. A compromised workflow runner with all three tokens would violate the intended separation. Independent custody, least-privilege Actions environments, branch rules and audited external highwater storage must be designed/reviewed before any activation.

Backup creation is NOT proof of historic Convoy Center source completeness, genuine Event attendance, 90-day operational retention, actual remote restore on isolated infrastructure, or available Event Capacity slots. Results remain `historicalCoverageCertified:false`, `freeSlotsCertified:false`, `retentionEnforced:false`, and `monthlyRestoreIndependentlyVerified:false`.

## Testing and release gate

Nine focused synthetic GitHub Contents HTTP tests cover one-time private daily creation, authenticated read/restore verification, duplicate same-date refusal, public/shared repository denial, wrong key/receipt/date, 409 conflict, ambiguous remote success, ciphertext mutation during read, and safe error redaction. The workflow-gating test keeps this library outside the live Convoy Checker and prevents retention deletion.

A full **same-HEAD** CI run must pass after any further change. The prior successful 1,111-test workflow was for commit `5181dc5c1d97fde3ed431bd9f103a23d233ebda6`, **not necessarily this newer commit**. No manual `capacity_preview` is required and this adapter must remain inactive without a separate explicit CEO-reviewed release process.
