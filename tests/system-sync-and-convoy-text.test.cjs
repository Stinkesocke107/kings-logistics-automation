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
