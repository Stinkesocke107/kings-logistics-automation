# Kings Logistics — Changelog Editor & Publisher safety / handover (27 Nov 2026)

## Systems
- `add-changelog-entry.yml`: authorized manual source-to-queue entry editor
- `changelog.yml`: scheduled queue-to-public-Discord publisher
- Both reuse the current single Changelog Queue, release numbering, history and existing Git-safe-push. **No new workflow** is added.

## Technical safety now implemented
- Malformed existing `changelog-state.json`, `changelog-history.json`, nonnumeric KL numbering and duplicate/stale history release IDs **stop publication before POST**; previous state is never silently replaced by a first-run default.
- Missing historical archive for an already established automated version cannot be treated as a new release history.
- Missing/blank/unsupported queue entries cannot be skipped silently and then cleared. A too-long category section blocks the entire post rather than truncating approved text.
- Human-entered Changelog content is omitted from public Actions logs. Discord failure details are reduced to HTTP status; the response body is not printed.
- The two existing dispatch workflows run synthetically mocked/isolated safety tests before doing any actual edit/publication.
- The tests do not need real webhook secrets and do not send messages. They verify valid queue edits, duplicate rejection, malformed inputs, publisher no-op, failed send and pre-send failure gates. New isolated tests also cover confirmed complete delivery with lost Git state, partial delivery, altered historical content, missing bot credentials and Discord GET failures.

## Last mandatory operational acceptance
1. Authorized operator validates a genuine queued non-sensitive release item in the **manual** Changelog Editor workflow and confirms it was committed safely.
2. The Publisher records a **single real published changelog** into the intended existing public Discord destination with correct release number, full message, queue emptying and permanent history. Source and actual posted message must be independently checked.
3. New delivery guard (2026-11-27): Before posting a **nonempty** release queue, the existing publisher uses the protected bot token to verify its existing webhook identity and scan the public channel's complete accessible message history (bounded, fail-closed). Every new release part has a unique release/part marker. A complete matching prior delivery is independently recognized and local state is safely re-archived **without a duplicate Discord POST**; a partial, altered, inaccessible or truncated history **blocks** further posting until an authorized operator resolves it. This protects the ordinary Git-push-conflict retry path but does **not** constitute a guaranteed global exactly-once delivery protocol under every possible external failure. Confirm behavior in genuine next release and ambiguous-delivery recovery.
4. Document editor/publisher operator handover and obtain explicit CEO final acceptance. Do not create artificial public posts to pass the checklist.

**Status: Technical safety implementation, offline verification. NOT fully accepted until genuine human release and independent Discord read-back.** The publisher now requires working `DISCORD_BOT_TOKEN` channel GET access for nonempty release queues; missing access blocks publication without losing entries.
