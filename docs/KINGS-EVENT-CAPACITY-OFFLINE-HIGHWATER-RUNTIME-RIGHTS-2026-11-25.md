# Kings Event Capacity — Offline owner highwater and repository-scoped runtime request guard

**25 November 2026 — DRAFT PR #143. No new credentials, live worker, Event data, or deployment.** These two isolated modules are intended to prepare a synthetic-only future private pilot. They neither grant rights nor make any Event acceptance/capacity decision.

## Independent owner highwater: rollback/fork detection, no automatic advancement

`event-capacity-independent-owner-highwater.js` exports:

- `prepareOfflineOwnerHighwaterCard({ownerReceipt,scope,ownerPublicKey,nowMs})` — validates the **already owner-signed, offline Ed25519** archive checkpoint receipt and packages an offline custody card. The caller MUST move this card under a genuinely independent, owner-controlled retention mechanism **outside all three GitHub repositories and outside Actions**. The function does NOT write it anywhere, does NOT contain a private signing key, and returns `independentlyRetained:false` and `exportPerformed:false`. It should not be committed to public code or pasted into chat.
- `compareRemoteHistoryToOfflineHighwater({remoteJournal,remoteCheckpoint,remoteOwnerReceipt,retainedOwnerCard,scope,ownerPublicKey,nowMs})` — cryptographically checks **both** owner signatures, the complete remote signed lifecycle journal and the exact remote archive checkpoint. Rejects any remote history **older than** the separately supplied owner-pinned floor; also rejects two independently valid signatures at the same revision that disagree on archive digest or tip (fork/equivocation). If remote is newer, it verifies that the retained historical prefix is still present in the remote journal and reports **human reconciliation required**, not automatic owner highwater advancement. Exact remote/floor match also requires human review before permissions change.
- Failures use generic sanitized exceptions; output excludes raw Event IDs, Staff identities, archive plaintext and secrets.

**What it does NOT prove:** The function cannot know where `retainedOwnerCard` was kept or that the supplied floor is genuinely the most recent independently retained record. A malicious actor controlling both a mutable remote repository and the only copy of the floor can cause rollback. The owner must protect and verify an **actual independently retained latest** signed checkpoint. A different GitHub repository under the same account is not independent custody. Neither valid receipt nor intact journal proves all archived/deleted Convoys were captured.

## Offline two-copy recovery review — NEW DRAFT ONLY

The new pure helpers `fingerprintSignedOfflineOwnerFloor` and
`inspectOfflineOwnerRecoveryCopies` in `event-capacity-independent-owner-highwater.js`
verify the existing Ed25519-signed owner receipt, calculate a domain-separated
SHA-256 fingerprint over its revision, tip, archive digest, scope, issuance
date and signature, and compare **two separately supplied** cards to a
**separately recorded** exact fingerprint. Mismatches, forged signatures,
stale/different signed copies, unexpected fields, and wrong scope/key are denied.
The helpers perform no network access, export, receipt update, key generation,
signing or Event decision. Independent custody and latestness remain unproven.

**Owner-operated procedure for a future separately approved synthetic pilot:**

1. Create and sign a synthetic checkpoint on an isolated owner-controlled device.
   NEVER import the Ed25519 owner PRIVATE signing key into GitHub Actions,
   a GitHub repository, ChatGPT or Discord.
2. Generate the card offline. Export one copy to an owner-controlled primary
   offline medium, and another to an independently controlled recovery medium
   or provider. Export is a human action, not performed by the code.
3. Record the SHA-256 fingerprint on a **third separately controlled record**
   (preferably a printed offline record). Do not publish the card in the public repo.
4. During owner review, privately read both independently retained copies and
   the separately recorded fingerprint, and run the two-copy audit.
   Then use `compareRemoteHistoryToOfflineHighwater` to check signed remote
   history against the retained signed owner floor. If remote is ahead,
   require separate human review and a new offline signing/custody ceremony.
   Never automatically advance the highwater.
5. For an actual recovery drill, simulate GitHub/account loss and independently
   obtain both copies, verify the fingerprint, and recover/reverify the real
   encrypted archive. In-memory synthetic tests are not recovery drills.

**Blocked until separately authorized:** real token/key provisioning, Event
migration, real backup workers, secrets, merge, production activation, or
automated available-slot claims. Two matching objects cannot prove that
copies are on independent media or are the latest owner checkpoint; a matching
signed digest alone does not prove archive ciphertext was retrieved and hashed.

## Private GitHub request allowlist: additional defense, not a permission grant

`event-capacity-private-runtime-request-guard.js` exports `createKingsPrivateGithubRequestGuard({role,mode,transport})` for exactly three roles:

| Role | Future read requests | Future write requests |
|---|---|---|
| `history` | PRIVATE repository metadata, `main` branch, encrypted `capacity-history/current.json` index and SHA-256 named historical segments | `PUT capacity-history/current.json` with a GitHub file SHA for CAS; immutable SHA-256 named encrypted segment **create-only** without overwrite SHA |
| `witness` | PRIVATE repository metadata, `main` branch, explicitly named `capacity-witness/current.json` on `main` | **No automated write mode**. A future approved owner-review flow is required; this path is only a placeholder, no witness data exists yet |
| `backup` | PRIVATE repository metadata, `main` branch, UTC-day manifest and SHA-256 named ciphertext segments | **Create-only**, no overwrite SHA, for UTC-day manifests and encrypted segments |

A transport **strictly rejects** cross-repo URLs, unexpected GitHub methods (`DELETE`, `PATCH`, `POST`), arbitrary paths, encoded traversal, wrong refs/branches, malformed base64, missing CAS SHA on the history index, any overwrite SHA on immutable segments/backups, bad calendar dates, unexpected request fields and excessive payloads. A rejected request never reaches the injected network transport. A transport error is generically redacted and not automatically retried.

The request guard additionally pins GitHub's media Accept header, optional API-version header, safe User-Agent format, and JSON-only PUT Content-Type; unexpected header values and embedded newlines are refused before transport. The request guard validates the **requested** URL and method. It does NOT establish the actual fine-grained scopes, custody or expiration of the token inside the `Authorization` header. It does NOT prove that opaque bytes are encrypted or that the remote write succeeded. The final production pilot must use independently provisioned credentials with **GitHub-restricted repository rights**, credential rotation/revocation controls and read-after-write verification. Existing GitHub connection for one-time setup reported administrative rights to all three stores and is NOT a suitable proof of separate runtime least privilege.

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
