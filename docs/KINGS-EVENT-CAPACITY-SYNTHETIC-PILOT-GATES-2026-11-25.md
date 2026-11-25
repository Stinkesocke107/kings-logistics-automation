# Kings Event Capacity — Private Synthetic Pilot Gates (development-only)

**25 November 2026. PR #143 DRAFT. This is a safety runbook, not approval to launch.**

## Completed in the draft branch

The following two modules are new and have **no production imports**:

1. `event-capacity-private-runtime-grant-policy.js`: checks an exact, zero-secret, five-identity *proposed* GitHub runtime permission plan. No credentials are created, token scopes inspected, or authority granted.
2. `event-capacity-offline-synthetic-recovery-drill.js`: combines two signed offline owner cards and an independently recorded fingerprint with the existing encrypted segmented backup verification. It checks that the recovered signed journal and archive checkpoint match the signed owner floor, and rejects ciphertext corruption, wrong secrets and stale owner receipts. No external data is fetched and no live restoration occurs.

The earlier `event-capacity-independent-owner-highwater.js` and `event-capacity-private-runtime-request-guard.js` remain offline guards, not proof of real account configuration.

## Five proposed runtime credential identities — strict plan, not actual grants

| Role | Exact private repository | Contents permission | Intended runner | Write posture |
|---|---|---|---|---|
| historyReader | `kings-event-capacity-history` | read | private-history-review | Read only |
| historyWriter | `kings-event-capacity-history` | write | private-history-worker | Reviewed CAS index and immutable encrypted segments only |
| witnessReader | `kings-event-capacity-witness` | read | isolated-owner-review | No automated writes |
| backupReader | `kings-event-capacity-backups` | read | private-backup-review | Read only |
| backupWriter | `kings-event-capacity-backups` | write | private-backup-worker | Immutable encrypted segments and UTC-day manifests only |

The validator requests **one repository per short-lived installation token**, with at most 60 minutes of proposed lifetime, only Metadata=read plus Contents=read/write as shown. It forbids administration, workflows, actions, issues, secrets and pull requests. It also forbids generic/public runners and cross-repository grants.

**Crucial:** These are *requested* properties, not verified GitHub grants. Actual issuance must be separately authorized, checked from the provider, and tested with real restricted token scopes by a trusted reviewer before any authorized synthetic private pilot. The existing connected GitHub App setup actor has broad administrative powers and must not be used as a general-purpose runtime identity.

Do not issue GitHub Secrets, personal access tokens, private-owner signing keys, event records or scheduled workers as part of this document.

## Offline encrypted synthetic restoration — runbook

1. Under authorized offline development, construct **synthetic Event history only** and a synthetic owner Ed25519 keypair. Keep all private keys out of GitHub.
2. Sign the exact synthetic archive checkpoint; create two **separately supplied** owner cards and record their SHA-256 fingerprint as an independent input. These in-memory objects **do not mean** two physical backup copies exist.
3. Encrypt the synthetic source archive using an archive key; encrypt the offsite backup using a *different* key. Split into content-addressed encrypted segments and a bounded manifest using the existing packer.
4. Run `simulateKingsOfflineSyntheticRecovery` with the detached owner cards, fingerprint, manifest, ciphertext segments, synthetic keys, known scope and owner public key.
5. Verify refusal when the owner receipt is stale, a segment was swapped/truncated, its hash changed, the fingerprint differs or the backup/source key is wrong.
6. The returned private summary contains only verified revision and segment count, and clearly states that real independent storage, the latest externally retained highwater, external archive retrieval, and an actual isolated host restore **are not proved**.

The synthetic drill is necessary software-test evidence; **it does not count** as the real independent disaster-recovery test.

## Remaining prerequisites before approving a restricted synthetic private pilot

- [ ] Independently review GitHub App installation token *actual effective* repository and permission scopes; ensure each proposed identity is issued only to its one repository, with no admin-capable setup actor reuse.
- [ ] Approve the precise synthetic pilot actions, runtime owner/operator, log redaction, rollback plan, and stop conditions; verify no public workflow ever receives private credentials.
- [ ] Establish an owner-controlled offline signing procedure, independently retained current highwater and recovery copies outside the GitHub account. Keep the owner private signing key strictly offline.
- [ ] Test private synthetic encrypted create/read/reconcile with the actual least-privilege credentials after explicit CEO authorization. No real Event archive migration.
- [ ] Perform a genuinely separate storage/host restore experiment and retention/legal-hold/privacy review. A second private repository under the same GitHub account is not independent disaster recovery.
- [ ] Authenticate and reconcile the full 24 months of source Event lifecycle evidence including archive/deletion and Legacy records. Missing history is a hard blocker for confident free-slot counts.
- [ ] Verify effective live Discord roles, second human approval and all release/security/privacy checks.
- [ ] Obtain explicit CEO approval for any merge, private worker enablement and eventual product launch.

## Non-negotiable stop conditions

If there is an ambiguous GitHub write, a missing owner receipt, a rollback/fork, a changed source, an unverified token grant, non-independent backup custody, incomplete historical evidence or any questionable access, **stop and request private human reconciliation**. Never infer free Event capacity, automatically approve/decline invitations, retry unsafe writes or enable any production actions.

**Current status:** three dedicated private repos exist and are connected; credential plan structurally checked; independent signed-card comparison and synthetic encrypted restore checks developed. Real restricted runtime tokens **not issued or tested**, real backups and independent custody **not running**, real 24-month history **not certified**, PR **not merged**, production **not active**.
