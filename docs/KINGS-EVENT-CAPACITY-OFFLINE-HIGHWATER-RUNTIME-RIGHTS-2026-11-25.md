# Kings Event Capacity — Offline owner highwater and repository-scoped runtime request guard

**25 November 2026 — DRAFT PR #143. No new credentials, live worker, Event data, or deployment.** These two isolated modules are intended to prepare a synthetic-only future private pilot. They neither grant rights nor make any Event acceptance/capacity decision.

## Independent owner highwater: rollback/fork detection, no automatic advancement

`event-capacity-independent-owner-highwater.js` exports:

- `prepareOfflineOwnerHighwaterCard({ownerReceipt,scope,ownerPublicKey,nowMs})` — validates the **already owner-signed, offline Ed25519** archive checkpoint receipt and packages an offline custody card. The caller MUST move this card under a genuinely independent, owner-controlled retention mechanism **outside all three GitHub repositories and outside Actions**. The function does NOT write it anywhere, does NOT contain a private signing key, and returns `independentlyRetained:false` and `exportPerformed:false`. It should not be committed to public code or pasted into chat.
- `compareRemoteHistoryToOfflineHighwater({remoteJournal,remoteCheckpoint,remoteOwnerReceipt,retainedOwnerCard,scope,ownerPublicKey,nowMs})` — cryptographically checks **both** owner signatures, the complete remote signed lifecycle journal and the exact remote archive checkpoint. Rejects any remote history **older than** the separately supplied owner-pinned floor; also rejects two independently valid signatures at the same revision that disagree on archive digest or tip (fork/equivocation). If remote is newer, it verifies that the retained historical prefix is still present in the remote journal and reports **human reconciliation required**, not automatic owner highwater advancement. Exact remote/floor match also requires human review before permissions change.
- Failures use generic sanitized exceptions; output excludes raw Event IDs, Staff identities, archive plaintext and secrets.

**What it does NOT prove:** The function cannot know where `retainedOwnerCard` was kept or that the supplied floor is genuinely the most recent independently retained record. A malicious actor controlling both a mutable remote repository and the only copy of the floor can cause rollback. The owner must protect and verify an **actual independently retained latest** signed checkpoint. A different GitHub repository under the same account is not independent custody. Neither valid receipt nor intact journal proves all archived/deleted Convoys were captured.

## Private GitHub request allowlist: additional defense, not a permission grant

`event-capacity-private-runtime-request-guard.js` exports `createKingsPrivateGithubRequestGuard({role,mode,transport})` for exactly three roles:

| Role | Future read requests | Future write requests |
|---|---|---|
| `history` | PRIVATE repository metadata, `main` branch, encrypted `capacity-history/current.json` index and SHA-256 named historical segments | `PUT capacity-history/current.json` with a GitHub file SHA for CAS; immutable SHA-256 named encrypted segment **create-only** without overwrite SHA |
| `witness` | PRIVATE repository metadata, `main` branch, explicitly named `capacity-witness/current.json` on `main` | **No automated write mode**. A future approved owner-review flow is required; this path is only a placeholder, no witness data exists yet |
| `backup` | PRIVATE repository metadata, `main` branch, UTC-day manifest and SHA-256 named ciphertext segments | **Create-only**, no overwrite SHA, for UTC-day manifests and encrypted segments |

A transport **strictly rejects** cross-repo URLs, unexpected GitHub methods (`DELETE`, `PATCH`, `POST`), arbitrary paths, encoded traversal, wrong refs/branches, malformed base64, missing CAS SHA on the history index, any overwrite SHA on immutable segments/backups, bad calendar dates, unexpected request fields and excessive payloads. A rejected request never reaches the injected network transport. A transport error is generically redacted and not automatically retried.

The request guard validates the **requested** URL and method. It does NOT establish the actual fine-grained scopes, custody or expiration of the token inside the `Authorization` header. It does NOT prove that opaque bytes are encrypted or that the remote write succeeded. The final production pilot must use independently provisioned credentials with **GitHub-restricted repository rights**, credential rotation/revocation controls and read-after-write verification. Existing GitHub connection for one-time setup reported administrative rights to all three stores and is NOT a suitable proof of separate runtime least privilege.

## GitHub Free-compatible future runtime plan (not enabled)

- PUBLIC `kings-logistics-automation`: code/tests/documentation only; **no Event Capacity production Secrets**, private Events, or owner private signing key.
- PRIVATE `kings-event-capacity-history`: own scoped history reader/writer credential, only after separate permission review. The offline Ed25519 owner signing PRIVATE key remains outside workflows. Do not grant backups or witness admin access.
- PRIVATE `kings-event-capacity-witness`: ideally read-only verification, no runtime write/secret by default. Owner may manually compare an offline receipt with this repository, but must retain the **latest** signed owner floor elsewhere.
- PRIVATE `kings-event-capacity-backups`: separate scoped backup reader/writer credential and separate backup encryption key handling. Do not grant history or witness write access.
- A future independent second-host/offline disaster-recovery copy and real monthly restore remain required; same GitHub account backup is insufficient.

**No account work required now.** The owner already created and authorized all three repositories and the assistant has initialized only security documentation/`.gitignore`. Do not create secrets until a named, reviewed runtime identity and workflow is ready.

## Tested denial paths

Focused Node tests use synthetic in-memory journals and repository transports to check old remote owner floor rollback, divergent signed checkpoints, altered source journal, invalid key, future signatures, safe error output, role-swapped/wrong-repo URLs, disallowed writes, forbidden content paths, incorrect Content API CAS semantics, invalid/oversized payloads and no automatic retries. A separate workflow gate checks the two new modules are **not loaded** by the live Convoy Checker.

A full exact-current-HEAD GitHub Actions CI run must finish successfully before claiming the development batch is regression-green. A successful unit test does **not** establish true independent custody, least-privilege grants, historical source completeness or safe automatic capacity reporting.

**Release remains blocked by authenticated 24-month original history, genuinely independent owner highwater and backup/restore custody, private credential E2E, effective Discord Staff role permissions and explicit CEO go-live approval.**
