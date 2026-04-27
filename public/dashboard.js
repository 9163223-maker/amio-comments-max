function $(id) { return document.getElementById(id); }

function params(name) {
  try { return new URL(window.location.href).searchParams.get(name) || ""; }
  catch { return ""; }
}

const adminToken = params("adminToken");

async function apiJson(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (adminToken) headers["x-admin-token"] = adminToken;
  const response = await fetch(url, { cache: "no-store", ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw new Error(data?.error || `http_${response.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

function parseButtons(value) {
  return String(value || "").split(/\r?\n/g).map((line, index) => {
    const parts = line.split("|").map((item) => item.trim());
    if (!parts[0] || !parts[1]) return null;
    return {
      id: `btn_${index + 1}`,
      text: parts[0],
      url: parts[1],
      postIds: String(parts[2] || "").split(",").map((item) => item.trim()).filter(Boolean)
    };
  }).filter(Boolean);
}

function stringifyButtons(items) {
  return (Array.isArray(items) ? items : []).map((item) => [item.text || "", item.url || "", (item.postIds || []).join(",")].join(" | ")).join("\n");
}

function parseLines(value) {
  return String(value || "").split(/\r?\n|,/g).map((item) => item.trim()).filter(Boolean);
}

const el = {
  channelSelect: $("channelSelect"),
  channelId: $("channelId"),
  channelPicker: $("channelPicker"),
  planTier: $("planTier"),
  brandName: $("brandName"),
  whiteLabelEnabled: $("whiteLabelEnabled"),
  agencyMode: $("agencyMode"),
  agencyBrandName: $("agencyBrandName"),
  brandUrl: $("brandUrl"),
  leadMagnetEnabled: $("leadMagnetEnabled"),
  leadMagnetText: $("leadMagnetText"),
  leadMagnetUrl: $("leadMagnetUrl"),
  keyboardLeadMagnetEnabled: $("keyboardLeadMagnetEnabled"),
  trackedButtons: $("trackedButtons"),
  pollEnabled: $("pollEnabled"),
  pollQuestion: $("pollQuestion"),
  pollOptions: $("pollOptions"),
  pollPostIds: $("pollPostIds"),
  pollAllowRevote: $("pollAllowRevote"),
  notes: $("notes"),
  loadBtn: $("loadBtn"),
  saveBtn: $("saveBtn"),
  refreshAnalyticsBtn: $("refreshAnalyticsBtn"),
  statusBox: $("statusBox"),
  kpiPosts: $("kpiPosts"),
  kpiComments: $("kpiComments"),
  kpiReactions: $("kpiReactions"),
  kpiClicks: $("kpiClicks"),
  kpiCommenters: $("kpiCommenters"),
  kpiUniqueClickers: $("kpiUniqueClickers"),
  kpiPollVotes: $("kpiPollVotes"),
  kpiBlocked: $("kpiBlocked"),
  topButtons: $("topButtons"),
  topPosts: $("topPosts"),
  topCommenters: $("topCommenters"),
  recentClicks: $("recentClicks"),
  dashboardAlerts: $("dashboardAlerts"),
  selectedPostStats: $("selectedPostStats")
};

let cachedChannels = [];

function showStatus(message, ok = true) {
  if (!el.statusBox) return;
  el.statusBox.textContent = message || "";
  el.statusBox.className = `status-box ${ok ? "ok" : "error"}`;
}

function fillForm(settings) {
  if (!settings) return;
  el.planTier.value = settings.planTier || "free";
  el.brandName.value = settings.brandName || "АдминКит";
  el.whiteLabelEnabled.checked = Boolean(settings.whiteLabelEnabled);
  el.agencyMode.checked = Boolean(settings.agencyMode);
  el.agencyBrandName.value = settings.agencyBrandName || "";
  el.brandUrl.value = settings.brandUrl || "";
  el.leadMagnetEnabled.checked = Boolean(settings.leadMagnetEnabled);
  el.leadMagnetText.value = settings.leadMagnetText || "";
  el.leadMagnetUrl.value = settings.leadMagnetUrl || "";
  el.keyboardLeadMagnetEnabled.checked = Boolean(settings.keyboardLeadMagnetEnabled);
  el.trackedButtons.value = stringifyButtons(settings.trackedButtons || []);
  el.pollEnabled.checked = Boolean(settings.poll?.enabled);
  el.pollQuestion.value = settings.poll?.question || "";
  el.pollOptions.value = (settings.poll?.options || []).map((item) => item.text || "").join("\n");
  el.pollPostIds.value = (settings.poll?.postIds || []).join(", ");
  el.pollAllowRevote.checked = Boolean(settings.poll?.allowRevote);
  el.notes.value = settings.notes || "";
}

function getPayload() {
  return {
    channelId: el.channelId.value.trim(),
    planTier: el.planTier.value,
    brandName: el.brandName.value.trim(),
    whiteLabelEnabled: el.whiteLabelEnabled.checked,
    agencyMode: el.agencyMode.checked,
    agencyBrandName: el.agencyBrandName.value.trim(),
    brandUrl: el.brandUrl.value.trim(),
    leadMagnetEnabled: el.leadMagnetEnabled.checked,
    leadMagnetText: el.leadMagnetText.value.trim(),
    leadMagnetUrl: el.leadMagnetUrl.value.trim(),
    keyboardLeadMagnetEnabled: el.keyboardLeadMagnetEnabled.checked,
    trackedButtons: parseButtons(el.trackedButtons.value),
    poll: {
      enabled: el.pollEnabled.checked,
      question: el.pollQuestion.value.trim(),
      options: parseLines(el.pollOptions.value).map((text, index) => ({ id: `opt_${index + 1}`, text })),
      postIds: parseLines(el.pollPostIds.value),
      allowRevote: el.pollAllowRevote.checked
    },
    notes: el.notes.value.trim()
  };
}

function renderOptions(selectEl, channels, selectedId, singleLabel) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  if (!channels.length) {
    selectEl.innerHTML = '<option value="">Канал не найден</option>';
    selectEl.disabled = false;
    return;
  }
  if (channels.length === 1) {
    const item = channels[0];
    selectEl.innerHTML = `<option value="${escapeHtml(item.channelId)}">${escapeHtml(singleLabel ? `${singleLabel}: ${item.title || item.channelId}` : (item.title || item.channelId))}</option>`;
    selectEl.value = item.channelId;
    selectEl.disabled = true;
    return;
  }
  selectEl.disabled = false;
  selectEl.innerHTML = '<option value="">Выберите канал</option>' + channels.map((item) => `<option value="${escapeHtml(item.channelId)}">${escapeHtml(item.title || item.channelId)}</option>`).join('');
  if (selectedId) selectEl.value = selectedId;
}

function applySelectedChannel(channelId) {
  const normalized = String(channelId || '').trim();
  if (normalized) el.channelId.value = normalized;
  const resolved = String(el.channelId.value || '').trim();
  if (el.channelSelect) el.channelSelect.value = resolved;
  if (el.channelPicker) el.channelPicker.value = resolved;
  return resolved;
}

async function loadChannels() {
  const data = await apiJson('/api/channels');
  const channels = Array.isArray(data.channels) ? data.channels : [];
  cachedChannels = channels;
  const requested = params('channelId');
  const selected = requested || el.channelId.value.trim() || (channels.length === 1 ? channels[0].channelId : '');

  renderOptions(el.channelSelect, channels, selected, channels.length === 1 ? 'Подключён' : '');
  renderOptions(el.channelPicker, channels, selected, channels.length === 1 ? 'Авто' : '');

  if (channels.length === 1) {
    applySelectedChannel(channels[0].channelId);
    if (el.channelId) {
      el.channelId.value = channels[0].channelId;
      el.channelId.readOnly = true;
    }
  } else {
    if (el.channelId) el.channelId.readOnly = false;
    applySelectedChannel(selected);
  }
  return channels;
}

async function loadSettings() {
  const channelId = applySelectedChannel(el.channelId.value.trim());
  if (!channelId) return showStatus('Сначала подключите канал боту.', false);
  const data = await apiJson(`/api/growth/settings?channelId=${encodeURIComponent(channelId)}`);
  fillForm(data.settings || {});
  showStatus(cachedChannels.length === 1 ? `Настройки загружены для канала: ${cachedChannels[0].title || cachedChannels[0].channelId}` : 'Настройки growth загружены.');
}

async function saveSettings() {
  const payload = getPayload();
  if (!payload.channelId) return showStatus('Сначала подключите канал боту.', false);
  await apiJson('/api/growth/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  showStatus('Growth settings сохранены.');
  await loadAnalytics();
}

function renderList(target, items, renderItem) {
  if (!target) return;
  target.innerHTML = (Array.isArray(items) && items.length) ? items.map(renderItem).join('') : '<div class="simple-list-item">Пока пусто.</div>';
}

function renderAlerts(items) {
  const alerts = Array.isArray(items) ? items : [];
  if (!el.dashboardAlerts) return;
  el.dashboardAlerts.innerHTML = alerts.length
    ? alerts.map((item) => `<div class="log-item ${item.severity || 'info'}"><div class="log-head"><strong>${escapeHtml(item.title || item.type || 'alert')}</strong><span>${new Date(item.createdAt || Date.now()).toLocaleString('ru-RU')}</span></div><div class="log-meta">severity: ${escapeHtml(item.severity || 'info')} · postId: ${escapeHtml(item.postId || '—')}</div><div class="log-text">${escapeHtml(item.message || '')}</div></div>`).join('')
    : '<div class="log-item muted">Алертов пока нет.</div>';
}

async function refreshAlerts() {
  const channelId = el.channelId.value.trim();
  if (!channelId) return renderAlerts([]);
  const data = await apiJson(`/api/alerts?channelId=${encodeURIComponent(channelId)}&limit=20`);
  renderAlerts(data.alerts || []);
}

async function loadSelectedPostStats(post) {
  if (!el.selectedPostStats) return;
  if (!post?.commentKey) {
    el.selectedPostStats.innerHTML = '<div class="simple-list-item">Выберите пост из списка «Посты канала», чтобы увидеть детали.</div>';
    return;
  }
  const data = await apiJson(`/api/analytics/post?commentKey=${encodeURIComponent(post.commentKey)}&channelId=${encodeURIComponent(el.channelId.value.trim())}`);
  const item = data.post || {};
  const totals = item.totals || {};
  el.selectedPostStats.innerHTML = [
    `<div class="simple-list-item"><strong>${escapeHtml(item.title || 'Без текста')}</strong>`,
    `<div class="simple-list-meta">postId: ${escapeHtml(item.postId || '—')}</div>`,
    `<div class="simple-list-meta">Комментариев: ${totals.comments || item.comments || 0} · Ответов: ${totals.replies || 0} · Участников: ${totals.participants || item.uniqueCommenters || 0}</div>`,
    `<div class="simple-list-meta">Реакций: ${totals.reactions || item.reactions || 0} · Кликов: ${totals.clicks || 0} · Голосов: ${totals.pollVotes || 0}</div>`,
    `<div class="simple-list-meta">Подарков на посте: ${item.gifts || 0} · Обновлён: ${item.updatedAt ? new Date(item.updatedAt).toLocaleString('ru-RU') : '—'}</div>`,
    `</div>`
  ].join('');
}

async function loadAnalytics() {
  const channelId = applySelectedChannel(el.channelId.value.trim());
  if (!channelId) return showStatus('Сначала подключите канал боту.', false);
  const data = await apiJson(`/api/analytics/summary?channelId=${encodeURIComponent(channelId)}`);
  const totals = data.summary?.totals || {};

  el.kpiPosts.textContent = totals.posts || 0;
  el.kpiComments.textContent = totals.comments || 0;
  el.kpiReactions.textContent = totals.reactions || 0;
  el.kpiClicks.textContent = totals.clicks || 0;
  el.kpiCommenters.textContent = totals.commenters || 0;
  el.kpiUniqueClickers.textContent = totals.uniqueClickers || 0;
  el.kpiPollVotes.textContent = totals.pollVotes || 0;
  el.kpiBlocked.textContent = totals.moderationBlocked || 0;

  renderList(el.topButtons, data.summary?.topButtons || [], (item) => `<div class="simple-list-item"><strong>${escapeHtml(item.text || item.buttonId)}</strong><div class="simple-list-meta">${item.count || 0} кликов</div></div>`);

  const topPosts = Array.isArray(data.summary?.topPosts) ? data.summary.topPosts : [];
  renderList(el.topPosts, topPosts, (item) => `<div class="simple-list-item" data-comment-key="${escapeHtml(item.commentKey || '')}"><strong>${escapeHtml(item.text || 'Без текста')}</strong><div class="simple-list-meta">postId: ${escapeHtml(item.postId || '—')} · комментарии: ${item.comments || 0} · реакции: ${item.reactions || 0} · клики: ${item.clicks || 0}</div></div>`);
  Array.from(el.topPosts?.querySelectorAll('[data-comment-key]') || []).forEach((node) => {
    node.style.cursor = 'pointer';
    node.addEventListener('click', () => {
      const selected = topPosts.find((item) => item.commentKey === node.dataset.commentKey);
      loadSelectedPostStats(selected).catch((error) => showStatus(`Ошибка поста: ${error.message}`, false));
    });
  });
  await loadSelectedPostStats(topPosts[0] || null).catch(() => {});

  renderList(el.topCommenters, data.summary?.topCommenters || [], (item) => `<div class="simple-list-item"><strong>${escapeHtml(item.userName || item.userId)}</strong><div class="simple-list-meta">${item.comments || 0} комментариев</div></div>`);
  renderList(el.recentClicks, data.summary?.recentClicks || [], (item) => `<div class="simple-list-item"><strong>${escapeHtml(item.buttonText || item.buttonId)}</strong><div class="simple-list-meta">${new Date(item.createdAt).toLocaleString('ru-RU')} · userId: ${escapeHtml(item.userId || '—')} · source: ${escapeHtml(item.source || 'button')}</div></div>`);

  await refreshAlerts().catch(() => {});
  const liveTitle = String(data.summary?.channelInfo?.title || '').trim();
  const liveMembers = data.summary?.channelInfo?.memberCount;
  const gifts = totals.gifts || 0;
  showStatus(liveTitle ? `Статистика загружена: ${liveTitle}${(liveMembers !== null && liveMembers !== undefined) ? ` · подписчиков сейчас: ${liveMembers}` : ''} · активных подарков: ${gifts}` : 'Статистика загружена.');
}

el.loadBtn?.addEventListener('click', () => loadSettings().catch((error) => showStatus(`Ошибка загрузки: ${error.message}`, false)));
el.saveBtn?.addEventListener('click', () => saveSettings().catch((error) => showStatus(`Ошибка сохранения: ${error.message}`, false)));
el.refreshAnalyticsBtn?.addEventListener('click', () => loadAnalytics().catch((error) => showStatus(`Ошибка analytics: ${error.message}`, false)));

async function onChannelChanged(value) {
  applySelectedChannel(value);
  await loadSettings().catch(() => {});
  await loadAnalytics().catch((error) => showStatus(`Ошибка analytics: ${error.message}`, false));
}

el.channelSelect?.addEventListener('change', async () => onChannelChanged(el.channelSelect.value || ''));
el.channelPicker?.addEventListener('change', async () => onChannelChanged(el.channelPicker.value || ''));
el.channelId?.addEventListener('change', async () => onChannelChanged(el.channelId.value || ''));

(async () => {
  el.channelId.value = params('channelId');
  const channels = await loadChannels().catch(() => []);
  if (!el.channelId.value && channels.length === 1) applySelectedChannel(channels[0].channelId);
  if (el.channelId.value) {
    await loadSettings().catch(() => {});
    await loadAnalytics().catch(() => {});
  } else {
    showStatus('Сначала подключите канал боту, затем откройте статистику.');
  }
})();
