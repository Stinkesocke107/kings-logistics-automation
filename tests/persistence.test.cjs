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
