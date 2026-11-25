const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const p = require('../convoy-preview');
const settings = require('../convoy-preview-config.json');
const staff = '111111111111111111';
const outsider = '222222222222222222';
const thread = '333333333333333333';
const authorized = new Set([staff]);
const content = `**Event Type:** External
**TruckersMP Event Link:** https://truckersmp.com/events/37022-chinese-new-year
**Responsible Event Team Member:** <@${staff}>
**Confirmed Kings Slot:** Route B Slot 7
**Slot Confirmation:** https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333
**Kings Route:** B
**Kings Meetup / Assembly Location:** Strasbourg quarry
**Kings Meetup Time:** <t:1801141200:F>`;
const starter = () => ({ id: thread, author: { id: staff }, content, attachments: [{ id: '4', content_type: 'image/png' }] });

test('configured identifiers retain string precision and seven roles', () => {
  p.validateConfig(settings);
  assert.equal(settings.staffRoleIds.length, 7);
  assert.throws(() => p.validateConfig({ ...settings, guildId: Number(settings.guildId) }));
});

test('complete English template is recognized but never authorizes publishing', () => {
  const s = starter();
  const result = p.inspectSubmission(s, [s], authorized, ['Scheduled']);
  assert.deepEqual(result.issues, []);
  assert.equal(result.eventId, '37022');
  assert.equal(result.automaticPublicationAllowed, false);
  assert.ok(result.checks.includes('approval_actor_not_verified'));
});

test('German labels and Kings-hosted assembly do not require an external slot', () => {
  const s = starter();
  s.content = `**Eventtyp:** Eigener Kings-Convoy
**TruckersMP-Eventlink:** https://truckersmp.com/events/123
**Zuständiges Event-Team-Mitglied:** Person
**Kings-Treffpunkt / Aufstellplatz:** Kings parking
**Kings-Treffzeit:** <t:1801141200:F>`;
  s.attachments = [];
  assert.deepEqual(p.inspectSubmission(s, [s], authorized, []).issues, []);
});

test('copying the unfilled template never passes completeness checks', () => {
  const s = starter();
  s.content = `**Event Type:** External / Kings-hosted
**TruckersMP Event Link:**
**Responsible Event Team Member:**
**Confirmed Kings Slot:** Required for external convoys.
**Kings Meetup Time:** Preferably a Discord timestamp.`;
  const result = p.inspectSubmission(s, [s], authorized, []);
  assert.ok(result.issues.includes('event_type_missing_or_invalid'));
  assert.ok(result.issues.includes('meetup_missing'));
  assert.ok(result.issues.includes('truckersmp_event_link_missing_or_invalid'));
});

test('outsider and bot images cannot satisfy slot requirements', () => {
  const s = starter(); s.attachments = [];
  const images = [outsider, staff].map((id, i) => ({ ...starter(), author: { id, bot: i === 1 } }));
  assert.ok(p.inspectSubmission(s, images, authorized, []).issues.includes('slot_image_missing'));
  s.author.id = outsider;
  assert.ok(p.inspectSubmission(s, [], authorized, ['Scheduled']).issues.includes('unauthorized_submitter'));
});

test('staff image replies are counted and ambiguous manual times require review', () => {
  const s = starter(); s.attachments = [];
  s.content = s.content.replace('<t:1801141200:F>', '20:00');
  const result = p.inspectSubmission(s, [starter()], authorized, []);
  assert.ok(!result.issues.includes('slot_image_missing'));
  assert.ok(result.issues.includes('meetup_requires_manual_date_time_timezone_review'));
});

test('event URL validation rejects misleading domains and accepts official slugs', () => {
  assert.equal(p.eventId('https://truckersmp.com.evil.test/events/123'), null);
  assert.equal(p.eventId('https://evil.test/truckersmp.com/events/123'), null);
  assert.equal(p.eventId('<https://truckersmp.com/events/123-title>'), '123');
});

test('Discord requests are GET only; redirects disabled and raw errors hidden', async () => {
  const calls = [];
  const get = p.discordReader('fake-token', async (url, opts) => {
    calls.push({ url, opts });
    return { ok: false, status: 403, text: async () => 'private-body-token' };
  });
  await assert.rejects(get(`/channels/${thread}`), /HTTP 403/);
  assert.equal(calls[0].opts.method, 'GET');
  assert.equal(calls[0].opts.redirect, 'error');
  await assert.rejects(get('https://evil.test'), /Unsupported/);
  assert.equal(calls.length, 1);
});

test('bounded rate-limit retry and inaccessible members', async () => {
  const delays = []; let attempt = 0;
  const get = p.discordReader('fake', async () => ++attempt === 1 ?
    { status: 429, json: async () => ({ retry_after: 0.01 }) } :
    { ok: true, status: 200, json: async () => ({ roles: [] }) }, async ms => delays.push(ms));
  assert.deepEqual(await get(`/guilds/${settings.guildId}/roles`), { roles: [] });
  assert.equal(delays.length, 1);
  const missing = p.discordReader('fake', async () => ({ status: 404, ok: false }));
  assert.equal(await missing(`/channels/${thread}`, true), null);
  await assert.rejects(missing(`/channels/${thread}`), /HTTP 404/);
});

test('encrypted report round-trips and tampering is detected', () => {
  const key = p.reportKey(crypto.randomBytes(32).toString('base64'));
  const report = { privateNote: 'Never print this internal text' };
  const enc = p.encryptReport(report, key);
  assert.ok(!JSON.stringify(enc).includes(report.privateNote));
  const decrypt = value => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
    decipher.setAAD(Buffer.from(value.purpose));
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString();
  };
  assert.deepEqual(JSON.parse(decrypt(enc)), report);
  assert.throws(() => decrypt({ ...enc, authTag: Buffer.alloc(16).toString('base64') }));
  assert.throws(() => p.reportKey('short'));
});

test('active and archived posts are merged; other forums ignored; duplicates flagged', async () => {
  const archivedId = '444444444444444444';
  const archivedThread = { id: archivedId, parent_id: settings.forumId, thread_metadata: { archived: true } };
  const routes = [];
  const get = async route => {
    routes.push(route);
    if (route === `/channels/${settings.forumId}`) return { type: 15, guild_id: settings.guildId, available_tags: [] };
    if (route.endsWith('/roles')) return settings.staffRoleIds.map(id => ({ id }));
    if (route.endsWith('/threads/active')) return { threads: [
      { id: thread, parent_id: settings.forumId }, { id: '555555555555555555', parent_id: 'other' }
    ] };
    if (route.includes('/threads/archived/public')) return { threads: [archivedThread], has_more: false };
    if (route.includes('/members/')) return { roles: [settings.staffRoleIds[3]] };
    if (route.includes('/messages?')) return [starter()];
    if (route.includes('/messages/')) return { ...starter(), id: route.split('/').at(-1) };
    throw Error('unexpected test route');
  };
  const report = await p.runPreview(get, settings);
  assert.equal(report.posts.length, 2);
  assert.ok(report.posts.every(post => post.issues.includes('duplicate_event_id')));
  assert.ok(!routes.some(route => route.includes('555555555555555555')));
  assert.equal(routes.filter(route => route.includes('/members/')).length, 1);
});

test('wrong forum/server and absent configured roles fail before reading posts', async () => {
  await assert.rejects(p.runPreview(async () => ({ type: 0, guild_id: settings.guildId })), /not a forum/);
  await assert.rejects(p.runPreview(async route => route.endsWith('/roles') ? [] :
    { type: 15, guild_id: settings.guildId }), /roles do not exist/);
});

test('message pagination reads beyond latest 100 and rejects a stuck cursor', async () => {
  let n = 0;
  const page = Array.from({ length: 100 }, (_, i) => ({ id: String(600000000000000000n + BigInt(i)) }));
  const messages = await p.listMessages(async () => ++n === 1 ? page : [starter()], thread);
  assert.equal(messages.length, 101);
  await assert.rejects(p.listMessages(async () => page, thread), /did not advance/);
});

test('archive pagination advances across pages and rejects stalled pagination', async () => {
  let n = 0;
  const get = async route => route.endsWith('/threads/active') ? { threads: [] } : {
    threads: [{ id: thread, parent_id: settings.forumId,
      thread_metadata: { archive_timestamp: '2026-09-01T00:00:00.000Z' } }], has_more: ++n === 1
  };
  assert.equal((await p.listThreads(get, settings)).length, 1);
  await assert.rejects(p.listThreads(async route => route.endsWith('/threads/active') ? { threads: [] } : {
    threads: [{ id: thread, parent_id: settings.forumId,
      thread_metadata: { archive_timestamp: '2026-09-01T00:00:00.000Z' } }], has_more: true
  }, settings), /did not advance/);
});
