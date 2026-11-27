'use strict';
// Strict read-only privacy preflight for Kings Operations Notices.
// Current role IDs and channel overwrite metadata are always checked on each run.
// Discord Guild Administrators can bypass channel denies: see operator guide.
const ID = /^\d{17,22}$/;
const VIEW = 1n << 10n;
const MAX_APPROVED_ROLES = 12;

function reject() { throw Error('Operations channel privacy or role approval unverified'); }
function roleList(value) {
  if (typeof value !== 'string' || !value || value.length > 512) reject();
  const ids = value.split(',').map(x => x.trim());
  if (ids.length < 1 || ids.length > MAX_APPROVED_ROLES ||
      ids.some(id => !ID.test(id)) || new Set(ids).size !== ids.length) reject();
  return Object.freeze(ids);
}
function hasBit(value, flag) {
  try { return (BigInt(String(value)) & flag) === flag; }
  catch { reject(); }
}
function validatePrivateOperationsChannel({
  channel, channelId, guildId, bot, botMember, guildRoles, approvedRoleIds
} = {}) {
  if (!ID.test(String(channelId || '')) || !ID.test(String(guildId || '')) ||
      !channel || String(channel.id) !== channelId ||
      String(channel.guild_id) !== guildId || channel.type !== 0 ||
      !Array.isArray(channel.permission_overwrites) ||
      !bot || !ID.test(String(bot.id)) || bot.bot !== true ||
      !botMember || !Array.isArray(botMember.roles) ||
      !Array.isArray(guildRoles) || !Array.isArray(approvedRoleIds) ||
      approvedRoleIds.length < 1 || approvedRoleIds.length > MAX_APPROVED_ROLES ||
      approvedRoleIds.some(id => !ID.test(id) || id === guildId) ||
      new Set(approvedRoleIds).size !== approvedRoleIds.length) reject();

  const name = String(channel.name || '').toLowerCase()
    .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!['operations-notifications', 'kings-operations-notifications'].includes(name)) reject();

  const roles = new Map();
  for (const role of guildRoles) {
    if (!role || !ID.test(String(role.id)) || roles.has(String(role.id))) reject();
    roles.set(String(role.id), role);
  }
  if (!roles.has(guildId) || approvedRoleIds.some(id => !roles.has(id))) reject();

  const botRoles = new Set(botMember.roles.map(String));
  if ([...botRoles].some(id => !ID.test(id) || !roles.has(id))) reject();

  const overwrites = new Map();
  for (const item of channel.permission_overwrites) {
    const id = String(item?.id || '');
    const type = item?.type;
    if (!ID.test(id) || ![0,1].includes(type) ||
        (type === 0 && !roles.has(id))) reject();
    const key = type + ':' + id;
    if (overwrites.has(key)) reject();
    overwrites.set(key,item);
    const positiveView = hasBit(item.allow,VIEW);
    const deniedView = hasBit(item.deny,VIEW);
    if (positiveView && deniedView) reject();
    if (positiveView) {
      if (type === 1 && id !== String(bot.id)) reject();
      if (type === 0 && id !== guildId &&
          !approvedRoleIds.includes(id) && !botRoles.has(id)) reject();
    }
  }
  const everyone = overwrites.get('0:' + guildId);
  if (!everyone || !hasBit(everyone.deny,VIEW) || hasBit(everyone.allow,VIEW))
    reject();

  // Every approved audience role needs explicit visibility, rather than
  // relying on display names, inherited permissions, or an accidental admin role.
  for (const id of approvedRoleIds) {
    const item = overwrites.get('0:' + id);
    if (!item || !hasBit(item.allow,VIEW) || hasBit(item.deny,VIEW)) reject();
  }
  return true;
}
module.exports = {roleList, validatePrivateOperationsChannel, MAX_APPROVED_ROLES};
