# Kings Event Capacity — Protected GitHub Actions Import (2026-11-24)

**Status: draft source-code prototype, NOT deployed. No live Convoy report ZIP has been downloaded, no real staff ledger imported and no existing production workflow has been changed.**

## Added code

- \`event-capacity-private-import.js\` — an explicit, *private-host only* ingestion procedure for the current Kings Convoy Checker. It selects a verified successful completed run on \`main\`, chooses its single expected \`kings-convoy-reports\` artifact, obtains raw ZIP bytes through a separately authenticated source connector, checks archive integrity, loads a separately scoped private encrypted decision ledger and signs the synchronized snapshot.
- \`event-capacity-private-archive.js\` — built-in Node ZIP decoder with strict caps on archive size and expanded content. It accepts exactly the expected report filenames (and the existing workflow's additional known files), supports stored/deflate members, and rejects missing reports, duplicate names, path traversal, symlinks, unsupported ZIP features, malformed JSON/UTF-8, invalid CRC-32 and decompression bombs. It returns **only** the Checker report and the Convoy Overview objects; never miscellaneous ZIP members.
- \`tests/event-capacity-private-import.test.cjs\` and \`tests/event-capacity-private-archive.test.cjs\` — synthetic end-to-end source authorization, metadata/ZIP provenance, corrupt archive, quotas and revision rollback tests.

## Source workflow selection

The expected GitHub repository is \`Stinkesocke107/kings-logistics-automation\`, workflow \`.github/workflows/convoy-checker.yml\`, branch \`main\`, run name \`Kings Convoy Checker\`, artifact \`kings-convoy-reports\`. A run is eligible only when GitHub metadata from the *authenticated provider* proves:

1. \`status=completed\` and \`conclusion=success\`;
2. \`head_branch=main\` and \`head_repository/repository\` match the configured Kings repository;
3. scheduled production run or an explicitly **live** manual dispatch; push-triggered and dry-run workflows do not qualify automatically;
4. timestamps are within freshness limits;
5. artifact ID, parent run ID, head commit and branch match; artifact is not expired and ZIP byte count matches metadata.

Read-only \`getRun\`, \`getArtifacts\` and \`readArtifact\` callbacks **must be implemented in the private issuer host** using authenticated GitHub REST calls. The archive ZIP must be downloaded by immutable artifact ID, never by an untrusted supplied URL. The decoder does not issue requests and has no credentials.

## Private source cursor and transactional safety

A protected \`readCursor\` / \`commitCursor\` pair tracks the last accepted run ID, run attempt and private decision-ledger revision. Newer runs, approved newer attempts and a higher private ledger revision on the same run can advance the cursor; older runs, attempts and ledger revisions are rejected. \`commitCursor\` must be an **atomic, durable compare-and-swap** against its expected old value. A merely JavaScript in-memory cursor is *not* production persistence or rollback protection.

**Key caution:** The producer's \`authenticatedService:true\` flag and \`trustedProducer:true\` flag do **not** authenticate anyone. The host must verify its own service identity and GitHub API responses before invoking these methods. A malicious service that can forge the callbacks can also fake the input; all source and secret access must be restricted to the Kings-owned private service identity.

The snapshot attestation is HMAC-bound to the report, Overview and encrypted-ledger projection, scoped to the official guild/forum, and tied to the verified run ID and attempt. The private Discord viewer independently verifies the attestation and current member/channel permission before presenting a private read-only calendar. There is no automatic publication or modification.

## Production launch gates (not satisfied)

- A continuously running, private Kings backend with real authenticated GitHub API credentials, encrypted transport, controlled artifact access and a non-public source ingestion process.
- Owner-verified Event Coordination/Leadership/CEO role IDs, actual private dashboard channel permissions and current guild owner/Administrator access audit.
- Real private transactional encrypted data store, monotonic rollback anchor, protected keys, 24-month personal audit log deletion, 90-day encrypted backups, monthly restore test and deletion propagation.
- E2E checks against authorized real Convoy Center reports and reconciliation of archived/historical records and event end times; only manually verified classifications may consume confirmed slots.
- Secure live Discord endpoint with command registration, valid signing key, replay tracking, ACK/defer, rate limiting and privacy-safe logs.
- Explicit approval by Kings Logistics CEO before merging or enabling, with a safe migration from old advisory limits.

**Public GitHub Actions artifacts can contain sensitive data. DO NOT upload decrypted reports or private staff decisions to this public repository or CI logs.** This draft intentionally only contains generic code and synthetic test inputs.

## Private GitHub API transport (new development module)

The new file event-capacity-github-source.js implements the issuer-side **read-only GitHub REST client**. A protected host injects a narrowly scoped GitHub read token at runtime. The client:

- requests immutable run metadata and artifacts only through fixed API URLs under the Kings repository;
- requires a complete artifact listing, never silently accepts a missing second page;
- obtains an immutable artifact ID ZIP, checks source response bounds (25 MiB maximum ZIP) and uses the validated in-memory ZIP decoder;
- follows at most one HTTPS redirect to an explicitly allowed GitHub Actions/blob CDN suffix, and **never forwards the GitHub Authorization header** or bot tokens to the download URL;
- rejects invalid redirect hosts, HTTP errors, unexpected API responses, oversized downloads and unknown identities with generic errors;
- writes no files, logs or data by itself.

Tests in tests/event-capacity-github-source.test.cjs exercise private API token isolation, redirection, malformed metadata, oversized responses and server-side request safety.

### Prototype integration contract

Inside a separately authenticated Kings-owned backend, create the reader via createPrivateGitHubReader({token: privateReadOnlyToken}) and pass reader.getRun, reader.getArtifacts and reader.readArtifact to importPrivateConvoySnapshot alongside protected loadLedger, readCursor and commitCursor services. The importer verifies successful live workflow metadata, the ZIP/metadata size, exact report inventory, valid ledger scope, signed snapshot and atomic cursor advancement.

**Do not run this flow with live credentials inside public GitHub Actions logs or this repository.** Providing an authenticatedService:true flag does not authenticate the server by itself. A real trust boundary, secret management, encrypted private storage, rollback resistance, retention and deletion handling still need to be deployed and audited.

The GitHub reader is code only; no new GitHub token was connected, no real workflow artifact was opened and no production import was executed during this change.

## 2026-11-25: Import transaction invariant (draft; not a live implementation)

The importer requires a trusted `commitSnapshot({ scope, expected, next, snapshot, metadata })` callback. A cursor-only `commitCursor` callback is **not accepted**. The callback must atomically commit BOTH (a) the encrypted, scope-bound, attested source snapshot and (b) the monotonic source cursor in one durable private database transaction, conditional on the expected cursor/revision. Only return `true` after the complete transaction is durably committed. On concurrency conflict, encryption failure, database failure or partial write, fail closed and leave the prior committed snapshot+cursor pair intact.

**Why:** moving the cursor without durably storing the snapshot could skip a valid Convoy Checker report forever after a process crash. Returning an in-memory snapshot alone is not a persistence guarantee.

The draft now tests that the combined callback receives the signed snapshot and matching cursor, refuses cursor-only implementations and rejects storage failures without returning a trusted result. These are **synthetic offline tests**. No private production database, host, Discord channel, bot, roles, backup or real authenticated Convoy Center data was provisioned. The callback contract does not by itself guarantee a correct database implementation. A real transactional, encrypted and anti-rollback-protected implementation must be separately built, security reviewed and tested before any release.
