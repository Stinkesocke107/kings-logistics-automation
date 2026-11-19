// Private, read-only Kings Driver Loyalty + identity register.
// Legacy two-line records remain supported; verified platform IDs are optional.
// No IDs or dates are written to the public GitHub repository.
const { parseDriverIdentityRecord, parseDriverIdentityRecords, createPlatformIndex, addIdentityToIndex } = require('./driver-identity-register');
const VIEW_CHANNEL = 1n << 10n;
const MAX_MESSAGES = 2000;
const CHANNEL_NAME = 'driver-loyalty-records';

function normalizeRoleName(name = '') {
  return String(name).normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function managementRole(role) {
  return new Set([
    'ceo', 'ceo founder', 'kings ceo', 'kings ceo founder',
    'management', 'kings management', 'head management', 'kings head management'
  ]).has(normalizeRoleName(role?.name));
}
const parseRecord = parseDriverIdentityRecord;

function authorizedManager(userId, members, roles, ownerId) {
  if (String(userId) === String(ownerId)) return true;
  const member = members.find((m) => String(m?.user?.id) === String(userId));
  if (!member || member.user?.bot || !Array.isArray(member.roles)) return false;
  const byId = new Map(roles.map((r) => [String(r.id), r]));
  return member.roles.some((id) => managementRole(byId.get(String(id))));
}
function assertPrivateChannel(channel, guildId, roles, members, ownerId, botId) {
  if (String(channel.guild_id) !== String(guildId) || Number(channel.type) !== 0) {
    throw new Error('Kings Loyalty register must be a text channel in this Kings Discord.');
  }
  if (!Array.isArray(channel.permission_overwrites)) {
    throw new Error('Could not verify private Loyalty channel permissions.');
  }
  const byId = new Map(roles.map((r) => [String(r.id), r]));
  const all = channel.permission_overwrites;
  const everyone = all.find((o) => String(o.id) === String(guildId) && Number(o.type) === 0);
  if (!everyone || !(BigInt(String(everyone.deny || '0')) & VIEW_CHANNEL)) {
    throw new Error('Kings Loyalty register must deny View Channel to @everyone.');
  }
  for (const overwrite of all) {
    const canView = Boolean(BigInt(String(overwrite.allow || '0')) & VIEW_CHANNEL);
    if (!canView) continue;
    if (Number(overwrite.type) === 0) {
      const role = byId.get(String(overwrite.id));
      if (!managementRole(role) && String(role?.tags?.bot_id || '') !== String(botId)) {
        throw new Error('Loyalty register has a non-Management role with View Channel access.');
      }
    } else if (Number(overwrite.type) === 1) {
      if (String(overwrite.id) !== String(botId) &&
          !authorizedManager(overwrite.id, members, roles, ownerId)) {
        throw new Error('Loyalty register has a non-Management member with View Channel access.');
      }
    } else {
      throw new Error('Unknown channel permission overwrite type.');
    }
  }
}
async function loadRegister(discord, guildId, roles, members, botId, options = {}) {
  const desiredId = String(options.channelId || '').trim();
  const name = String(options.channelName || CHANNEL_NAME).toLowerCase();
  const channels = await discord('/guilds/' + guildId + '/channels');
  if (!Array.isArray(channels)) throw new Error('Discord channel directory unavailable.');
  const candidates = channels.filter((c) => desiredId
    ? String(c.id) === desiredId
    : String(c.name).toLowerCase() === name && Number(c.type) === 0);
  if (candidates.length === 0 && !desiredId) {
    // Before a Management-only channel has been configured, preserve existing
    // roles and the established Discord-joined_at calculation.
    return { enabled: false, records: new Map(), identities: new Map(), platformIndex: createPlatformIndex(), channelId: null };
  }
  if (candidates.length !== 1) throw new Error('Missing or ambiguous private Kings Loyalty channel.');
  const channel = candidates[0];
  const guild = await discord('/guilds/' + guildId);
  if (!guild?.owner_id) throw new Error('Cannot verify Kings Discord owner.');
  assertPrivateChannel(channel, guildId, roles, members, guild.owner_id, botId);

  const records = new Map();
  // Memory-only identity lookup for later Live Tracker and Driver integrations.
  const identities = new Map();
  const platformIndex = createPlatformIndex();
  let before = '';
  for (let page = 0; page < MAX_MESSAGES / 100; page++) {
    const params = new URLSearchParams({limit:'100'});
    if (before) params.set('before', before);
    const batch = await discord('/channels/' + channel.id + '/messages?' + params);
    if (!Array.isArray(batch)) throw new Error('Invalid private Loyalty register message history.');
    for (const message of batch) {
      const parsedRecords = parseDriverIdentityRecords(message.content);
      if (!parsedRecords.length) continue;
      if (!authorizedManager(message.author?.id, members, roles, guild.owner_id)) {
        throw new Error('Loyalty record was posted by a non-Management member; no role changes allowed.');
      }
      for (const parsed of parsedRecords) {
        if (records.has(parsed.userId)) {
          throw new Error('Duplicate Loyalty register entry for the same Discord ID; remove outdated entry first.');
        }
        addIdentityToIndex(platformIndex, parsed);
        records.set(parsed.userId, parsed.joinedAt);
        identities.set(parsed.userId, parsed);
      }
    }
    if (batch.length < 100) return { enabled: true, records, identities, platformIndex, channelId: String(channel.id) };
    before = String(batch[batch.length - 1]?.id || '');
    if (!before) throw new Error('Incomplete private Loyalty record history.');
  }
  throw new Error('Private Loyalty record channel exceeds the safe reading limit.');
}
module.exports = {parseRecord, managementRole, authorizedManager, assertPrivateChannel, loadRegister};
