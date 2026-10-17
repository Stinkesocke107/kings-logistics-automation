# Kings Social Video News — Discord

Adds **official TikTok videos**, **Instagram Reels/videos** and **YouTube uploads (including Shorts exposed in the YouTube RSS feed)** to the existing Kings News channel. TruckersMP News (`news.js`) stays unchanged.

## Official Kings Logistics profiles

- **TikTok:** https://www.tiktok.com/@kings__logistics
- **Instagram:** https://www.instagram.com/kings___logistics/
- **YouTube:** https://www.youtube.com/channel/UCB6vBqCWktsZnAyrITC6E-Q
- **YouTube channel RSS:** https://www.youtube.com/feeds/videos.xml?channel_id=UCB6vBqCWktsZnAyrITC6E-Q

The YouTube RSS feed is public and does not require an API token. It contains recent public uploads, including eligible Shorts. The RSS does not reliably distinguish a Short from a regular video, so announcements say **YouTube Upload**.

## Publishing policy

- Each new TikTok video, Instagram Reel/video and YouTube video/Short exposed in the channel feed receives **its own** Discord message, with a direct link to the original.
- Kings blue embed: `#182DFF`.
- **No history/backfill.** On the first successful authenticated poll of each platform, only a baseline is recorded.
- Each platform has independent ID checkpoints in `data/social-news-state.json`. After every confirmed Discord post, the checkpoint is saved.
- Before posting an unseen ID, the bot looks through recent News messages for the embedded `Kings Social News: <platform>:<id>` marker. This also helps recover when posting succeeded but the GitHub state push failed.
- No roles or mass mentions; no deletion or modification of old messages.
- TikTok and Instagram APIs and the official YouTube RSS are **read only**. Posting happens **only** to the established Discord News webhook.
- Scheduled checks run approximately every five minutes, but GitHub Actions schedules can be delayed.

## Connect the official accounts (required before live posting)

**YouTube:** the public feed is configured for Kings channel `UCB6vBqCWktsZnAyrITC6E-Q`; no YouTube login or API key is required. A first authenticated workflow run with an existing Discord News webhook/bot will baseline current YouTube uploads without posting them. Only later releases will be published. The public RSS feed exposes a limited number of recent entries, so this does **not** guarantee that an upload missed during a prolonged outage will be recoverable.


1. Create or approve a TikTok developer app with **Display API** and `video.list`. Authorize the **official Kings TikTok account** through TikTok Login Kit and obtain its access token.
2. Connect the official Kings Instagram **Business/Creator** account with the Instagram API using Instagram Login and `instagram_business_basic`. Obtain a suitable account access token.
3. In GitHub repository **Settings → Secrets and variables → Actions**, configure these repository secrets:
   - `SOCIAL_TIKTOK_ACCESS_TOKEN` — access token for the official Kings TikTok account
   - `SOCIAL_INSTAGRAM_ACCESS_TOKEN` — access token for the official Kings Instagram professional account
   - `NEWS_DISCORD_WEBHOOK_URL` — the existing Kings News channel webhook (already used by TruckersMP news)
   - `DISCORD_BOT_TOKEN` — existing Kings Systems bot, requires permission to **read message history** in the Kings News channel
4. The destination is `1479853315264217202` (the channel recorded by the existing TruckersMP News publishing evidence). Verify that the webhook actually targets this channel.
5. Run **Kings Social Video News** via workflow_dispatch once. This initializes baselines for every connected platform (YouTube works without its own token) **without announcing historical videos**. Subsequent public uploads are announced separately.

Never paste tokens into Discord, GitHub issues, or this chat. The workflow skips any social platform without a configured token.

## Token renewal — required for long-term unattended operation

TikTok's `access_token` commonly lasts **24 hours**; its `refresh_token` must be rotated securely using TikTok's OAuth token endpoint. Long-lived Instagram tokens also expire and need periodic refresh. The initial integration does **not** silently store OAuth refresh credentials in Git and does **not** claim to auto-renew these secrets.

Until a dedicated **secure refresh-token manager** is connected, the account owner must renew the platform tokens before expiry or the corresponding social checker will stop and report an error. Never store refreshed tokens in `data/social-news-state.json`. The remaining setup phase is to arrange safe rotating token storage and complete a live, non-posting baseline check of each authorized account.

## Files

- `social-news.js` — official API/RSS polling, filtering, Discord history proof check, deduplication, checkpoint
- `.github/workflows/social-news.yml` — scheduled execution, tests and safe checkpoint persistence
- `tests/social-news.test.cjs` — offline regression suite
- `data/social-news-state.json` — created on first authorized poll; no secrets
