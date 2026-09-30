const test = require('node:test');
const assert = require('node:assert/strict');

const {
  KINGS_LOGISTICS_LOGO,
  KINGS_HEART,
  replaceBrandText,
  brandDiscordPayload,
  canRetryDiscordResponse,
  canRetryDiscordError
} = require('../kings-branding');

test('keeps valid Kings custom emoji mentions intact', () => {
  const input = `${KINGS_LOGISTICS_LOGO} Kings Logistics ${KINGS_HEART}`;
  assert.equal(replaceBrandText(input), input);
});

test('converts textual aliases and unicode branding to real Discord custom emojis', () => {
  const output = replaceBrandText(
    ':Kings_Logistics_Logo: Kings_Logistics_Logo 👑 :kings_heart: kings_heart 💙'
  );

  assert.equal(
    output,
    `${KINGS_LOGISTICS_LOGO} ${KINGS_LOGISTICS_LOGO} ${KINGS_LOGISTICS_LOGO} ` +
      `${KINGS_HEART} ${KINGS_HEART} ${KINGS_HEART}`
  );
});

test('brands Kings message content without duplicate custom emoji markup', () => {
  const output = brandDiscordPayload({
    content: 'Kings Logistics just published a news post!'
  });

  assert.equal(
    output.content,
    `${KINGS_LOGISTICS_LOGO} Kings Logistics just published a news post! ${KINGS_HEART}`
  );

  assert.equal(
    (output.content.match(/<:Kings_Logistics_Logo:/g) || []).length,
    1
  );

  assert.equal(
    (output.content.match(/<:kings_heart:/g) || []).length,
    1
  );
});

test('normalizes existing legacy emoji IDs to the current Kings IDs', () => {
  const output = replaceBrandText(
    '<:Kings_Logistics_Logo:111111111111111111> <:kings_heart:222222222222222222>'
  );

  assert.equal(output, `${KINGS_LOGISTICS_LOGO} ${KINGS_HEART}`);
});

test('preserves embed-only messages without injecting custom emoji content', () => {
  const output = brandDiscordPayload({
    embeds: [
      {
        title: 'Kings Staff Leadership Overview',
        description: 'Read-only Staff roster monitoring.'
      }
    ]
  });

  assert.equal(output.content, undefined);
  assert.equal(output.embeds[0].title, 'Kings Staff Leadership Overview');
});

test('Discord POST retries explicit 429 but never ambiguous 5xx', () => {
  assert.equal(canRetryDiscordResponse('POST', 429), true);
  assert.equal(canRetryDiscordResponse('POST', 503), false);
  assert.equal(canRetryDiscordResponse('POST', 408), false);
});

test('Discord idempotent writes retry transient responses and network failures', () => {
  assert.equal(canRetryDiscordResponse('PATCH', 503), true);
  assert.equal(canRetryDiscordResponse('DELETE', 429), true);
  assert.equal(canRetryDiscordResponse('GET', 408), true);
  assert.equal(canRetryDiscordError('PATCH', { cause: { code: 'ECONNRESET' } }), true);
  assert.equal(canRetryDiscordError('POST', { cause: { code: 'ECONNRESET' } }), false);
});
