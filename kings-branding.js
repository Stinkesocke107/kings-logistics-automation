// Kings Logistics central Discord branding.
// Custom Kings Discord emojis belong only in normal message content.
// Discord embeds must remain untouched and use their own normal Unicode/text styling.

const KINGS_LOGISTICS_LOGO = '<:Kings_Logistics_Logo:1545254529648431124>';
const KINGS_HEART = '<:kings_heart:1500949819110326352>';

let installed = false;

function replaceBrandText(value) {
  if (typeof value !== 'string' || !value) return value;

  // Protect already-correct custom emoji mentions before normalizing textual
  // aliases. Without placeholders, the :name: part inside a valid
  // <:name:id> mention could be matched a second time and corrupted.
  const logoPlaceholder = '__KL_BRAND_LOGO__';
  const heartPlaceholder = '__KL_BRAND_HEART__';

  return value
    .replace(/<a?:Kings_Logistics_Logo:\d+>/g, logoPlaceholder)
    .replace(/:Kings_Logistics_Logo:/g, logoPlaceholder)
    .replace(/\bKings_Logistics_Logo\b/g, logoPlaceholder)
    .replace(/👑/g, logoPlaceholder)
    .replace(/<a?:kings_heart:\d+>/g, heartPlaceholder)
    .replace(/:kings_heart:/g, heartPlaceholder)
    .replace(/\bkings_heart\b/g, heartPlaceholder)
    .replace(/💙/g, heartPlaceholder)
    .replaceAll(logoPlaceholder, KINGS_LOGISTICS_LOGO)
    .replaceAll(heartPlaceholder, KINGS_HEART);
}

function containsKingsBrand(value) {
  return /Kings Logistics|Kings Family|Kings Staff|Kings Driver|Kings Convoy|Kings Systems/i.test(
    String(value || '')
  );
}

function brandMessageContent(content) {
  if (typeof content !== 'string') return content;

  let output = replaceBrandText(content);

  if (containsKingsBrand(output)) {
    if (!output.includes(KINGS_LOGISTICS_LOGO) && output.length < 1930) {
      output = `${KINGS_LOGISTICS_LOGO} ${output}`;
    }

    if (!output.includes(KINGS_HEART) && output.length < 1930) {
      output = `${output} ${KINGS_HEART}`;
    }
  }

  return output;
}

function brandDiscordPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;

  // IMPORTANT: Only normal Discord message content receives Kings custom emojis.
  // Embeds are intentionally copied unchanged. This prevents raw/custom emoji
  // markup from appearing inside embed titles, descriptions, fields, authors,
  // footers, or embed-only system posts such as Kings Systems status embeds.
  const output = { ...payload };

  if (typeof output.content === 'string') {
    output.content = brandMessageContent(output.content);
  }

  return output;
}

function isDiscordUrl(input) {
  try {
    const raw =
      typeof input === 'string' || input instanceof URL
        ? String(input)
        : String(input?.url || '');

    const host = new URL(raw).hostname.toLowerCase();

    return (
      host === 'discord.com' ||
      host.endsWith('.discord.com') ||
      host === 'discordapp.com' ||
      host.endsWith('.discordapp.com')
    );
  } catch {
    return false;
  }
}

function transformBody(body) {
  if (typeof body === 'string') {
    try {
      return JSON.stringify(
        brandDiscordPayload(
          JSON.parse(body)
        )
      );
    } catch {
      // A raw non-JSON Discord body is message-like text, so branding it is
      // still safe. Normal Discord webhook/bot payloads are JSON/FormData.
      return replaceBrandText(body);
    }
  }

  if (
    typeof FormData !== 'undefined' &&
    body instanceof FormData
  ) {
    const payloadJson = body.get('payload_json');

    if (typeof payloadJson === 'string') {
      try {
        body.set(
          'payload_json',
          JSON.stringify(
            brandDiscordPayload(
              JSON.parse(payloadJson)
            )
          )
        );
      } catch {
        // Do not recursively rewrite arbitrary malformed multipart data.
        // Leave it unchanged rather than risk modifying embed-like content.
      }
    }
  }

  return body;
}

function installDiscordBranding() {
  if (installed) return;
  installed = true;

  const originalFetch = globalThis.fetch;

  if (typeof originalFetch !== 'function') {
    throw new Error(
      'Kings Discord branding requires the Node.js global fetch implementation.'
    );
  }

  globalThis.fetch = async function kingsBrandedFetch(input, init = undefined) {
    if (
      !isDiscordUrl(input) ||
      !init ||
      init.body === undefined
    ) {
      return originalFetch(input, init);
    }

    const nextInit = {
      ...init,
      body: transformBody(init.body)
    };

    return originalFetch(input, nextInit);
  };
}

module.exports = {
  KINGS_LOGISTICS_LOGO,
  KINGS_HEART,
  replaceBrandText,
  brandMessageContent,
  brandDiscordPayload,
  installDiscordBranding
};
