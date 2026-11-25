'use strict';
// Safe real-source gate for #15. Read private Discord forum via GET only.
// Never print, export, save, publish or upload raw invitation information.
const {readInvitationTracker,trustedInvitationObservation}
  =require('./event-invitation-tracker-source');
async function verify({env=process.env,transport=fetch,nowMs=Date.now()}={}){
  try{
    const result=await readInvitationTracker({
      token:env.DISCORD_BOT_TOKEN,transport,nowMs
    });
    if(!trustedInvitationObservation(result,nowMs)||
       result.bookingsCreated!==0||
       result.staffApprovalsVerified!==false||
       result.invitationDecisionsVerified!==false)
      throw Error('Invitation source not verified');
    // A complete source scan can still leave forum lifecycle labels
    // unverified. Keep the production check visibly non-green until Staff
    // authoritatively confirms the real Forum's tag mapping.
    if(result.tagSchemaVerified!==true){
      console.warn('::warning::Kings Event Invitation Tracker: INVITATIONS_READABLE_TAG_SCHEMA_UNVERIFIED');
      process.exitCode=1;
      return 'INVITATIONS_READABLE_TAG_SCHEMA_UNVERIFIED';
    }
    // Fixed allowlist log text. Never log source counts or invite names.
    console.log('Kings Event Invitation Tracker: READ_ONLY_SOURCE_VERIFIED');
    console.log('Recorded entries are source claims; acceptance, attendance and original historical coverage are NOT verified.');
    return 'READ_ONLY_SOURCE_VERIFIED';
  }catch(error){
    const reasons=new Set([
      'ACCESS_DENIED','ACCESS_DENIED_FORUM','ACCESS_DENIED_ACTIVE',
      'ACCESS_DENIED_ARCHIVE','ACCESS_DENIED_MESSAGES',
      'RATE_LIMITED','API_UNAVAILABLE',
      'FORUM_MISMATCH','FORUM_TAGS_MISSING',
      'ACTIVE_THREAD_LIST','ARCHIVE_PAGE_INCOMPLETE',
      'MESSAGE_PAGE_INCOMPLETE','STARTER_NOT_FOUND',
      'SOURCE_INCONSISTENT'
    ]);
    const reason=reasons.has(error?.sourceReason)
      ?error.sourceReason:'SOURCE_INCONSISTENT';
    // No HTTP body, private source field, thread ID, name or exception text.
    console.warn('::warning::Kings Event Invitation Tracker: SOURCE_UNAVAILABLE ('+reason+')');
    process.exitCode=1;
    return 'SOURCE_UNAVAILABLE';
  }
}
if(require.main===module)verify();
module.exports={verify};
