'use strict';

const assert = require('assert');
const {
  KINGS_LOGISTICS_LOGO,
  KINGS_HEART,
  brandDiscordPayload
} = require('./kings-branding');

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function run() {
  const plainMessage = {
    content: '👑 Kings Logistics update 💙'
  };
  const brandedPlain = brandDiscordPayload(deepClone(plainMessage));
  assert.ok(brandedPlain.content.includes(KINGS_LOGISTICS_LOGO), 'Normal message content must receive the Kings logo emoji.');
  assert.ok(brandedPlain.content.includes(KINGS_HEART), 'Normal message content must receive the Kings heart emoji.');

  const embedOnly = {
    embeds: [
      {
        title: '👑 Kings Systems',
        description: 'Kings Logistics system status 💙',
        fields: [
          { name: 'Kings Driver', value: '💙 Healthy' }
        ],
        author: { name: '👑 Kings Systems' },
        footer: { text: '💙 Kings Logistics' }
      }
    ]
  };
  const embedSnapshot = deepClone(embedOnly.embeds);
  const brandedEmbedOnly = brandDiscordPayload(deepClone(embedOnly));
  assert.strictEqual(brandedEmbedOnly.embeds[0].description, 'Kings Logistics system status ' + KINGS_HEART, 'Embed hearts must use Kings custom emoji.');
  assert.strictEqual(brandedEmbedOnly.embeds[0].fields[0].value, KINGS_HEART + ' Healthy', 'Embed field hearts must be canonical.');
  assert.strictEqual(brandedEmbedOnly.embeds[0].footer.text, KINGS_HEART + ' Kings Logistics', 'Embed footer hearts must be canonical.');
  assert.strictEqual(brandedEmbedOnly.embeds[0].title, embedSnapshot[0].title, 'Unrelated embed title/branding must remain unchanged.');
  assert.strictEqual(brandedEmbedOnly.embeds[0].author.name, embedSnapshot[0].author.name, 'Unrelated embed author must remain unchanged.');
  assert.strictEqual(brandedEmbedOnly.content, undefined, 'Embed-only payloads must not gain extra message content.');
  assert.deepStrictEqual(brandDiscordPayload(brandedEmbedOnly), brandedEmbedOnly, 'Embed branding must be idempotent.');

  const mixed = {
    content: '👑 Kings Logistics notification 💙',
    embeds: [
      {
        title: '👑 Kings Systems',
        description: 'Embed body 💙'
      }
    ]
  };
  const mixedEmbedSnapshot = deepClone(mixed.embeds);
  const brandedMixed = brandDiscordPayload(deepClone(mixed));
  assert.ok(brandedMixed.content.includes(KINGS_LOGISTICS_LOGO), 'Mixed payload message content must still be branded.');
  assert.ok(brandedMixed.content.includes(KINGS_HEART), 'Mixed payload message content must still use Kings heart.');
  assert.strictEqual(brandedMixed.embeds[0].description, 'Embed body ' + KINGS_HEART, 'Mixed embed hearts must use Kings custom emoji.');
  assert.strictEqual(brandedMixed.embeds[0].title, mixedEmbedSnapshot[0].title, 'Mixed embed non-heart title must remain unchanged.');

  const existingCustom = {
    content: `${KINGS_LOGISTICS_LOGO} Kings Logistics ${KINGS_HEART}`
  };
  const brandedExisting = brandDiscordPayload(deepClone(existingCustom));
  assert.strictEqual(
    (brandedExisting.content.match(new RegExp(KINGS_LOGISTICS_LOGO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length,
    1,
    'Existing Kings logo emoji must not be duplicated.'
  );
  assert.strictEqual(
    (brandedExisting.content.match(new RegExp(KINGS_HEART.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length,
    1,
    'Existing Kings heart emoji must not be duplicated.'
  );

  console.log('Kings branding self-test passed: custom hearts are canonical in content and embeds, with no unrelated embed changes.');
}

run();
