'use strict';

// Management-only review of welcome announcements, NOT an authority for Kings
// joining dates. Does not write to the private Identity/Loyalty register.
const { syncTextMessage } = require('./leadership-message-sync');

const DISCORD_API = 'https://discord.com/api/v10';
const GUILD_ID = '1114967437788577792';
const DRIVER_ROLE_ID = '1204836048845410405';
const REGISTER_CHANNEL_ID = '1572736232969084948';
const MAX_HISTORY_MESSAGES = 3000;
const VIEW_CHANNEL = 1n << 10n;
const HEADER_MARKER = '👑 **Kings Driver Welcome Review | Page ';

function snowflake(value) {
  return /^\d{17,20}$/.test(String(value || ''));
}
function normalizedName(value) {
  return String(value || '').normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function isName(channel, expected) {
  const n = normalizedName(channel?.name);
  return n === expected || n.endsWith('-' + expected);
}
function officialWebhookId(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Driver Updates webhook is missing or invalid.'); }
  if (!['discord.com', 'discordapp.com', 'canary.discord.com'].includes(parsed.hostname)) {
    throw new Error('Driver Updates webhook must belong to Discord.');
  }
  const match = /^\/api(?:\/v\d+)?\/webhooks\/(\d{17,20})\/[^/]+\/?$/.exec(parsed.pathname);
  if (!match) throw new Error('Driver Updates webhook path is invalid.');
  return match[1];
}
function selectChannel(channels, kind) {
  if (!Array.isArray(channels)) throw new Error('Discord channel list unavailable.');
  const matching = channels.filter(c => Number(c.type) === 0 && isName(c, kind));
  if (matching.length !== 1) throw new Error('Cannot uniquely resolve ' + kind + ' channel.');
  return matching[0];
}
function assertPrivateLeadershipChannel(channel, roles, guildId) {
  if (Number(channel?.type) !== 0 || String(channel?.guild_id) !== String(guildId) ||
      !Array.isArray(channel?.permission_overwrites)) {
    throw new Error('Driver Leadership channel cannot be verified as a private text channel.');
  }
  const everyone = channel.permission_overwrites.find(o =>
    String(o.id) === String(guildId) && Number(o.type) === 0);
  if (!everyone || !(BigInt(String(everyone.deny || '0')) & VIEW_CHANNEL)) {
    throw new Error('Driver Leadership review requires @everyone View Channel denied.');
  }
  const byId = new Map(roles.map(r => [String(r.id), normalizedName(r.name)]));
  for (const o of channel.permission_overwrites) {
    if (!(BigInt(String(o.allow || '0')) & VIEW_CHANNEL)) continue;
    if (Number(o.type) === 0) {
      const role = byId.get(String(o.id));
      // 'Driver Leadership' and 'Driver Management' are staff roles, not
      // Kings Driver membership roles. Never reject every role containing
      // the word 'driver': that wrongly blocked the real Leadership channel.
      const generalAudience = /(^|-)driver(s)?($|-)|(^|-)trial($|-)|(^|-)partner(s)?($|-)|(^|-)community($|-)/.test(role || '');
      const leadershipOnly = /^(?:kings-)?(?:driver-(?:leadership|management|services|operations)(?:-leadership|-management)?|driver-team-lead|driver-director|(?:head-management|management|director|team-lead|head-staff|high-staff|staff)-(?:driver-services|driver-operations|driver-leadership|driver-management))$/.test(role || '');
      if (!role || (generalAudience && !leadershipOnly)) {
        throw new Error('Driver Leadership review blocked: non-Leadership role with View Channel access: ' +
          (role || 'unknown role') + '. Remove its View Channel allow permission.');
      }
    } else if (Number(o.type) !== 1) {
      throw new Error('Unknown Driver Leadership permission overwrite.');
    }
  }
}

function parseWelcomeMessage(message, webhookId) {
  if (!snowflake(message?.id)) return null;
  const currentWebhook = String(message?.webhook_id || '') === String(webhookId);
  // Older announcements were often written by staff members rather than
  // today's webhook. This is a REVIEW LIST, never an authoritative join-date
  // source; manual posts are visibly labeled for Management confirmation.
  const historicalBot = message?.author?.bot === true &&
    (!message.webhook_id || snowflake(message.webhook_id));
  const manualStaffPost = !message?.webhook_id &&
    snowflake(message?.author?.id) && message?.author?.bot !== true;
  if (!currentWebhook && !historicalBot && !manualStaffPost) return null;

  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  const welcomeEmbed = embeds.find(embed =>
    String(embed?.title || '').includes('Welcome to the Kings Family!') &&
    /^Please welcome /i.test(String(embed?.description || '')));

  // Former Driver Updates announcements used ordinary webhook text:
  // "Please welcome <@discordId> to the Kings Family as a Driver".
  // This path MUST retain a directly tagged Discord member. Do not match
  // usernames or TruckersMP names and do not accept promotions/departures.
  const sourceText = welcomeEmbed
    ? String(welcomeEmbed.description || '')
    : String(message.content || '');
  if (!/\bPlease\s+welcome\b[\s\S]{0,180}<@!?(\d{17,20})>[\s\S]{0,450}\bKings\s+(?:Family|Logistics)\b/i.test(sourceText)) {
    return null;
  }

  const mentions = [...sourceText.matchAll(/<@!?(\d{17,20})>/g)].map(match=>match[1]);
  if (mentions.length===0 || new Set(mentions).size!==1) return null;
  const discordId=mentions[0];
  // In an embed-based update, public ping content must not name a different
  // driver. Other plain-text legacy content was validated in its entirety.
  if (welcomeEmbed) {
    const contentMentions=[...String(message.content||'').matchAll(/<@!?(\d{17,20})>/g)]
      .map(match=>match[1]);
    if (contentMentions.some(id=>id!==discordId)) return null;
  }
  const when=new Date(message.timestamp);
  if (!Number.isFinite(when.getTime()) || when>new Date() ||
      when.getUTCFullYear()<2015) return null;
  return {
    discordId,
    sentAt:when.toISOString(),
    messageId:String(message.id),
    sourceKind:currentWebhook ? (welcomeEmbed?'current-embed':'current-text')
      : historicalBot ? (welcomeEmbed?'historical-bot-embed':'historical-bot-text')
      : (welcomeEmbed?'manual-staff-embed':'manual-staff-text')
  };
}

function selectEarliestWelcomes(messages, webhookId) {
  const byId = new Map();
  for (const message of messages) {
    const parsed = parseWelcomeMessage(message, webhookId);
    if (!parsed) continue;
    const current = byId.get(parsed.discordId);
    if (!current) byId.set(parsed.discordId, { ...parsed, count:1 });
    else {
      current.count++;
      if (parsed.sentAt < current.sentAt) {
        current.sentAt = parsed.sentAt;
        current.messageId = parsed.messageId;
        current.sourceKind = parsed.sourceKind;
      }
    }
  }
  return byId;
}
function currentDrivers(roles, members) {
  if (!Array.isArray(roles) || !Array.isArray(members) || !members.length) {
    throw new Error('Current Kings Discord roles or roster unavailable.');
  }
  const driver = roles.find(r => String(r.id) === DRIVER_ROLE_ID);
  if (!driver || normalizedName(driver.name) !== 'kings-driver') {
    throw new Error('Authoritative Kings Driver role not found.');
  }
  const trials = roles.filter(r => normalizedName(r.name) === 'kings-trial');
  if (trials.length > 1) throw new Error('Ambiguous Kings Trial roles.');
  const trialId = trials.length ? String(trials[0].id) : null;
  const ids = new Set();
  const out = [];
  for (const member of members) {
    const id = String(member?.user?.id || '');
    if (!snowflake(id) || !Array.isArray(member.roles)) {
      throw new Error('Incomplete Kings Discord member roster.');
    }
    if (ids.has(id)) throw new Error('Duplicate Kings Discord member ID.');
    ids.add(id);
    if (member.user?.bot) continue;
    const assigned = member.roles.map(String);
    if (!assigned.includes(DRIVER_ROLE_ID) && !(trialId && assigned.includes(trialId))) continue;
    out.push({discordId:id, role:assigned.includes(DRIVER_ROLE_ID) ? 'Driver' : 'Trial'});
  }
  if (!out.length) throw new Error('No verified Kings Drivers found; refusing empty report.');
  return out.sort((a,b) => a.discordId.localeCompare(b.discordId));
}
function dateDE(iso) {
  const d = new Date(iso);
  return String(d.getUTCDate()).padStart(2,'0')+'.'+
    String(d.getUTCMonth()+1).padStart(2,'0')+'.'+d.getUTCFullYear();
}
function buildWelcomeRows(drivers, welcomeIndex, guildId, sourceChannelId) {
  const rows = drivers.map(driver => {
    const welcome = welcomeIndex.get(driver.discordId);
    const marker = welcome
      ? dateDE(welcome.sentAt) + ' • [Welcome](https://discord.com/channels/' +
        guildId + '/' + sourceChannelId + '/' + welcome.messageId + ')' +
        (welcome.count > 1 ? ' • ' + welcome.count + '×' : '')
        + (welcome.sourceKind?.startsWith('historical-') ? ' • *Older bot source: verify*' : '')
        + (welcome.sourceKind?.startsWith('manual-') ? ' • *Manual welcome: verify*' : '')
      : '*No verified welcome in scan*';
    return {
      ...driver,
      welcomeFound:Boolean(welcome),
      text:'• \`'+driver.discordId+'\` • '+driver.role+' • '+marker
    };
  });
  return rows.sort((a,b) => Number(b.welcomeFound)-Number(a.welcomeFound) ||
    a.discordId.localeCompare(b.discordId));
}
function buildWelcomePages(rows, {completeScan, scannedMessages}, maxLength=1900) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Empty welcome-review rows.');
  const headline = 'Welcome message timestamp ≠ verified Kings joining date. ' +
    'Check original record before entering it in <#'+REGISTER_CHANNEL_ID+'>. ' +
    'No Loyalty roles are changed.';
  const note = completeScan ? 'History scan complete.' :
    'Only most recent '+scannedMessages+' messages checked; older welcomes may be missing.';
  const preamble = headline + '\n' + note;
  const chunks = [];
  let current = [];
  const safePageHeaderLength = (HEADER_MARKER+'999/999**\n'+preamble+'\n').length;
  for (const row of rows) {
    if (row.text.length + safePageHeaderLength > maxLength) {
      throw new Error('Single driver review entry exceeds Discord message limit.');
    }
    if (current.length && current.join('\n').length + row.text.length + 1 +
        safePageHeaderLength > maxLength) {
      chunks.push(current);
      current = [];
    }
    current.push(row.text);
  }
  if (current.length) chunks.push(current);
  if (chunks.length > 30) throw new Error('Welcome review report too large for a safe publish.');
  return chunks.map((chunk,i) =>
    HEADER_MARKER+(i+1)+'/'+chunks.length+'**\n'+preamble+'\n'+chunk.join('\n'));
}

async function generateWelcomeReview({token, webhookUrl, transport=fetch, enforcePrivateDestination=true}) {
  if (!token) throw new Error('DISCORD_BOT_TOKEN is required.');
  const webhookId = officialWebhookId(webhookUrl);
  const discord = async pathname => {
    if (!pathname.startsWith('/')) throw new Error('Invalid Discord path.');
    const response = await transport(DISCORD_API+pathname, {
      method:'GET',
      headers:{Authorization:'Bot '+token,'User-Agent':'Kings Driver Welcome Review/1.0'},
      signal:AbortSignal.timeout(15000),
      redirect:'error'
    });
    if (!response?.ok) throw new Error('Discord read failed HTTP '+response?.status+' (no identities logged).');
    return response.json();
  };
  const [channels, roles] = await Promise.all([
    discord('/guilds/'+GUILD_ID+'/channels'),
    discord('/guilds/'+GUILD_ID+'/roles')
  ]);
  const updates = selectChannel(channels,'driver-updates');
  const leadership = selectChannel(channels,'driver-leadership');
  if (updates.id === leadership.id) throw new Error('Source and destination channels cannot be identical.');
  // Preview only computes aggregate counts and prints no driver IDs/dates.
  // The private destination check applies to every actual publication.
  if (enforcePrivateDestination) assertPrivateLeadershipChannel(leadership,roles,GUILD_ID);
  const members = [];
  let after = '';
  for (let page=0;page<20;page++) {
    const query = new URLSearchParams({limit:'1000'});
    if (after) query.set('after',after);
    const batch = await discord('/guilds/'+GUILD_ID+'/members?'+query);
    if (!Array.isArray(batch)) throw new Error('Invalid Discord guild roster page.');
    members.push(...batch);
    if (batch.length < 1000) break;
    after = String(batch.at(-1)?.user?.id || '');
    if (!snowflake(after) || page === 19) throw new Error('Incomplete Discord guild roster.');
  }
  const drivers = currentDrivers(roles,members);
  const sourceMessages = [];
  let before = '';
  let completeScan = false;
  for (let page=0;page<MAX_HISTORY_MESSAGES/100;page++) {
    const query = new URLSearchParams({limit:'100'});
    if (before) query.set('before',before);
    const batch = await discord('/channels/'+updates.id+'/messages?'+query);
    if (!Array.isArray(batch)) throw new Error('Invalid Driver Updates history page.');
    sourceMessages.push(...batch);
    if (batch.length < 100) { completeScan = true; break; }
    before = String(batch.at(-1)?.id || '');
    if (!snowflake(before)) throw new Error('Invalid Driver Updates history cursor.');
  }
  // Aggregate-only diagnostics: CI logs must never contain Discord IDs,
  // message authors, raw message contents, dates, or webhook tokens.
  const sourceStats = {
    sourceMessages:sourceMessages.length,
    currentWebhookMessages:sourceMessages.filter(m=>String(m?.webhook_id||'')===String(webhookId)).length,
    welcomeEmbeds:sourceMessages.filter(m=>(m.embeds||[]).some(e=>
      String(e.title||'').includes('Welcome to the Kings Family'))).length,
    welcomeText:sourceMessages.filter(m=>/Please welcome/i.test(String(m.content||''))).length,
    textWithDirectMention:sourceMessages.filter(m=>/Please welcome/i.test(String(m.content||'')) &&
      /<@!?\d{17,20}>/.test(String(m.content||''))).length,
    textFromBot:sourceMessages.filter(m=>/Please welcome/i.test(String(m.content||'')) &&
      m.author?.bot===true).length,
    textWithWebhook:sourceMessages.filter(m=>/Please welcome/i.test(String(m.content||'')) &&
      Boolean(m.webhook_id)).length,
    textWithKings:sourceMessages.filter(m=>/Please welcome/i.test(String(m.content||'')) &&
      /Kings (Family|Logistics)/i.test(String(m.content||''))).length,
    textWithDriverRole:sourceMessages.filter(m=>/Please welcome/i.test(String(m.content||'')) &&
      /(?:Trial )?Driver/i.test(String(m.content||''))).length
  };
  const index = selectEarliestWelcomes(sourceMessages,webhookId);
  const rows = buildWelcomeRows(drivers,index,GUILD_ID,updates.id);
  const pages = buildWelcomePages(rows, {completeScan,scannedMessages:sourceMessages.length});
  return {
    pages,
    leadershipChannelId:String(leadership.id),
    counts:{currentDrivers:rows.length, withWelcome:rows.filter(x=>x.welcomeFound).length,
      withoutWelcome:rows.filter(x=>!x.welcomeFound).length,
      scannedMessages:sourceMessages.length, completeScan,sourceStats}
  };
}

async function main() {
  const mode = String(process.env.DRIVER_WELCOME_REVIEW_MODE || 'preview');
  if (!['preview','publish','preflight'].includes(mode)) throw new Error('Use preview, preflight or publish.');
  const token = process.env.DISCORD_BOT_TOKEN;
  const report = await generateWelcomeReview({
    token,webhookUrl:process.env.DRIVER_UPDATES_WEBHOOK_URL,
    enforcePrivateDestination:mode !== 'preview'
  });
  // GitHub Actions logs are publicly visible; never print member IDs, dates,
  // messages or complete report contents there.
  console.log('Kings welcome review: '+report.counts.currentDrivers+' current Driver/Trial members, '+
    report.counts.withWelcome+' matching welcomes, '+
    report.counts.withoutWelcome+' missing within scan, '+
    report.pages.length+' pages; history complete: '+report.counts.completeScan+'.');
  console.log('Source coverage (aggregate only): '+report.counts.sourceStats.sourceMessages+
    ' messages, '+report.counts.sourceStats.currentWebhookMessages+' current webhook messages, '+
    report.counts.sourceStats.welcomeEmbeds+' welcome-title embeds, '+
    report.counts.sourceStats.welcomeText+' plain-text welcome candidates.');
  console.log('Legacy welcome hints (aggregate only): '+
    report.counts.sourceStats.textWithDirectMention+' direct Discord mentions, '+
    report.counts.sourceStats.textFromBot+' bot authors, '+
    report.counts.sourceStats.textWithWebhook+' webhook messages, '+
    report.counts.sourceStats.textWithKings+' Kings references, '+
    report.counts.sourceStats.textWithDriverRole+' Driver-role references.');
  if (mode !== 'publish') {
    console.log(mode === 'preflight'
      ? 'READ-ONLY PREFLIGHT: private Leadership permission checks passed; no Discord writes.'
      : 'PREVIEW ONLY: no Discord messages sent; no register or role writes.');
    return;
  }
  for (let i=0;i<report.pages.length;i++) {
    const marker = HEADER_MARKER+(i+1)+'/';
    const result = await syncTextMessage({
      token, channelId:report.leadershipChannelId,
      marker,content:report.pages[i],
      userAgent:'Kings Driver Welcome Review/1.0'
    });
    if (result.action === 'suppressed') {
      throw new Error('Welcome report disabled by Leadership consolidation safety policy.');
    }
  }
  console.log('Published reviewed candidate list in private Driver Leadership; no register or role changes.');
}

if (require.main === module) {
  main().catch(error => {
    console.error('Kings Driver welcome review failed: '+error.message);
    process.exit(1);
  });
}
module.exports = {
  officialWebhookId, selectChannel, assertPrivateLeadershipChannel,
  parseWelcomeMessage, selectEarliestWelcomes, currentDrivers,
  buildWelcomeRows, buildWelcomePages, generateWelcomeReview
};
