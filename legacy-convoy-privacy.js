'use strict';
// Kings Legacy Convoy Archive: keep original staff notes encrypted, export only
// the fields needed for existing convoy reminder/overview consumers.
const crypto = require('node:crypto');
const DOMAIN = 'kings-legacy-convoy-private-archive-v1';
function derive(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Kings Legacy Convoy private archive key missing or too short.');
  }
  return crypto.createHash('sha256').update(DOMAIN + '\0').update(secret).digest();
}
function validateArchive(archive) {
  if (!archive || typeof archive !== 'object' || Array.isArray(archive)
      || archive.version !== 1 || !Array.isArray(archive.convoys)
      || !archive.convoys.every(v => v && typeof v === 'object' && !Array.isArray(v))) {
    throw new Error('Kings Legacy Convoy archive structure invalid.');
  }
  return archive;
}
function encryptLegacyArchive(archive, secret) {
  const key = derive(secret);
  const input = validateArchive(archive);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(input), 'utf8')), cipher.final()
  ]);
  return {version:1, encrypted:true, algorithm:'aes-256-gcm',
    iv:iv.toString('base64'), authTag:cipher.getAuthTag().toString('base64'),
    ciphertext:encrypted.toString('base64')};
}
function decryptLegacyArchive(container, secret) {
  const key = derive(secret);
  if (!container || container.encrypted !== true || container.algorithm !== 'aes-256-gcm'
      || container.version !== 1 || typeof container.iv !== 'string'
      || typeof container.authTag !== 'string' || typeof container.ciphertext !== 'string') {
    throw new Error('Kings Legacy Convoy private container invalid.');
  }
  try {
    const dec = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(container.iv,'base64'));
    dec.setAuthTag(Buffer.from(container.authTag,'base64'));
    const plain = Buffer.concat([dec.update(Buffer.from(container.ciphertext,'base64')),dec.final()]);
    return validateArchive(JSON.parse(plain.toString('utf8')));
  } catch {
    throw new Error('Kings Legacy Convoy private archive integrity check failed.');
  }
}
// Stable, non-reversible *display identity*; the original Discord thread
// identifier remains exclusively in the encrypted private source.
function publicLegacyId(source) {
  if (typeof source==='string' && /^legacy-public-v2-[0-9a-f]{24}$/.test(source)) return source;
  const value=String(source?.legacyId || source?.sourceThreadId || source || '');
  if (!value || value==='[object Object]') throw Error('Legacy source identity missing.');
  return 'legacy-public-v2-'+crypto.createHash('sha256')
    .update('kings-legacy-public-identity-v2\0').update(value).digest('hex').slice(0,24);
}
function publicPlain(value) {
  if (typeof value!=='string') return null;
  const text=value.trim();
  if (!text || text.length>250 || /<@!?[0-9]{8,}>|discord(?:app)?\.(?:com|net)|(?:cdn|media)\.discordapp\.(?:com|net)|[a-z0-9_.-]+\/webhooks\//i.test(text)) return null;
  return text;
}
function publicLocation(value) {
  if (!value) return null;
  if (typeof value==='string') return publicPlain(value);
  if (typeof value!=='object' || Array.isArray(value)) return null;
  const city=publicPlain(value.city);
  const location=publicPlain(value.location);
  const name=publicPlain(value.name);
  return {city,location,name};
}
function publicEventId(value) {
  return /^\d{3,10}$/.test(String(value||'')) ? String(value) : null;
}
function sanitizedPublicConvoy(convoy) {
  const id=publicLegacyId(convoy);
  const eventId=publicEventId(convoy.eventId);
  const originalTmp=convoy.truckersmp&&typeof convoy.truckersmp==='object'
    ?convoy.truckersmp:null;
  const name=publicPlain(originalTmp?.name)||
    'Legacy Convoy'+(convoy.eventDate?' — '+String(convoy.eventDate):'');
  const withImage=Boolean(convoy.kingsSlotImage||
    (Array.isArray(convoy.kingsSlotImages)&&convoy.kingsSlotImages.length));
  const confirmed=convoy.confirmedKingsSlot===true;
  const slotStatus=['confirmed','pending','unknown'].includes(convoy.slotStatus)
    ?convoy.slotStatus:'unknown';
  const eventUrl=eventId?'https://truckersmp.com/events/'+eventId:null;
  const official=originalTmp?{
    id:eventId?Number(eventId):null,
    name:publicPlain(originalTmp.name),
    server:publicPlain(originalTmp.server),
    game:publicPlain(originalTmp.game),
    hostVtc:publicPlain(originalTmp.hostVtc),
    meetupAtUtc:publicPlain(originalTmp.meetupAtUtc),
    startAtUtc:publicPlain(originalTmp.startAtUtc),
    departure:publicLocation(originalTmp.departure),
    arrive:publicLocation(originalTmp.arrive),
    url:eventUrl
  }:null;
  return {
    legacy:true,
    readOnly:true,
    legacyId:id,
    source:'old-discord-convoy-calendar',
    sourceMonth:publicPlain(convoy.sourceMonth),
    // All original Discord message/thread/channel IDs, internal URLs,
    // images, source note contents and staff conversation stay encrypted.
    sourceMessageIds:[],
    sourceNotes:[],
    slotEvidence:[],
    eventId,eventUrl,name,
    eventDate:typeof convoy.eventDate==='string' ? convoy.eventDate:null,
    meetingTime:publicPlain(convoy.meetingTime),
    eventUnix:Number.isSafeInteger(Number(convoy.eventUnix))&&Number(convoy.eventUnix)>0
      ?Number(convoy.eventUnix):null,
    eventTimeValid:convoy.eventTimeValid===true,
    eventTimeZone:publicPlain(convoy.eventTimeZone),
    departureUnix:Number.isSafeInteger(Number(convoy.departureUnix))&&Number(convoy.departureUnix)>0
      ?Number(convoy.departureUnix):null,
    status:['Scheduled','Completed','Cancelled','Legacy Past'].includes(convoy.status)
      ?convoy.status:'Scheduled',
    slotStatus,
    confirmedKingsSlot:confirmed,
    kingsSlot:slotStatus==='pending'?'Pending — slot confirmation required':
      confirmed?(withImage?'Confirmed — Slot image available':'Confirmed — Kings slot'):null,
    // Only an availability flag is public; original Discord attachment ID,
    // URL and uploader text are never part of a public JSON projection.
    kingsSlotImage:withImage?{available:true}:null,
    kingsSlotImages:[],
    server:publicPlain(convoy.server),
    game:publicPlain(convoy.game),
    hostVtc:publicPlain(convoy.hostVtc),
    meetingPoint:publicPlain(convoy.meetingPoint),
    start:publicPlain(convoy.start),
    destination:publicPlain(convoy.destination),
    route:publicPlain(convoy.route),
    truckersmp:official,
    importedAt:publicPlain(convoy.importedAt),
    sourceUnavailable:convoy.sourceUnavailable===true,
    preservedFromPreviousImport:convoy.preservedFromPreviousImport===true
  };
}
function sanitizeLegacyPublicArchive(archive) {
  const input=validateArchive(archive);
  const output={
    version:1,
    mode:'one-time-frozen-legacy-import',
    importedAt:publicPlain(input.importedAt),
    authority:'old Discord Convoy Calendar before Convoy Center',
    readOnly:true,
    monthChannels:(Array.isArray(input.monthChannels)?input.monthChannels:[])
      .map(row=>({
        label:publicPlain(row.label),
        year:Number.isSafeInteger(row.year)?row.year:null,
        month:Number.isSafeInteger(row.month)?row.month:null
      })),
    policy:{
      newConvoysSource:'Convoy Center only',
      legacySourceFrozen:true,
      duplicateRule:'Convoy Center event ID wins over Legacy',
      overview:'Legacy future convoys remain counted; slot confirmation and timing are retained.',
      driverReminders:'Legacy reminders use verified encrypted evidence, not public Discord metadata.'
    },
    summary:input.summary ? JSON.parse(JSON.stringify(input.summary)) : {},
    monthStats:Object.fromEntries(Object.entries(input.monthStats||{}).map(([k,v])=>[
      k,{threads:Number(v?.threads||0),imported:Number(v?.imported||0),
        pastSkipped:Number(v?.pastSkipped||0),
        preservedMissingSource:Number(v?.preservedMissingSource||0)}
    ])),
    duplicateEventIds:(input.duplicateEventIds||[]).map(item=>({
      eventId:publicEventId(item.eventId),
      firstLegacyId:publicLegacyId(item.firstLegacyId),
      duplicateLegacyId:publicLegacyId(item.duplicateLegacyId)
    })),
    failures:(input.failures||[]).map(item=>({
      month:publicPlain(item?.month)||'Unknown',
      category:'import-failure-details-withheld'
    })),
    convoys:input.convoys.map(sanitizedPublicConvoy)
  };
  assertPublicLegacyArchiveSafe(output);
  return output;
}
function assertPublicLegacyArchiveSafe(output) {
  validateArchive(output);
  const forbiddenKeys=new Set([
    'sourceThreadId','sourceThreadName','sourceMonthChannelId','sourceThreadArchived',
    'sourceMessageId','messageId','attachmentId','capturedUrl','messageUrl',
    'accompanyingText','sourceUnavailableReason','preservedAt','threadId',
    'filename','contentType','imageUrl','uploaderId','ownerId','authorId'
  ]);
  function walk(v) {
    if (Array.isArray(v)) {for(const x of v)walk(x);return}
    if (v && typeof v==='object') {
      for (const [k,x] of Object.entries(v)) {
        if (forbiddenKeys.has(k)) throw Error('Public Legacy archive contains forbidden private metadata.');
        if (['sourceNotes','slotEvidence','sourceMessageIds','kingsSlotImages'].includes(k)
            && Array.isArray(x) && x.length!==0) throw Error('Public Legacy archive contains raw source details.');
        walk(x);
      }
      return;
    }
    if (typeof v==='string' && (
      /<@!?[0-9]{8,}>/.test(v)||
      /(?:discord(?:app)?\.(?:com|net)|cdn\.discordapp\.(?:com|net))\//i.test(v)||
      /https?:\/\/[^\s]*\/webhooks\//i.test(v)||
      /\b(?:old-calendar:|legacy-public-v1-)[0-9]{10,}\b/i.test(v)
    )) throw Error('Public Legacy archive contains a private Discord identifier or URL.');
  }
  walk(output);
  for (const c of output.convoys) {
    if (!/^legacy-public-v2-[0-9a-f]{24}$/.test(c.legacyId))
      throw Error('Public Legacy archive contains non-anonymous source identity.');
  }
  return true;
}
function hasUnredactedPrivateNotes(archive) {
  return validateArchive(archive).convoys.some(x =>
    (Array.isArray(x.sourceNotes) && x.sourceNotes.some(y => y?.text))
    || (Array.isArray(x.slotEvidence) && x.slotEvidence.some(y => y?.text))
    || (Array.isArray(x.kingsSlotImages) && x.kingsSlotImages.some(y => y?.accompanyingText))
    || Boolean(x.kingsSlotImage?.accompanyingText)
  );
}
module.exports = {validateArchive, encryptLegacyArchive, decryptLegacyArchive,
  sanitizeLegacyPublicArchive, hasUnredactedPrivateNotes, publicLegacyId, assertPublicLegacyArchiveSafe};
