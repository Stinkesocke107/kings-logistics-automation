# Kings Social Video News — Retired (1 November 2026)

The Kings Logistics CEO decided to retire the unused GitHub YouTube video notification system.

The workflow, publishing script and isolated tests were removed. Their references in the central scheduler, workflow registry, monitoring and Discord monitor were also removed.

The existing `data/social-news-state.json` remains untouched as a historical record, preventing accidental reposting if the feature is ever reconsidered.

TruckersMP News and Changelog remain operational. TikTok and Instagram notifications are handled independently by PostPing outside GitHub.

The prior configuration remains accessible in Git history. Do not automatically restore the deleted workflow.
