const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PERMISSIONS: P,
  hasPermission,
  basePermissions,
  effectiveChannelPermissions,
  missingPermissions,
  resolveTarget,
  scopedHighRiskFindings
} = require('../discord-permission-audit');

function value(...names) {
  return names.reduce((bits, name) => bits | P[name], 0n);
}
function role(id, permissions) {
  return { id: String(id), permissions: String(permissions) };
}
function channel(id, name, type = 0, permission_overwrites = []) {
  return { id: String(id), name, type, permission_overwrites };
}
function overwrite(id, type, allow = 0n, deny = 0n) {
  return { id: String(id), type, allow: String(allow), deny: String(deny) };
}

const guildId = '100';
const memberId = '999';
const botRoleId = '200';
const baseRoles = [
  role(guildId, value('VIEW_CHANNEL', 'READ_MESSAGE_HISTORY')),
  role(botRoleId, value('SEND_MESSAGES'))
];
const memberRoles = [botRoleId];
const base = basePermissions(guildId, memberRoles, baseRoles);

test('base permissions OR everyone and assigned bot roles', () => {
  assert.equal(hasPermission(base, 'VIEW_CHANNEL'), true);
  assert.equal(hasPermission(base, 'READ_MESSAGE_HISTORY'), true);
  assert.equal(hasPermission(base, 'SEND_MESSAGES'), true);
  assert.equal(hasPermission(base, 'MANAGE_THREADS'), false);
});

test('@everyone deny removes a base permission', () => {
  const c = channel('1', 'driver-leadership', 0, [
    overwrite(guildId, 0, 0n, P.SEND_MESSAGES)
  ]);
  const effective = effectiveChannelPermissions(c, guildId, memberId, memberRoles, base);
  assert.equal(hasPermission(effective, 'SEND_MESSAGES'), false);
});

test('assigned role overwrite can restore a permission after everyone deny', () => {
  const c = channel('2', 'staff-leadership', 0, [
    overwrite(guildId, 0, 0n, P.SEND_MESSAGES),
    overwrite(botRoleId, 0, P.SEND_MESSAGES, 0n)
  ]);
  const effective = effectiveChannelPermissions(c, guildId, memberId, memberRoles, base);
  assert.equal(hasPermission(effective, 'SEND_MESSAGES'), true);
});

test('member-specific overwrite is applied after role overwrites', () => {
  const c = channel('3', 'hr-leadership', 0, [
    overwrite(botRoleId, 0, P.SEND_MESSAGES, 0n),
    overwrite(memberId, 1, 0n, P.SEND_MESSAGES)
  ]);
  const effective = effectiveChannelPermissions(c, guildId, memberId, memberRoles, base);
  assert.equal(hasPermission(effective, 'SEND_MESSAGES'), false);
});

test('administrator bypass satisfies channel requirements', () => {
  const adminBase = value('ADMINISTRATOR');
  const c = channel('4', 'private', 0, [
    overwrite(guildId, 0, 0n, value('VIEW_CHANNEL', 'SEND_MESSAGES'))
  ]);
  const effective = effectiveChannelPermissions(c, guildId, memberId, memberRoles, adminBase);
  assert.deepEqual(missingPermissions(effective, ['VIEW_CHANNEL', 'SEND_MESSAGES', 'MANAGE_THREADS']), []);
});

test('duplicate normalized HR channels resolve to the single channel with required access', () => {
  const target = {
    key: 'hr-leadership',
    name: 'hr-leadership',
    types: [0],
    required: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY']
  };
  const channels = [
    channel('10', '👥┃hr-leadership', 0, [overwrite(memberId, 1, 0n, P.VIEW_CHANNEL)]),
    channel('11', 'hr-leadership')
  ];
  const result = resolveTarget(target, channels, { guildId, memberId, memberRoleIds: memberRoles, base });
  assert.equal(result.status, 'resolved');
  assert.equal(result.selected.channel.id, '11');
});

test('multiple fully usable duplicate targets fail closed as ambiguous', () => {
  const target = {
    key: 'system-alerts',
    name: 'system-alerts',
    types: [0],
    required: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY']
  };
  const result = resolveTarget(
    target,
    [channel('20', 'system-alerts'), channel('21', '🚨 system-alerts')],
    { guildId, memberId, memberRoleIds: memberRoles, base }
  );
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.candidates.filter((item) => item.satisfies).length, 2);
});

test('scoped high-risk permissions are accepted only on the intended target', () => {
  const elevatedBaseRoles = [
    role(guildId, value('VIEW_CHANNEL', 'READ_MESSAGE_HISTORY')),
    role(botRoleId, value('SEND_MESSAGES'))
  ];
  const elevatedBase = basePermissions(guildId, memberRoles, elevatedBaseRoles);
  const source = channel('30', 'kings-convoys', 15, [overwrite(botRoleId, 0, P.MANAGE_THREADS, 0n)]);
  const other = channel('31', 'general', 0, [overwrite(botRoleId, 0, P.MANAGE_THREADS, 0n)]);
  const targetById = new Map([
    ['30', { key: 'source', allowedRisk: ['MANAGE_THREADS'] }]
  ]);
  const findings = scopedHighRiskFindings(
    [source, other],
    targetById,
    { guildId, memberId, memberRoleIds: memberRoles, base: elevatedBase }
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].channelId, '31');
  assert.deepEqual(findings[0].permissions, ['MANAGE_THREADS']);
});
