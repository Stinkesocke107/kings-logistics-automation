'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {sandbox} = require('./sandbox.cjs');
const root = path.resolve(__dirname, '..');

test('Convoy Overview shows a verified snapshot, event type, separate meeting and departure times', () => {
  const meeting = Math.floor(Date.now() / 1000) + 3600;
  const departure = new Date((meeting + 1800) * 1000).toISOString();
  const generatedAt = new Date().toISOString();
  const convoy = {
    name: 'Kings Logistics Event', eventType:'Partner Convoy', status:'Scheduled',
    eventDate:new Date(meeting * 1000).toISOString().slice(0, 10), eventUnix:meeting, eventTimeValid:true,
    departureAtUtc:departure, confirmedKingsSlot:true, kingsSlot:'Slot 3',
    server:'Simulation 1', meetingPoint:'Berlin', route:'Berlin → Prague', eventUrl:'https://truckersmp.com/events/42'
  };
  const data = {generatedAt, months:{}, planning:{months:{},days:{}}, countedConvoys:[convoy], overall:{confirmedKingsSlots:1}};
  const s = sandbox('convoy-overview-discord.js', {files:{'output/convoy-overview.json':JSON.stringify(data)}});
  const message = s.run('buildMessage(' + JSON.stringify(data) + ')');
  assert.match(message, /Kings Convoy Center snapshot/);
  assert.match(message, /Event Type:\*\* Partner Convoy/);
  assert.match(message, /Meeting Time:\*\* <t:\d+:/);
  assert.match(message, /Departure Time:\*\* <t:\d+:/);
  assert.match(message, /Kings Slot:\*\* Slot 3/);
  assert.match(message, /GitHub may delay/);
  assert.ok(message.length <= 1950);
  assert.notEqual(meeting, Date.parse(departure) / 1000);
  assert.throws(() => s.run('buildMessage({generatedAt:"invalid",months:{}})'), /invalid/);
  assert.throws(() => s.run('buildMessage({months:{}})'), /source timestamp/);
});

test('Convoy Overview preserves complete lines when Discord text is too long', () => {
  const meeting = Math.floor(Date.now() / 1000) + 1200;
  const convoy = {
    name:'Length test',status:'Scheduled',
    eventDate:new Date(meeting*1000).toISOString().slice(0,10),
    eventUnix:meeting,eventTimeValid:true,confirmedKingsSlot:true,kingsSlot:'A',
    route:'R'.repeat(5000),eventUrl:'https://truckersmp.com/events/42'
  };
  const data={generatedAt:new Date().toISOString(),months:{},planning:{},countedConvoys:[convoy],overall:{}};
  const s=sandbox('convoy-overview-discord.js',{files:{'output/convoy-overview.json':JSON.stringify(data)}});
  const message=s.run('buildMessage('+JSON.stringify(data)+')');
  assert.ok(message.length <= 1950);
  assert.match(message, /More convoy details are available/);
  assert.ok(!message.includes('R'.repeat(1000)));
});

test('all live outputs share exactly one Tracker generation, not unrelated cron heartbeats', () => {
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/live-tracker.yml'),'utf8');
  const tracker=fs.readFileSync(path.join(root,'tracker.js'),'utf8');
  const stats=fs.readFileSync(path.join(root,'statistics.js'),'utf8');
  const overview=fs.readFileSync(path.join(root,'central-overview.js'),'utf8');
  assert.ok(tracker.includes('live-tracker-snapshot.json'));
  assert.match(workflow,/node tracker\.js[\s\S]*node statistics\.js[\s\S]*Verify Tracker and Statistics[\s\S]*node central-overview\.js/);
  assert.match(stats,/state\.sourceSnapshotAt = sourceSnapshotAt;/);
  assert.match(overview,/statistics\.sourceSnapshotAt !== snapshot\.updatedAt/);
  assert.doesNotMatch(workflow,/Statistics heartbeat updated/);
  assert.match(workflow,/refusing to publish mixed-time dashboard data/);
});

test('operational Discord Convoy Overview displays one 3/day UTC cap, not obsolete category limits',()=>{
  const now=new Date(),date=now.toISOString().slice(0,10),month=date.slice(0,7);
  const planning={
    version:2,mode:'advisory-only',sourceClaimsOnly:true,freeSlotsCertified:false,
    limits:{dailyTotal:3,partnerMonthly:30,externalMonthly:30,
      kingsMonthly:null,separationMinutes:120},
    months:{[month]:{external:2,partner:1,kings:1}},
    days:{[date]:{external:2,partner:1,kings:1,total:4}},
    warnings:[{code:'total-day-over-limit',period:date,count:4,limit:3}],
    unknownTypes:[],missingDepartures:[]
  };
  const data={generatedAt:now.toISOString(),months:{},planning,countedConvoys:[],overall:{}};
  const s=sandbox('convoy-overview-discord.js',{files:{'output/convoy-overview.json':JSON.stringify(data)}});
  const message=s.run('buildMessage('+JSON.stringify(data)+')');
  assert.match(message,/External \*\*2\/30\*\*/);
  assert.match(message,/Partner \*\*1\/30\*\*/);
  assert.match(message,/UTC Today \*\*4\/3 total\*\*/);
  assert.match(message,/Daily combined cap reviews/);
  assert.match(message,/Claims are not Staff approvals|No current-month planning alerts|Needs Staff review/);
  assert.doesNotMatch(message,/External \*\*2\/2\*\*|Partner \*\*1\/3\*\*/);
});

test('stale legacy planning summary is not displayed as certified Event Capacity',()=>{
  const date=new Date().toISOString().slice(0,10);
  const data={generatedAt:new Date().toISOString(),months:{},
    planning:{version:1,months:{[date.slice(0,7)]:{external:5,partner:4}},
      days:{[date]:{external:3,partner:4}},warnings:[]},countedConvoys:[],overall:{}};
  const s=sandbox('convoy-overview-discord.js',{files:{'output/convoy-overview.json':JSON.stringify(data)}});
  const message=s.run('buildMessage('+JSON.stringify(data)+')');
  assert.match(message,/Capacity source not verified/);
  assert.doesNotMatch(message,/External \*\*5\/30\*\*|Today: External/);
});


test('official Convoy Overview uses explicit UTC+0 meeting and departure and UTC month across local-day boundaries',()=>{
  const stamp=Math.floor(Date.parse('2027-06-01T00:30:00.000Z')/1000);
  const convoy={
    name:'Synthetic month boundary',eventDate:'2027-05-31',eventUnix:stamp,
    eventTimeValid:true,departureAtUtc:'2027-06-01T01:00:00+00:00',
    status:'Scheduled',eventType:'Partner Convoy',confirmedKingsSlot:true
  };
  const overview={
    generatedAt:'2027-05-31T12:00:00.000Z',
    months:{},countedConvoys:[convoy],overall:{}
  };
  const s=sandbox('convoy-overview-discord.js',{
    files:{'output/convoy-overview.json':JSON.stringify(overview)}
  });
  const displayed=s.run('buildMessage('+JSON.stringify(overview)+')');
  assert.match(displayed,/Meeting Time:\*\* 2027-06-01 00:30 UTC\+0/);
  assert.match(displayed,/Departure Time:\*\* 2027-06-01 01:00 UTC\+0/);
  assert.match(displayed,/2027-06-01 UTC\+0/);
  assert.doesNotMatch(displayed,/Meeting Time:\*\* <t:|Departure Time:\*\* <t:/);
  assert.equal(s.run('convoyMonthKey('+JSON.stringify(convoy)+')'),'2027-06');
  const bad={...convoy,departureAtUtc:'2027-06-01T01:00:00'};
  assert.equal(s.run('convoyDepartureLabel('+JSON.stringify(bad)+')'),null);
  const unknown={...bad,eventUnix:null,eventTimeValid:false};
  assert.match(s.run('convoyDateLabel('+JSON.stringify(unknown)+')'),
    /source date; UTC\+0 time unverified/);
});
