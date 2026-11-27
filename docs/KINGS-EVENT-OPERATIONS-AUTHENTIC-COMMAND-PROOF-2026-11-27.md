# Kings Logistics — #18 genuine Discord Staff command proof (Draft)

**Prepared 27 November 2026.** This is an additional **manual, GET-only acceptance gate** in the existing `Kings Event Leadership Reports` workflow. It is **not active on `main` until reviewed and merged** and does not add a 47th workflow. It does not enable the Discord command worker, configure secrets, create a private channel, or make a personnel/Event decision.

## Why this check is necessary

A successful integrated Event source check and stored Discord dashboard GET proves the dashboard matches protected source data, but it does **not** prove that a genuinely new authorised Event Coordinator action caused a change. Existing tests simulate Staff actions; they cannot replace authentic original evidence.

## How an authorised owner can run it, after review/merge

1. Keep the private Event Operations channel, six approved Discord operator roles and existing key/token configuration properly scoped. Only enable `KINGS_EVENT_DISCORD_REVIEW_ENABLED=ENABLED` after a separate explicit owner review. The new proof itself never changes that setting.
2. A legitimate Event Coordinator takes a **real** review action using a current `!kings-review KR… start|block|reopen|record_check` command from the private dashboard. Do not create a fake decision solely to make a CI test pass. Do not include actual personal/Event source material in messages or public logs.
3. Let the existing `event-operations-discord-review.yml` worker process that command and commit `Record protected Discord Event Operations Staff review progress`. Verify that the existing consolidated dashboard refresh finishes and actually updates the bot-owned message.
4. In **GitHub Actions → Kings Event Leadership Reports → Run workflow**, choose **`command-proof`** on **`main`**. Run shortly after the new command, while the Event and Invitation original-source observations are still current and before another encrypted Event-state update.
5. The job finds the latest protected #18 Discord worker commit and reads its **encrypted** previous and new snapshots from Git history into ephemeral runner-local files. It refuses a mismatch with the current encrypted `main` state. It then repeats the actual bounded Discord GET parser against the earlier state, with current private channel/role checks and the recorded review timestamp, and demands byte-equivalent parsed JSON State reconstruction. Finally it GETs the owner-bot Event dashboard and compares the actual stored Staff and Invitation fields with fresh protected source. Nothing is written to Git or Discord.
6. Only a complete successful run may log the fixed result `EVENT_STAFF_COMMAND_TO_STORED_DASHBOARD_VERIFIED`; otherwise the job is red with a fixed `COMMAND_PROOF_UNVERIFIED` label. Record the Actions run URL, reviewer, actual source records checked, and exception/retry outcome **in private operator evidence**, not in public GitHub.

## Strict limitations

- Only the **most recent Event Operations encrypted journal commit** is eligible, and it must still exactly match the current encrypted file. This intentionally fails after a newer state update or an ambiguous batch. A new normal authorised action may be necessary for a fresh proof.
- The proof must run within **six hours** of the recorded journal update. Discord command replay checks **current** Guild role membership, not historical role membership independently attested by Discord; removed roles and inaccessible historic messages cause a safe failure.
- Discord history can change (including deletion of a command or a newer message), so the proof may refuse even when an older action legitimately occurred. This is a deliberate conservative evidence limitation; no stale or missing message is treated as proof.
- A positive result proves a consistent *current* authenticated-command replay, protected journal transition, and live stored dashboard readback. It cannot by itself prove past role membership, every original 24-month Event, authentic external invitation delivery/RSVP, business capacity, Event approvals, attendance, system availability, operational handover or CEO acceptance.
- `#17 Event Booking & Slot Management` remains cancelled. All capacity warnings are advisory; no bookings, release of slots, staff roles, external invitations or automatic approvals are created.

**Next gate after technical success:** Event Coordination Lead checks authentic original-source cases and handover; CEO separately decides the daily/weekend/category policy and authorises final system acceptance. Keep the master Issue #213 Event boxes open until that evidence exists.
