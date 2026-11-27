'use strict';
// Text displayed in the PRIVATE Event Leadership dashboard only.
// The production command parser and human-authority checks remain unchanged.
const ACTIONS = Object.freeze([
  {action:'start',label:'Start review',suffix:'start'},
  {action:'block',label:'Needs evidence',suffix:'block'},
  {action:'reopen',label:'Reopen case',suffix:'reopen'},
  {action:'record_check',label:'Record original check',
    suffix:'record_check STAFF_RECORD ORIGINAL_RECORDS_CHECKED'}
]);

function renderEventReviewCommandGuide(state = {}) {
  const initialized = state.discordReviewCursor !== undefined;
  const ignored = Number.isSafeInteger(state.discordReviewIgnored)
    ? state.discordReviewIgnored : 'Unknown';
  const tick = String.fromCharCode(96);
  const lines = [
    initialized
      ? 'Last saved status: review reader initialized (not a live availability check).'
      : 'Review reader is NOT initialized; commands cannot be assumed active.',
    '1. Copy a CURRENT private KR code from the field above.',
    '2. Send one command into approved private #event-operations:',
    ...ACTIONS.map(x => '• ' + x.label + ': ' + tick +
      '!kings-review <KR_CODE> ' + x.suffix + tick),
    '3. Wait for GitHub polling and check the private Staff Progress field.',
    'For record_check: first START and manually inspect the source record. Other evidence types: ORIGINAL_DISCORD or ORIGINAL_EVENT_PAGE.',
    'These commands change review progress only, NEVER Event approvals, bookings or free capacity.',
    'Unapplied or invalid commands: ' + ignored + ' (saved count only).'
  ];
  const output = lines.join('\n');
  if (output.length > 1024) throw Error('Private command help exceeds Discord limit');
  return output;
}
module.exports = {ACTIONS,renderEventReviewCommandGuide};
