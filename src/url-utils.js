const SEARCH_URL = 'https://duckduckgo.com/?q=';
const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const HOSTNAME_PATTERN = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?::\d{1,5})?(?:[/?#].*)?$/i;

/**
 * Turns address-bar text into a safe HTTP(S) URL. Anything that is not clearly
 * a web address is sent to DuckDuckGo as a search, like a regular browser.
 * Non-web schemes (javascript:, file:, data:, and so on) are never navigated.
 */
export function normalizeAddress(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;

  // Accept explicit HTTP(S) URLs, but do not mistake a local host:port for a scheme.
  if (/^https?:\/\//i.test(text)) {
    try {
      const parsed = new URL(text);
      if (WEB_PROTOCOLS.has(parsed.protocol)) return parsed.href;
    } catch {
      // Invalid input falls through to a safe text search.
    }
    return `${SEARCH_URL}${encodeURIComponent(text)}`;
  }

  // Other scheme-like input (javascript:, file:, data:, ftp:, etc.) is searched.
  if (/^[a-z][a-z\d+.-]*:/i.test(text) && !HOSTNAME_PATTERN.test(text)) {
    return `${SEARCH_URL}${encodeURIComponent(text)}`;
  }

  if (HOSTNAME_PATTERN.test(text)) {
    try {
      const parsed = new URL(`https://${text}`);
      if (WEB_PROTOCOLS.has(parsed.protocol)) return parsed.href;
    } catch {
      // A hostname-like string that fails URL parsing is searched instead.
    }
  }

  return `${SEARCH_URL}${encodeURIComponent(text)}`;
}

export function isWebUrl(value) {
  try {
    return WEB_PROTOCOLS.has(new URL(String(value)).protocol);
  } catch {
    return false;
  }
}
