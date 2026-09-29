// Kings Logistics central Discord branding.
// Keep all Kings automation messages consistent and ensure our custom Discord
// emojis render as emojis instead of literal :emoji_name: text.

const KINGS_LOGISTICS_LOGO = '<:Kings_Logistics_Logo:1545254529648431124>';
const KINGS_HEART = '<:kings_heart:1500949819110326352>';

let installed = false;

function replaceBrandText(value) {
  if (typeof value !== 'string' || !value) return value;

  return value
    .replace(/<a?:Kings_Logistics_Logo:\d+>/g, KINGS_LOGISTICS_LOGO)
    .replace(/:Kings_Logistics_Logo:/g, KINGS_LOGISTICS_LOGO)
    .replace(/\bKings_Logistics_Logo\b/g, KINGS_LOGISTICS_LOGO)
    .replace(/<a?:kings_heart:\d+>/g, KINGS_HEART)
    .replace(/:kings_heart:/g, KINGS_HEART)
    .replace(/\bkings_heart\b/g, KINGS_HEART)
    .replace(/👑/g, KINGS_LOGISTICS_LOGO)
    .replace(/💙/g, KINGS_HEART);
}

function containsKingsBrand(value) {
  return /Kings Logistics|Kings Family|Kings Staff|Kings Driver|Kings Convoy|Kings Systems/i.test(
    String(value || '')
  );
}

function transformValue(value, key = '') {
  if (typeof value === 'string') {
    // Discord embed footer/author text does not consistently render custom
    // emoji markup, so keep those text-only areas untouched rather than risk
    // showing raw <:name:id> text.
    if (key === 'footerText' || key === 'authorName') return value;
    return replaceBrandText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => transformValue(item));
  }

  if (!value || typeof value !== 'object') return value;

  const output = {};

  for (const [childKey, item] of Object.entries(value)) {
    if (childKey === 'footer' && item && typeof item === 'object') {
      output[childKey] = {
        ...item,
        text: transformValue(item.text, 'footerText')
      };
      continue;
    }

    if (childKey === 'author' && item && typeof item === 'object') {
      output[childKey] = {
        ...item,
        name: transformValue(item.name, 'authorName')
      };
      continue;
    }

    output[childKey] = transformValue(item, childKey);
  }

  return output;
}

function brandDiscordPayload(payload) {
  const output = transformValue(payload);

  if (!output || typeof output !== 'object') return output;

  if (typeof output.content === 'string' && containsKingsBrand(output.content)) {
    let content = output.content;

    if (!content.includes(KINGS_LOGISTICS_LOGO) && content.length < 1930) {
      content = `${KINGS_LOGISTICS_LOGO} ${content}`;
    }

    if (!content.includes(KINGS_HEART) && content.length < 1930) {
      content = `${content} ${KINGS_HEART}`;
    }

    output.content = content;
  }

  // Embed-only Kings posts should still visibly carry our real custom logo and
  // heart. Put them in normal message content where Discord reliably renders
  // custom emojis, rather than in embed footer/author text.
  if (
    (output.content === undefined || output.content === null || output.content === '') &&
    Array.isArray(output.embeds) &&
    output.embeds.some((embed) => containsKingsBrand(JSON.stringify(embed)))
  ) {
    output.content = `${KINGS_LOGISTICS_LOGO} ${KINGS_HEART}`;
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
        body.set(
          'payload_json',
          replaceBrandText(payloadJson)
        );
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
  brandDiscordPayload,
  installDiscordBranding
};
