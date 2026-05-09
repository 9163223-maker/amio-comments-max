'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const RUNTIME = 'CC6.3';
const SOURCE = 'adminkit-CC6.3-comments-runtime-audit';
const MAX_EVENTS = 120;
const runtimeEvents = [];

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    });
  } catch {}
}

function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeDecode(value) {
  let current = String(value || '');
  for (let i = 0; i < 4; i += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

function firstMatch(text, re) {
  const m = String(text || '').match(re);
  return m ? m[1] || m[0] : '';
}

function extractScopeFromText(text) {
  const decoded = safeDecode(text || '');
  const commentKey = firstMatch(decoded, /-?\d+:-?\d{4,}/);
  const handoff = firstMatch(decoded, /h_[A-Za-z0-9_-]{8,}/);
  const channelId = commentKey ? commentKey.split(':')[0] : firstMatch(decoded, /(?:channelId|chat(?:%22)?id)[=:"%]+(-?\d{6,})/i);
  const postId = commentKey ? commentKey.split(':').slice(1).join(':') : firstMatch(decoded, /(?:postId|post_id)[=:"%]+([A-Za-z0-9_.:-]{4,})/i);
  return { commentKey, handoff, channelId, postId };
}

function scopeFromPayload(payload = {}) {
  const sources = [
    payload.href,
    payload.search,
    payload.hash,
    payload.startapp,
    payload.startappRaw,
    payload.commentKey,
    payload.handoff,
    payload.channelId,
    payload.postId,
    payload.raw,
  ].map(v => String(v || '')).filter(Boolean);
  const merged = sources.join(' ');
  const fromText = extractScopeFromText(merged);
  const commentKey = norm(payload.commentKey || fromText.commentKey);
  const channelId = norm(payload.channelId || fromText.channelId || (commentKey.includes(':') ? commentKey.split(':')[0] : ''));
  const postId = norm(payload.postId || fromText.postId || (commentKey.includes(':') ? commentKey.split(':').slice(1).join(':') : ''));
  const handoff = norm(payload.handoff || fromText.handoff);
  return { commentKey, handoff, channelId, postId, complete: Boolean(channelId && postId) };
}

function pushEvent(event) {
  const payload = event && typeof event === 'object' ? event : {};
  const item = {
    eventType: norm(payload.eventType || payload.type || 'unknown'),
    ok: payload.ok !== false,
    runtime: RUNTIME,
    clientRuntime: norm(payload.runtime || payload.clientRuntime || ''),
    ts: Number(payload.ts || Date.now()),
    receivedAt: Date.now(),
    href: norm(payload.href || ''),
    title: norm(payload.title || ''),
    scope: scopeFromPayload(payload),
    selectors: payload.selectors && typeof payload.selectors === 'object' ? payload.selectors : null,
    timings: payload.timings && typeof payload.timings === 'object' ? payload.timings : null,
    reason: norm(payload.reason || ''),
    payload: payload.payload && typeof payload.payload === 'object' ? payload.payload : undefined,
  };
  runtimeEvents.push(item);
  while (runtimeEvents.length > MAX_EVENTS) runtimeEvents.shift();
  return item;
}

function latestByType(type) {
  for (let i = runtimeEvents.length - 1; i >= 0; i -= 1) {
    if (runtimeEvents[i].eventType === type) return runtimeEvents[i];
  }
  return null;
}

function latestWithSelectors() {
  for (let i = runtimeEvents.length - 1; i >= 0; i -= 1) {
    if (runtimeEvents[i].selectors) return runtimeEvents[i];
  }
  return null;
}

function summarizeRuntime() {
  const boot = latestByType('comments_audit_boot');
  const domReady = latestByType('comments_dom_ready');
  const loaded = latestByType('comments_client_loaded');
  const firstPaint = latestByType('comments_first_stable_paint');
  const selectors = latestWithSelectors();
  const cta = latestByType('floating_cta_visible');
  const registerAttempt = latestByType('public_post_register_attempt');
  const registerResult = latestByType('public_post_register_result');
  const shellVisible = latestByType('comments_shell_visible');
  const latest = runtimeEvents[runtimeEvents.length - 1] || null;
  const scope = latest?.scope || boot?.scope || shellVisible?.scope || {};
  const selectorState = selectors?.selectors || {};
  const ctaBeforePaint = Boolean(cta && firstPaint && Number(cta.ts) < Number(firstPaint.ts));
  const appOpenOk = Boolean(loaded || firstPaint || shellVisible);
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    verdict: appOpenOk ? 'comments_runtime_seen' : 'waiting_for_comments_open',
    appOpenOk,
    uiSelectorsOk: {
      topNavigation: Boolean(selectorState.backBtn && selectorState.searchBtn && selectorState.commentsCountPill),
      composer: Boolean(selectorState.commentInput && selectorState.sendBtn && selectorState.composerCard),
      attachments: Boolean(selectorState.attachBtn || selectorState.attachmentInput),
      reactions: Boolean(selectorState.reactionBar || selectorState.actionSheet),
      legacyUi: Boolean(selectorState.commentsList && selectorState.postCard),
    },
    scope,
    scopeStatus: scope?.complete ? 'channel_and_post_resolved' : (scope?.handoff ? 'handoff_only' : 'not_resolved_yet'),
    timings: {
      bootTs: boot?.ts || null,
      domReadyTs: domReady?.ts || null,
      loadedTs: loaded?.ts || null,
      firstStablePaintTs: firstPaint?.ts || null,
      lastEventTs: latest?.ts || null,
      firstStablePaintMs: firstPaint?.timings?.sinceNavigationStart ?? null,
    },
    cta: {
      visible: Boolean(cta),
      beforeFirstStablePaint: ctaBeforePaint,
      policy: 'must_not_block_first_paint',
      last: cta || null,
    },
    registration: {
      attemptSeen: Boolean(registerAttempt),
      resultSeen: Boolean(registerResult),
      lastAttempt: registerAttempt || null,
      lastResult: registerResult || null,
      policy: 'background_only_must_not_block_open_or_posting',
    },
    eventsCount: runtimeEvents.length,
    recentEvents: runtimeEvents.slice(-20),
    generatedAt: Date.now(),
  };
}

function auditLegacyAppJs() {
  const appPath = path.join(__dirname, 'public', 'app.js');
  let source = '';
  try { source = fs.readFileSync(appPath, 'utf8'); } catch (error) {
    return { ok: false, reason: 'app_js_read_failed', error: error?.message || String(error), appPath };
  }
  const required = {
    topNavigation: ['miniAppTopbar', 'backBtn', 'searchBtn'],
    attachments: ['attachBtn', 'attachmentMenu', 'attachmentInput'],
    reactions: ['reactionBar', 'sendReaction', 'QUICK_REACTIONS'],
    actionSheet: ['actionSheet', 'positionActionSheet', 'selectedComment'],
    replies: ['composerReply', 'clearComposerReply', 'replyToId'],
    mediaViewer: ['mediaPreviewModal', 'mediaViewerModal'],
    maxBridge: ['getPossibleWebApps', 'initBridgeUi', 'getBridgeUser'],
    legacyUi: ['commentsList', 'composerCard', 'renderComments'],
  };
  const checks = Object.fromEntries(Object.entries(required).map(([name, tokens]) => [name, {
    ok: tokens.every(token => source.includes(token)),
    tokens: Object.fromEntries(tokens.map(token => [token, source.includes(token)])),
  }]));
  const allOk = Object.values(checks).every(item => item.ok);
  return {
    ok: allOk,
    runtimeVersion: RUNTIME,
    appJsBytes: Buffer.byteLength(source, 'utf8'),
    appJsApproxKb: Math.round(Buffer.byteLength(source, 'utf8') / 1024),
    checks,
    suspicious: {
      standalonePrototypeMarkers: ['cc60_standalone_clean_route', 'cc61_clean_boot_ui_preserved', 'clean_boot_ui_preserved'].filter(token => source.includes(token)),
      hardRedirects: (source.match(/window\.location\.href\s*=/g) || []).length,
      fetchCalls: (source.match(/fetch\(/g) || []).length,
      mutationObservers: (source.match(/MutationObserver/g) || []).length,
      timers: (source.match(/setInterval|setTimeout/g) || []).length,
    },
    verdict: allOk ? 'approved_legacy_ui_tokens_present' : 'legacy_ui_tokens_missing',
    generatedAt: Date.now(),
  };
}

function runtimeClientScript() {
  return `(() => {
    const RUNTIME = 'CC6.3';
    const startedAt = Date.now();
    const now = () => Date.now();
    const q = (id) => !!document.getElementById(id);
    const safe = (v) => String(v || '');
    function getApps(){ return [window.WebApp, window.Telegram?.WebApp, window.Max?.WebApp, window.MAX?.WebApp, window.maxWebApp, window.MAXWebApp, window.MiniApp, window.max?.WebApp].filter(Boolean); }
    function bridgeRaw(){
      const arr = [];
      for (const app of getApps()) {
        arr.push(app?.initDataUnsafe?.start_param, app?.initDataUnsafe?.startapp, app?.initDataUnsafe?.postId, app?.initDataUnsafe?.post_id, app?.initDataUnsafe?.commentKey, app?.initDataUnsafe?.query_id, app?.initData, app?.startParam, app?.launchParams, app?.params);
      }
      arr.push(location.href, location.search, location.hash, document.referrer || '');
      return arr.filter(Boolean).map(String).slice(0, 12).join(' ');
    }
    function selectors(){ return {
      miniAppTopbar:q('miniAppTopbar'), backBtn:q('backBtn'), searchBtn:q('searchBtn'), commentsCountPill:q('commentsCountPill'),
      postCard:q('postCard'), commentsList:q('commentsList'), emptyState:q('emptyState'), composerCard:q('composerCard'),
      commentInput:q('commentInput'), sendBtn:q('sendBtn'), attachBtn:q('attachBtn'), attachmentInput:q('attachmentInput'),
      reactionBar:q('reactionBar'), actionSheet:q('actionSheet'), mediaViewerModal:q('mediaViewerModal')
    }; }
    function send(eventType, extra){
      const body = Object.assign({ eventType, runtime:RUNTIME, ts:now(), href:location.href, title:document.title, raw:bridgeRaw(), selectors:selectors(), timings:{ sinceNavigationStart: Math.round(performance.now ? performance.now() : (now()-startedAt)) } }, extra || {});
      try { fetch('/api/cc63/runtime-event', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), keepalive:true, cache:'no-store' }).catch(()=>{}); } catch {}
    }
    send('comments_audit_boot');
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => send('comments_dom_ready'), { once:true }); else send('comments_dom_ready');
    window.addEventListener('load', () => send('comments_client_loaded'), { once:true });
    requestAnimationFrame(() => requestAnimationFrame(() => send('comments_first_stable_paint')));
    setTimeout(() => send('comments_shell_visible'), 500);
    setTimeout(() => send('comments_shell_visible'), 1600);
  })();`;
}

function injectAuditScript(html) {
  const marker = '/cc63-runtime-audit.js';
  if (!html || typeof html !== 'string' || html.includes(marker) || !/<html|<!doctype/i.test(html)) return html;
  const tag = '<script src="/cc63-runtime-audit.js" defer></script>';
  if (html.includes('</body>')) return html.replace('</body>', `${tag}</body>`);
  return `${html}${tag}`;
}

function install(app) {
  if (!app || app.__cc63RuntimeAudit) return app;
  app.__cc63RuntimeAudit = true;
  const json = express.json({ limit: '128kb' });

  app.use((req, res, next) => {
    if (!/^GET$/i.test(req.method) || !String(req.path || req.url || '').startsWith('/app')) return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      try {
        const type = String(res.getHeader('content-type') || '').toLowerCase();
        const text = Buffer.isBuffer(body) ? body.toString('utf8') : (typeof body === 'string' ? body : '');
        if ((!type || type.includes('html')) && text) return originalSend(injectAuditScript(text));
      } catch {}
      return originalSend(body);
    };
    next();
  });

  app.get('/cc63-runtime-audit.js', (req, res) => {
    noCache(res);
    res.type('application/javascript').send(runtimeClientScript());
  });

  app.post('/api/cc63/runtime-event', json, (req, res) => {
    noCache(res);
    const item = pushEvent(req.body || {});
    res.json({ ok: true, runtimeVersion: RUNTIME, event: item.eventType, scope: item.scope, eventsCount: runtimeEvents.length });
  });

  app.get('/debug/comments-runtime', (req, res) => {
    noCache(res);
    res.json(summarizeRuntime());
  });

  app.get('/debug/comments-shell', (req, res) => {
    noCache(res);
    res.json({
      ok: true,
      runtimeVersion: RUNTIME,
      sourceMarker: SOURCE,
      commentsShell: 'cc63_runtime_audit_over_legacy_ui',
      appRouteOwner: 'legacy_index_public_app',
      usesLegacyAppJs: true,
      uiPolicy: 'keep_approved_legacy_comments_ui_and_functions',
      cleanCoreScope: 'runtime_audit_backend_routes_and_db_registration_only',
      standalonePrototypeDisabled: true,
      blocksAppOpen: false,
      blocksPosting: false,
      dbRegistration: 'background_only',
      redirects: false,
      runtimeAudit: 'enabled_passive_client_script',
      auditScriptInjected: true,
      generatedAt: Date.now(),
    });
  });

  app.get('/debug/app-audit', (req, res) => {
    noCache(res);
    res.json(auditLegacyAppJs());
  });

  return app;
}

module.exports = { RUNTIME, SOURCE, install, auditLegacyAppJs, summarizeRuntime, pushEvent };
