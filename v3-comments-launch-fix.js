'use strict';

const RUNTIME = 'CC6.5.6.1-COMMENTS-LAUNCH-FIX';
const SOURCE = 'adminkit-CC6.5.6.1-direct-miniapp-comments-link';

function clean(value) {
  return String(value || '').trim();
}

function buildStartappPayload({ handoffToken, commentKey, postId, channelId } = {}) {
  const normalizedHandoff = clean(handoffToken);
  if (normalizedHandoff) return normalizedHandoff;

  const normalizedCommentKey = clean(commentKey);
  if (normalizedCommentKey) return `ck:${normalizedCommentKey}`;

  const normalizedChannelId = clean(channelId);
  const normalizedPostId = clean(postId);
  if (normalizedChannelId && normalizedPostId) return `cp:${normalizedChannelId}:${normalizedPostId}`;
  if (normalizedPostId) return `post:${normalizedPostId}`;
  return '';
}

function buildDirectMiniAppLaunchUrl({ appBaseUrl, handoffToken, postId, channelId, commentKey } = {}) {
  const normalizedAppBaseUrl = clean(appBaseUrl).replace(/\/$/, '');
  if (!normalizedAppBaseUrl) return '';

  const normalizedPostId = clean(postId);
  const normalizedChannelId = clean(channelId);
  const normalizedCommentKey = clean(commentKey);
  const normalizedHandoff = clean(handoffToken);
  const startapp = buildStartappPayload({
    handoffToken: normalizedHandoff,
    commentKey: normalizedCommentKey,
    postId: normalizedPostId,
    channelId: normalizedChannelId
  });

  const query = new URLSearchParams();
  if (startapp) query.set('startapp', startapp);
  if (normalizedHandoff) query.set('handoff', normalizedHandoff);
  if (normalizedPostId) query.set('postId', normalizedPostId);
  if (normalizedChannelId) query.set('channelId', normalizedChannelId);
  if (normalizedCommentKey) query.set('commentKey', normalizedCommentKey);

  const qs = query.toString();
  return `${normalizedAppBaseUrl}/app${qs ? '?' + qs : ''}`;
}

function install() {
  const api = require('./services/maxApi');
  if (!api || api.__adminkitCommentsLaunchFix) return selfTest();

  const originalBuildBotStartLink = api.buildBotStartLink;
  const originalBuildMiniAppLaunchUrl = api.buildMiniAppLaunchUrl;
  const originalBuildCommentsKeyboard = api.buildCommentsKeyboard;

  api.buildMiniAppLaunchUrl = function patchedBuildMiniAppLaunchUrl(args = {}) {
    const direct = buildDirectMiniAppLaunchUrl(args);
    if (direct) return direct;
    return originalBuildMiniAppLaunchUrl.call(this, args);
  };

  api.buildCommentsKeyboard = function patchedBuildCommentsKeyboard(args = {}) {
    const rows = [];

    if (args.showPrimaryButton !== false) {
      const buttonText = clean(args.primaryButtonText) || api.buildCommentsButtonText(args.count || 0, args.buttonSuffix || '');
      const appLink = api.buildMiniAppLaunchUrl(args);
      const botLink = originalBuildBotStartLink.call(api, args);
      const launchLink = appLink || botLink || '';
      rows.push([
        {
          type: 'link',
          text: buttonText,
          ...(launchLink ? { url: launchLink } : {})
        }
      ]);
    }

    const extraRows = Array.isArray(args.extraRows) ? args.extraRows.filter((row) => Array.isArray(row) && row.length) : [];
    rows.push(...extraRows);

    if (!rows.length) return [];
    return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
  };

  api.__adminkitCommentsLaunchFix = {
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    preferDirectMiniAppUrl: true,
    note: 'comments button now prefers APP_BASE_URL /app?commentKey=... over bot deep-link when appBaseUrl exists'
  };

  return selfTest();
}

function selfTest() {
  const api = require('./services/maxApi');
  const sample = api.buildCommentsKeyboard({
    appBaseUrl: 'https://example.code.run',
    botUsername: 'sample_bot',
    maxDeepLinkBase: 'https://max.ru/sample_bot',
    commentKey: '-100:123',
    count: 0
  });
  const url = sample?.[0]?.payload?.buttons?.[0]?.[0]?.url || '';
  return {
    ok: !!(api && api.__adminkitCommentsLaunchFix) && /^https:\/\/example\.code\.run\/app\?/.test(url) && url.includes('commentKey='),
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    sampleUrl: url,
    installed: api && api.__adminkitCommentsLaunchFix || null
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest };
