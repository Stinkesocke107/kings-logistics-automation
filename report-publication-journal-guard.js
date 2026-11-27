'use strict';
// Shared fail-closed reader for publication journals. Absence is a legitimate
// first run; corrupt or ambiguous existing records are NOT a first run.
// This helper never writes or sends Discord messages.
const fs=require('node:fs');
const path=require('node:path');

function loadPublicationState(file, field, createInitialState){
  if(!['publishedWeeks','publishedMonths'].includes(field)||typeof createInitialState!=='function')
    throw new Error('Invalid Kings publication journal reader configuration');
  if(!fs.existsSync(file))return createInitialState();
  const label=path.basename(file);
  let state;
  try{
    state=JSON.parse(fs.readFileSync(file,'utf8'));
  }catch{
    throw new Error('Existing Kings publication journal is unreadable: '+label+
      ' (manual recovery required; refusing empty-state reset)');
  }
  if(!state||typeof state!=='object'||Array.isArray(state)||!Array.isArray(state[field]))
    throw new Error('Existing Kings publication journal has invalid schema: '+label+
      ' (manual recovery required; refusing empty-state reset)');
  const seen=new Set();
  const format=field==='publishedMonths'?/^\d{4}-(0[1-9]|1[0-2])$/:/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  for(const entry of state[field]){
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||
       typeof entry.key!=='string'||!format.test(entry.key))
      throw new Error('Existing Kings publication journal has invalid period key: '+label);
    const date=new Date(entry.key+(field==='publishedMonths'?'-01':'')+'T00:00:00.000Z');
    if(!Number.isFinite(date.getTime())||
       date.toISOString().slice(0,field==='publishedMonths'?7:10)!==entry.key)
      throw new Error('Existing Kings publication journal has nonexistent period: '+label);
    if(seen.has(entry.key))
      throw new Error('Existing Kings publication journal has duplicate periods: '+label);
    seen.add(entry.key);
  }
  return state;
}

function loadPublicationKeyState(file,keyFields,reportFields,createInitialState){
  if(!Array.isArray(keyFields)||!keyFields.length||
     !Array.isArray(reportFields)||typeof createInitialState!=='function')
    throw new Error('Invalid Kings leadership publication journal configuration');
  if(!fs.existsSync(file))return createInitialState();
  const label=path.basename(file);
  let state;
  try{state=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{throw new Error('Existing Kings publication journal is unreadable: '+label+
      ' (manual recovery required; refusing empty-state reset)');}
  if(!state||typeof state!=='object'||Array.isArray(state))
    throw new Error('Existing Kings publication journal has invalid schema: '+label);
  for(const field of [...keyFields,...reportFields]){
    if(!Array.isArray(state[field]))
      throw new Error('Existing Kings publication journal has invalid schema for '+field+': '+label);
    const seen=new Set();
    const month=field==='publishedMonths'||/Monthly/.test(field)||field==='monthlyReports';
    const format=month?/^\d{4}-(0[1-9]|1[0-2])$/:/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    for(const value of state[field]){
      const key=reportFields.includes(field)?value?.key:value;
      if(typeof key!=='string'||!format.test(key))
        throw new Error('Existing Kings publication journal has invalid period key for '+field+': '+label);
      const date=new Date(key+(month?'-01':'')+'T00:00:00.000Z');
      if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,month?7:10)!==key)
        throw new Error('Existing Kings publication journal has nonexistent period for '+field+': '+label);
      if(seen.has(key))
        throw new Error('Existing Kings publication journal has duplicate periods in '+field+': '+label);
      seen.add(key);
    }
  }
  return state;
}

module.exports={loadPublicationState,loadPublicationKeyState};
