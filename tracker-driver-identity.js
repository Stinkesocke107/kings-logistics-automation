'use strict';
// Read-only private Kings Driver Identity -> TruckersMP lookup for the Live Tracker.
// No Discord IDs, dates, identity records or account mappings are ever persisted.
const { loadRegister } = require('./driver-loyalty-register');

const DISCORD_API = 'https://discord.com/api/v10';
const DEFAULT_GUILD_ID = '1114967437788577792';

function isValidDiscordSnowflake(value) {
  return /^\d{17,20}$/.test(String(value || ''));
}
function isValidTruckersMpId(value) {
  return /^[1-9]\d{0,17}$/.test(String(value ?? ''));
}

function markLinkedTruckersMpPlayers(players, index) {
  if (!Array.isArray(players)) throw new Error('Invalid Live Tracker player list.');
  if (index != null && !(index instanceof Map)) {
    throw new Error('Invalid private TruckersMP identity index.');
  }
  return players.map(player => ({
    ...player,
    // An exact numeric TMP-ID match is required; names are NEVER matched.
    // Only this public-safe boolean leaves the private identity module.
    identityLinked: isValidTruckersMpId(player?.tmpId) &&
      Boolean(index?.has(String(player.tmpId)))
  }));
}

async function loadTrackerTruckersMpIdentityIndex(options = {}) {
  const token = options.token ?? process.env.DISCORD_BOT_TOKEN;
  if (!token) return { enabled:false, index:new Map() };
  const guildId = String(options.guildId || process.env.DISCORD_GUILD_ID || DEFAULT_GUILD_ID);
  if (!isValidDiscordSnowflake(guildId)) throw new Error('Invalid Kings Discord guild configuration.');
  const transport = options.transport || fetch;

  // A restricted reader: no non-GET requests, no webhook writes, no user-controlled URLs.
  async function discord(pathname) {
    if (!pathname.startsWith('/')) throw new Error('Invalid Discord read path.');
    const response = await transport(DISCORD_API + pathname, {
      method: 'GET',
      headers: {
        Authorization: 'Bot ' + token,
        Accept: 'application/json',
        'User-Agent': 'Kings Logistics Live Identity Read/1.0'
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'error'
    });
    if (!response?.ok) throw new Error('Private Discord identity read failed (HTTP ' + response?.status + ').');
    return response.json();
  }

  async function members() {
    const roster = [];
    let after = '';
    for (let page = 0; page < 20; page++) {
      const params = new URLSearchParams({limit:'1000'});
      if (after) params.set('after',after);
      const batch = await discord('/guilds/' + guildId + '/members?' + params);
      if (!Array.isArray(batch)) throw new Error('Incomplete private Discord member roster.');
      roster.push(...batch);
      if (batch.length < 1000) {
        if (!roster.length) throw new Error('Empty private Discord member roster.');
        return roster;
      }
      if (page === 19) break;
      after = String(batch.at(-1)?.user?.id || '');
      if (!isValidDiscordSnowflake(after)) throw new Error('Invalid private Discord member pagination.');
    }
    throw new Error('Incomplete private Discord member roster.');
  }

  const [bot, roles, roster] = await Promise.all([
    discord('/users/@me'),
    discord('/guilds/' + guildId + '/roles'),
    members()
  ]);
  if (!isValidDiscordSnowflake(bot?.id) || !Array.isArray(roles)) {
    throw new Error('Invalid private Discord identity metadata.');
  }

  // Reuse the same Management-authorship, permission and uniqueness checks as
  // Driver Loyalty. An unsafe or malformed register must never produce links.
  const register = await loadRegister(discord, guildId, roles, roster, bot.id, {
    channelId: options.channelId || process.env.DRIVER_LOYALTY_REGISTER_CHANNEL_ID,
    channelName: options.channelName || process.env.DRIVER_LOYALTY_REGISTER_CHANNEL_NAME
  });
  return {
    enabled: register.enabled,
    index: register.platformIndex.truckersmp
  };
}

module.exports = {
  isValidTruckersMpId,
  markLinkedTruckersMpPlayers,
  loadTrackerTruckersMpIdentityIndex
};
