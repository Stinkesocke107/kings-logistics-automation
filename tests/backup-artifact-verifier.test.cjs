'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {assertUploadedBackupArtifact} = require('../backup-artifact-verifier.js');

const RUN_ID = '123456';
const NAME = 'kings-automation-backup-42';
const make = (changes={}) => ({
  id: 123, name: NAME, expired: false, size_in_bytes: 8192,
  workflow_run: {id:Number(RUN_ID)},
  archive_download_url: 'https://api.github.com/repos/test/repo/actions/artifacts/123/zip',
  ...changes
});
const payload = (list=[make()]) => ({total_count:list.length,artifacts:list});
const verify = (x, opts={}) => assertUploadedBackupArtifact(x,
  {name:NAME,runId:RUN_ID,...opts});

test('Backup artifact proof binds a nonempty uploaded archive to its exact successful runner', () => {
  assert.deepEqual(verify(payload()), {id:123,name:NAME,bytes:8192,runId:RUN_ID});
  const restoreName='kings-restore-point-manual-43';
  assert.equal(verify(payload([make({name:restoreName})]), {name:restoreName}).name,restoreName);
});

test('Backup proof fails closed for missing, duplicate, expired, empty, and cross-run artifact', () => {
  const bad=[
    payload([]),
    payload([make(),make({id:124})]),
    payload([make({expired:true})]),
    payload([make({size_in_bytes:0})]),
    payload([make({id:null})]),
    payload([make({workflow_run:{id:999}})]),
    payload([make({workflow_run:null})]),
    payload([make({archive_download_url:'https://example.com/fake'})])
  ];
  for(const item of bad) assert.throws(()=>verify(item), /artifact|run|GitHub/i);
});

test('Backup proof rejects corrupt or truncated API listings rather than accepting partial evidence',()=>{
  for (const input of [null,{}, {artifacts:[],total_count:101},
    {artifacts:[make()],total_count:2},
    {artifacts:[make()]},
    {artifacts:[],total_count:-1}]) {
    assert.throws(()=>verify(input),/incomplete|invalid/);
  }
});

test('Core Backup workflow confirms newly uploaded artifact using bounded same-run GitHub API inspection',()=>{
  const workflow = fs.readFileSync(path.join(__dirname,'../.github/workflows/core-backup.yml'),'utf8');
  assert.match(workflow,/actions: read/);
  assert.match(workflow,/Verify uploaded backup artifact exists in this GitHub run/);
  assert.match(workflow,/KINGS_BACKUP_SOURCE_RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.match(workflow,/node backup-artifact-verifier\.js \/tmp\/kings-backup-artifacts\.json/);
  assert.match(workflow,/for attempt in 1 2 3 4 5; do/);
  assert.match(workflow,/actions\/runs\/\$\{GITHUB_RUN_ID\}\/artifacts/);
});
