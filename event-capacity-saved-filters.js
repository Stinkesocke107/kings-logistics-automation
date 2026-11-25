'use strict';
// Private owner-only saved Event Capacity filters. Pure revisioned state;
// the trusted private host must authenticate, encrypt and persist transactions.
const {timestamp}=require('./event-capacity-core');
const {validateFilters}=require('./event-capacity-search');
const ERROR='Kings Event Capacity saved filter authorization or validation failed.';
const SNOWFLAKE=/^\d{17,22}$/;
const FILTER_ID=/^[A-Za-z0-9_-]{1,40}$/;
const ROLES=new Set(['Event Coordination','Event Leadership','CEO']);
function fail(){throw new Error(ERROR);}
function checkedTime(value){
  const ms=timestamp(value);
  if(ms===null)fail();
  return new Date(ms).toISOString();
}
function scopeOf(scope){
  if(!scope||typeof scope!=='object'||Array.isArray(scope)||
    !SNOWFLAKE.test(String(scope.guildId||''))||
    !SNOWFLAKE.test(String(scope.forumId||'')))fail();
  return {guildId:String(scope.guildId),forumId:String(scope.forumId)};
}
function principal(actor){
  if(!actor||actor.source!=='trusted-server-gateway'||
    !SNOWFLAKE.test(String(actor.id||''))||
    !Array.isArray(actor.verifiedRoles)||
    !actor.verifiedRoles.some(x=>ROLES.has(x)))fail();
  return actor.id;
}
function empty(scope,at){
  return {version:1,scope:scopeOf(scope),revision:0,createdAt:checkedTime(at),
    updatedAt:checkedTime(at),users:Object.create(null),history:[]};
}
function validate(state,scope){
  if(!state||state.version!==1||!Number.isSafeInteger(state.revision)||
    state.revision<0||!state.users||typeof state.users!=='object'||
    Array.isArray(state.users)||!Array.isArray(state.history)||
    state.history.length!==state.revision||
    timestamp(state.createdAt)===null||timestamp(state.updatedAt)===null)fail();
  const actual=scopeOf(state.scope);
  if(scope){
    const expected=scopeOf(scope);
    if(expected.guildId!==actual.guildId||expected.forumId!==actual.forumId)fail();
  }
  if(Object.keys(state.users).length>10000)fail();
  for(const [uid,entries] of Object.entries(state.users)){
    if(!SNOWFLAKE.test(uid)||!Array.isArray(entries)||entries.length>5)fail();
    const ids=new Set();
    for(const item of entries){
      if(!item||!FILTER_ID.test(item.id)||ids.has(item.id)||
        typeof item.title!=='string'||item.title.length>40||
        !item.title.trim()||/[\u0000-\u001f]/.test(item.title)||
        timestamp(item.updatedAt)===null)fail();
      ids.add(item.id);
      try{validateFilters(item.filters);}catch{fail();}
    }
  }
  return state;
}
function listForActor(state,actor){
  validate(state);
  const id=principal(actor);
  return structuredClone(state.users[id]||[]);
}
function apply(state,command,actor,at){
  validate(state);
  const id=principal(actor),time=checkedTime(at);
  if(!command||typeof command!=='object'||Array.isArray(command)||
    command.expectedRevision!==state.revision||
    !['save','delete'].includes(command.action)||
    !FILTER_ID.test(command.id||''))fail();
  const copy=structuredClone(state);
  const items=copy.users[id]||[];
  const index=items.findIndex(x=>x.id===command.id);
  if(command.action==='save'){
    const title=command.title;
    if(typeof title!=='string'||!title.trim()||title.length>40||
      /[\u0000-\u001f]/.test(title))fail();
    try{validateFilters(command.filters);}catch{fail();}
    if(index<0&&items.length>=5)fail();
    const entry={id:command.id,title:title.trim(),
      filters:structuredClone(command.filters),updatedAt:time};
    if(index>=0)items[index]=entry;
    else items.push(entry);
  }else{
    if(index<0)fail();
    items.splice(index,1);
  }
  copy.users[id]=items;
  copy.revision++;
  copy.updatedAt=time;
  copy.history.push({
    revision:copy.revision,actorId:id,at:time,
    action:command.action,filterId:command.id
  });
  return validate(copy,state.scope);
}
module.exports={empty,validate,listForActor,apply};
