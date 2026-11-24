'use strict';
// Private Event Capacity read-service adapter; NO Discord bot and NO network.
// The caller must still verify Discord signatures, live roles and permissions.
const ERROR='Kings Event Capacity protected source snapshot not available.';
const SNOWFLAKE=/^\d{17,22}$/;
function fail(){throw new Error(ERROR);}
function createPrivateCapacitySnapshotReader({scope,store}={}){
  if(!scope||typeof scope!=='object'||!SNOWFLAKE.test(String(scope.guildId||''))||
    !SNOWFLAKE.test(String(scope.forumId||''))||
    !store||typeof store.readLatest!=='function')fail();
  const expected={guildId:String(scope.guildId),forumId:String(scope.forumId)};
  // Inject only into the existing signed, permission-checked read-service.
  // Never export this handler as a public HTTP/Discord route.
  return async function loadTrustedSnapshot({guildId,forumId}={}){
    if(String(guildId)!==expected.guildId||
      String(forumId)!==expected.forumId)fail();
    let latest;
    try{latest=store.readLatest();}catch{fail();}
    if(!latest||!latest.snapshot||!latest.metadata||
      latest.metadata.sourceVerified!==true||
      latest.snapshot.integrityVerified!==true||
      latest.snapshot.attestation?.scope?.guildId!==expected.guildId||
      latest.snapshot.attestation?.scope?.forumId!==expected.forumId||
      latest.metadata.runId!==latest.snapshot.attestation.runId)fail();
    // Return only the private, already-verified and still-fresh snapshot.
    // The read-service validates its signature/ledger a second time.
    return latest.snapshot;
  };
}
module.exports={createPrivateCapacitySnapshotReader};
