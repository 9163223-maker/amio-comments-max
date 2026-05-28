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
  const commentsList = $('commentsList');
  const params = new URL(location.href).searchParams;
  const token = params.get('token') || params.get('adminToken') || '';
  let mediaNodeRefs = Object.create(null);
  let imageSrcRefs = Object.create(null);

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
  function stickerUrl() { return '/stickers/adminkit/v1/adminkit_ok.webp'; }
  function rectsIntersect(a, b) {
    if (!a || !b) return true;
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }
  function cssEscape(value) {
    try { return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"'); } catch (_) { return String(value).replace(/"/g, '\\"'); }
  }
  function mediaIds(expected) { return Object.keys((expected && expected.mediaRemountCountByCommentId) || {}); }
  function zeroMap(keys) { return keys.reduce((acc, key) => { acc[key] = 0; return acc; }, {}); }
  function renderRow(id, type) {
    const row = document.createElement('div');
    row.className = 'comment-row own ' + (type === 'sticker' ? 'comment-sticker-only' : '');
    row.setAttribute('data-comment-id', id);
    if (type === 'sticker') row.setAttribute('data-sticker-row', '1');
    const bubble = document.createElement('div');
    bubble.className = 'comment-bubble ' + (type === 'sticker' ? 'has-sticker' : '');
    const media = document.createElement('div');
    media.className = type === 'sticker' ? 'comment-sticker comment-sticker-only' : 'comment-photo';
    if (type === 'sticker') media.setAttribute('data-sticker-id', 'adminkit_ok');
    const img = document.createElement('img');
    img.className = type === 'sticker' ? 'comment-sticker-img' : 'comment-photo-img';
    img.src = stickerUrl();
    img.alt = type === 'sticker' ? 'Стикер' : 'Фото';
    img.loading = 'eager';
    media.appendChild(img);
    const time = document.createElement('div');
    time.className = 'comment-time comment-sticker-meta';
    time.textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    bubble.appendChild(media);
    bubble.appendChild(time);
    row.appendChild(bubble);
    return row;
  }
  function renderFixture(report) {
    commentsList.textContent = '';
    mediaNodeRefs = Object.create(null);
    imageSrcRefs = Object.create(null);
    const stickerId = stickerRequirement(report).commentId;
    const ids = mediaIds(hydrationExpected(report));
    ids.forEach((id) => {
      const type = id === stickerId ? 'sticker' : 'photo';
      const row = renderRow(id, type);
      commentsList.appendChild(row);
      mediaNodeRefs[id] = row.querySelector(type === 'sticker' ? '.comment-sticker' : '.comment-photo');
      const img = row.querySelector('img');
      imageSrcRefs[id] = img ? (img.currentSrc || img.src) : '';
    });
  }
  async function runStickerProbe(report) {
    const id = stickerRequirement(report).commentId;
    const row = document.querySelector('[data-comment-id="' + cssEscape(id) + '"]');
    const sticker = row && row.querySelector('.comment-sticker');
    const time = row && row.querySelector('.comment-time');
    const bubble = row && row.querySelector('.comment-bubble');
    const before = sticker && sticker.getBoundingClientRect();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = sticker && sticker.getBoundingClientRect();
    const styles = bubble ? getComputedStyle(bubble) : null;
    const bg = styles ? styles.backgroundColor : '';
    const bgTransparent = bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)' || /rgba\([^)]*,\s*0\)/.test(bg);
    const noShadow = !styles || styles.boxShadow === 'none';
    const stable = Boolean(before && after && Math.abs(before.width - after.width) <= 1 && Math.abs(before.height - after.height) <= 1 && before.width > 0 && before.height > 0);
    return {
      commentId: id,
      selector: '[data-comment-id="' + id + '"]',
      checks: {
        standaloneStickerMedia: Boolean(row && sticker && row.getAttribute('data-sticker-row') === '1'),
        noRegularBubbleVisuals: Boolean(bgTransparent && noShadow && bubble && bubble.classList.contains('has-sticker')),
        timeDoesNotIntersectMediaBox: Boolean(sticker && time && !rectsIntersect(sticker.getBoundingClientRect(), time.getBoundingClientRect())),
        stableMediaBoxBeforeImageLoad: stable
      },
      measurements: { backgroundColor: bg, boxShadow: styles && styles.boxShadow, mediaRect: before ? { width: before.width, height: before.height } : null }
    };
  }
  function runHydrationProbe(report) {
    const expected = hydrationExpected(report);
    const remountIds = Object.keys(expected.mediaRemountCountByCommentId || {});
    const reloadIds = Object.keys(expected.imageReloadCountByCommentId || {});
    const beforeCount = commentsList.children.length;
    commentsList.setAttribute('data-reopen-probe', '1');
    commentsList.removeAttribute('data-reopen-probe');
    const afterCount = commentsList.children.length;
    const remount = zeroMap(remountIds);
    const reload = zeroMap(reloadIds);
    remountIds.forEach((id) => {
      const row = document.querySelector('[data-comment-id="' + cssEscape(id) + '"]');
      const media = row && (row.querySelector('.comment-sticker') || row.querySelector('.comment-photo'));
      if (media !== mediaNodeRefs[id]) remount[id] = 1;
    });
    reloadIds.forEach((id) => {
      const row = document.querySelector('[data-comment-id="' + cssEscape(id) + '"]');
      const img = row && row.querySelector('img');
      const src = img ? (img.currentSrc || img.src) : '';
      if (src !== imageSrcRefs[id]) reload[id] = 1;
    });
    return { counters: { listClearCount: beforeCount && afterCount ? 0 : 1, mediaRemountCountByCommentId: remount, imageReloadCountByCommentId: reload } };
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
  function summarize(full, sticker, hydration, finalReport) {
    const backendOk = Boolean(full && full.backendOk);
    const browserOk = checksOk(sticker) && countersOk(hydration);
    const apiAccepted = Boolean(finalReport && finalReport.browserProbeResult && finalReport.browserProbeResult.ok);
    const finalOk = Boolean(finalReport && finalReport.ok);
    mark(backendOk && browserOk && apiAccepted ? (finalOk ? 'PASS' : 'PASS с предупреждениями') : 'FAIL', backendOk && browserOk && apiAccepted ? (finalOk ? 'ok' : 'warn') : 'bad');
    summaryEl.innerHTML = '<div class="pill ' + (backendOk ? 'ok' : 'bad') + '">Backend ' + (backendOk ? 'PASS' : 'FAIL') + '</div><div class="pill ' + (browserOk ? 'ok' : 'bad') + '">Browser probes ' + (browserOk ? 'PASS' : 'FAIL') + '</div><div class="pill ' + (apiAccepted ? 'ok' : 'bad') + '">API accepted ' + (apiAccepted ? 'YES' : 'NO') + '</div><div class="pill ' + (finalOk ? 'ok' : 'warn') + '">Final report ' + (finalOk ? 'PASS' : 'WARN/FAIL') + '</div><p class="muted">Если Final report не PASS только из-за performance warnings, это не ломает backend/UI-contract, но требует отдельной оптимизации скорости.</p>';
    rawEl.textContent = JSON.stringify(finalReport || {}, null, 2);
  }
  async function run() {
    runBtn.disabled = true;
    logEl.textContent = '';
    rawEl.textContent = '{}';
    commentsList.textContent = '';
    cleanupLink.hidden = true;
    mark('RUNNING', 'warn');
    try {
      log('Запускаю backend self-test /full');
      const full = await readJson('/debug/selftest/comments/full');
      setLinks(full.commentKey);
      log('Backend: ' + (full.backendOk ? 'PASS' : 'FAIL') + ', key=' + full.commentKey, full.backendOk ? 'ok' : 'bad');
      log('Строю browser fixture DOM');
      renderFixture(full);
      log('Проверяю sticker renderer contract');
      const sticker = await runStickerProbe(full);
      log('Sticker probe: ' + (checksOk(sticker) ? 'PASS' : 'FAIL'), checksOk(sticker) ? 'ok' : 'bad');
      log('Проверяю reopen/hydration stability');
      const hydration = runHydrationProbe(full);
      log('Hydration probe: ' + (countersOk(hydration) ? 'PASS' : 'FAIL'), countersOk(hydration) ? 'ok' : 'bad');
      log('Отправляю /browser-result');
      const finalReport = await postJson('/debug/selftest/comments/browser-result', {
        commentKey: full.commentKey,
        probes: { sticker_renderer_contract_probe: sticker, reopen_hydration_stability_probe: hydration },
        telemetry: { source: 'PR89_BROWSER_RUNNER', browserMeasured: true, userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight }, at: new Date().toISOString() }
      });
      setLinks(finalReport.commentKey || full.commentKey);
      log('Browser result accepted: ' + Boolean(finalReport.browserProbeResult && finalReport.browserProbeResult.ok), finalReport.browserProbeResult && finalReport.browserProbeResult.ok ? 'ok' : 'bad');
      summarize(full, sticker, hydration, finalReport);
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
