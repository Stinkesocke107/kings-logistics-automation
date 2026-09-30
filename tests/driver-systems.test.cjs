const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sandbox } = require('./sandbox.cjs');

const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();

test('Driver Management applies Grace, Active, Info, Attention and HR Review thresholds correctly', () => {
  const s = sandbox('driver-management.js');

  const grace = s.run(`evaluateActivity({
    current:true,
    firstObservedAt:'${isoDaysAgo(5)}',
    joinDate:'${isoDaysAgo(5)}',
    lastOnlineSeenAt:null
  })`);
  assert.equal(grace.level, 'Grace');

  const active = s.run(`evaluateActivity({
    current:true,
    firstObservedAt:'${isoDaysAgo(40)}',
    joinDate:'${isoDaysAgo(40)}',
    lastOnlineSeenAt:'${isoDaysAgo(6)}'
  })`);
  assert.equal(active.level, 'Active');
  assert.equal(active.inactiveDays, 6);

  const info = s.run(`evaluateActivity({
    current:true,
    firstObservedAt:'${isoDaysAgo(40)}',
    joinDate:'${isoDaysAgo(40)}',
    lastOnlineSeenAt:'${isoDaysAgo(7)}'
  })`);
  assert.equal(info.level, 'Info');

  const attention = s.run(`evaluateActivity({
    current:true,
    firstObservedAt:'${isoDaysAgo(40)}',
    joinDate:'${isoDaysAgo(40)}',
    lastOnlineSeenAt:'${isoDaysAgo(14)}'
  })`);
  assert.equal(attention.level, 'Attention');

  const hr = s.run(`evaluateActivity({
    current:true,
    firstObservedAt:'${isoDaysAgo(60)}',
    joinDate:'${isoDaysAgo(60)}',
    lastOnlineSeenAt:'${isoDaysAgo(30)}'
  })`);
  assert.equal(hr.level, 'HR Review');

  const left = s.run(`evaluateActivity({current:false,lastOnlineSeenAt:'${isoDaysAgo(1)}'})`);
  assert.equal(left.level, 'Left');
});

test('Driver LOA marks active leave and historical leave time is excluded from inactivity', () => {
  const s = sandbox('driver-loa.js');

  const activeLeave = s.run(`evaluateWithLeave({
    tmpId:10,
    current:true,
    firstObservedAt:'${isoDaysAgo(60)}',
    joinDate:'${isoDaysAgo(60)}',
    lastOnlineSeenAt:'${isoDaysAgo(20)}'
  }, [{
    tmpId:10,
    startAt:'${isoDaysAgo(2)}',
    endAt:'${new Date(Date.now() + 2 * 86400000).toISOString()}',
    closedAt:null
  }])`);
  assert.equal(activeLeave.level, 'Approved Leave');
  assert.equal(activeLeave.basis, 'approved-leave');

  // 20 calendar days inactive minus a seven-day approved leave = 13 effective days.
  // That must remain Info and must not incorrectly escalate to Attention.
  const adjusted = s.run(`evaluateWithLeave({
    tmpId:11,
    current:true,
    firstObservedAt:'${isoDaysAgo(90)}',
    joinDate:'${isoDaysAgo(90)}',
    lastOnlineSeenAt:'${isoDaysAgo(20)}'
  }, [{
    tmpId:11,
    startAt:'${isoDaysAgo(18)}',
    endAt:'${isoDaysAgo(11)}',
    closedAt:null
  }])`);
  assert.equal(adjusted.level, 'Info');
  assert.ok(adjusted.inactiveDays >= 12 && adjusted.inactiveDays <= 13);
  assert.match(adjusted.basis, /loa-adjusted/);
});

test('Entering approved leave clears old inactivity alert state and prevents false Restored alerts', () => {
  const s = sandbox('driver-loa.js');
  const future = new Date(Date.now() + 3 * 86400000).toISOString();

  const result = s.run(`(() => {
    const management = {
      updatedAt: new Date().toISOString(),
      drivers: [{
        tmpId:21,
        username:'Test Driver',
        current:true,
        firstObservedAt:'${isoDaysAgo(60)}',
        joinDate:'${isoDaysAgo(60)}',
        lastOnlineSeenAt:'${isoDaysAgo(20)}',
        activityLevel:'Attention',
        lastActivityAlertLevel:'Attention',
        lastActivityAlertAt:'${isoDaysAgo(1)}'
      }]
    };
    const loa = {leaves:[{
      tmpId:21,
      startAt:'${isoDaysAgo(1)}',
      endAt:'${future}',
      closedAt:null
    }]};
    applyLeaveToManagement(management, loa);
    return management.drivers[0];
  })()`);

  assert.equal(result.activityLevel, 'Approved Leave');
  assert.equal(result.lastActivityAlertLevel, null);
  assert.equal(result.lastActivityAlertAt, null);
});

test('Driver Status Alerts deduplicate thresholds and only restore after real Active state', () => {
  const s = sandbox('driver-status-alerts.js');

  assert.equal(s.run(`pendingType({current:true,activityLevel:'Info',lastActivityAlertLevel:null})`), 'Info');
  assert.equal(s.run(`pendingType({current:true,activityLevel:'Info',lastActivityAlertLevel:'Info'})`), null);
  assert.equal(s.run(`pendingType({current:true,activityLevel:'Attention',lastActivityAlertLevel:'Info'})`), 'Attention');
  assert.equal(s.run(`pendingType({current:true,activityLevel:'HR Review',lastActivityAlertLevel:'Attention'})`), 'HR Review');
  assert.equal(s.run(`pendingType({current:true,activityLevel:'Active',lastActivityAlertLevel:'HR Review'})`), 'Restored');
  assert.equal(s.run(`pendingType({current:true,activityLevel:'Approved Leave',lastActivityAlertLevel:null})`), null);
  assert.equal(s.run(`pendingType({current:false,activityLevel:'HR Review',lastActivityAlertLevel:null})`), null);
});

test('Driver Updates detects join, leave and rename by stable TruckersMP ID', () => {
  const s = sandbox('driver-updates.js');
  const result = s.run(`compareMembers(
    [
      {tmpId:1,username:'Same'},
      {tmpId:2,username:'Old Name'},
      {tmpId:3,username:'Leaving'}
    ],
    [
      {tmpId:1,username:'Same'},
      {tmpId:2,username:'New Name'},
      {tmpId:4,username:'Joining'}
    ]
  )`);

  assert.deepEqual([...result.joined].map(x => x.tmpId), [4]);
  assert.deepEqual([...result.left].map(x => x.tmpId), [3]);
  assert.equal(result.renamed.length, 1);
  assert.equal(result.renamed[0].tmpId, 2);
  assert.equal(result.renamed[0].oldUsername, 'Old Name');
  assert.equal(result.renamed[0].newUsername, 'New Name');
});

test('Driver Updates rejects catastrophic roster loss and requires confirmation for significant leave waves', () => {
  const s = sandbox('driver-updates.js');

  assert.throws(
    () => s.run(`validateMemberChange(Array.from({length:20},(_,i)=>({tmpId:i+1})), Array.from({length:9},(_,i)=>({tmpId:i+1})))`),
    /untrusted API snapshot/
  );

  const first = s.run(`destructiveChangeConfirmed(
    Array.from({length:20},(_,i)=>({tmpId:i+1})),
    Array.from({length:17},(_,i)=>({tmpId:i+1})),
    {left:[{tmpId:18},{tmpId:19},{tmpId:20}]}
  )`);
  assert.equal(first, false);
  assert.ok(s.files.has('data/driver-change-guard.json'));

  const second = s.run(`destructiveChangeConfirmed(
    Array.from({length:20},(_,i)=>({tmpId:i+1})),
    Array.from({length:17},(_,i)=>({tmpId:i+1})),
    {left:[{tmpId:18},{tmpId:19},{tmpId:20}]}
  )`);
  assert.equal(second, true);
  assert.equal(s.files.has('data/driver-change-guard.json'), false);
});

test('Driver public update messages escape markdown supplied by usernames', () => {
  const s = sandbox('driver-updates.js');
  const join = s.run(`buildJoinMessage({tmpId:123,username:'@everyone **Driver**'})`);
  const leave = s.run(`buildLeaveMessage({tmpId:123,username:'@here _Driver_'})`);

  assert.match(join, /truckersmp\.com\/user\/123/);
  assert.match(leave, /truckersmp\.com\/user\/123/);
  assert.match(join, /\\\*\\\*Driver\\\*\\\*/);
  assert.match(leave, /\\_Driver\\_/);
});

test('Driver Achievements handles month-end and leap-year anniversaries', () => {
  const s = sandbox('driver-achievements.js');

  const febLeap = s.run(`earnedDate(new Date('2024-01-31T12:00:00.000Z'), ACHIEVEMENTS.find(x => x.id === '1m')).toISOString()`);
  assert.equal(febLeap, '2024-02-29T12:00:00.000Z');

  const leapYear = s.run(`earnedDate(new Date('2024-02-29T12:00:00.000Z'), ACHIEVEMENTS.find(x => x.id === '1y')).toISOString()`);
  assert.equal(leapYear, '2025-02-28T12:00:00.000Z');
});

test('Driver Achievements baseline and rejoin logic never retroactively spams old milestones', () => {
  const s = sandbox('driver-achievements.js');
  const oldJoin = isoDaysAgo(400);
  const recentJoin = isoDaysAgo(2);

  const first = s.run(`(() => {
    const state = emptyState();
    const alerts = syncState(state, [{tmpId:31,username:'Baseline',current:true,joinDate:'${oldJoin}'}], true);
    return {alerts, record:state.drivers[0]};
  })()`);
  assert.equal(first.alerts.length, 0);
  assert.ok(first.record.achievements.length > 0);
  assert.ok(first.record.achievements.every(item => item.retroactive === true));

  const rejoin = s.run(`(() => {
    const state = {version:1,mode:'recognition-only',drivers:[{
      tmpId:31,
      joinDate:'${oldJoin}',
      current:true,
      achievements:[{id:'1y',earnedAt:'${isoDaysAgo(35)}',recognizedAt:'${isoDaysAgo(34)}',retroactive:false}]
    }]};
    const alerts = syncState(state, [{tmpId:31,username:'Rejoined',current:true,joinDate:'${recentJoin}'}], false);
    return {alerts, record:state.drivers[0]};
  })()`);
  assert.equal(rejoin.alerts.length, 0);
  assert.equal(rejoin.record.achievements.length, 0);
  assert.equal(rejoin.record.current, true);
});

test('Driver Achievements sends only genuinely newly earned milestones and summary tracks current drivers', () => {
  const s = sandbox('driver-achievements.js');
  const join = isoDaysAgo(40);

  const result = s.run(`(() => {
    const state = {version:1,mode:'recognition-only',drivers:[{
      tmpId:41,
      joinDate:'${join}',
      current:true,
      achievements:[]
    }]};
    const drivers = [{tmpId:41,username:'Milestone Driver',current:true,joinDate:'${join}'}];
    const alerts = syncState(state, drivers, false);
    const summary = buildSummary(state, drivers);
    return {alerts, summary, record:state.drivers[0]};
  })()`);

  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].id, '1m');
  assert.equal(result.record.achievements.length, 1);
  assert.equal(result.record.achievements[0].retroactive, false);
  assert.equal(result.summary.currentDrivers, 1);
  assert.equal(result.summary.trackedCurrentDrivers, 1);
  assert.equal(result.summary.counts['1m'], 1);
});
