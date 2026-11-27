'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {WORKFLOW_REGISTRY}=require('../kings-workflow-registry');

test('The Kings 2026-11-27 closeout plan explicitly covers all registered workflows once',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','docs',
    'KINGS-SYSTEM-PRIORITIES-2026-11-27.md'),'utf8');
  const ids=[...source.matchAll(/^\|\s*\*{0,2}(\d\d)\*{0,2}\s*\|/gm)]
    .map(match=>Number(match[1]));
  assert.equal(WORKFLOW_REGISTRY.length,46);
  assert.equal(ids.length,46,'Every workflow must have one work row');
  assert.deepEqual([...ids].sort((a,b)=>a-b),
    Array.from({length:46},(_,i)=>i+1));
  assert.match(source,/\*\*35\*\* \| \*\*Monthly Report\*\*/);
  assert.match(source,/Event-Fachsystemnummer #17 .*gestrichen/);
});
