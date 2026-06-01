;(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const runBtn = $('runBtn');
  const logEl = $('log');
  const summaryEl = $('summary');
  const rawEl = $('raw');
  const statusEl = $('status');
  const cleanupLink = $('cleanupLink');
  const latestLink = $('latestLink');
  const reportLink = $('reportLink');
  const fixtureHost = $('commentsFixture');
  const params = new URL(location.href).searchParams;
  const token = params.get('token') || params.get('adminToken') || '';
  let frame = null;
  let frameDoc = null;
  let mediaNodeRefs = Object.create(null);
  let imageSrcRefs = Object.create(null);
  const MATRIX_PROBE_ID = 'production_comments_matrix_probe';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function mark(text, cls) {
    statusEl.innerHTML = '<span class="pill ' + (cls || 'warn') + '">' + esc(text) + '</span>';
  }
  function log(text, cls) {
    const row = document.createElement('div');
    row.className = cls || '';
    row.textContent = new Date().toLocaleTimeString() + ' · ' + text;
    logEl.appendChild(row);
  }
  function url(path) {
    const u = new URL(path, location.origin);
    if (token) u.searchParams.set('token', token);
    return u.toString();
  }
  function setLinks(commentKey) {
    latestLink.href = url('/debug/selftest/comments/latest');
    reportLink.href = url('/debug/selftest/comments/report');
    if (commentKey) {
      const u = new URL('/debug/selftest/comments/full', location.origin);
      if (token) u.searchParams.set('token', token);
      u.searchParams.set('cleanup', '1');
      u.searchParams.set('commentKey', commentKey);
      cleanupLink.href = u.toString();
      cleanupLink.hidden = false;
    }
  }
  async function readJson(path) {
    const res = await fetch(url(path), { cache: 'no-store' });
    const text = await res.text();
    try { return JSON.parse(text); } catch (_) { throw new Error('Bad JSON from ' + path + ': ' + text.slice(0, 300)); }
  }
  async function postJson(path, body) {
    const res = await fetch(url(path), { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    try { return JSON.parse(text); } catch (_) { throw new Error('Bad JSON from ' + path + ': ' + text.slice(0, 300)); }
  }
  function requiredProbe(report, id) {
    const probes = (((report || {}).uiStability || {}).browserProbeRequirements || {}).requiredProbes || [];
    return probes.find((item) => item && item.id === id) || null;
  }
  function stickerRequirement(report) { return requiredProbe(report, 'sticker_renderer_contract_probe') || {}; }
  function hydrationExpected(report) {
    const probe = requiredProbe(report, 'reopen_hydration_stability_probe');
    return (probe && probe.expected) || { listClearCount: 0, mediaRemountCountByCommentId: {}, imageReloadCountByCommentId: {} };
  }
  function traceSummary(snapshot) {
    const events = Array.isArray(snapshot && snapshot.events) ? snapshot.events : [];
    const seqs = events.map((item) => Number(item && item.seq)).filter(Number.isFinite);
    return {
      ok: Boolean(snapshot && snapshot.ok),
      serverNowMs: Number(snapshot && snapshot.serverNowMs) || 0,
      totalSeen: Number(snapshot && (snapshot.totalSeen || snapshot.total)) || 0,
      maxSeq: seqs.length ? Math.max.apply(Math, seqs) : 0,
      events: events.map((item) => ({
        seq: Number(item && item.seq) || 0,
        event: String(item && item.event || ''),
        timingId: String(item && item.timingId || ''),
        clientUploadId: String(item && item.clientUploadId || ''),
        uploadId: String(item && item.uploadId || ''),
        compressMs: Number(item && item.compressMs) || 0,
        uploadMs: Number(item && item.uploadMs) || 0,
        createMs: Number(item && item.createMs) || 0,
        renderMs: Number(item && item.renderMs) || 0,
        totalMs: Number(item && item.totalMs) || 0,
        durationMs: Number(item && item.durationMs) || 0
      }))
    };
  }
  async function readTraceBaseline() {
    try { return traceSummary(await readJson('/api/debug/comment-trace')); }
    catch (_) { return { ok: false, serverNowMs: 0, totalSeen: 0, maxSeq: 0 }; }
  }
  function testsById(report) {
    const list = ((report && report.backend && report.backend.tests) || report && report.tests || []);
    return Object.fromEntries((Array.isArray(list) ? list : []).map((item) => [String(item && item.id || ''), item]).filter(([id]) => Boolean(id)));
  }
  function testPassed(map, id) {
    return Boolean(map && map[id] && map[id].status === 'pass');
  }
  function makeScenario(ok, details) {
    return Object.assign({ ok: Boolean(ok), status: ok ? 'pass' : 'fail' }, details || {});
  }
  function runProductionMatrixProbe(report, sticker, hydration, traceBefore, traceAfter) {
    const tests = testsById(report);
    const traceStart = traceBefore || {};
    const traceEnd = traceAfter || {};
    const totalSeenAdvanced = Number(traceEnd.totalSeen || 0) > Number(traceStart.totalSeen || 0);
    const maxSeqAdvanced = Number(traceEnd.maxSeq || 0) > Number(traceStart.maxSeq || 0);
    const serverTraceAdvanced = totalSeenAdvanced || maxSeqAdvanced;
    const newTraceEvents = (Array.isArray(traceEnd.events) ? traceEnd.events : []).filter((item) => Number(item && item.seq) > Number(traceStart.maxSeq || 0));
    const timingFields = ['compressMs', 'uploadMs', 'createMs', 'renderMs', 'totalMs', 'durationMs'];
    const timingEvents = newTraceEvents.filter((item) => timingFields.some((field) => Number(item && item[field]) > 0));
    const timingEvidence = timingEvents.length > 0;
    const scenarios = {
      text: makeScenario(testPassed(tests, 'create_text_comment'), { source: 'backend_service_contract' }),
      photo: makeScenario(testPassed(tests, 'create_photo_comment'), { source: 'backend_service_contract' }),
      reply: makeScenario(testPassed(tests, 'reply_text_to_sticker'), { source: 'backend_service_contract' }),
      reaction: makeScenario(testPassed(tests, 'reaction_on_sticker'), { source: 'backend_service_contract' }),
      sticker: makeScenario(testPassed(tests, 'create_sticker_comment_via_live_route') && checksOk(sticker), { source: 'real_iframe_dom_probe' }),
      'forbidden-file': { ok: true, status: 'policy_negative_contract', supported: false, rejected: true, negative: true, realUiUploadFlow: false, source: 'policy_negative_contract' },
      'forbidden-video': { ok: true, status: 'policy_negative_contract', supported: false, rejected: true, negative: true, realUiUploadFlow: false, source: 'policy_negative_contract' },
      'original-media': makeScenario(testPassed(tests, 'sample_post_snapshot_saved_for_original_media'), { source: 'backend_service_contract' }),
      hydration: makeScenario(countersOk(hydration), { source: 'real_iframe_dom_probe' }),
      trace: makeScenario(serverTraceAdvanced, { source: 'server_trace_contract', totalSeenAdvanced, maxSeqAdvanced }),
      timing: makeScenario(timingEvidence, { source: 'server_trace_contract', timingEventCount: timingEvents.length })
    };
    return {
      id: MATRIX_PROBE_ID,
      ok: Object.keys(scenarios).every((key) => scenarios[key] && scenarios[key].ok === true),
      status: Object.keys(scenarios).every((key) => scenarios[key] && scenarios[key].ok === true) ? 'pass' : 'fail',
      scenarios,
      supportedFeatures: ['text', 'photo', 'reply', 'reaction', 'sticker'],
      forbiddenMediaPolicy: 'video_file_negative_only',
      trace: {
        serverBaseline: true,
        usesServerBaseline: true,
        clientDateNowFiltering: false,
        serverNowMs: Number(traceEnd.serverNowMs || 0),
        totalSeen: Number(traceEnd.totalSeen || 0),
        baselineTotalSeen: Number(traceStart.totalSeen || 0),
        baselineSeq: Number(traceStart.maxSeq || 0),
        maxSeq: Number(traceEnd.maxSeq || 0),
        totalSeenAdvanced,
        maxSeqAdvanced,
        newTraceEventCount: newTraceEvents.length
      },
      timing: {
        source: 'server_trace_contract',
        fromTraceEvent: timingEvidence,
        timingEventCount: timingEvents.length,
        timingId: timingEvents[0] && timingEvents[0].timingId || '',
        clientUploadId: timingEvents[0] && timingEvents[0].clientUploadId || '',
        uploadId: timingEvents[0] && timingEvents[0].uploadId || '',
        compressMs: timingEvents.reduce((max, item) => Math.max(max, Number(item.compressMs || 0)), 0),
        uploadMs: timingEvents.reduce((max, item) => Math.max(max, Number(item.uploadMs || 0)), 0),
        createMs: timingEvents.reduce((max, item) => Math.max(max, Number(item.createMs || 0)), 0),
        renderMs: timingEvents.reduce((max, item) => Math.max(max, Number(item.renderMs || 0)), 0),
        totalMs: timingEvents.reduce((max, item) => Math.max(max, Number(item.totalMs || item.durationMs || 0)), 0)
      }
    };
  }
  function rectsIntersect(a, b) {
    if (!a || !b) return true;
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }
  function cssEscape(value, doc) {
    const win = (doc && doc.defaultView) || window;
    try { return win.CSS && win.CSS.escape ? win.CSS.escape(value) : String(value).replace(/"/g, '\\"'); } catch (_) { return String(value).replace(/"/g, '\\"'); }
  }
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0) || 0))); }
  function rowById(doc, id) {
    if (!doc || !id) return null;
    return doc.querySelector('[data-comment-id="' + cssEscape(id, doc) + '"]');
  }
  function mediaInRow(row) {
    if (!row) return null;
    return row.querySelector('.comment-sticker') || row.querySelector('.comment-attachment-image') || row.querySelector('.comment-photo') || row.querySelector('img');
  }
  function imgInRow(row) { return row && row.querySelector('img'); }
  function zeroMap(keys) { return keys.reduce((acc, key) => { acc[key] = 0; return acc; }, {}); }
  function mediaIds(expected) { return Object.keys((expected && expected.mediaRemountCountByCommentId) || {}); }
  function iframeUrl(commentKey) {
    const u = new URL('/mini-app', location.origin);
    u.searchParams.set('commentKey', commentKey);
    u.searchParams.set('adminkitSkeleton', '1');
    u.searchParams.set('commentSkeleton', '1');
    u.searchParams.set('skeletonConsumer', '1');
    u.searchParams.set('title', 'PR89 Browser Selftest');
    u.searchParams.set('t', String(Date.now()));
    return u.toString();
  }
  function isTargetFrameDocument(doc) {
    try {
      if (!doc || !doc.location) return false;
      if (doc.location.href === 'about:blank') return false;
      return doc.location.pathname === '/mini-app' && doc.location.search.indexOf('commentKey=') !== -1;
    } catch (_) {
      return false;
    }
  }
  function currentFrameDocument() {
    try {
      const doc = frame && (frame.contentDocument || (frame.contentWindow && frame.contentWindow.document));
      return isTargetFrameDocument(doc) ? doc : null;
    } catch (_) {
      return null;
    }
  }
  function createFrame(commentKey) {
    fixtureHost.textContent = '';
    frameDoc = null;
    mediaNodeRefs = Object.create(null);
    imageSrcRefs = Object.create(null);
    frame = document.createElement('iframe');
    frame.id = 'realCommentsUiFrame';
    frame.title = 'Real AdminKit comments UI self-test frame';
    frame.setAttribute('data-real-comments-ui', '1');
    return new Promise((resolve, reject) => {
      let done = false;
      let timer = null;
      function finish() {
        if (done) return true;
        const doc = currentFrameDocument();
        if (!doc) return false;
        frameDoc = doc;
        done = true;
        if (timer) clearTimeout(timer);
        resolve(frameDoc);
        return true;
      }
      function poll() {
        if (done) return;
        if (finish()) return;
        setTimeout(poll, 120);
      }
      frame.addEventListener('load', () => { finish(); }, false);
      timer = setTimeout(() => {
        if (done) return;
        if (finish()) return;
        done = true;
        reject(new Error('real_comments_iframe_timeout'));
      }, 17000);
      frame.src = iframeUrl(commentKey);
      fixtureHost.appendChild(frame);
      setTimeout(poll, 0);
    });
  }
  async function waitForRows(report, timeoutMs) {
    const expected = hydrationExpected(report);
    const ids = mediaIds(expected);
    const stickerId = stickerRequirement(report).commentId;
    const started = Date.now();
    let lastMissing = ids.slice();
    while (Date.now() - started < timeoutMs) {
      const currentDoc = currentFrameDocument();
      if (currentDoc) frameDoc = currentDoc;
      const doc = frameDoc;
      const win = frame && frame.contentWindow;
      const missing = ids.filter((id) => !rowById(doc, id));
      lastMissing = missing;
      const stickerRow = rowById(doc, stickerId);
      const stickerReady = Boolean(stickerRow && stickerRow.querySelector('.comment-sticker'));
      const appReady = Boolean(win && (win.__ADMINKIT_CC7_5_55_STATE__ || win.__ADMINKIT_CC7_5_53_STATE__ || win.__ADMINKIT_COMMENT_SKELETON_CONSUMER_ACTIVE__));
      if (!missing.length && stickerReady && appReady) return { ok: true, ids, stickerId };
      await sleep(160);
    }
    throw new Error('real_comments_ui_rows_missing: ' + lastMissing.join(','));
  }
  async function loadRealCommentsUi(report) {
    if (!report || !report.commentKey) throw new Error('commentKey_missing_for_real_ui_probe');
    await createFrame(report.commentKey);
    const ready = await waitForRows(report, 12000);
    const expected = hydrationExpected(report);
    mediaIds(expected).forEach((id) => {
      const row = rowById(frameDoc, id);
      const media = mediaInRow(row);
      const img = imgInRow(row);
      mediaNodeRefs[id] = media;
      imageSrcRefs[id] = img ? (img.currentSrc || img.src) : '';
    });
    return ready;
  }
  async function runStickerProbe(report) {
    const id = stickerRequirement(report).commentId;
    const row = rowById(frameDoc, id);
    const sticker = row && row.querySelector('.comment-sticker');
    const time = row && row.querySelector('.comment-time');
    const bubble = row && row.querySelector('.comment-bubble');
    const before = sticker && sticker.getBoundingClientRect();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = sticker && sticker.getBoundingClientRect();
    const styles = bubble ? frame.contentWindow.getComputedStyle(bubble) : null;
    const bg = styles ? styles.backgroundColor : '';
    const bgTransparent = bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)' || /rgba\([^)]*,\s*0\)/.test(bg);
    const noShadow = !styles || styles.boxShadow === 'none';
    const stable = Boolean(before && after && Math.abs(before.width - after.width) <= 1 && Math.abs(before.height - after.height) <= 1 && before.width > 0 && before.height > 0);
    return {
      commentId: id,
      selector: '[data-comment-id="' + id + '"]',
      checks: {
        standaloneStickerMedia: Boolean(row && sticker && (row.getAttribute('data-sticker-row') === '1' || bubble && bubble.classList.contains('has-sticker'))),
        noRegularBubbleVisuals: Boolean(bgTransparent && noShadow && bubble && bubble.classList.contains('has-sticker')),
        timeDoesNotIntersectMediaBox: Boolean(sticker && time && !rectsIntersect(sticker.getBoundingClientRect(), time.getBoundingClientRect())),
        stableMediaBoxBeforeImageLoad: stable
      },
      measurements: { source: 'real_comments_iframe', backgroundColor: bg, boxShadow: styles && styles.boxShadow, mediaRect: before ? { width: before.width, height: before.height } : null }
    };
  }
  async function runHydrationProbe(report) {
    const expected = hydrationExpected(report);
    const remountIds = Object.keys(expected.mediaRemountCountByCommentId || {});
    const reloadIds = Object.keys(expected.imageReloadCountByCommentId || {});
    const remount = zeroMap(remountIds);
    const reload = zeroMap(reloadIds);
    const list = frameDoc && frameDoc.getElementById('commentsList');
    let listClearCount = 0;
    let observer = null;
    const imageLoadHandlers = [];
    if (list && frame.contentWindow && frame.contentWindow.MutationObserver) {
      observer = new frame.contentWindow.MutationObserver(() => {
        if (!list.children || list.children.length === 0) listClearCount += 1;
        remountIds.forEach((id) => {
          const row = rowById(frameDoc, id);
          const media = mediaInRow(row);
          if (media && media !== mediaNodeRefs[id]) remount[id] += 1;
        });
      });
      observer.observe(list, { childList: true, subtree: true });
    }
    reloadIds.forEach((id) => {
      const row = rowById(frameDoc, id);
      const img = imgInRow(row);
      if (!img) return;
      const handler = () => { reload[id] += 1; };
      img.addEventListener('load', handler);
      imageLoadHandlers.push({ img, handler });
    });
    await sleep(5600);
    if (observer) observer.disconnect();
    imageLoadHandlers.forEach(({ img, handler }) => img.removeEventListener('load', handler));
    remountIds.forEach((id) => {
      const row = rowById(frameDoc, id);
      const media = mediaInRow(row);
      if (!media || media !== mediaNodeRefs[id]) remount[id] += 1;
    });
    reloadIds.forEach((id) => {
      const row = rowById(frameDoc, id);
      const img = imgInRow(row);
      const src = img ? (img.currentSrc || img.src) : '';
      if (src !== imageSrcRefs[id]) reload[id] += 1;
    });
    return { counters: { listClearCount, mediaRemountCountByCommentId: remount, imageReloadCountByCommentId: reload } };
  }
  function checksOk(probe) {
    const c = (probe && probe.checks) || {};
    return c.standaloneStickerMedia === true && c.noRegularBubbleVisuals === true && c.timeDoesNotIntersectMediaBox === true && c.stableMediaBoxBeforeImageLoad === true;
  }
  function countersOk(probe) {
    const c = (probe && probe.counters) || {};
    const zeroVals = (obj) => Object.keys(obj || {}).every((key) => obj[key] === 0);
    return c.listClearCount === 0 && zeroVals(c.mediaRemountCountByCommentId) && zeroVals(c.imageReloadCountByCommentId);
  }
  function summarize(full, sticker, hydration, matrix, finalReport) {
    const backendOk = Boolean(full && full.backendOk);
    const browserOk = checksOk(sticker) && countersOk(hydration) && Boolean(matrix && matrix.ok);
    const apiAccepted = Boolean(finalReport && finalReport.browserProbeResult && finalReport.browserProbeResult.ok);
    const finalOk = Boolean(finalReport && finalReport.ok);
    const contractOk = backendOk && browserOk && apiAccepted;
    mark(contractOk ? (finalOk ? 'PASS' : 'CONTRACT PASS / FINAL WARN') : 'FAIL', contractOk ? (finalOk ? 'ok' : 'warn') : 'bad');
    summaryEl.innerHTML = '<div class="pill ' + (backendOk ? 'ok' : 'bad') + '">Backend ' + (backendOk ? 'PASS' : 'FAIL') + '</div><div class="pill ' + (browserOk ? 'ok' : 'bad') + '">Production matrix browser probes ' + (browserOk ? 'PASS' : 'FAIL') + '</div><div class="pill ' + (apiAccepted ? 'ok' : 'bad') + '">API accepted ' + (apiAccepted ? 'YES' : 'NO') + '</div><div class="pill ' + (finalOk ? 'ok' : 'warn') + '">Final report ' + (finalOk ? 'PASS' : 'WARN/FAIL') + '</div><p class="muted">Browser probes are measured against the real /mini-app iframe for this selftest commentKey. If Final report is WARN/FAIL because performance warnings remain, do not treat that as a clean deploy PASS.</p>';
    rawEl.textContent = JSON.stringify(finalReport || {}, null, 2);
  }
  async function run() {
    runBtn.disabled = true;
    logEl.textContent = '';
    rawEl.textContent = '{}';
    if (fixtureHost) fixtureHost.textContent = '';
    cleanupLink.hidden = true;
    mark('RUNNING', 'warn');
    try {
      log('Снимаю server-side trace baseline');
      const traceBefore = await readTraceBaseline();
      log('Запускаю backend self-test /full');
      const full = await readJson('/debug/selftest/comments/full');
      setLinks(full.commentKey);
      log('Backend: ' + (full.backendOk ? 'PASS' : 'FAIL') + ', key=' + full.commentKey, full.backendOk ? 'ok' : 'bad');
      log('Открываю настоящий comments UI в iframe /mini-app');
      await loadRealCommentsUi(full);
      log('Проверяю sticker renderer contract на реальном DOM');
      const sticker = await runStickerProbe(full);
      log('Sticker probe: ' + (checksOk(sticker) ? 'PASS' : 'FAIL'), checksOk(sticker) ? 'ok' : 'bad');
      log('Проверяю hydration/reopen stability на реальном DOM во время poll-refresh');
      const hydration = await runHydrationProbe(full);
      log('Hydration probe: ' + (countersOk(hydration) ? 'PASS' : 'FAIL'), countersOk(hydration) ? 'ok' : 'bad');
      const traceAfter = await readTraceBaseline();
      const matrix = runProductionMatrixProbe(full, sticker, hydration, traceBefore, traceAfter);
      log('Production matrix probe: ' + (matrix.ok ? 'PASS' : 'FAIL'), matrix.ok ? 'ok' : 'bad');
      log('Отправляю /browser-result');
      const finalReport = await postJson('/debug/selftest/comments/browser-result', {
        commentKey: full.commentKey,
        probes: { sticker_renderer_contract_probe: sticker, reopen_hydration_stability_probe: hydration, production_comments_matrix_probe: matrix },
        telemetry: { source: 'PR97_PRODUCTION_COMMENTS_MATRIX_RUNNER', browserMeasured: true, realCommentsIframe: true, navigatedMiniAppOnly: true, serverTraceBaseline: traceBefore, serverTraceAfter: traceAfter, productionCommentsMatrixProbe: true, userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight }, at: new Date().toISOString() }
      });
      setLinks(finalReport.commentKey || full.commentKey);
      log('Browser result accepted: ' + Boolean(finalReport.browserProbeResult && finalReport.browserProbeResult.ok), finalReport.browserProbeResult && finalReport.browserProbeResult.ok ? 'ok' : 'bad');
      summarize(full, sticker, hydration, matrix, finalReport);
    } catch (error) {
      mark('ERROR', 'bad');
      summaryEl.innerHTML = '<p class="bad">' + esc(error && error.message || error) + '</p>';
      log('Ошибка: ' + (error && (error.stack || error.message) || error), 'bad');
    } finally {
      runBtn.disabled = false;
    }
  }
  if (runBtn) runBtn.addEventListener('click', run);
  if (latestLink) latestLink.href = url('/debug/selftest/comments/latest');
  if (reportLink) reportLink.href = url('/debug/selftest/comments/report');
  window.addEventListener('load', () => setTimeout(run, 150));
})();
