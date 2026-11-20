# Kings Driver Identity & Loyalty — private Management register

This private Discord register is the authoritative source of a **Kings Driver's original Kings joining date**, and may also hold **verified Discord ↔ platform account mappings**. It is intentionally the same existing Management channel, not a second public database. The monthly Driver Leadership membership-duration section and automated TruckersMP achievement notices remain disabled. Welcome and promotion messages in **Driver Updates are unchanged**.

## Setup

1. Use the already created private Kings Discord channel **`1572736232969084948`** (`<#1572736232969084948>`). This exact channel ID is pinned in both GitHub Actions workflows, `driver-achievements.yml` and `live-tracker.yml`, through `DRIVER_LOYALTY_REGISTER_CHANNEL_ID`. The configured ID is authoritative, so the channel can keep its existing Discord name; do **not** create a second register channel. Never make this channel public.
2. Deny **View Channel** to `@everyone`.
3. Allow **View Channel** and **Read Message History** only for **Management**, **Head Management**, and **CEO**, along with the Kings Systems bot. Users with Discord's Administrator permission may also be able to view private channels regardless of channel overrides.
4. Do not give other Staff, Drivers, Trial Drivers, Partner or community roles channel visibility. The automation checks explicit channel permission overwrites and refuses role updates if access has been explicitly granted to unrelated users or roles.
5. An authorised Management/CEO account posts **one ordinary message per Driver**, or one validated **bulk batch of up to 12 Drivers** as shown below. The existing two-line format is still fully supported:

```text
id: 123456789012345678
datum: 2.2.2020
```

Alternatively, use the extended identity format:

```text
discord_id: 123456789012345678
truckersmp_id: 1234567
haulmp_id: -
trucklinemp_id: -
kings_join_date: 02.02.2020
```

The IDs above are examples, not real driver accounts. `id` and `discord_id` are aliases, as are `datum` and `kings_join_date`; never include both versions of the same field in one message. Keep the Discord ID first. The mandatory date is the **original Kings membership date**, not the Discord join date or a platform registration date. The day and month may have one or two digits. The three platform ID fields are optional; use `-` or omit a field when no verified ID is available. TruckersMP IDs are positive numeric strings; HaulMP and TrucklineMP IDs are treated as opaque alphanumeric identifiers (including `-` and `_`) pending provider integrations. Do not assume a player's display name proves identity.

**Important distinction:** This private channel stores identity links and the original Kings joining dates. It is **not** a source of real-time game presence, positions, or live activity. The Live Tracker still gets actual TruckersMP server data from the existing TruckersMP APIs and (where available) its player-map feed. Official server totals alone cannot establish which Kings drivers are online. If that player feed is unavailable, the tracker must mark live data unavailable and preserve the last verified aggregates — never fabricate an online count. HaulMP and TrucklineMP account IDs can already be recorded in this register; integration of their own live-data sources remains future work. No Trucky app registration or alternative third-party provider is required by this channel configuration.

## Fast TruckersMP VTC joining-date import (manual approval, no guessed IDs)

Use **Actions → Kings TruckersMP Driver Joining Date Review** in GitHub:

1. Choose `preview` to compare the official Kings TruckersMP VTC roster (`/v2/vtc/64284/members`) against the current Kings Driver / Trial Discord roles. It uses **exact `discordSnowflake` to Discord-ID matches** from current TruckersMP public profiles and can also reuse **historical mappings that Kings originally verified through the exact public `discordSnowflake` link**. Those previous links remain encrypted (`data/driver-loyalty-roles.json`) and are decrypted in memory using the existing `DRIVER_STATE_KEY` secret. No usernames or unverified guesses qualify. Conflicting public-versus-historical links are excluded. The GitHub log prints aggregate counts only.
2. Choose `publish` to send an ID-and-date review in the existing **private `driver-leadership`** channel. Matched records have the **current Kings VTC joining date**, not the TruckersMP account registration date. The report also lists current Discord Drivers/Trials whose TruckersMP-to-Discord link could not be verified. For some unmatched Drivers, an **exact, unique nickname match** supplies an optional *Possible TMP — VERIFY* link and VTC date to speed **manual review only**. Such name hints NEVER become automatically verified identities or approved register batches.
3. For each candidate, **verify that the VTC join date represents the original Kings membership date**. A VTC rejoin or earlier Kings participation can make the recorded current VTC date newer than the true Kings date.
4. Copy a confirmed batch (the content of its code block, without Markdown triple-backtick markers) to the private register <#1572736232969084948>. The batch must be sent by a current **Management, Head Management or CEO** account. The existing private channel safety/permission checks remain mandatory. The Bot does not self-authorize records, and publishing the review NEVER updates roles.
5. For new Drivers, run the same review after onboarding or add an ordinary 2-line record manually; this feature is currently **on-demand**, not an unattended weekly sync. Enabling automatic registration later requires a trusted original Kings date and an explicit sign-off design.

The importer recognizes the following **Management-authored batch format** as a single Discord message (maximum 12 entries; each Discord message stays under Discord's message-length limit):

```text
KINGS_REGISTER_BATCH_V1
discord_id: 123456789012345678
truckersmp_id: 1234567
kings_join_date: 02.02.2020
---
discord_id: 123456789012345679
truckersmp_id: 1234568
kings_join_date: 03.03.2021
```

These are examples, never real Kings identities. Duplicate IDs, duplicate platform links, invalid dates, unauthorized authors or unsafe channel permissions stop role processing rather than assigning uncertain Loyalty awards. Existing single-driver messages remain supported. The new VTC review never writes personal dates or Discord↔TruckersMP IDs into the public GitHub repository.

## Final completeness audit when current Kings Drivers have been registered

Once Management has finished entering the IDs and original joining dates, run **Actions → Kings TruckersMP Driver Joining Date Review → Run workflow** with:

- `audit-preview` – checks the existing **private** register, current Discord Driver/Trial roles, current official Kings TruckersMP VTC membership, and existing exact public/previously verified TMP↔Discord links. Outputs **counts only** to public GitHub logs. Does not send, alter or reveal private records.
- `audit-publish` – performs the same strict checks and publishes the **remaining Discord IDs and TruckersMP profile links in the private `driver-leadership` channel only**, alongside an explicit `COMPLETE` or `INCOMPLETE` assessment. Older bot-owned audit pages are removed safely; no unrelated Discord messages are changed.

The report distinguishes **missing Discord records**, **registered Drivers without a TruckersMP ID**, **registered IDs that are absent from the current official Kings VTC roster**, **exact public profile identity conflicts**, and **current official VTC members without a verified, current Driver/Trial record link**. The final category can include verified public Discord-ID candidates marked `VERIFY`, but never treats nickname matches as verified identity. A current VTC member without an exact Discord link is reported with their TruckersMP profile only, not an invented Discord ID.

**A completeness verdict is strict:** All current Kings Driver/Trial roles must have private records with valid current TruckersMP identities, and every current official Kings VTC account must be accounted for. If a VTC member is not on the Discord Driver/Trial roster, or a current member is exempt, Management must resolve/record the exception before a global `COMPLETE` claim is possible. A `COMPLETE` audit validates coverage, **not** that every historical Kings joining date is accurate; dates still require Management verification.

The private register channel must still deny `View Channel` to `@everyone` and unapproved roles (including any broad `Leadership` role not exclusively limited to CEO/Management). The bot **refuses to inspect the register** if privacy/author checks, duplicate records, or identity validation fail. Correct permissions before rerunning the audit. All audits are manual only; no automatic driver registrations or Loyalty role changes occur.

**When to use it:** Tell ChatGPT you have finished entering all current Driver IDs, then use `audit-preview` and `audit-publish` to review the remaining cases. Re-run after corrections for an updated list. Do not paste driver identities in GitHub issues, PRs or public workflow logs.

## Easier onboarding-date review from Driver Updates

The **Kings Driver Leadership Reports** GitHub Actions workflow now supports a safe on-demand historical welcome-date report:

1. Open **Actions → Kings Driver Leadership Reports → Run workflow**.
2. Choose **welcome-review-preview** first. It scans the existing `driver-updates` channel but shows **only aggregate counts** in GitHub Actions logs; it sends **no** Discord messages.
3. Choose **welcome-review-publish** to publish/update paginated lists in the existing private `driver-leadership` channel. Each current Kings Driver/Trial Driver has a row with their Discord user ID, role, the oldest identifiable **official welcome-message timestamp**, and a direct Discord link to that message. Missing historical welcomes are marked as unknown; no names are matched or guessed.
4. For each Driver, verify that the welcome-message time actually reflects the **original Kings joining date**. Only then create a **separate Management-authored record** in <#1572736232969084948> using the extended record format above.

**Important:** The report is a manual review aid, **not a data migration**. A welcome announcement may have been delayed, may have used an earlier webhook, or may have been sent after a member rejoined. The posted date is **not automatically accepted** as the Kings joining date and does not automatically trigger a Loyalty role. The scan verifies the official Driver Updates webhook, ignores promotions/departures, and includes only current verified Driver/Trial roles. It does not use guessed TruckersMP mappings, nor does it modify the existing announcements. No personal roster, Discord IDs, message links or dates are written to public GitHub files or Actions logs. Publishing refuses a channel without explicit @everyone denial or with Driver/Trial visibility overrides.

The report is **manual-only** to avoid repeated Leadership spam. Existing Daily/Monthly Driver Leadership reports and welcome messages continue unchanged. If there is no identifiable welcome announcement, verify the original Kings date using internal records instead of inventing one.

## Updating entries

- Edit the existing Driver record if the original Kings date or a verified platform ID needs correction.
- Delete an obsolete message if it should no longer be used.
- Never have two valid records for the same Discord ID, or assign one platform account ID to different Discord members. Duplicates, unknown fields or malformed records stop role updates until resolved.
- Only messages authored by current Management/CEO members (or the guild owner) are accepted.
- Only members with the verified full **Kings Driver** Discord role can receive Loyalty awards.
- Once the private register is active, registered Kings Drivers are assigned the highest earned cosmetic Loyalty role based on the recorded date. Unregistered Drivers retain their **existing** role assignments unchanged during migration; they are not guessed from TruckersMP, usernames or the Discord server join date.
- Because the register channel ID is now explicitly configured in GitHub Actions, a missing, inaccessible, or unsafe channel **fails closed** instead of falling back to the Discord-server join date. Once the channel is active, Drivers without records keep their existing Loyalty roles unchanged until Management adds their original joining dates.
- The automation runs with the existing daily and recovery schedule and does **not** create, edit or delete messages in the register.

## Privacy

The register is read directly through the Kings Systems Discord bot. Individual ID/date mappings are **not copied into the publicly accessible GitHub repository**. The role sync continues consuming only the `records` map of original Kings joining dates. A new `identities` map and per-platform `platformIndex` exist **only in process memory** for later verified cross-system integration. The public Loyalty summary includes only aggregate counts. Do not log individual identity objects or add them to public tracker snapshots.

## Future system integrations

The shared parser lives in `driver-identity-register.js`, and `loadRegister()` in `driver-loyalty-register.js` provides the private verified identity lookup once Management has configured the channel. The existing Loyalty role logic remains unchanged. **TruckersMP Live Tracker:** The scheduled `live-tracker.yml` job now reads this private register with the same read-only, permission-checked parser (`tracker-driver-identity.js`). It matches live TruckersMP IDs **exactly**, never by nickname. The public Discord Tracker shows the **public TruckersMP ID** and a neutral `Kings Identity Linked` label only when the private record matches. It never exposes Discord IDs, Kings joining dates, other platform IDs, or the private record text. The public-safe GitHub live snapshot remains **aggregate-only**. Missing bot credentials, a missing channel, unsafe permissions or malformed/ambiguous records produce **no linked labels**; ordinary live player tracking continues normally. The lookup is enabled only when `TRACKER_IDENTITY_SYNC_ENABLED=true` and `DISCORD_BOT_TOKEN` is present in the existing live workflow.

**Future integrations:** HaulMP, TrucklineMP, Statistics, Driver Management and Convoy reporting are **not yet connected** to the identity lookup; those integrations need verified provider data, privacy controls, and separate regression tests before activation.

## Other messages

The automated **Kings Driver Loyalty Achievement** announcements in `driver-leadership` are no longer generated by the daily role-sync workflow. Historical Discord messages are left unchanged. The regular **Driver Updates** welcome, Trial-to-Driver congratulations and full departure announcements continue normally, including targeted Discord user mentions.
