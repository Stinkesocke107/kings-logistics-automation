# Kings Event Capacity — Encrypted historical decision archive (DRAFT)

**25 November 2026. Offline development only; NOT deployed.** PR #143 remains unmerged. No production Discord or GitHub Actions integration, no real private repositories, no private signing key in GitHub, and no certified event availability.

## Why this exists

The existing `event-capacity-historical-lifecycle-journal.js` proves that recorded historical **accept**, **reschedule**, **cancel**, and **complete** transitions were signed by the configured offline Ed25519 owner key and have an intact hash chain. That journal was in-memory only.

The new `event-capacity-historical-encrypted-archive.js` is an **offline AES-256-GCM serialization/restore codec** for that signed journal. It separates encrypted records by the UTC **review month** (not departure month and NOT the Event Capacity accounting month), up to 128 entries per segment. An authenticated encryption tag protects each part, with AAD binding the Kings guild/forum, archive creation timestamp, part order, exact revision range, prior and final chain tips, and review month.

The private archive manifest includes only scope, review month, revision boundaries, ciphertext lengths/hashes, final tip and uncertainty flags. It deliberately contains **no plaintext event IDs, member IDs, staff notes, evidence digests or event details**. The manifest itself is still private internal metadata and must **never** be committed to the public source repo.

## Available interfaces

- `createEncryptedHistoricalArchive({journal, scope, ownerPublicKey, encryptionSecret})` validates the entire pre-existing owner-signed journal before encrypting it. It returns `{archive,checkpoint,historicalCoverageCertified:false,freeSlotsCertified:false}`.
- `openEncryptedHistoricalArchive({archive,expectedCheckpoint,scope,ownerPublicKey,encryptionSecret})` requires a **separately retained expected checkpoint**, then validates its digest, authenticated ciphertext, segment continuity, revision chain, reconstructed original owner signatures and final journal state before returning the private journal. There is NO fallback to an empty journal. The result reports `encryptedArchiveIntegrityVerified:true` but explicitly `sourceEvidenceAuthenticityVerified:false`: cryptographic integrity does not authenticate the original Convoy Center source.
- The checkpoint binds the journal revision, final tip and SHA-256 hash of the exact archive manifest. It must be pinned and authenticated **outside the archive and outside any storage account that can rewrite it**. The same archive can NOT independently authenticate its own checkpoint.
- The encryption secret must be **high-entropy** and supplied only in a reviewed private environment. A 32-character human password is **not** equivalent to a high-entropy key. The offline Ed25519 signing PRIVATE key must stay outside GitHub, Actions and Discord.
- Hard bounds: 24,000 journal entries, 512 encrypted parts, 128 entries/part, 512 KiB ciphertext/part, 36 MiB total ciphertext. Storage/retention is NOT provided.

No API calls, Discord writes, GitHub commits, staff decisions, automatic event acceptance, automatic slot releases, map queries, or scheduled workflow changes are performed by this codec.

## Local verification

The seven focused Node tests were executed against the **existing real signed journal module** with synthetic source data:

1. Cross-month signed acceptance → reschedule → completion, archive encryption and exact journal round trip.
2. Empty history stays uncertified.
3. Tampering, swapped/missing/duplicated parts and forged manifest revisions fail closed.
4. Missing/mismatched pinned checkpoint, wrong encryption key and wrong guild scope fail closed.
5. Two archived revisions cannot be replayed against each other's independently pinned checkpoint.
6. A signed historical cancellation survives restore but does **not** prove when the formerly occupied slot was freed.
7. 129 synthetic decisions in one review month are split into contiguous, bounded 128+1 encrypted segments and reconstructed.

See `tests/event-capacity-historical-encrypted-archive.test.cjs` and `tests/event-capacity-historical-lifecycle-workflow-gating.test.cjs`. **Full GitHub CI for the latest PR head remains pending and must not be claimed successful.**

## Still blocking a live release

1. **Durable private GitHub storage**: distinct private data and witness repositories, minimum-scoped tokens, access policy, actual GitHub write/read version checks, independent owner-controlled checkpoint storage, race recovery and audit.
2. **Encrypted long-term partition/retention integration**: private 24-month history, 90-day independent encrypted backups, monthly isolated restore testing, field-specific erasure and recovery. A codec is not a real backup or 24-month store.
3. **Real historical evidence**: authenticate original Convoy Center threads, archived entries and true staff accept/cancel/reschedule records. Cryptographic signatures on newly reviewed entries do not prove omitted old events do not exist. Resolve duplicate and contradictory source identities.
4. **Production permission checks**: actual Discord roles, admin bypass, channel, signed/verified approval evidence and independent human release review.
5. **Source freshness and quota proof**: historic UTC-month coverage and exact verified Event identities must be reconciled before free slots can ever be shown as verified.
6. **System-wide CI and safe pilot**: run full same-head regression suite, authorized read-only preview, privacy/rollback incident drills and explicit CEO approval. No production activation before that.

**NO HISTORICAL COMPLETENESS OR VERIFIED FREE SLOT CLAIM IS MADE BY THIS ARCHIVE.**
