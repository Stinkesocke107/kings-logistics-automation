'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {ACTIONS,renderEventReviewCommandGuide} = require('../event-review-command-guide');
const {parseCommand} = require('../event-operations-discord-review-source');

test('Private command help documents exactly the supported parser actions', () => {
  const token = 'KR' + 'a'.repeat(24);
  const supported = new Set(['start','block','reopen','record_check']);
  assert.deepEqual(new Set(ACTIONS.map(x=>x.action)),supported);
  const help = renderEventReviewCommandGuide({discordReviewCursor:'0',discordReviewIgnored:2});
  assert.ok(help.length<=1024);
  for (const action of ACTIONS) {
    assert.equal(parseCommand('!kings-review ' + token + ' ' + action.suffix)?.action,action.action);
    assert.ok(help.includes('!kings-review <KR_CODE> ' + action.suffix));
  }
  assert.match(help,/NOT Event approvals|NEVER Event approvals/);
  assert.match(help,/saved count only/);
});

test('Private command guidance does not misrepresent initialization as live availability', () => {
  const disabled = renderEventReviewCommandGuide({});
  const initialized = renderEventReviewCommandGuide({discordReviewCursor:'0'});
  assert.match(disabled,/NOT initialized/);
  assert.match(initialized,/not a live availability check/);
});
