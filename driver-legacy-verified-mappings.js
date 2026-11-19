'use strict';
// Historical Kings Loyalty mappings were originally created by the official
// TruckersMP /player/{id}.discordSnowflake exact link (October 2026).
// They remain AES-256-GCM encrypted in GitHub. Read them in memory only;
// never publish their plaintext or treat them as verified join dates.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {numericId,discordId}=require('./kings-vtc-register-contract');
const DOMAIN='kings-driver-loyalty-roles-v1';
const FILE=path.join(__dirname,'data','driver-loyalty-roles.json');
const ALLOWED_SOURCES=new Set(['truckersmp-discordSnowflake','stored-verified-mapping']);

function parseVerifiedLegacyMappings(container,secret){
  if(!container || container.encrypted!==true ||
      container.algorithm!=='aes-256-gcm' || !container.iv ||
      !container.authTag || !container.ciphertext ||
      typeof secret!=='string' || secret.length<32) {
    throw Error('Private historical mapping state unavailable or unsafe.');
  }
  const key=crypto.createHash('sha256').update(DOMAIN+'\0')
    .update(secret).digest();
  let decrypted;
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,
      Buffer.from(container.iv,'base64'));
    decipher.setAuthTag(Buffer.from(container.authTag,'base64'));
    decrypted=JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(container.ciphertext,'base64')),decipher.final()
    ]).toString('utf8'));
  }catch{
    throw Error('Could not authenticate encrypted historical Driver mapping file.');
  }
  if(!Array.isArray(decrypted?.mappings) || decrypted.mappings.length>5000)
    throw Error('Invalid historical Driver mapping shape.');
  const result=[],seenTmp=new Set(),seenDiscord=new Set();
  for(const row of decrypted.mappings){
    if(!ALLOWED_SOURCES.has(row?.source))continue;
    const tmpId=numericId(row.tmpId),discord=discordId(row.discordUserId);
    if(!tmpId || !discord)continue;
    if(seenTmp.has(tmpId)||seenDiscord.has(discord)){
      // A broken or conflicting old cache cannot be used as identity truth.
      throw Error('Conflicting historical verified Driver mapping entries.');
    }
    seenTmp.add(tmpId);seenDiscord.add(discord);
    result.push({tmpId,discordId:discord,source:'historical-verified'});
  }
  return result;
}
function loadVerifiedLegacyMappings(secret=process.env.DRIVER_STATE_KEY){
  if(!secret || !fs.existsSync(FILE))return [];
  const container=JSON.parse(fs.readFileSync(FILE,'utf8'));
  return parseVerifiedLegacyMappings(container,secret);
}
module.exports={parseVerifiedLegacyMappings,loadVerifiedLegacyMappings};
