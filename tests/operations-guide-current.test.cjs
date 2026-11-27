'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
test('current operation guide distinguishes old core baselines from current inventory and live status',()=>{
 const g=fs.readFileSync(path.join(root,'docs','KINGS-AUTOMATION-OPERATING-GUIDE-2026-11-21.md'),'utf8');
 assert.match(g,/46 registrierte Workflow-Dateien/);
 assert.match(g,/33 mit Schedule, 13 manuell\/on-change/);
 assert.match(g,/21\. November hatte 44 Workflows/);
 assert.match(g,/dry-run/);
 assert.match(g,/Unavailable/);
 assert.match(g,/historische/);
});
test('CEO Command Center is a non-deployed and privilege-bounded concept',()=>{
 const g=fs.readFileSync(path.join(root,'docs','KINGS-CEO-COMMAND-CENTER-CONCEPT.md'),'utf8');
 assert.match(g,/GEPLANT, nicht aktiviert/);
 assert.match(g,/CEO User-ID/);
 assert.match(g,/\/kings pause/);
 assert.match(g,/keine Erfolgsmeldung/i);
 assert.match(g,/Recovery bleibt/);
});
