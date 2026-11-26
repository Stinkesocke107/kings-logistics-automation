# Kings Logistics — Monthly Awards (4 categories, human-only)

**Operational draft 27 November 2026.** This is an organizational process, **not** an additional GitHub Action among the 46 registered workflows. It does not claim a completed real awards cycle or final CEO approval.

## Exactly four monthly awards

| Category | Scope of the private evidence review |
|---|---|
| **Driver of the Month** | Verified Driver engagement, reliability and community contributions; authorized LOA is treated fairly |
| **Staff of the Month** | Staff contributions across all current Staff and Leadership ranks together; no separate High Staff award |
| **Recruiter of the Month** | Evidence-backed completed legitimate onboarding and support; no credit for unverified invites, spam or provisional arrivals |
| **Photo of the Month** | Original eligible image, rights/consent, approved final selection, and the winning livery recognition |

The removed High Staff and Excellence awards must not reappear. Removed Driver Level 1–7 roles must not be recreated. No automatic award recipient choice or role mutation.

## One monthly human workflow

1. **Collect nominations privately.** Drivers/Staff may nominate eligible contributors or photos through an approved existing private Staff process. Do not store names, Discord IDs, TruckersMP IDs, proof screenshots, personnel notes or application outcomes in this public repository.
2. **Verify originals and time period.** Record the UTC award month. Validate activity/logs and relevant Kings/TruckersMP/Discord sources, ensure nominations refer to that month, avoid duplicate records and distinguish missing evidence from genuine zero results.
3. **Handle conflicts fairly.** A reviewer should not be the only person deciding their own award. Staff recognition includes Leadership; Recruiting counts genuine completed onboarding, not invitation volume. Photos require rights/consent and the confirmed winning livery.
4. **Human recommendation and final decision.** Authorized Kings Leadership reviews the eligible candidates and decides manually. Only explicitly authorized results move forward; the CEO retains final authority where required.
5. **Publish once through an approved current Kings channel.** Check correct category, name, month, photo/livery where relevant, design, permission and recipient consent. Independent staff confirmation prevents duplicates. No GitHub Actions automatic posting.
6. **Archive privately and hand over.** Preserve original evidence source, decision provenance, announcement link, month, correction/revocation decisions and a second-person verification in the protected system. Public GitHub should only contain aggregate process documentation.

The executable **read-only** checklist is `node kings-monthly-awards-review.js YYYY-MM`. It reads only the already-approved `data/awards-catalog.json`, outputs no nominee information and deliberately sets all stages to pending until actual human review. It does **not** perform or certify any award.

## Remaining release gates

- Verify the intended nomination route, permissions, responsible Leadership and protected archive with actual Staff.
- Review genuine November/other month source records and conflicts.
- Confirm the final human winner(s), publication, livery recognition, private history, recovery/corrections and explicit CEO approval.
- Only after those steps may the operational cycle be called completed. No unrelated Shop/Hub/RealmMP functionality is introduced here.
