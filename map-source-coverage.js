'use strict';
// Future secondary TruckersMP map data source: fail-closed coverage gate.
// No provider is approved or enabled. No network calls or private data stored.
const MAX_AGE_MS=120000;
const KINGS_VTC_ID=64284;
const reject=reason=>{throw new Error('Secondary map coverage rejected: '+reason);};
const validId=value=>Number.isSafeInteger(value)&&value>0;
function validateSecondaryMapFrame(frame,officialServers,now=Date.now()){
  if(!Number.isFinite(now)||now<=0||!Array.isArray(officialServers)||!officialServers.length){
    reject('official server directory or time unavailable');
  }
  if(!frame||frame.complete!==true||!Array.isArray(frame.servers)||
     typeof frame.source!=='string'||!/^[a-z0-9][a-z0-9._-]{2,60}$/.test(frame.source)){
    reject('unverified provider or incomplete global scan');
  }
  const timestamp=Date.parse(frame.observedAt||'');
  if(!Number.isFinite(timestamp)||now-timestamp>MAX_AGE_MS||timestamp-now>15000){
    reject('stale or invalid sample timestamp');
  }
  const expected=new Map();
  for(const server of officialServers){
    if(!validId(server?.mapId)||!['ATS','ETS2'].includes(server?.game)||
       !String(server.name||'').trim()||expected.has(server.mapId)){
      reject('invalid official server metadata');
    }
    if(server.reportedPlayers!=null&&
       (!Number.isSafeInteger(server.reportedPlayers)||server.reportedPlayers<0)){
      reject('invalid official server population');
    }
    expected.set(server.mapId,server);
  }
  if(frame.servers.length!==expected.size)reject('partial server coverage');
  const seen=new Set(),playersSeen=new Set(),kingsPlayers=[];
  for(const entry of frame.servers){
    const official=expected.get(entry?.mapId);
    if(!official||seen.has(entry.mapId)||entry.complete!==true||
       !Array.isArray(entry.players))reject('server scan missing or duplicated');
    seen.add(entry.mapId);
    if(official.reportedPlayers!=null&&entry.players.length!==official.reportedPlayers){
      reject('server player count differs from official directory');
    }
    for(const player of entry.players){
      if(!validId(player?.MpId)||!Number.isSafeInteger(player?.VtcId)||
         player.VtcId<0||typeof player.Name!=='string'||!player.Name.trim()||
         !Number.isFinite(player.X)||!Number.isFinite(player.Y)||
         playersSeen.has(player.MpId))reject('invalid or duplicate player');
      playersSeen.add(player.MpId);
      if(player.VtcId===KINGS_VTC_ID){
        kingsPlayers.push({tmpId:player.MpId,name:player.Name,game:official.game,
          server:official.name,X:player.X,Y:player.Y,isEvent:official.isEvent===true});
      }
    }
  }
  if(seen.size!==expected.size)reject('server coverage incomplete');
  return {source:frame.source,observedAt:new Date(timestamp).toISOString(),
    serverCoverage:{checked:seen.size,required:expected.size},kingsPlayers};
}
module.exports={validateSecondaryMapFrame,MAX_AGE_MS,KINGS_VTC_ID};
