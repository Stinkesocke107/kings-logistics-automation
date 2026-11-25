# Kings Event Capacity — GitHub Free / Three PRIVATE repositories / Secrets and access plan

**Decision: 25 November 2026.** This is the CURRENT owner-approved architecture and supersedes any prior temporary single-public-repository idea. All three private repositories have now been **independently verified** through the installed GitHub App: exact names, PRIVATE visibility, real `main` branches, unarchived state, and selected-repository installation access. No secrets, tokens, keys, new workflows or live Event data have been configured.

## Permanent repository boundaries

| Repository | Visibility | Intended content | What NEVER belongs here |
|---|---|---|---|
| `Stinkesocke107/kings-logistics-automation` | PUBLIC | All source code, offline synthetic tests, documentation, privacy-safe readiness metadata only | Raw or encrypted private Event records, user IDs/names, staff decisions, tokens, encryption keys, owner private signing key, signed private event snapshots |
| `Stinkesocke107/kings-event-capacity-history` | PRIVATE | Encrypted historical journal segments, signed internal Event decisions, private read/CAS history index; only after privacy review | Backup decryption keys, offline owner signing private key, public publishable data |
| `Stinkesocke107/kings-event-capacity-witness` | PRIVATE | Owner-signed CHECKPOINT COPIES / review receipts. These receipts need to be securely retained independently as well | Original archive plaintext, backup encryption key, owner private signing key |
| `Stinkesocke107/kings-event-capacity-backups` | PRIVATE | Separately encrypted daily backup manifests and ciphertext segments; eventual retention control | Owner private signing key, source archive plaintext and public Event statistics |

**Important:** A signed witness stored in another repo of the same account is not a genuinely independent rollback-resistant highwater. Independently retained latest signed checkpoint/highwater **outside GitHub** is a launch blocker. A private GitHub backup repo in the same account is also not a fully independent disaster-recovery location.

## GitHub Free: supported versus unavailable protection

- Unlimited PRIVATE repositories: supported.
- Repository-level GitHub Actions **Secrets** (`Settings > Secrets and variables > Actions`): supported, but do **not** create them yet. A repository secret can be read by workflows in that repository, so each secret needs a carefully reviewed execution boundary.
- A repository-local `GITHUB_TOKEN` is normally scoped to the repository containing its workflow. Cross-repository operations need a separately approved minimal grant and **must not share one unrestricted master credential**.
- GitHub Actions on private repositories uses a plan-dependent included allowance. Later scheduled jobs must respect the account's actual included usage; no paid plan or large unlimited runner budget is assumed.
- Paid private **branch protection/ruleset enforcement**, paid private **Environment Secrets**, and private Environment reviewer gates are **NOT assumed** on Free.
- No public PR, fork, untrusted checkout or user-controlled workflow input may be allowed to receive private store credentials or use the offline signing key.

## Minimum-secret decision matrix (planning only; NOT secrets to create now)

| Execution home | Allowed future material | Explicitly forbidden |
|---|---|---|
| Public code repository | No Event Capacity secret at all | Historical, witness, backup tokens/keys; any source archive/Staff data |
| Private history repository | Scoped repository-local `GITHUB_TOKEN` for writes **only if** a future approved private history workflow is deployed; a separate archive-decryption key only for workflows that genuinely must decrypt | Owner Ed25519 signing PRIVATE key, backup key, witness admin token |
| Private witness repository | Signed receipt metadata and offline-public Ed25519 verification key (public information); preferably NO persistent automation credential | Offline owner signing PRIVATE key, archive/backup decryption secrets |
| Private backups repository | Separate private backup encryption secret only if required by a future narrowly scoped recovery worker; repository-local `GITHUB_TOKEN` for separately approved uploads | Offline owner signing PRIVATE key and combined access to history + witness + backup admin grants |
| Owner-controlled secure offline custody | Ed25519 owner PRIVATE key, verified latest signed highwater, recovery key copies | Never put these in GitHub, Actions logs, public code, Discord messages or ChatGPT chat |

The existing draft adapters currently accept caller-provided secret parameters, so **they must NOT be imported by a production workflow yet**. A future trusted deployment design will choose short-lived installation credentials or fine-grained repo-restricted tokens, verify granted permissions and keep the signer outside CI.

## GitHub App authorization — completed and verified

- [x] Owner created `kings-event-capacity-history`, `kings-event-capacity-witness` and `kings-event-capacity-backups` as PRIVATE GitHub Free repositories.
- [x] The existing GitHub App installation `162599792` is configured for **selected** repositories and now exposes all three new private repositories.
- [x] Each repository has a real `main` branch, initial README and a safe local accidental-secret `.gitignore`. No real private Event data, credentials or signing keys have been added.
- [x] GitHub read-only repository metadata access and `main` branch search succeeded for all three.
- [ ] Do **NOT** assume the setup actor's reported admin/push rights are least-privilege production credentials; design isolated runtime identities separately.
- [ ] Do **NOT** create tokens or GitHub Secrets yet. Wait until workflow capability and per-repository minimum permissions are reviewed.

**No immediate account action remains for the CEO.** Continue only with controlled offline design, synthetic tests, and read-only private checks until the explicitly approved permission-separated pilot.

## Remaining independent launch blockers

- Full 24-month authenticated history including cancelled, completed, rescheduled, archived/deleted Convoys and provenance.
- Privacy, Staff roles/effective channel permissions and manual double review.
- Independent monotonic owner-highwater custody; proof of latest signed checkpoint, not just a valid signature.
- Production-sized private backup cadence, retention/erasure/legal-hold enforcement and monthly truly isolated restore.
- Locked-down minimum-scope runtime credentials, private GitHub Free review and CI, real private encrypted **synthetic-only** read/write recovery pilot after separate authorization, explicit CEO go-live approval.

**Status: PR #143 DRAFT; live Kings Convoy Checker unchanged; no `capacity_preview` dispatch, merge, key creation, private data migration or production enablement.**
