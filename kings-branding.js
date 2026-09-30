// Kings Logistics central Discord branding and transport hardening.
// Custom Kings Discord emojis belong only in normal message content.
// Discord embeds remain untouched and use normal Unicode/text styling.

const KINGS_LOGISTICS_LOGO = '<:Kings_Logistics_Logo:1545254529648431124>';
const KINGS_HEART = '<:kings_heart:1500949819110326352>';

const DISCORD_MAX_RETRIES = 3;
const DISCORD_BASE_DELAY_MS = 750;
const DISCORD_MAX_DELAY_MS = 15000;
const DISCORD_IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']);
const DISCORD_RETRYABLE_ERROR_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'ETIMEDOUT'
]);

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampDiscordDelay(ms) {
  return Math.max(0, Math.min(DISCORD_MAX_DELAY_MS, Number(ms) || 0));
}

function discordRetryAfter(response) {
  const header = response?.headers?.get?.('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return clampDiscordDelay(seconds * 1000);
    const timestamp = Date.parse(header);
    if (Number.isFinite(timestamp)) return clampDiscordDelay(timestamp - Date.now());
  }

  return null;
}

function discordBackoff(attempt, response = null) {
  const retryAfter = discordRetryAfter(response);
  if (retryAfter !== null) return retryAfter;

  const exponential = DISCORD_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * DISCORD_BASE_DELAY_MS);
  return clampDiscordDelay(exponential + jitter);
}

function discordErrorCode(error) {
  return String(error?.code || error?.cause?.code || error?.cause?.cause?.code || '').trim();
}

function isRetryableDiscordNetworkError(error) {
  return (
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError' ||
    DISCORD_RETRYABLE_ERROR_CODES.has(discordErrorCode(error))
  );
}

function discordMethod(input, init) {
  return String(init?.method || input?.method || 'GET').toUpperCase();
}

function canRetryDiscordResponse(method, status) {
  if (status === 429) return true;
  if (!DISCORD_IDEMPOTENT_METHODS.has(method)) return false;
  return status === 408 || status === 425 || status >= 500;
}

function canRetryDiscordError(method, error) {
  if (!DISCORD_IDEMPOTENT_METHODS.has(method)) return false;
  return isRetryableDiscordNetworkError(error);
}

async function discardResponse(response) {
  try {
    if (response?.body && typeof response.body.cancel === 'function') {
      await response.body.cancel();
    }
  } catch {
    // Response cleanup is best-effort only.
  }
}

async function discordResilientFetch(originalFetch, input, init) {
  const method = discordMethod(input, init);
  const attempts = DISCORD_MAX_RETRIES + 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const nextInit = init ? { ...init } : {};

    // Add a bounded timeout only when the caller did not provide its own signal.
    if (!nextInit.signal && typeof AbortSignal?.timeout === 'function') {
      nextInit.signal = AbortSignal.timeout(15000);
    }

    try {
      const response = await originalFetch(input, nextInit);

      if (
        response?.ok ||
        !canRetryDiscordResponse(method, Number(response?.status)) ||
        attempt >= attempts
      ) {
        return response;
      }

      const delay = discordBackoff(attempt, response);
      console.warn(
        `Discord ${method}: HTTP ${response.status}; retry ${attempt}/${DISCORD_MAX_RETRIES} in ${delay}ms.`
      );
      await discardResponse(response);
      await sleep(delay);
    } catch (error) {
      if (!canRetryDiscordError(method, error) || attempt >= attempts) throw error;

      const delay = discordBackoff(attempt);
      const code = discordErrorCode(error);
      console.warn(
        `Discord ${method}: ${error?.name === 'AbortError' || error?.name === 'TimeoutError' ? 'timeout' : `${error.message}${code ? ` (${code})` : ''}`}; ` +
        `retry ${attempt}/${DISCORD_MAX_RETRIES} in ${delay}ms.`
      );
      await sleep(delay);
    }
  }

  throw new Error(`Discord ${method}: retry loop exited unexpectedly.`);
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
    if (!isDiscordUrl(input)) {
      return originalFetch(input, init);
    }

    const nextInit = init
      ? {
          ...init,
          body: init.body === undefined ? undefined : transformBody(init.body)
        }
      : init;

    return discordResilientFetch(originalFetch, input, nextInit);
  };
}

module.exports = {
  KINGS_LOGISTICS_LOGO,
  KINGS_HEART,
  DISCORD_MAX_RETRIES,
  DISCORD_IDEMPOTENT_METHODS,
  replaceBrandText,
  brandMessageContent,
  brandDiscordPayload,
  isDiscordUrl,
  canRetryDiscordResponse,
  canRetryDiscordError,
  discordResilientFetch,
  installDiscordBranding
};
