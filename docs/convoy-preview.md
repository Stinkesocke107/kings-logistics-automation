# Convoy system: stage 1, read-only preview

Status: proposed implementation, not an active convoy system. No scheduled
trigger, Discord writes, tag changes, publication, reminders or git commits.
No changes to existing systems or the old Convoy Calendar.

## Configuration

`convoy-preview-config.json` contains the server, new management forum and seven
Event Team role IDs supplied by the owner. Any one of these current roles allows
submission (variant 1). Their existence is checked against the selected server.
No extra management approval is introduced. Approval itself is not performed in
this stage: a Scheduled tag does not identify who changed it, and is never
treated as proof of authorization.

## What is checked

- Correct server and forum type; all configured roles exist.
- Active and publicly archived threads in this forum only. “Public thread” is
  Discord's thread type; it still inherits the private forum's access restrictions.
- Current submitter roles, English/German template fields, official event links,
  required slot and confirmation reference, assembly location and meetup.
- Image attachments from current authorized staff, including replies.
- Duplicate event IDs across the inspected forum.

Edit structured fields in the starter message for this preview. Arbitrary prose
updates in replies are not interpreted. Staff-authored image replies are counted,
but the system cannot prove that an attachment is a slot map or that a screenshot
confirms a booking. Dates given as plain text are marked for manual timezone
review; use Discord timestamps for an unambiguous meetup.

This stage does not fetch TruckersMP event details, check the full calendar's
limits/timing, import old forums, verify routes or download attachments. These
remain later steps. Future Kings events without an external slot are supported.
No public announcements will be added by this system.

The reader paginates archived threads and messages. Access errors and bounded
pagination limits fail the run instead of silently presenting a complete result.
A missing starter is recorded for attention. Missing message content can indicate
a disabled Message Content Intent; it is not treated as a valid submission.

## Setup and first live run — after owner approval

1. Use a Discord application with a bot account installed on the Kings server.
   Enable Message Content Intent. Give it View Channel and Read Message History
   on the management forum. No Administrator, Send Messages or Manage Threads
   permissions are required for this stage. Avoid unrelated channel access.
2. Store the bot token as the GitHub Actions secret `DISCORD_BOT_TOKEN`.
3. Generate a random 32-byte base64 key locally, for example with Node:
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
   Save it as `CONVOY_REPORT_KEY` and keep a secure copy to decrypt reports.
   Never post either secret in a chat, commit or Actions log.
4. After approval, merge the reviewed change. The workflow must exist on the
   default branch to be available through GitHub's manual Actions menu.
5. With separate approval for the live read, manually run
   **Kings Convoy - Read-only Preview**. Nothing runs on a timer or on PR creation.

## Report and privacy

This repository is public. The only saved output is
`tmp/convoy-preview.enc.json`, uploaded as an encrypted artifact for 7 days.
No plaintext report or internal images are uploaded or committed. Logs expose
only aggregate counts and fixed diagnostics. The report contains parsed fields,
thread/attachment identifiers and issue codes, not downloaded images or full
conversations. It is a temporary inspection report, not durable convoy state.

Decrypt only in a private local environment with `CONVOY_REPORT_KEY` set. Example:

```js
const fs = require('node:fs');
const crypto = require('node:crypto');
const { reportKey } = require('./convoy-preview');
const data = JSON.parse(fs.readFileSync('tmp/convoy-preview.enc.json', 'utf8'));
const decipher = crypto.createDecipheriv('aes-256-gcm',
  reportKey(process.env.CONVOY_REPORT_KEY), Buffer.from(data.iv, 'base64'));
decipher.setAAD(Buffer.from('kings-convoy-preview-v1'));
decipher.setAuthTag(Buffer.from(data.authTag, 'base64'));
const plaintext = Buffer.concat([
  decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()
]);
fs.writeFileSync('tmp/convoy-preview.private.json', plaintext, { mode: 0o600 });
```

Never decrypt in a public Actions job. Keep plaintext in the ignored `tmp/`
directory and delete it when the review is complete. Do not feed it into the
existing backup workflow. Persistent encrypted convoy state and its recovery
strategy will be implemented separately before publication is enabled.

## Local validation

`node --test tests/convoy-preview.test.cjs`

Tests use synthetic data and mocked Discord responses. They never contact
Discord and do not need credentials. A passing suite is not a live access test.

References:
- https://docs.discord.com/developers/resources/guild#list-active-guild-threads
- https://docs.discord.com/developers/resources/channel#list-public-archived-threads
- https://docs.discord.com/developers/resources/message#get-channel-messages
