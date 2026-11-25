# Kings Event Capacity — Private Repositories & Owner Handoff

**Verified on 25 November 2026. Current decision. PR #143 remains DRAFT / NOT DEPLOYED.**

This is the **single current owner action register**. It supersedes earlier iterations proposing a single public data repository, three repositories still needing to be created, or upgrading GitHub Free. The public code repository is NOT an approved confidential data store.

## 1. Repository setup — completed and checked

| Role | Exact repository | Visibility | Default branch | Installation access |
|---|---|---|---|---|
| Source code | `Stinkesocke107/kings-logistics-automation` | PUBLIC | `main` | Connected |
| History | `Stinkesocke107/kings-event-capacity-history` | PRIVATE | `main` exists | Connected |
| Witness | `Stinkesocke107/kings-event-capacity-witness` | PRIVATE | `main` exists | Connected |
| Backups | `Stinkesocke107/kings-event-capacity-backups` | PRIVATE | `main` exists | Connected |

The actual connected GitHub repository metadata, installation membership and branch searches were checked. All three private repositories are **not archived** and are included in the existing GitHub App installation `162599792`, which remains `selected` rather than `all`. The app sees six Kings repositories total, including the pre-existing two private automation repositories, which have NOT been repurposed.

Safe initial preparation committed to the three PRIVATE repository `main` branches:
- An individual README defining exact purpose, limits and **no production authority**.
- A `.gitignore` for common accidentally committed secret/private-text file formats.

**Crucial:** `.gitignore` does NOT prevent direct API commits, intentional force-adds, and already committed Git history. These are guardrails, not encryption or permission checks.

**Completed tasks:**
- [x] Owner chose THREE separate PRIVATE repositories under the GitHub Free account.
- [x] Repositories were actually created and their PRIVATE visibility independently checked.
- [x] All three have a real `main` branch.
- [x] The connected selected-repositories GitHub App was granted access to all three.
- [x] Privacy-safe READMEs and accidental-secret `.gitignore` files initialized in all three.
- [x] Existing public code repo, its `main`, and existing two private automation repos were not modified for deployment.
- [x] The Draft PR records the decision and includes a strict zero-key repository-topology audit with synthetic tests.

## 2. Fixed confidential-data boundaries

**PUBLIC code repo:** only software, fake/offline test fixtures, documentation and anonymous status. Never commit raw or encrypted Event archive payloads, private Staff/Driver events, signer receipts tied to private events, signing/decryption keys, or tokens into the PUBLIC repository.

**PRIVATE history:** only owner-reviewed, encrypted, signed Event journal data and indexes after a separate privacy and permission pilot. Never place the Ed25519 owner PRIVATE signing key or backup decryption key here.

**PRIVATE witness:** only signed checkpoint copies and review proofs. IMPORTANT: because it is under the same GitHub account as history, a witness copy here is **NOT** sufficient to prove independent, rollback-resistant latest owner highwater. Keep a truly independent latest checkpoint offline.

**PRIVATE backups:** separately encrypted daily backup manifests/chunks. A second GitHub repository in the SAME account is not a genuinely independent disaster-recovery backup. Independent media/provider or separately controlled recovery custody and isolated restore drill are still required.

## 3. GitHub Free security limitations

Unlimited private repositories and basic repository-level GitHub Actions Secrets are compatible with Free. Do **not** rely on paid private branch protection/ruleset enforcement or paid Environment reviewer protection. The new repositories may report branch protection as absent; that is not proof of a setup error.

The connected actor currently reports **admin/maintain/push** permissions to all three private repositories. This confirms administrative setup access, but is **too broad to count as runtime least privilege**. It does NOT prove independent key custody, limited credential grants, source history authenticity, or readiness to activate.

**NEVER reuse the connected admin-capable setup actor as the default worker identity across all three private stores.** Any later automated job must have a reviewed, narrowly scoped and separate credential path; an owner-signed PRIVATE key must remain offline and not enter GitHub Actions.

GitHub Free private workflow usage is limited by the included plan allowance; no unlimited paid runner capacity is assumed.

## 4. Remaining steps — tracked explicitly

### A. Access and key custody — NO owner task right now

- [ ] Define the exact future read/write operations per repository, their minimum permissions, and who may approve them.
- [ ] Design separate runtime credentials per store; **do NOT create tokens or GitHub Secrets yet**.
- [ ] Set up an **offline Ed25519 OWNER PRIVATE signer** under CEO custody, and keep latest signed highwater independently outside all three repositories. Share only a PUBLIC verification key through a controlled process; never paste secrets in ChatGPT, Discord or a git commit.
- [ ] Define separate history and backup encryption key custody, rotation and recovery procedures. Never provision all sensitive keys into one Actions runner.

### B. Historical source completeness

- [ ] Review authenticated, complete Convoy Center history for the required **24-month window**, including accepted, cancelled, rescheduled, completed, archived/deleted and legacy events.
- [ ] Establish source authenticity and distinct Event IDs, plus documented evidence of every cancellation/reschedule. `Completed` does NOT prove attendance.
- [ ] Prove continuous and sufficiently complete source coverage; missing history must block free-slot claims.

### C. Backup operations and privacy

- [ ] Approve a **synthetic-data-only** least-privilege private pilot before any real Event archive write.
- [ ] Design actual daily encrypted backup execution, 90-day retention review and legal holds (not automatic deletion), separate control of the latest owner receipt, and a genuinely isolated monthly recovery test.
- [ ] Perform privacy review for private Discord data, access logging and retention/erasure propagation.

### D. Staff and production acceptance

- [ ] Verify live effective Discord Staff/Leadership permissions and separate final human review before irreversible Event decisions.
- [ ] Run security/privacy E2E and full same-HEAD CI on any released code.
- [ ] Obtain **explicit CEO permission** to merge/enable private workers or Event Capacity; keep existing Convoy Checker and public `main` unchanged until then.

## 5. What the CEO needs to do NOW

**Nothing else right now.** The three repositories and their GitHub App access are verified. The assistant can continue designing, testing and documenting the minimum-privilege workflow, without real keys or Event data.

When a restricted synthetic private pilot is actually ready and needs account settings, provide one concrete step at a time. **Never request the owner to paste a secret into chat.**

**Safety status:** 3 private repos VERIFIED; access VERIFIED; code DRAFT; real archive data NOT migrated; real keys NOT created; credential least privilege NOT verified; real retention & isolated restore NOT enabled; free Event slots NOT certified; PR NOT merged; production NOT activated.

## Continued development — separate runtime rights and offline owner rollback floor (25 November 2026)

**Draft code prepared, NO real permissions changed:**

- [x] Added the fully offline signed-owner highwater comparison `event-capacity-independent-owner-highwater.js`, checking privately supplied owner receipt and signed journal against a separately retained floor. It refuses remote versions lower than that floor and signed same-revision forks; remote revisions ahead of the floor require human review. **This cannot establish actual external storage/custody or auto-update the floor.**
- [x] Added a strict three-role URL/method request allowlist `event-capacity-private-runtime-request-guard.js`: private history GitHub Contents read / CAS write, witness GET-only, encrypted backup immutable create-only paths. Blocks cross-repo writes, other methods and arbitrary paths. **It cannot prove actual token scopes.**
- [x] Added synthetic regression tests, production import isolation check and runbook `docs/KINGS-EVENT-CAPACITY-OFFLINE-HIGHWATER-RUNTIME-RIGHTS-2026-11-25.md`.

**Next engineering work:** devise the independently controlled owner floor storage/recovery procedure and a real, reviewed least-privilege credential issuance and read-only credential-scope proof for an authorized synthetic pilot. Do NOT create general all-repositories tokens or store the owner Ed25519 PRIVATE signing key in GitHub Actions. Do NOT run live-data history/backup writes yet.

**CEO immediate task remains NONE**: the three real PRIVATE repos, selected GitHub App access and non-secret initialization are already verified. This phase is Draft-only; CI status for the exact latest head must be checked before software tests are claimed green.


## Large batch: least-privilege plan and offline synthetic recovery (25 November 2026)

**DRAFT-only progress; nothing new is required from the CEO immediately.**

- [x] Five proposed short-lived single-repository GitHub App runtime identities have a strict zero-secret permission-plan validator (`event-capacity-private-runtime-grant-policy.js`). It rejects broad repository grants, admin/workflow rights and public runners. **This does not issue tokens or attest their real scope.**
- [x] Existing independently-supplied owner signed card/fingerprint comparison is composed with the full AES-GCM segmented backup verifier in `event-capacity-offline-synthetic-recovery-drill.js`. This validates in-memory synthetic recovery integrity only, **not independent offsite storage or a real isolated restore drill**.
- [x] Added tampering/rollback tests, production-isolation tests and the full reviewer gate at `docs/KINGS-EVENT-CAPACITY-SYNTHETIC-PILOT-GATES-2026-11-25.md`.
- [x] Added the 24-UTC-calendar-month claim-only evidence readiness board `event-capacity-historical-24month-readiness.js` with strict month/monthly proof checklists, missing archive/deletion/legacy/history checks and no false historical completeness claim. Original authenticated historical evidence remains unavailable and is NOT imported.
- [ ] Before private synthetic writes: actual **provider-confirmed** single-repository least-privilege grants, separate CEO approval, redacted logs, isolated worker boundary and deliberate stop/rollback tests.
- [ ] Owner offline signer and latest highwater truly kept independently; actual isolated encrypted backup restore and real historic source completeness remain release blockers.

**No GitHub Actions Secrets, tokens, owner keys, real Event records or new scheduled workers have been configured. Public `main` and live Convoy Checker remain unchanged. PR #143 must stay DRAFT and unmerged.** Full same-HEAD CI result must be rechecked for each updated commit.

## Private runtime grant scope and pilot HOLD — 25 November 2026

**Development-only additions, NOT real account configuration:**

- [x] Built a separately invoked GET-only GitHub installation-token repository listing probe: **one exact PRIVATE repository**, stable across two reads; deny broad (e.g., six-repository) installation access, foreign repos, missing `main` and invalid responses. This does not prove Contents permission level or provider provenance under a fake transport.
- [x] Built a five-role scope bundle with five **distinct externally supplied credentials** and sequential fail-closed execution; detects repeated tokens and swapped role/repository bindings, with synthetic tests only.
- [x] Built an **offline, token-omitting** issued-grant metadata shape validator checking proposed minimal Contents permissions, repo selection and at-most-60-minute remaining expiry; this never confirms actual GitHub issuance or token revocation.
- [x] Built a **private synthetic pilot HOLD checklist**: even full offline evidence remains blocked without separately reviewed CEO permission, actual runtime credential scope, offline owner key custody, independent recovery, source history completeness, Discord effective-role E2E and privacy signoff.
- [x] Added focused negative tests and production import isolation. See `docs/KINGS-EVENT-CAPACITY-PRIVATE-RUNTIME-GRANT-AUDIT-2026-11-25.md`.

**CEO action right now: NONE.** No new tokens/Secrets, App permission grants, live private data writes, private pilot, real backup worker or GitHub PR merge. Existing private GitHub Free repos and public `main` remain in their prior state. Full exact-HEAD CI must be verified before claiming new test completion.

## Historical evidence and backup recovery-gap batch — 25 November 2026

**Draft-only additions; CEO account action immediately required: NONE.**

- [x] `event-capacity-historical-evidence-gap-audit.js` checks cryptographically signed original Event lifecycle journal entries against privately supplied source-evidence claims over an explicit 24-month UTC window. It reports missing original evidence, signed Event/source disagreements, cancellation/reschedule/status/category/departure mismatches and legacy/deleted record review needs with HMAC-only issue identifiers. **This cannot authenticate the original 24-month source inventory or certify completeness.**
- [x] `event-capacity-backup-90day-recovery-audit.js` reports missing backups over the previous **90 completed UTC days** (excluding unfinished today), 90-day retention review, legal holds, and unverified offsite/restore claims without writes or deletion. **Real daily backups and isolated-host restore are not activated or proven.**
- [x] `event-capacity-private-safety-overview.js` aggregates four private software review reports for future leadership visibility without exposing raw Events or marking the system ready.
- [x] Added negative regression tests and a workflow import-isolation guard. New runbook: `docs/KINGS-EVENT-CAPACITY-HISTORICAL-EVIDENCE-AND-RECOVERY-GAPS-2026-11-25.md`.
- [ ] Still required: authenticated original Convoy Center Event evidence, genuinely independently stored owner highwater and encrypted backups, real restricted GitHub credentials, Discord Staff permissions, privacy and two-person decision checks, approved synthetic private pilot, and explicit CEO go-live decision.

**Zero real Event data imported, zero Tokens/Secrets/owner private keys created, zero private repo workers activated, zero automated Event approvals, and no changes to public `main` or the live Convoy Checker. PR #143 remains DRAFT. The exact-current-HEAD CI result must be independently checked before calling this batch regression-green.**

## Historical allocation holds and full synthetic safety composition — 25 November 2026

**DRAFT-only engineering; CEO immediate task remains NONE.**

- [x] Hardened the signed-vs-original-source historical review: a previously signed in-window booking rescheduled outside the 24-month window must remain a human review gap; an archived original source requires separate evidence review; unsupported `Scheduled` ↔ `Rescheduled` equivalence is no longer accepted; future-issued owner reviews are rejected at earlier inspection times.
- [x] Implemented `event-capacity-historical-reservation-holds.js` with cryptographically verified **provisional historical Partner/External holds** for previously accepted or authorized-rescheduled UTC dates. `cancel`, `complete` and `reschedule` never automatically release a previously approved date. Kings-hosted convoys do not use partner/external quotas. A count of zero is **NOT** evidence of available capacity.
- [x] Extended `event-capacity-private-safety-overview.js` with an **optional redacted historical-holds view** showing private month, count and limit warnings, without Event IDs or signatures and without granting authority.
- [x] Added end-to-end **synthetic and fully offline** software test composition spanning five mock scoped GitHub App credentials, signed history, original-source gap audit, provisional old/new dates, 90-day backup gap report, AES-GCM segmented synthetic restore and CEO safety summary.
- [x] Added focused negative tests and production isolation check. Runbook: `docs/KINGS-EVENT-CAPACITY-HISTORICAL-EVIDENCE-AND-RECOVERY-GAPS-2026-11-25.md`.

**Still blocked:** authentic 24-month Event source coverage and legacy/deleted material, independently retained latest owner-signed highwater, provider-verified private runtime permissions, real backup storage and isolated host recovery, Staff role/practical approval checks, privacy review and separately authorized synthetic pilot followed by CEO production approval. This batch creates **NO** production data, private Github credentials, secrets, workers, Discord tickets or automatic event acceptance.

## Event-Team twelve-month calendar review — 25 November 2026

**Draft-only. No real Event-Team command or free-slot approval is activated.**

- [x] Implemented `event-capacity-staff-calendar-review.js` as a **separate PRIVATE/READ-ONLY projection** reusing the existing Kings day/month snapshot evaluator, not a second booking engine. It displays all 12 months for a selected year and every UTC day in an optional selected month.
- [x] Shows currently reported Partner / Other External / Kings counts **separately** from owner-signed provisional historical holds, explicitly refusing to add potentially overlapping current/history records together or infer an available slot.
- [x] Retains the exact Kings limits: 2 combined non-Kings accepted convoy bookings per UTC day; 20 Partner and 20 Other External per UTC month; Kings-organized events quota-exempt. No weekly limit.
- [x] Missing historical report means **unknown**, not `0` verified holds. Historic counts exceeding present snapshot counts are human review hints. Quota conflicts require separate human review.
- [x] Enforces matching signed journal revision across all supplied monthly historical reports and reconciles current snapshot daily/monthly totals. Prevents an accidental mixture of conflicting historical report revisions.
- [x] Added a private ephemeral Discord **renderer only** (no live slash-command wiring), focused synthetic tests, workflow import-isolation and an extended multi-module integration test.
- [x] Runbook: `docs/KINGS-EVENT-CAPACITY-STAFF-YEAR-MONTH-CALENDAR-2026-11-25.md`.

**CEO immediate action remains NONE.** Real Staff access, authenticated complete 24-month source history, real credentials/custody, genuine independent backups, isolated restore checks and explicit release/pilot authorization remain blocked. Nothing new was deployed. PR #143 must remain DRAFT.
