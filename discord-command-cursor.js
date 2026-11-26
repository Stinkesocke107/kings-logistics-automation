'use strict';
// Bounded, fail-closed incremental Discord history reader for HR Probation
// and Driver LOA. This module never writes Discord, roles or local state.
// Discord GET messages are newest-first; skipped pages are NOT proof that a
// human command was processed. Cursor moves only after caller persistence.
const ID=/^\d{1,20}$/;
const PAGE_SIZE=100,MAX_PAGES=20;
function checkedId(value,allowZero=false){
  if(typeof value!=='string'||!ID.test(value)||
     (!allowZero&&BigInt(value)===0n))
    throw Error('Kings protected command cursor unverified');
  return BigInt(value);
}
function checkedPage(batch,previousOldest){
  if(!Array.isArray(batch)||batch.length>PAGE_SIZE)
    throw Error('Kings protected command page unverified');
  let prior=previousOldest;
  for(const message of batch){
    if(!message||typeof message!=='object'||Array.isArray(message))
      throw Error('Kings protected command page unverified');
    const id=checkedId(message.id);
    if(prior!==null&&id>=prior)
      throw Error('Kings protected command message order unverified');
    prior=id;
  }
  return prior;
}
async function readNewCommands({channelId,cursor,fetchPage,maxPages=MAX_PAGES}={}){
  checkedId(channelId);
  const bootstrap=cursor===null||cursor===undefined;
  const checkpoint=bootstrap?null:checkedId(cursor,true);
  if(typeof fetchPage!=='function'||!Number.isInteger(maxPages)||
    maxPages<1||maxPages>MAX_PAGES)
    throw Error('Kings protected command reader configuration invalid');
  const messages=[];
  let before=null,newestId=null;
  for(let page=0;page<maxPages;page++){
    const batch=await fetchPage(before);
    const oldest=checkedPage(batch,before===null?null:checkedId(before));
    if(newestId===null&&batch.length)newestId=batch[0].id;
    // Bootstrap skips ALL historical commands. Even an initially empty
    // channel must use the durable zero cursor rather than skipping the
    // first genuinely new command on the next poll.
    if(bootstrap)return Object.freeze({
      bootstrap:true,newestId:newestId||'0',
      messages:Object.freeze([])
    });
    let reachedCheckpoint=false;
    for(const message of batch){
      if(checkedId(message.id)<=checkpoint){
        reachedCheckpoint=true;
        break;
      }
      messages.push(message);
    }
    if(reachedCheckpoint||batch.length<PAGE_SIZE)
      return Object.freeze({
        bootstrap:false,newestId:newestId||cursor,
        messages:Object.freeze([...messages].reverse())
      });
    before=String(oldest);
  }
  // Do not advance any cursor: a partial history would permanently skip
  // older unseen commands. Recover by an operator inspection, not a reset.
  throw Error('Kings protected command backlog exceeds the safe read-only limit');
}
module.exports={readNewCommands,PAGE_SIZE,MAX_PAGES};
