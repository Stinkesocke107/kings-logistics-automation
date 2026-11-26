'use strict';
// Official TruckersMP public Web API: VTC membership and global server totals.
// NO per-player online status is provided by these endpoints. Never infer it.
const BASE='https://api.truckersmp.com/v2';
const KINGS_VTC_ID=64284;

function parseOfficialMembership(roster,nowMs=Date.now()) {
  if (!roster || (roster.error !== false && roster.error !== 'false') ||
      !Array.isArray(roster.response?.members)) {
    throw new Error('Official TruckersMP VTC member roster is unavailable or invalid.');
  }
  if (!Number.isFinite(nowMs) || nowMs<=0) throw new Error('Invalid official API snapshot timestamp.');
  const vtcMemberCount=roster.response.members.length;
  if (vtcMemberCount>20000) throw new Error('Official TruckersMP member count is outside safety limits.');
  return {
    source:'truckersmp-official-v2',observedAt:new Date(nowMs).toISOString(),
    vtcMemberCount,kingsOnline:null
  };
}

function parseOfficialSnapshot(roster,serverResponse,nowMs=Date.now()) {
  if (!roster || (roster.error !== false && roster.error !== 'false') || !Array.isArray(roster.response?.members)) {
    throw new Error('Official TruckersMP VTC member roster is unavailable or invalid.');
  }
  if (!serverResponse || (serverResponse.error !== false && serverResponse.error !== 'false') || !Array.isArray(serverResponse.response) ||
      serverResponse.response.length===0) {
    throw new Error('Official TruckersMP server directory is unavailable or invalid.');
  }
  if (!Number.isFinite(nowMs) || nowMs<=0) throw new Error('Invalid official API snapshot timestamp.');
  const vtcMemberCount=roster.response.members.length;
  if (vtcMemberCount>20000) throw new Error('Official TruckersMP member count is outside safety limits.');

  const out={ETS2:0,ATS:0};
  let activeServers=0;
  for (const s of serverResponse.response) {
    if (!s || typeof s!=='object' || typeof s.online!=='boolean') {
      throw new Error('Invalid official TruckersMP server status.');
    }
    if (!Number.isSafeInteger(s.players) || s.players<0 || s.players>100000) {
      throw new Error('Invalid official TruckersMP server population.');
    }
    const game=String(s.game||'').toUpperCase();
    if (s.online) {
      if (game!=='ETS2' && game!=='ATS') {
        throw new Error('Unknown game in active TruckersMP server directory.');
      }
      out[game]+=s.players;
      activeServers++;
    }
  }
  return {
    source:'truckersmp-official-v2',
    observedAt:new Date(nowMs).toISOString(),
    vtcMemberCount,
    activeServers,
    // These counts refer to ALL TruckersMP users, not Kings VTC members.
    ets2AllPlayers:out.ETS2,
    atsAllPlayers:out.ATS,
    totalAllPlayers:out.ETS2+out.ATS,
    kingsOnline:null
  };
}

async function officialGetJson(path,transport=fetch) {
  if (path!=='/vtc/'+KINGS_VTC_ID+'/members' && path!=='/servers') {
    throw new Error('Unsupported official TruckersMP endpoint.');
  }
  const response=await transport(BASE+path,{
    headers:{Accept:'application/json','User-Agent':'KingsLogisticsSystems/1.0'},
    signal:AbortSignal.timeout(9000)
  });
  if (!response?.ok) throw new Error('Official TruckersMP endpoint unavailable (HTTP '+response?.status+').');
  return response.json();
}

async function fetchOfficialMembership(transport=fetch) {
  // The full official Kings VTC count does not depend on the map API or
  // server directory. Never infer per-player online status from this count.
  const roster=await officialGetJson('/vtc/'+KINGS_VTC_ID+'/members',transport);
  return parseOfficialMembership(roster);
}

async function fetchOfficialSnapshot(transport=fetch) {
  // Intentionally call only two documented TruckersMP public API endpoints.
  const [members,servers]=await Promise.all([
    officialGetJson('/vtc/'+KINGS_VTC_ID+'/members',transport),
    officialGetJson('/servers',transport)
  ]);
  return parseOfficialSnapshot(members,servers);
}

module.exports={KINGS_VTC_ID,parseOfficialMembership,parseOfficialSnapshot,fetchOfficialMembership,fetchOfficialSnapshot};
