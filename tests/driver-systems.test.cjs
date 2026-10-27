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

test('Driver Updates publish welcomes, Trial-to-Driver promotions, and only verified full departures', () => {
  const s = sandbox('driver-updates.js');
  const member = {tmpId:123, discordUserId:'100100100100100100', username:'Example Driver', truckersmpVerified:true};
  const joined = s.run(`buildDriverUpdateEmbed('joined', {tmpId:123,username:'New Driver',membershipRole:'trial'})`);
  const promotion = s.run(`buildDriverUpdateEmbed('promoted', {tmpId:123,username:'New Driver',membershipRole:'driver'})`);
  const departure = s.run(`buildDriverUpdateEmbed('departed', {tmpId:123,username:'Example Driver'})`);

  assert.equal(joined.image.url, 'https://i.postimg.cc/9M1hrDM5/Kings-Logistics-Banner-1920px-1080px.png');
  assert.equal(promotion.image.url, joined.image.url);
  assert.equal(departure.image.url, joined.image.url);
  assert.equal(joined.color, 0x182DFF);
  assert.match(joined.description, /New Driver/);
  assert.match(promotion.title, /Congratulations/);
  assert.match(departure.description, /no longer part of.*Kings Logistics/);
  assert.doesNotMatch(departure.description, /role removed|no longer holds|role taken away/i);

  const confirmed = s.run(`isConfirmedKingsDeparture(${JSON.stringify(member)}, [], [])`);
  assert.equal(confirmed, true, 'Driver is verified absent from both rosters');

  const stillOnServer = s.run(`isConfirmedKingsDeparture(${JSON.stringify(member)}, [], [{user:{id:'100100100100100100'}}])`);
  assert.equal(stillOnServer, false, 'Removing Driver/Trial roles while staying on the Discord server is not a departure');

  const stillInVtc = s.run(`isConfirmedKingsDeparture(${JSON.stringify(member)}, [{tmpId:123}], [])`);
  assert.equal(stillInVtc, false, 'Removing roles or leaving Discord while still in the Kings VTC is not a departure');

  const missingProof = s.run(`isConfirmedKingsDeparture(${JSON.stringify({...member,truckersmpVerified:false})}, [], [])`);
  assert.equal(missingProof, false, 'No public exit when previous identity was not verified against TruckersMP');

  const missingId = s.run(`isConfirmedKingsDeparture(${JSON.stringify({...member,tmpId:null})}, [], [])`);
  assert.equal(missingId, false, 'No public exit without a known TruckersMP identity');

  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', 'driver-updates.js'), 'utf8');
  assert.doesNotMatch(source, /sendDiscordMessage\(\s*buildLeaveMessage/);
  assert.match(source, /isConfirmedKingsDeparture\(member, tmpMembers, discordAuthority\.discordMembers\)/);
  assert.match(source, /appendAnonymousEvents\(\s*history,\s*"leave"/);
});

test('Single Driver membership removal waits for a second matching poll before publication', () => {
  const s = sandbox('driver-updates.js');
  const oldDrivers = Array.from({length:8},(_,i)=>({discordUserId:String(100+i),tmpId:i+1}));
  const currentDrivers = oldDrivers.slice(0,7);
  const changes = {left:[oldDrivers[7]]};
  const first = s.run(`destructiveChangeConfirmed(${JSON.stringify(oldDrivers)},${JSON.stringify(currentDrivers)},${JSON.stringify(changes)})`);
  assert.equal(first, false);
  assert.ok(s.files.has('data/driver-change-guard.json'));
  const second = s.run(`destructiveChangeConfirmed(${JSON.stringify(oldDrivers)},${JSON.stringify(currentDrivers)},${JSON.stringify(changes)})`);
  assert.equal(second, true);
});

test('Trial/Driver role transitions do not create a membership departure', () => {
  const s=sandbox('driver-updates.js');
  const result=s.run(`compareDiscordDrivers(
    [{discordUserId:'100',membershipRole:'trial',username:'Promoted'},
     {discordUserId:'200',membershipRole:'driver',username:'Downgraded'}],
    [{discordUserId:'100',membershipRole:'driver',username:'Promoted'},
     {discordUserId:'200',membershipRole:'trial',username:'Downgraded'}]
  )`);
  assert.equal(result.left.length,0);
  assert.equal(result.joined.length,0);
  assert.equal(result.transitions.length,2);
  assert.equal(result.transitions.filter(t=>t.oldMembershipRole==='trial'&&t.membershipRole==='driver').length,1);
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

test('Driver public update embeds escape markdown supplied by usernames', () => {
  const s = sandbox('driver-updates.js');
  const joined = s.run(`buildDriverUpdateEmbed('joined', {tmpId:123,username:'@everyone **Driver**',membershipRole:'trial'})`);
  const departed = s.run(`buildDriverUpdateEmbed('departed', {tmpId:123,username:'@here _Driver_'})`);

  assert.match(joined.description, /truckersmp\.com\/user\/123/);
  assert.match(departed.description, /truckersmp\.com\/user\/123/);
  assert.match(joined.description, /\\\*\\\*Driver\\\*\\\*/);
  assert.match(departed.description, /\\_Driver\\_/);
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
