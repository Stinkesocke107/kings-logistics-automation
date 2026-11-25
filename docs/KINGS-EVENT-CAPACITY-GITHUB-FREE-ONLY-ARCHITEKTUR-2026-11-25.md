# Kings Event Capacity — GitHub Free ONLY (no external hosting)

**Binding owner requirement as of 25 November 2026: GitHub Free only. NO extra hosting provider, paid VPS, always-on database or subscription is available.**

## Feasible GitHub-only architecture

The code/workflow repository remains `Stinkesocke107/kings-logistics-automation`; its current production `main` and deployed Convoy Checker are **not changed** by this architecture draft.

For a separately approved real pilot, a possible GitHub-Free-only design is:

| Piece | GitHub Free option | Important reality |
| --- | --- | --- |
| Code and testing | Existing repository and GitHub Actions | Each job executes on a **fresh runner**, not a persistent server |
| Scheduled import/read checks | GitHub Actions `schedule` and `workflow_dispatch` | Best-effort scheduled/batch work; starts can be delayed or workflows disabled |
| Confidential event source snapshots | **Separate private GitHub repository** containing only AES-GCM ciphertext and internal HMAC claims | A public code repository must NEVER store original private messages or credentials |
| Review checkpoint / version history | A **second private GitHub repository** or separate protected branch containing checkpoint claims | Same provider/account means NOT independently hosted or protected from total account compromise |
| Secrets | Repository/org Actions Secrets, tightly limited token scopes | Do not commit secrets; future setup needs CEO authorization |
| Event Team reports | Private ephemeral previews and safe output artifacts; public summaries may contain safe totals only | Artifacts expire under retention policy; do not use as sole long-term history |
| Static documentation | GitHub Markdown or Pages if useful | GitHub Pages does not run a Discord interaction API or persistent authentication server |

GitHub Free permits private repositories and Actions. **Important billing change:** Official current GitHub Docs describe an included monthly compute credit (for GitHub Free, currently **USD 12**) and 500 MB artifact storage. This is a **shared account budget**, not a guaranteed free 24/7 instance; monitor usage and disable paid overages in billing settings. Repo Git data and Actions artifacts are distinct; do not mistake artifact retention for permanent history.

Docs:
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.github.com/en/actions/how-tos/troubleshoot-workflows
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- https://docs.github.com/en/rest/repos/contents

**GitHub Free limitation:** branch protection/ruleset enforcement on **private** repositories is generally a paid-plan feature. Do not claim that private source history is unconditionally append-only or tamper-proof. Restrict repository collaborators, avoid force pushes and keep separate access boundaries manually, but no software component here can certify independence from the same GitHub account owner/admin.

## Implemented GitHub-Free source contract (DRAFT)

`event-capacity-github-free-quarantine-ledger.js` prepares a **strictly injected transport contract** for a future GitHub Contents API adapter. This source file uses **no HTTP client, GitHub token, file writes, repo creation or production system imports**. Its explicit mode `INJECTED_GITHUB_FREE_TEST_ONLY` blocks default live operation.

It validates that both proposed repositories report **private=true**, belong to the same GitHub owner and have **distinct names**. The transport interface is:

- `describe({repository})` → `{full_name, private}`
- `read({repository,path})` → `null` or `{sha,content}`
- `put({repository,path,expectedSha,content,message})` → commit or conflict

A future real adapter must convert `content` to Base64 for GitHub's Contents API, use a narrowly scoped authorization mechanism and honor `sha` on updates. The interface never grants its own real credentials.

Source identity, old/new page claims, revisions and real original Events are **not** published. The state repository holds a **bounded AES-256-GCM encrypted metadata envelope** of the existing validated quarantined plan, including only HMAC-obfuscated identity references. A separate private GitHub repository holds a **HMAC authenticated witness record** `{revision,stateDigest}`. The state revision is changed using the preceding GitHub file blob SHA; the witness is changed separately and likewise conditional on its own SHA. Its hash checks the **exact ciphertext bytes**.

### Nonatomic GitHub two-repo gap

GitHub does **not** give an atomic transaction across two private repository files.

1. Validate both private repos, read the current source and witness and verify they agree.
2. Recheck all untrusted original source claims and the staged quarantine review plan.
3. Update the encrypted state file by its previous blob SHA.
4. Update the HMAC witness file by its previous blob SHA.
5. Re-read and require exact equality. **Only then report a matching GitHub-only checkpoint.**

If the runner crashes or is canceled between steps 3 and 4, the state and witness will disagree. The software refuses further reads and writes. **No automatic deletion, overwrite, rollback, release of old dates or fabricated external highwater** is permitted. A human must recover from verified actual evidence before another processing attempt. A later successful retry is idempotent only if both data and witness already match.

The matched witness is **not** an independent off-provider highwater. With only GitHub Free, a single compromised GitHub account could rewrite or delete both repos. Even two repos and HMAC secrets stored as Actions secrets cannot guarantee protection against such a compromise or loss of GitHub access. An optional *owner-held offline export* could strengthen recovery, but it is **not required for the GitHub-only implementation** and cannot be claimed to have occurred.

### GitHub storage is not the Actions runner's SQLite file

`event-capacity-atomic-staged-import-sqlite.js` is a valid **local and test transaction implementation**, but on a hosted Actions runner it disappears after the job. The GitHub-only persistence candidate is encrypted **repository content/history**, never a SQLite file left in the runner's temporary filesystem.

The prototype currently stores only bounded **quarantined review metadata**, not full 24 months of original Discord message content. Full historical source collection and edited/deleted evidence require separate authorized access, privacy checks and a partitioned encrypted retention schema. No claim of fully complete history is warranted.

### Tests

`tests/event-capacity-github-free-quarantine-ledger.test.cjs` uses a synthetic Contents API with SHA-based compare-and-swap, simulates two private repos, confidentiality checks, repeated calls, concurrent update races, missing ACK, partial 2-repo updates, changed source claims and actual restoration of an **older encrypted record** while retaining a newer witness. Other tests reject public repositories, forged witness MACs and invalid secrets. `tests/event-capacity-github-free-quarantine-isolation.test.cjs` confirms no live Convoy Checker or GitHub API is invoked.

**No actual storage repositories have been created by this draft. The tested mock is NOT the real GitHub API.**

## Practical phased roadmap without hosting fees

**Phase 1 — Current (CEO action not needed):** Build and test pure GitHub-only adapter, quota/usage guard, failure report, historical source reconciliation, event capacity safety rules, and prevent connection to production.

**Phase 2 — Requires owner authorization:** Create two **private GitHub Free repositories**, suggested names `kings-event-capacity-state` and `kings-event-capacity-witness`. Restrict collaborators, configure secret scopes and GitHub Actions permission boundaries. Do **not** paste personal access tokens in ChatGPT or commit them to files. Set billing safeguards to prevent paid usage.

**Phase 3 — Private read-only pilot:** Obtain explicit CEO consent, appropriate Discord effective read permissions and original current/legacy source inventory; run GitHub Actions manually or with conservative schedule. Store only encrypted limited metadata, verify all 24 months, current/revisions/edits/deletions and outgoing tracker. Stop and request human review whenever source completeness cannot be established.

**Phase 4 — Separate approval for production integration:** Explicit CEO consent for writes, actual Staff roles/privacy review, final business logic verification, independent restoration testing. With no external hosting, only **periodic batch** checks and outgoing Discord notifications are technically plausible, not an always-on Discord bot, live web API, or guaranteed immediate interaction processing.

### When the CEO needs to act

**Not now** while implementing and running synthetic CI. Later, the CEO must authorize creating the two private Free repositories and the exact restricted permissions. We will provide the exact click paths in GitHub settings. No hosting company or payment is required for the proposed design, assuming usage stays within GitHub's current free allowances.

**No automatic activation on 1 December 2026**, and PR #143 remains DRAFT/unmerged. Existing production main and Convoy Checker unchanged.
