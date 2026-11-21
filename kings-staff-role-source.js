'use strict';

// AUTHORITATIVE for CURRENT Discord Staff hierarchy-role assignments only.
// These observable roles do NOT prove a historically approved HR appointment,
// department contract, original appointment date or staff promotion decision.
// No network, local writes, member/role changes, or personal identifiers in
// returned aggregate. The caller supplies a complete, freshly fetched guild
// role + member snapshot.
const HIERARCHY=Object.freeze([
  'Head Management','Management','Director','Team Lead','Staff'
]);
const ID=/^\d{17,20}$/;

function normalizeRole(value){
  return String(value||'').normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}

function currentStaffRoleSnapshot(members,roles,at=new Date()){
  if(!Array.isArray(members)||!Array.isArray(roles)||
      !(at instanceof Date)||!Number.isFinite(at.getTime())||
      !roles.length)throw new Error('Kings Staff Discord role source is incomplete.');
  const memberIds=new Set();
  const active=[];
  for(const member of members){
    const id=String(member?.user?.id||'');
    if(!ID.test(id)||memberIds.has(id)||!Array.isArray(member?.roles)){
      throw new Error('Kings Staff member roster contains missing or duplicate verified identities.');
    }
    memberIds.add(id);
    if(!member.user.bot)active.push(member);
  }
  const roleIds=new Set();
  for(const role of roles){
    if(!ID.test(String(role?.id||''))||roleIds.has(String(role.id))){
      throw new Error('Kings Staff role source contains invalid or duplicate role IDs.');
    }
    roleIds.add(String(role.id));
  }
  const selected=HIERARCHY.map(label=>{
    const matched=roles.filter(r=>normalizeRole(r.name)===normalizeRole(label))
      .map(r=>({
        id:String(r.id),label,
        assigned:active.filter(member=>member.roles.map(String).includes(String(r.id))).length,
        preferred:/^\s*[|｜]/.test(r.name)?1:0,
        position:Number.isFinite(Number(r.position))?Number(r.position):0
      }))
      .sort((a,b)=>b.assigned-a.assigned||
        b.preferred-a.preferred||b.position-a.position);
    if(!matched.length)throw new Error('Kings Staff hierarchy role is missing: '+label);
    if(matched.length>1&&matched[0].assigned===matched[1].assigned&&
       matched[0].preferred===matched[1].preferred){
      throw new Error('Kings Staff role is ambiguous: '+label);
    }
    return matched[0];
  });
  const selectedIds=new Set(selected.map(role=>role.id));
  const total=active.filter(member=>
    member.roles.some(roleId=>selectedIds.has(String(roleId)))
  ).length;
  const counts=selected.map(({label,assigned})=>Object.freeze({label,count:assigned}));
  const summed=counts.reduce((n,r)=>n+r.count,0);
  if(total>active.length||summed<total){
    throw new Error('Kings Staff Discord role coverage is inconsistent.');
  }
  return Object.freeze({
    source:'live-discord-staff-hierarchy-roles',
    authority:'live-discord-guild',
    status:'verified-role-snapshot',
    observedAt:at.toISOString(),
    uniqueStaffRoleHolders:total,
    roleCounts:Object.freeze(counts),
    rolesAreHrAppointmentProof:false,
    hrAppointmentEvidence:'unavailable-no-authorized-staff-appointment-source',
    // These counts must NOT be reconciled to the TMP VTC Staff classification.
    vtcStaffClassificationComparable:false
  });
}

module.exports={HIERARCHY,normalizeRole,currentStaffRoleSnapshot};
