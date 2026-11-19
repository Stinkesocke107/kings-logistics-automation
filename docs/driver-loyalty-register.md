# Kings Driver Identity & Loyalty — private Management register

This private Discord register is the authoritative source of a **Kings Driver's original Kings joining date**, and may also hold **verified Discord ↔ platform account mappings**. It is intentionally the same existing Management channel, not a second public database. The monthly Driver Leadership membership-duration section and automated TruckersMP achievement notices remain disabled. Welcome and promotion messages in **Driver Updates are unchanged**.

## Setup

1. Use the already created private Kings Discord channel **`1572736232969084948`** (`<#1572736232969084948>`). This exact channel ID is pinned in both GitHub Actions workflows, `driver-achievements.yml` and `live-tracker.yml`, through `DRIVER_LOYALTY_REGISTER_CHANNEL_ID`. The configured ID is authoritative, so the channel can keep its existing Discord name; do **not** create a second register channel. Never make this channel public.
2. Deny **View Channel** to `@everyone`.
3. Allow **View Channel** and **Read Message History** only for **Management**, **Head Management**, and **CEO**, along with the Kings Systems bot. Users with Discord's Administrator permission may also be able to view private channels regardless of channel overrides.
4. Do not give other Staff, Drivers, Trial Drivers, Partner or community roles channel visibility. The automation checks explicit channel permission overwrites and refuses role updates if access has been explicitly granted to unrelated users or roles.
5. An authorised Management/CEO account posts **one ordinary message per Driver**. The existing two-line format is still fully supported:

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
