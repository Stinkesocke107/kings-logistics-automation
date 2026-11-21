'use strict';
// Read-only Discord: no API calls. Migration is deterministic except ciphertext IV.
const fs=require('node:fs');
const path=require('node:path');
const {encryptLegacyArchive,decryptLegacyArchive,sanitizeLegacyPublicArchive,
  hasUnredactedPrivateNotes,validateArchive}=require('../legacy-convoy-privacy');
const PUBLIC=path.join(__dirname,'..','data','legacy-convoys.json');
const PRIVATE=path.join(__dirname,'..','data','legacy-convoys-private.json');
function loadJson(file) {
  try {return JSON.parse(fs.readFileSync(file,'utf8'));}
  catch {throw new Error('Kings Legacy private migration: state unreadable (details withheld).');}
}
function migrate(original, existingPrivate, secret) {
  const source = existingPrivate ? decryptLegacyArchive(existingPrivate,secret) : validateArchive(original);
  if (existingPrivate && hasUnredactedPrivateNotes(original)) {
    // An old workflow may have republished plaintext. Restore redacted public
    // view from encrypted full original, without losing legitimate metadata.
    return {publicState:sanitizeLegacyPublicArchive(source),privateState:existingPrivate};
  }
  if (!existingPrivate && !hasUnredactedPrivateNotes(source)) {
    throw new Error('Kings Legacy private migration: cannot prove original source was preserved.');
  }
  return {publicState:sanitizeLegacyPublicArchive(source),
    privateState:existingPrivate || encryptLegacyArchive(source,secret)};
}
function main() {
  const secret=process.env.LEGACY_PRIVATE_STATE_KEY;
  if (!secret || Buffer.byteLength(secret,'utf8')<32) throw new Error('Private archive key missing.');
  if (!fs.existsSync(PUBLIC)) throw new Error('Public legacy archive missing.');
  const current=loadJson(PUBLIC);
  const prior=fs.existsSync(PRIVATE)?loadJson(PRIVATE):null;
  const result=migrate(current,prior,secret);
  const publicBody=JSON.stringify(result.publicState,null,2)+'\n';
  const privateBody=JSON.stringify(result.privateState,null,2)+'\n';
  if (fs.existsSync(PRIVATE) && fs.readFileSync(PUBLIC,'utf8')===publicBody) {
    console.log('Legacy Convoy archive already privacy-sanitized; no changes.');
    return;
  }
  // Writes are only committed together by the calling workflow after success.
  fs.writeFileSync(PRIVATE, privateBody, 'utf8');
  fs.writeFileSync(PUBLIC, publicBody, 'utf8');
  console.log('Legacy Convoy source preserved in encrypted storage; public notes sanitized.');
}
if(require.main===module) {
  try {main();}
  catch {console.error('Legacy Convoy privacy migration blocked safely (details withheld).');process.exitCode=1;}
}
module.exports={migrate};
