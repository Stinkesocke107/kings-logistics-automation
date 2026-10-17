# Kings Logistics Social Media News — Production Routing

Status: updated 2026-10-17. TikTok and Instagram are handled by the separately configured **PostPing Discord bot**; YouTube stays on the existing **Kings GitHub Action**. This change does not touch TruckersMP News or existing Kings automations.

## Responsible systems (one publisher per platform)

| Platform | Official profile | Publisher |
| --- | --- | --- |
| TikTok | https://www.tiktok.com/@kings__logistics | PostPing (external Discord bot) |
| Instagram | https://www.instagram.com/kings___logistics/ | PostPing (external Discord bot) |
| YouTube / Shorts | https://www.youtube.com/channel/UCB6vBqCWktsZnAyrITC6E-Q | Kings GitHub `.github/workflows/social-news.yml` |
| TruckersMP News | Existing Kings source | Kings GitHub `.github/workflows/news.yml` |

**Important:** PostPing is an independent Discord service. Its TikTok/Instagram posts do **not** pass through `social-news.js`, do not use GitHub Actions secrets, and are **not** confirmed or monitored by this GitHub workflow. The owner reports having configured it; a real Discord post is still needed to confirm production delivery.

## GitHub YouTube publication

- Runs approximately every five minutes via GitHub Actions; schedules can be delayed.
- Reads only the public official Kings YouTube Atom feed. No YouTube API key or login required.
- Posts to Discord News channel ID `1479853315264217202` using `NEWS_DISCORD_WEBHOOK_URL`.
- Uses `DISCORD_BOT_TOKEN` read-message-history access to check for previous posts and help avoid duplicates.
- Uses Kings blue `#182DFF`, a direct video link and no mass mentions.
- On first successful poll, establishes a baseline; historic videos are not posted automatically.
- Optional manually selected `post_latest_test=true` sends **only the latest YouTube upload once**, even if older. The existing YouTube test checkpoint has already been stored in `data/social-news-state.json`; subsequent one-time tests will skip it.
- `verify_connections_only=true` checks the YouTube feed without publishing or touching state.
- `data/social-news-state.json` is preserved. Never delete/reset it to force a repeat notification.
- Live feed diagnosis on 2026-10-17 showed YouTube's internal RSS channel ID without the leading `UC`; the parser verifies the official canonical channel link before accepting this format.

## PostPing setup / production acceptance

Within the PostPing bot/dashboard, configure **two** separate monitors:

1. TikTok account: `@kings__logistics` — new video uploads.
2. Instagram account: `@kings___logistics` — new Reels / videos.
3. Set the destination for **both** to the intended Kings News Discord channel (`1479853315264217202`). Verify channel permissions for the bot.
4. Make sure **PostPing YouTube monitoring is not enabled** for the Kings YouTube account; GitHub already handles it.
5. Check that any PostPing monitoring quotas, account limits and intervals cover both profiles. Do not assume that a free plan includes both without confirming within PostPing.
6. Observe the **next actual public TikTok video and Instagram Reel** and confirm that each produces exactly one Discord message with the correct link. Do not claim working automation until each has an actual production proof.

Discord delivery through PostPing is separate from GitHub, so the GitHub News logs cannot prove that TikTok/Instagram notifications have been sent.

## Archived API integration

The old TikTok Display API and Instagram Graph API *helper functions* remain in `social-news.js` for historical regression tests and future controlled migration. The production account list is **YouTube-only**, and the GitHub workflow no longer passes TikTok/Instagram secrets. This prevents accidental double publishing even if those secrets already exist.

Reactivating either official API route would require a deliberate code review, verified credentials, token rotation and disabling that platform in PostPing first. Never enable two publishers for the same platform.

## Main files

- `social-news.js`: YouTube production publisher, retained uninvoked legacy API helpers.
- `.github/workflows/social-news.yml`: scheduled/manual YouTube news publishing.
- `tests/social-news.test.cjs`: regressions and one-publisher configuration proof.
- `data/social-news-state.json`: deduplication evidence, unchanged by this migration.
