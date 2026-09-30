const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sandbox } = require('./sandbox.cjs');

const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const daysAgo = days => new Date(Date.now() - days * 86400000).toISOString();

test('Staff Management detects hierarchy Staff roles without classifying the Driver anchor as Staff', () => {
  const s = sandbox('staff-management.js');
  const ids = s.run(`detectStaffRoles([
    {id:1,name:'CEO',order:0,owner:true},
    {id:2,name:'Management',order:5,owner:false},
    {id:3,name:'Kings Driver',order:10,owner:false},
    {id:4,name:'Driver Operations Specialist',order:11,owner:false},
    {id:5,name:'Verified Member',order:12,owner:false}
  ]).map(x=>x.id).sort((a,b)=>a-b).join(',')`);
  assert.equal(ids, '1,2,4');
});

test('Staff Management records join, role change and leave without performing personnel actions', () => {
  const s = sandbox('staff-management.js');
  const result = s.run(`updateState({
    version:1,
    mode:'advisory-only',
    initializedAt:'${daysAgo(100)}',
    updatedAt:'${daysAgo(2)}',
    staff:[
      {tmpId:1,username:'Role Change',currentStaff:true,roleNames:['Staff'],departments:['General Staff'],firstObservedAt:'${daysAgo(100)}',lastChangedAt:'${daysAgo(20)}',leftStaffAt:null},
      {tmpId:2,username:'Leaving',currentStaff:true,roleNames:['Staff'],departments:['General Staff'],firstObservedAt:'${daysAgo(100)}',lastChangedAt:'${daysAgo(20)}',leftStaffAt:null}
    ],
    history:[]
  },[
    {tmpId:1,username:'Role Change',roleNames:['Management'],departments:['Management'],roleIds:[10],joinDate:'${daysAgo(100)}'},
    {tmpId:3,username:'Joining',roleNames:['Staff'],departments:['General Staff'],roleIds:[11],joinDate:'${daysAgo(1)}'}
  ])`);

  assert.equal(result.logicalChanged, true);
  assert.equal(result.changes.length, 3);
  assert.equal(result.changes.filter(x=>x.type==='role_changed').length, 1);
  assert.equal(result.changes.filter(x=>x.type==='staff_joined').length, 1);
  assert.equal(result.changes.filter(x=>x.type==='staff_left').length, 1);
  assert.equal(result.state.staff.filter(x=>x.currentStaff).length, 2);
  assert.equal(result.state.staff.length, 3);
});

test('Probation state corruption and invalid schemas fail closed without resetting deduplication state', () => {
  for (const raw of ['{broken', '{"version":2,"notified":[]}', '{"version":3,"initializedAt":null,"updatedAt":null,"notified":[{"key":"bad","notifiedAt":null}]}']) {
    const s = sandbox('probation.js', { files: { 'data/probation-state.json': raw } });
    assert.throws(() => s.run('loadState()'), /refusing to reset/);
    assert.equal(s.files.get('data/probation-state.json'), raw);
  }
});

test('Probation baseline stores only keyed memberships and sends no historical reminders', async () => {
  const joinedAt = daysAgo(30);
  const s = sandbox('probation.js', {
    fetch: async url => {
      if (url.includes('/vtc/64284/members')) {
        return json({ response: { members: [{ user_id: 123, username: 'Baseline Driver', joinDate: joinedAt }] } });
      }
      throw new Error(`Unexpected URL ${url}`);
    }
  });

  await s.run('checkProbations()');
  const state = JSON.parse(s.files.get('data/probation-state.json'));
  assert.equal(state.version, 3);
  assert.equal(state.notified.length, 1);
  assert.equal(state.notified[0].notifiedAt, null);
  assert.match(state.notified[0].key, /^[a-f0-9]{64}$/);
  const persisted = s.files.get('data/probation-state.json');
  assert.equal(persisted.includes('Baseline Driver'), false);
  assert.equal(persisted.includes('123'), false);
  assert.equal(s.calls.length, 1);
});

test('Failed Probation Discord reminder is retried because it is never persisted as sent', async () => {
  const joinedAt = daysAgo(10);
  const initial = JSON.stringify({
    version:3,
    initializedAt:daysAgo(20),
    updatedAt:daysAgo(1),
    notified:[]
  });
  const s = sandbox('probation.js', {
    files: { 'data/probation-state.json': initial },
    fetch: async (url, options) => {
      if (url.includes('/vtc/64284/members')) {
        return json({ response: { members: [{ user_id: 456, username: 'Retry Driver', joinDate: joinedAt }] } });
      }
      if (url.endsWith('/guilds/1114967437788577792/channels')) {
        return json([{ id:'10', type:0, name:'hr-leadership' }]);
      }
      if (url.endsWith('/channels/10/messages') && String(options.method).toUpperCase() === 'POST') {
        return new Response('temporary failure', { status:500 });
      }
      throw new Error(`Unexpected URL ${url}`);
    }
  });

  await assert.rejects(s.run('checkProbations()'), /Discord API 500/);
  assert.equal(s.files.get('data/probation-state.json'), initial);
});

test('Probation, HR Probation and HR Leadership use the same membership key contract', () => {
  const joinedAt = '2026-09-01T12:00:00.000Z';
  const probation = sandbox('probation.js');
  const hrProbation = sandbox('hr-probation.js');
  const leadership = sandbox('hr-leadership.js');

  const a = probation.run(`membershipKey(999,'${joinedAt}')`);
  const b = hrProbation.run(`membershipKey(999,'${joinedAt}')`);
  const c = leadership.run(`probationKey(999,'${joinedAt}')`);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.notEqual(a, probation.run(`membershipKey(999,'2026-09-02T12:00:00.000Z')`));
});

test('HR Probation creates reviews only for successfully notified probation memberships', () => {
  const s = sandbox('hr-probation.js');
  const joinedA = daysAgo(10);
  const joinedB = daysAgo(11);
  const result = s.run(`(() => {
    const driverState={drivers:[
      {tmpId:1,username:'Notified',current:true,joinDate:'${joinedA}'},
      {tmpId:2,username:'Baseline Only',current:true,joinDate:'${joinedB}'}
    ]};
    const keyA=membershipKey(1,'${joinedA}');
    const keyB=membershipKey(2,'${joinedB}');
    const probationState={notified:[
      {key:keyA,notifiedAt:'${daysAgo(2)}'},
      {key:keyB,notifiedAt:null}
    ]};
    const hrState={version:1,lastProcessedMessageId:null,reviews:[]};
    const changed=syncReviews(driverState,probationState,hrState);
    return {changed,reviews:hrState.reviews};
  })()`);

  assert.equal(result.changed, true);
  assert.equal(result.reviews.length, 1);
  assert.equal(result.reviews[0].tmpId, 1);
  assert.equal(result.reviews[0].status, 'open');
});

test('HR Leadership separates active probation, open reviews, extensions, HR review and approved leave', () => {
  const s = sandbox('hr-leadership.js');
  const activeJoin = daysAgo(2);
  const reviewJoin = daysAgo(10);
  const extendedJoin = daysAgo(12);
  const future = new Date(Date.now() + 5 * 86400000).toISOString();

  const result = s.run(`(() => {
    const openKey=probationKey(2,'${reviewJoin}');
    const extendedKey=probationKey(3,'${extendedJoin}');
    return buildData({drivers:[
      {tmpId:1,username:'Probation',current:true,joinDate:'${activeJoin}',activityLevel:'Grace'},
      {tmpId:2,username:'Open Review',current:true,joinDate:'${reviewJoin}',activityLevel:'Active'},
      {tmpId:3,username:'Extended',current:true,joinDate:'${extendedJoin}',activityLevel:'Active'},
      {tmpId:4,username:'Inactive',current:true,joinDate:'${daysAgo(100)}',activityLevel:'HR Review',inactiveDays:31},
      {tmpId:5,username:'Leave',current:true,joinDate:'${daysAgo(100)}',activityLevel:'Approved Leave'}
    ]},{notified:[
      {key:openKey,notifiedAt:'${daysAgo(2)}'},
      {key:extendedKey,notifiedAt:'${daysAgo(2)}'}
    ]},{reviews:[
      {key:openKey,status:'open',openedAt:'${daysAgo(2)}'},
      {key:extendedKey,status:'extended',openedAt:'${daysAgo(2)}',dueAt:'${future}'}
    ]});
  })()`);

  assert.equal(result.current.length, 5);
  assert.equal(result.probationActive.length, 1);
  assert.equal(result.probationReviews.length, 1);
  assert.equal(result.probationExtended.length, 1);
  assert.equal(result.hrReviews.length, 1);
  assert.equal(result.approvedLeave.length, 1);
});
