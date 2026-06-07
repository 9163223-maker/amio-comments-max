'use strict';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderGroupPushInboundDebugHtml(diagnostics = {}) {
  const generatedAt = new Date().toISOString();
  const latest = Array.isArray(diagnostics.latest) ? diagnostics.latest.slice(-30).reverse() : [];
  const rows = latest.map((event) => `
    <article class="card">
      <div class="row"><b>time</b><span>${escapeHtml(event.at)}</span></div>
      <div class="row"><b>updateType</b><span>${escapeHtml(event.updateType)}</span></div>
      <div class="row"><b>textPreview</b><span>${escapeHtml(event.textPreview)}</span></div>
      <div class="row"><b>matchedPushCommand</b><span>${event.matchedPushCommand ? 'true' : 'false'}</span></div>
      <div class="row"><b>hasUserId</b><span>${event.hasUserId ? 'true' : 'false'}</span></div>
      <div class="row"><b>hasChatId</b><span>${event.hasChatId ? 'true' : 'false'}</span></div>
      <div class="row"><b>chatTitlePreview</b><span>${escapeHtml(event.chatTitlePreview)}</span></div>
      <div class="row"><b>routeDecision</b><span>${escapeHtml(event.routeDecision)}</span></div>
      <div class="row"><b>routeResult</b><span>${escapeHtml(event.routeResult)}</span></div>
      <div class="row"><b>errorCode</b><span>${escapeHtml(event.errorCode)}</span></div>
    </article>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Group Push inbound debug</title>
  <style>
    body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #f6f7fb; color: #111827; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .meta { color: #4b5563; font-size: 13px; margin-bottom: 16px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px; margin: 0 0 12px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
    .row { display: grid; grid-template-columns: 145px 1fr; gap: 8px; padding: 4px 0; font-size: 14px; word-break: break-word; }
    .row b { color: #374151; }
    .empty { background: #fff; border-radius: 14px; padding: 16px; color: #4b5563; }
  </style>
</head>
<body>
  <h1>Group Push inbound debug</h1>
  <div class="meta">generatedAt: ${escapeHtml(generatedAt)} · count: ${Number(diagnostics.count || 0) || 0}</div>
  ${rows || '<div class="empty">No group Push inbound diagnostics recorded yet.</div>'}
</body>
</html>`;
}

module.exports = { escapeHtml, renderGroupPushInboundDebugHtml };
