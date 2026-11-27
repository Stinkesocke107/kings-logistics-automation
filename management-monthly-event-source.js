'use strict';
// Event Leadership state is AES-256-GCM encrypted. A ciphertext wrapper is
// never a valid plaintext Management Monthly Event report.
const fs=require('node:fs');
const {decryptEventState}=require('./event-leadership-state');
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const NUMERIC_FIELDS=Object.freeze([
  'counted','completed','cancelled','scheduled','ready','needsInfo','changes'
]);

function readProtectedEventMonthlyReport(file,month,secret){
  if(typeof month!=='string'||!MONTH.test(month))
    throw new Error('Invalid Management Monthly Event period');
  if(!fs.existsSync(file))return null;
  let container;
  try{container=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{throw new Error('Management Monthly encrypted Event source JSON invalid');}
  if(container?.encrypted!==true)
    throw new Error('Management Monthly Event source is not encrypted');
  const state=decryptEventState(container,secret);
  const entries=state.monthlyReports.filter(x=>x?.key===month);
  const keyCount=state.publishedMonthlyKeys.filter(x=>x===month).length;
  if(entries.length>1||keyCount>1||Boolean(entries.length)!==Boolean(keyCount))
    throw new Error('Management Monthly Event publication journal inconsistent');
  const entry=entries[0];
  if(!entry)return null;
  if(NUMERIC_FIELDS.some(name=>!Number.isSafeInteger(entry[name])||
      entry[name]<0||entry[name]>100000))
    throw new Error('Management Monthly Event original period counts invalid');
  if(entry.completed+entry.cancelled>entry.counted||
     entry.scheduled+entry.ready+entry.needsInfo+
       entry.completed>entry.counted)
    throw new Error('Management Monthly Event source counts contradictory');
  // Source-claim report only: no implied historical completeness or attendance.
  return Object.freeze({...entry,historyVerified:false,attendanceVerified:false});
}
module.exports={readProtectedEventMonthlyReport};
