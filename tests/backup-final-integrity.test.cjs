'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');

const ROOT=path.resolve(__dirname,'..');
const STATES=['driver-members.json','driver-management.json','driver-loa.json',
  'hr-probation.json','driver-achievements.json','staff-management.json'];

function sandbox() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kings-backup-final-'));
  const staging=path.join(dir,'backup-staging');
  fs.mkdirSync(staging);
  const rootFiles=['backup-final-check.js','backup-restore-verify.js',
    'recovery-path-guard.js','core-backup.js','core-recovery.js',
    'system-monitoring.js','system-alerts.js',
    '.github/workflows/core-backup.yml',
    '.github/workflows/core-recovery.yml',
    '.github/workflows/system-monitoring.yml',
    ...STATES.map(name=>'data/'+name)];
  const files=[];
  for(const name of rootFiles){
    const source=path.join(dir,name);
    fs.mkdirSync(path.dirname(source),{recursive:true});
    const original=['backup-final-check.js','backup-restore-verify.js','recovery-path-guard.js'].includes(name)
      ? fs.readFileSync(path.join(ROOT,name))
      : Buffer.from(name.startsWith('data/')?
        JSON.stringify({encrypted:true,algorithm:'aes-256-gcm'}):'Kings synthetic backup test fixture\\n');
    fs.writeFileSync(source,original);
    const staged=path.join(staging,name);
    fs.mkdirSync(path.dirname(staged),{recursive:true});
    fs.copyFileSync(source,staged);
    files.push({path:name,size:original.length,
      sha256:crypto.createHash('sha256').update(original).digest('hex')});
  }
  const manifest={version:2,files};
  function writeManifest(){fs.writeFileSync(path.join(staging,'backup-manifest.json'),JSON.stringify(manifest)+'\n');}
  writeManifest();
  function run(){return spawnSync(process.execPath,['backup-final-check.js'],{
    cwd:dir,encoding:'utf8',timeout:25000
  });}
  const dispose=()=>fs.rmSync(dir,{recursive:true,force:true});
  return {dir,staging,manifest,writeManifest,run,dispose};
}

test('final backup check performs a genuine disposable SHA-256 restore',()=>{
  const s=sandbox();
  try{
    const result=s.run();
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(s.staging,'backup-final-health.json'),'utf8')).healthy,true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(s.staging,'backup-restore-verification.json'),'utf8')).healthy,true);
    assert.equal(fs.existsSync(path.join(s.dir,'restore-verification')),false);
  }finally{s.dispose();}
});

test('final backup rejects duplicate paths before Map construction',()=>{
  const s=sandbox();
  try{
    s.manifest.files.push({...s.manifest.files[0]});
    s.writeManifest();
    const result=s.run();
    assert.notEqual(result.status,0);
    assert.equal(fs.existsSync(path.join(s.dir,'restore-verification')),false);
  }finally{s.dispose();}
});

test('final backup refuses staged symlinks despite matching file bytes and hash',()=>{
  const s=sandbox();
  try{
    const name='system-monitoring.js';
    const staged=path.join(s.staging,name);
    const external=path.join(s.dir,'external-copy');
    fs.copyFileSync(staged,external);
    fs.rmSync(staged);
    fs.symlinkSync(external,staged);
    const result=s.run();
    assert.notEqual(result.status,0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(s.staging,'backup-final-health.json'),'utf8')).healthy,false);
    assert.equal(fs.existsSync(path.join(s.dir,'restore-verification')),false);
  }finally{s.dispose();}
});

test('final backup never follows source directory links while checking coverage',()=>{
  const s=sandbox();
  try{
    const original=path.join(s.dir,'data','extra.json');
    const external=path.join(s.dir,'extra-outside.json');
    fs.writeFileSync(external,'{}');
    fs.symlinkSync(external,original);
    const result=s.run();
    assert.notEqual(result.status,0);
    assert.equal(fs.existsSync(path.join(s.dir,'restore-verification')),false);
  }finally{s.dispose();}
});
