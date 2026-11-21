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
function sanitizeLegacyPublicArchive(archive) {
  // Public output preserves event timing, confirmed slots, images and their
  // operational links. Source notes and accompanying free text are private.
  const input = validateArchive(archive);
  const output = JSON.parse(JSON.stringify(input));
  output.convoys = output.convoys.map(convoy => {
    convoy.sourceNotes = [];
    convoy.sourceMessageIds = [];
    convoy.slotEvidence = [];
    if (Array.isArray(convoy.kingsSlotImages)) {
      convoy.kingsSlotImages = convoy.kingsSlotImages.map(item => {
        if (!item || typeof item !== 'object') return item;
        const safe = {...item}; delete safe.accompanyingText; return safe;
      });
    }
    if (convoy.kingsSlotImage && typeof convoy.kingsSlotImage === 'object') {
      delete convoy.kingsSlotImage.accompanyingText;
    }
    // Derive safe status rather than copying raw staff conversation/notes.
    if (convoy.slotStatus === 'pending') convoy.kingsSlot = 'Pending — slot confirmation required';
    else if (convoy.confirmedKingsSlot) {
      convoy.kingsSlot = convoy.kingsSlotImage
        ? 'Confirmed — Slot image available' : 'Confirmed — Kings slot';
    } else convoy.kingsSlot = null;
    return convoy;
  });
  output.failures = (Array.isArray(output.failures) ? output.failures : [])
    .map(item => ({month: String(item?.month || 'Unknown'), category: 'import-failure-details-withheld'}));
  return output;
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
  sanitizeLegacyPublicArchive, hasUnredactedPrivateNotes};
