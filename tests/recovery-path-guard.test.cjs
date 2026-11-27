'use strict';
// No real backups, Git repositories, credentials or Discord APIs are touched.
// Execute the actual recovery CLI only inside disposable OS temp directories.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
function sandbox(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kings-recovery-guard-'));
  for(const file of ['core-recovery.js','backup-restore-verify.js','recovery-path-guard.js'])
    fs.copyFileSync(path.join(ROOT,file),path.join(dir,file));
  const source=path.join(dir,'restore-source');
  const staging=path.join(dir,'backup-staging');
  fs.mkdirSync(source);fs.mkdirSync(staging);
  const bytes=Buffer.from('Kings synthetic recovery test file\n');
  const name='safe.txt';
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  const entry={path:name,size:bytes.length,sha256:hash};
  fs.writeFileSync(path.join(source,name),bytes);
  fs.writeFileSync(path.join(staging,name),bytes);
  const manifest={version:1,commit:'synthetic-commit',files:[entry]};
  const write=(root,which,obj)=>fs.writeFileSync(path.join(root,which),
    JSON.stringify(obj)+'\n');
  const update=()=>{write(source,'backup-manifest.json',manifest);
    write(staging,'backup-manifest.json',manifest)};
  update();
  write(source,'backup-health.json',{healthy:true,status:'HEALTHY'});
  write(source,'restore-point.json',{type:'restore-point',commit:'synthetic-commit',
    name:'synthetic test'});
  function run(script,mode='preview'){
    return spawnSync(process.execPath,[script],{
      cwd:dir,
      env:{...process.env,RECOVERY_MODE:mode,
        RECOVERY_CONFIRMATION:mode==='apply'?'RESTORE_KINGS':''},
      encoding:'utf8',timeout:20000
    });
  }
  const dispose=()=>fs.rmSync(dir,{recursive:true,force:true});
  return {dir,source,staging,entry,manifest,update,run,dispose};
}
test('preview validates a real synthetic restore point but never writes repository files',()=>{
  const s=sandbox();
  try{
    const result=s.run('core-recovery.js');
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/PREVIEW ONLY/);
    assert.equal(fs.existsSync(path.join(s.dir,'safe.txt')),false);
    assert.equal(JSON.parse(fs.readFileSync(
      path.join(s.dir,'recovery-plan.json'))).summary.actionsRequired,1);
  }finally{s.dispose()}
});
test('APPLY restores only the single manifest file into disposable sandbox',()=>{
  const s=sandbox();
  try{
    const result=s.run('core-recovery.js','apply');
    assert.equal(result.status,0,result.stderr);
    assert.equal(fs.readFileSync(path.join(s.dir,'safe.txt'),'utf8'),
      'Kings synthetic recovery test file\n');
    assert.equal(JSON.parse(fs.readFileSync(
      path.join(s.dir,'recovery-result.json'),'utf8')).status,'SUCCESS');
  }finally{s.dispose()}
});
test('recovery blocks linked source and target files, including dangling symlinks',()=>{
  for(const where of ['source','target','dangling-target']){
    const s=sandbox();
    try{
      const external=path.join(s.dir,'unrelated-private.txt');
      fs.writeFileSync(external,'must never be overwritten');
      if(where==='source'){
        fs.rmSync(path.join(s.source,'safe.txt'));
        fs.symlinkSync(external,path.join(s.source,'safe.txt'));
      }else if(where==='target'){
        fs.symlinkSync(external,path.join(s.dir,'safe.txt'));
      }else{
        fs.symlinkSync(path.join(s.dir,'missing-private.txt'),
          path.join(s.dir,'safe.txt'));
      }
      const result=s.run('core-recovery.js','apply');
      assert.notEqual(result.status,0,where);
      assert.equal(fs.readFileSync(external,'utf8'),
        'must never be overwritten');
      assert.equal(fs.existsSync(path.join(s.dir,'recovery-result.json')),false);
    }finally{s.dispose()}
  }
});
test('APPLY never recursively deletes an occupied destination directory',()=>{
  const s=sandbox();
  try{
    const occupied=path.join(s.dir,'safe.txt');
    fs.mkdirSync(occupied);
    const sentinel=path.join(occupied,'keep.txt');
    fs.writeFileSync(sentinel,'do not delete');
    const result=s.run('core-recovery.js','apply');
    assert.notEqual(result.status,0);
    assert.equal(fs.readFileSync(sentinel,'utf8'),'do not delete');
  }finally{s.dispose()}
});
test('malformed and duplicate manifest paths refuse preview and APPLY without mutation',()=>{
  for(const names of [
    ['../outside.txt'],['folder/../safe.txt'],['.git/config'],
    ['safe.txt','safe.txt'],['safe.txt','safe.txt/nested.txt'],
    ['C:/Windows/secret.txt'],['safe\\unsafe.txt'],
    ['node_modules/bad.js']
  ]){
    const s=sandbox();
    try{
      s.manifest.files=names.map(name=>({...s.entry,path:name}));
      s.update();
      const result=s.run('core-recovery.js','apply');
      assert.notEqual(result.status,0,names.join(','));
      assert.equal(fs.existsSync(path.join(s.dir,'recovery-result.json')),false);
      assert.equal(fs.existsSync(path.join(s.dir,'safe.txt')),false);
    }finally{s.dispose()}
  }
});
test('isolated backup verifier rejects changed sources and unsafe manifest before any sandbox remains',()=>{
  for(const corruption of ['healthy','hash','symlink','duplicate']){
    const s=sandbox();
    try{
      if(corruption==='hash')fs.writeFileSync(path.join(s.staging,'safe.txt'),'changed');
      if(corruption==='symlink'){
        fs.rmSync(path.join(s.staging,'safe.txt'));
        fs.symlinkSync(path.join(s.source,'safe.txt'),path.join(s.staging,'safe.txt'));
      }
      if(corruption==='duplicate'){
        s.manifest.files.push({...s.entry});
        s.update();
      }
      const result=s.run('backup-restore-verify.js');
      if(corruption==='healthy'){
        assert.equal(result.status,0,result.stderr);
        assert.equal(JSON.parse(fs.readFileSync(
          path.join(s.staging,'backup-restore-verification.json'))).healthy,true);
      }else assert.notEqual(result.status,0,corruption);
      assert.equal(fs.existsSync(path.join(s.dir,'restore-verification')),false);
    }finally{s.dispose()}
  }
});
