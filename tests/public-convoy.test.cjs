const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sandbox } = require('./sandbox.cjs');
const { parseMeetingTime } = require('../convoy-time-utils');
const json = value => new Response(JSON.stringify(value));
const guild = '1114967437788577792';
const source = '1506133821693755502';
const target = '1351613882791366838';
const internal = '1550997669596631200';
const driverRole = '1476774746480709675';

function publicFixture(mode='valid') {
  const publicPublished=[];
  const internalPublished=[];
  const thread={id:'101',name:mode==='test'?'TEST - convoy':'Monthly Convoy',parent_id:source,thread_metadata:{archived:mode==='archived',locked:mode==='locked'}};
  const meetingOffset = mode==='outside-window' ? 10800000 : mode==='starting-now' ? -300000 : 3600000;
  const event={
    id:42,
    name:'Monthly Convoy',
    meetup_at:new Date(Date.now()+meetingOffset).toISOString(),
    start_at:new Date(Date.now()+5400000).toISOString(),
    server:'Simulation 1',
    departure:{city:'Berlin'},
    arrive:{city:'Prague'}
  };
  if(mode==='missing-server') delete event.server;
  if(mode==='missing-meetup') delete event.meetup_at;

  const messages=[{
    id:'101',
    author:{id:'1'},
    content:'Event ID: 42\nRoute Map\nRequired DLCs: None',
    timestamp:new Date().toISOString(),
    attachments:[{
      filename:mode==='slot-image'?'slot.png':'route.png',
      content_type:'image/png',
      url:'https://fixture.invalid/route.png'
    }]
  }];
  if(mode==='slot-image') messages[0].content='Event ID: 42\nSlot Map';

  if(mode==='duplicate') {
    publicPublished.push({
      id:'500',
      author:{id:'bot'},
      content:'📣 **Kings Convoy Announcement — 2 Hours**\n🔗 **Event ID:** `42`'
    });
    internalPublished.push({
      id:'600',
      author:{id:'bot'},
      content:'🚛 **Kings Convoy Internal Announcement — 2 Hours**\n🔗 **Event ID:** `42`'
    });
  }

  const s=sandbox('kings-convoy-announcements.js',{fetch:async(url,opts={})=>{
    const method=opts.method||'GET';
    if(url.endsWith('/users/@me')) return json({id:'bot'});
    if(url.endsWith(`/channels/${source}`)) return json({id:source,guild_id:guild,type:15,name:'kings-convoys'});
    if(url.endsWith(`/channels/${target}`)) return json({id:target,guild_id:mode==='wrong-guild'?'999':guild,name:'public-convoys'});
    if(url.endsWith(`/channels/${internal}`)) return json({id:internal,guild_id:guild,name:'convoy-reminders'});
    if(url.endsWith('/threads/active')) return json({threads:[thread]});
    if(url.includes('/threads/archived/public')) return json({threads:[],has_more:false});
    if(url.includes('/channels/101/messages')) return json(messages);
    if(url.includes('/events/42')) return mode==='api-failure'?new Response('',{status:404}):json({response:event});
    if(url.includes(`/channels/${target}/messages`)&&method==='GET') return json(publicPublished);
    if(url.includes(`/channels/${internal}/messages`)&&method==='GET') return json(internalPublished);
    if(url==='https://fixture.invalid/route.png') return new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}});

    if(url.endsWith(`/channels/${target}/messages`)&&method==='POST') {
      if(mode==='send-failure') return new Response('',{status:403});
      let payload;
      if(opts.body instanceof FormData) {
        payload=JSON.parse(opts.body.get('payload_json'));
        assert.ok(opts.body.get('files[0]'));
      } else {
        payload=JSON.parse(opts.body);
      }
      publicPublished.push({id:'500',author:{id:'bot'},...payload});
      return json({id:'500'});
    }

    if(url.endsWith(`/channels/${internal}/messages`)&&method==='POST') {
      const payload=JSON.parse(opts.body);
      internalPublished.push({id:'600',author:{id:'bot'},...payload});
      return json({id:'600'});
    }

    throw new Error(`Unexpected ${method} ${url}`);
  }});
  return {s,publicPublished,internalPublished};
}

test('public and internal Kings announcements send once and suppress repeats',async()=>{
  const {s,publicPublished,internalPublished}=publicFixture();
  await s.run('main()');
  assert.equal(s.process.exitCode,0);
  assert.equal(publicPublished.length,1);
  assert.equal(internalPublished.length,1);
  assert.match(publicPublished[0].content,/Server:\*\* Simulation 1/);
  assert.match(publicPublished[0].content,/Berlin → Prague/);
  assert.match(publicPublished[0].content,/<:kings_heart:/);
  assert.deepEqual(publicPublished[0].allowed_mentions.parse,['everyone']);
  assert.match(internalPublished[0].content,new RegExp(`<@&${driverRole}>`));
  assert.deepEqual(internalPublished[0].allowed_mentions.roles,[driverRole]);

  await s.run('main()');
  assert.equal(publicPublished.length,1);
  assert.equal(internalPublished.length,1);
});

test('missing route image falls back to a real text-only public post',async()=>{
  const {s,publicPublished,internalPublished}=publicFixture('slot-image');
  await s.run('main()');
  assert.equal(s.process.exitCode,0);
  assert.equal(publicPublished.length,1);
  assert.equal(internalPublished.length,1);
  assert.doesNotMatch(publicPublished[0].content,/Route Map/);
});

test('recovery window sends a truthful starting-now announcement',async()=>{
  const {s,publicPublished,internalPublished}=publicFixture('starting-now');
  await s.run('main()');
  assert.equal(s.process.exitCode,0);
  assert.match(publicPublished[0].content,/Starting Now/);
  assert.match(publicPublished[0].content,/Meeting Time has arrived/);
  assert.match(internalPublished[0].content,/Starting Now/);
});

for(const mode of ['test','archived','locked','outside-window','duplicate','missing-server','missing-meetup','api-failure','send-failure','wrong-guild']) {
  test(`Kings announcement handling: ${mode}`,async()=>{
    const {s,publicPublished,internalPublished}=publicFixture(mode);
    if(mode==='wrong-guild') {
      await assert.rejects(s.run('main()'),/does not belong/);
      return;
    }

    await s.run('main()');

    if(mode==='duplicate') {
      assert.equal(publicPublished.length,1);
      assert.equal(internalPublished.length,1);
      assert.equal(s.process.exitCode,0);
      return;
    }

    if(['test','archived','locked','outside-window'].includes(mode)) {
      assert.equal(publicPublished.length,0);
      assert.equal(internalPublished.length,0);
      assert.equal(s.process.exitCode,0);
      return;
    }

    assert.equal(publicPublished.length,0);
    assert.equal(internalPublished.length,0);
    assert.equal(s.process.exitCode,1);
  });
}

test('terminal authorized convoy status survives missing historical event data',()=>{
  const s=sandbox('convoy-checker.js');
  assert.equal(s.run("deriveStatus({validation:{complete:false,parsed:{}},staffStatus:{status:'Completed'},starterText:'',duplicate:true})"),'Completed');
});

test('meeting timezone conversion rejects invalid calendar dates and impossible offsets',()=>{
  assert.equal(parseMeetingTime('2026-02-30','18:00 UTC'),null);
  assert.equal(parseMeetingTime('2026-09-30','18:00 UTC+14:30'),null);
  assert.equal(parseMeetingTime('2026-09-30','18:00'),null);
  assert.equal(parseMeetingTime('2026-09-30','18:00 CEST').unix,Date.parse('2026-09-30T16:00:00Z')/1000);
});

test('finished convoy archives once after 72 hours; failed archive is nonzero',async()=>{
  for(const fail of [false,true]) {
    const report={guildId:guild,threads:[{threadId:'101',name:'Finished',status:'Completed',eventTimeValid:true,eventUnix:Math.floor(Date.now()/1000)-73*3600}]};
    let archived=false;
    const s=sandbox('convoy-archive.js',{files:{'output/convoy-check-results.json':JSON.stringify(report)},fetch:async(url,opts)=>{
      assert.ok(url.endsWith('/channels/101'));
      if(opts.method==='PATCH') {
        if(fail) return new Response('',{status:403});
        assert.deepEqual(JSON.parse(opts.body),{archived:true}); archived=true;
      }
      return json({guild_id:guild,thread_metadata:{archived}});
    }});
    await s.run('main()');
    assert.equal(archived,!fail);
    assert.equal(s.process.exitCode,fail?1:0);
    if(!fail) { await s.run('main()'); assert.equal(s.calls.filter(c=>c.options.method==='PATCH').length,1); }
  }
});
