'use strict';

const DEFAULT_CLCK_ENDPOINT = 'https://clck.ru/--';
const DEFAULT_CLCK_TIMEOUT_MS = 4500;
const MIN_CLCK_TIMEOUT_MS = 1500;
const MAX_CLCK_TIMEOUT_MS = 12000;
const SHORT_URL_PROVIDER_CLCK = 'clck.ru';

function clean(value) {
  return String(value || '').trim();
}

function clckEnabled() {
  return clean(process.env.ADMINKIT_CLCK_SHORT_LINKS_ENABLED || '1') !== '0';
}

function clckEndpoint() {
  return clean(process.env.ADMINKIT_CLCK_ENDPOINT || DEFAULT_CLCK_ENDPOINT) || DEFAULT_CLCK_ENDPOINT;
}

function clckTimeoutMs() {
  const parsed = Number(process.env.ADMINKIT_CLCK_TIMEOUT_MS || DEFAULT_CLCK_TIMEOUT_MS) || DEFAULT_CLCK_TIMEOUT_MS;
  return Math.max(MIN_CLCK_TIMEOUT_MS, Math.min(MAX_CLCK_TIMEOUT_MS, parsed));
}

function isClckUrl(value = '') {
  return /^https?:\/\/clck\.ru\/\S+/i.test(clean(value));
}

function shortErrorCode(error) {
  return clean(error && (error.code || error.message) || error || 'clck_shortener_failed').replace(/https?:\/\/\S+/g, '[url]').slice(0, 220);
}

async function createClckShortUrl(longUrl = '') {
  const target = clean(longUrl);
  if (!target) {
    const error = new Error('short_url_target_missing');
    error.code = 'short_url_target_missing';
    throw error;
  }
  if (!clckEnabled()) {
    const error = new Error('clck_shortener_disabled');
    error.code = 'clck_shortener_disabled';
    throw error;
  }
  if (typeof fetch !== 'function') {
    const error = new Error('fetch_unavailable');
    error.code = 'fetch_unavailable';
    throw error;
  }
  const url = new URL(clckEndpoint());
  url.searchParams.set('url', target);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = setTimeout(() => {
    try { if (controller) controller.abort(); } catch {}
  }, clckTimeoutMs());
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller ? controller.signal : undefined,
      headers: { 'User-Agent': 'adminkit-clck-shortener' }
    });
    const text = clean(await response.text().catch(() => ''));
    if (!response.ok) {
      const error = new Error(`clck_http_${response.status}`);
      error.code = `clck_http_${response.status}`;
      throw error;
    }
    if (!isClckUrl(text)) {
      const error = new Error(text ? `clck_bad_response:${text.slice(0, 80)}` : 'clck_empty_response');
      error.code = text ? 'clck_bad_response' : 'clck_empty_response';
      throw error;
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function createShortUrlOrFallback(longUrl = '') {
  const safeLongUrl = clean(longUrl);
  try {
    const shortUrl = await createClckShortUrl(safeLongUrl);
    return {
      longUrl: safeLongUrl,
      displayUrl: shortUrl,
      shortUrl,
      shortUrlProvider: SHORT_URL_PROVIDER_CLCK,
      shortUrlError: ''
    };
  } catch (error) {
    return {
      longUrl: safeLongUrl,
      displayUrl: safeLongUrl,
      shortUrl: '',
      shortUrlProvider: SHORT_URL_PROVIDER_CLCK,
      shortUrlError: shortErrorCode(error)
    };
  }
}

module.exports = {
  DEFAULT_CLCK_ENDPOINT,
  SHORT_URL_PROVIDER_CLCK,
  clckEnabled,
  clckEndpoint,
  clckTimeoutMs,
  isClckUrl,
  createClckShortUrl,
  createShortUrlOrFallback,
  shortErrorCode
};
