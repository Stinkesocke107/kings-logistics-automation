const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const helper = path.resolve(__dirname,'../scripts/git-safe-push.sh');
function command(cwd,program,args,ok=true) {
  const r=spawnSync(program,args,{cwd,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_SAFE_PUSH_BASE_DELAY_SECONDS:'0'}});
  if(ok) assert.equal(r.status,0,r.stdout+r.stderr);
  return r;
}
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kings-git-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  command(dir,'git',['init','--bare','--initial-branch=main','remote.git']);
  command(dir,'git',['clone','remote.git','a']);
  const a=path.join(dir,'a');
  for(const cwd of [a]) {command(cwd,'git',['config','user.email','test@invalid']);command(cwd,'git',['config','user.name','Test']);}
  fs.writeFileSync(path.join(a,'state.json'),'{"value":"base"}\n');
  command(a,'git',['add','.']); command(a,'git',['commit','-m','base']); command(a,'git',['push','origin','main']);
  command(dir,'git',['clone','remote.git','b']);
  const b=path.join(dir,'b');
  command(b,'git',['config','user.email','test@invalid']); command(b,'git',['config','user.name','Test']);
  return {dir,a,b};
}
function commit(cwd,file,value) {fs.writeFileSync(path.join(cwd,file),value);command(cwd,'git',['add','.']);command(cwd,'git',['commit','-m','update']);}

test('safe push rebases independent concurrent workflow updates without losing either',t=>{
  const {a,b}=fixture(t);
  commit(a,'one.json','{"value":"one"}\n');commit(b,'two.json','{"value":"two"}\n');
  command(a,'bash',[helper,'main']);command(b,'bash',[helper,'main']);
  assert.equal(command(b,'git',['show','origin/main:one.json']).stdout,'{"value":"one"}\n');
  assert.equal(command(b,'git',['show','origin/main:two.json']).stdout,'{"value":"two"}\n');
});

test('safe push stops on conflicting state and preserves both remote and local commits',t=>{
  const {a,b}=fixture(t);
  commit(a,'state.json','{"value":"remote"}\n');commit(b,'state.json','{"value":"local"}\n');
  const local=command(b,'git',['rev-parse','HEAD']).stdout;
  command(a,'bash',[helper,'main']);
  assert.notEqual(command(b,'bash',[helper,'main'],false).status,0);
  assert.equal(command(b,'git',['rev-parse','HEAD']).stdout,local);
  assert.equal(command(b,'git',['show','origin/main:state.json']).stdout,'{"value":"remote"}\n');
  assert.equal(fs.readFileSync(path.join(b,'state.json'),'utf8'),'{"value":"local"}\n');
});

test('related API state is committed together; unrelated tracked dirt blocks safe push',t=>{
  const {a}=fixture(t);
  fs.writeFileSync(path.join(a,'state.json'),'uncommitted\n');
  assert.notEqual(command(a,'bash',[helper,'main'],false).status,0);
  command(a,'git',['restore','state.json']);
  fs.mkdirSync(path.join(a,'data/api-health'),{recursive:true});
  for(const file of ['live-tracker-snapshot.json','statistics.json','central-overview.json']) fs.writeFileSync(path.join(a,'data',file),'{}');
  fs.writeFileSync(path.join(a,'data/api-health/test.json'),'{}');
  command(a,'git',['add','.']);command(a,'git',['commit','-m','seed']);command(a,'git',['push','origin','main']);
  fs.writeFileSync(path.join(a,'data/live-tracker-snapshot.json'),'{"online":2}');
  fs.writeFileSync(path.join(a,'data/api-health/test.json'),'{"status":"degraded"}');
  fs.mkdirSync(path.join(a,'scripts'));
  fs.copyFileSync(helper,path.join(a,'scripts/git-safe-push.sh'));
  const workflow=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/live-tracker.yml'),'utf8');
  const script=workflow.split('      - name: Save Kings Live System Data and API Health Together\n')[1].split('        run: |\n')[1].split('\n').map(l=>l.replace(/^          /,'')).join('\n');
  command(a,'bash',['-e','-c',script]);
  assert.equal(command(a,'git',['show','origin/main:data/api-health/test.json']).stdout,'{"status":"degraded"}');
  assert.equal(command(a,'git',['show','origin/main:data/live-tracker-snapshot.json']).stdout,'{"online":2}');
});


const PROTECTED_STATE_WORKFLOWS = [
  { workflow:'driver-management', step:'Save Driver Management Data and API Health Together',
    file:'data/driver-management.json' },
  { workflow:'hr-leadership', step:'Save HR Probation Data Safely',
    file:'data/hr-probation.json' },
  { workflow:'staff-management', step:'Save Staff Management Data and API Health Together',
    file:'data/staff-management.json' }
];

function workflowSaveScript(workflow,step) {
  const yaml=fs.readFileSync(path.resolve(__dirname,
    '../.github/workflows/'+workflow+'.yml'),'utf8');
  const marker='      - name: '+step+'\n';
  assert.equal(yaml.split(marker).length,2,'Exactly one persistence step: '+workflow);
  const tail=yaml.split(marker)[1];
  const start=tail.indexOf('        run: |\n');
  assert.ok(start>=0,'Missing save script in '+workflow);
  const raw=tail.slice(start+'        run: |\n'.length);
  const end=raw.indexOf('\n      - name: ');
  const block=(end<0?raw:raw.slice(0,end));
  return block.split('\n').map(line=>line.startsWith('          ')
    ?line.slice(10):line).join('\n');
}

test('Driver, HR and Staff encrypted-state writes fail closed on real Git race instead of reporting green', t=>{
  for(const {workflow,step,file} of PROTECTED_STATE_WORKFLOWS){
    const {a,b}=fixture(t);
    const script=workflowSaveScript(workflow,step);
    assert.match(script,/bash scripts\/git-safe-push\.sh main/);
    assert.doesNotMatch(script,/reset --hard|treating this persistence conflict as non-fatal|exit 0\s*\n\s*fi\s*$/);
    fs.mkdirSync(path.dirname(path.join(a,file)),{recursive:true});
    fs.mkdirSync(path.dirname(path.join(b,file)),{recursive:true});
    fs.mkdirSync(path.join(b,'scripts'),{recursive:true});
    fs.copyFileSync(helper,path.join(b,'scripts/git-safe-push.sh'));

    // A genuinely newer encrypted-state placeholder is committed remotely.
    // The stale runner B then attempts to save the SAME path from an old
    // checkpoint; neither content nor identity is ever sent to real GitHub.
    commit(a,file,'{"snapshot":"newer"}\n');
    command(a,'bash',[helper,'main']);
    fs.writeFileSync(path.join(b,file),'{"snapshot":"stale"}\n','utf8');
    const result=command(b,'bash',['-e','-o','pipefail','-c',script],false);
    assert.notEqual(result.status,0,workflow+' must not report a successful unpersisted journal');
    assert.match(result.stdout+result.stderr,/Rebase conflict detected/,workflow);
    command(b,'git',['fetch','origin','main']);
    assert.equal(command(b,'git',['show','origin/main:'+file]).stdout,
      '{"snapshot":"newer"}\n',workflow+' must preserve the newer remote file');
    assert.equal(command(b,'git',['show','HEAD:'+file]).stdout,
      '{"snapshot":"stale"}\n',workflow+' must preserve the local conflicting commit');
  }
});

test('Driver, HR and Staff save steps exit successfully when protected data is already up to date',t=>{
  for(const {workflow,step} of PROTECTED_STATE_WORKFLOWS){
    const {b}=fixture(t);
    const script=workflowSaveScript(workflow,step);
    // No durable data changed: the existing no-change fast path is still safe.
    command(b,'bash',['-e','-o','pipefail','-c',script]);
  }
});
