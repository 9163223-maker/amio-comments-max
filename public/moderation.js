function $(id) {
  return document.getElementById(id);
}

function parseLines(value) {
  return String(value || "")
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function lines(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function paramsChannelId() {
  try {
    return new URL(window.location.href).searchParams.get("channelId") || "";
  } catch {
    return "";
  }
}

function paramsAdminToken() {
  try {
    return new URL(window.location.href).searchParams.get("adminToken") || "";
  } catch {
    return "";
  }
}

const adminToken = paramsAdminToken();

async function apiJson(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (adminToken) headers["x-admin-token"] = adminToken;
  const response = await fetch(url, { cache: "no-store", ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `http_${response.status}`);
  }
  return data;
}

const el = {
  channelId: $("channelId"),
  tariffPreset: $("tariffPreset"),
  enabled: $("enabled"),
  basicEnabled: $("basicEnabled"),
  aiEnabled: $("aiEnabled"),
  applyPresetCommon: $("applyPresetCommon"),
  blockInvites: $("blockInvites"),
  blockLinks: $("blockLinks"),
  action: $("action"),
  maxLinks: $("maxLinks"),
  maxRepeatedChars: $("maxRepeatedChars"),
  minTextLengthForCapsCheck: $("minTextLengthForCapsCheck"),
  maxUppercaseRatio: $("maxUppercaseRatio"),
  customBlocklist: $("customBlocklist"),
  regexRules: $("regexRules"),
  whitelistUsers: $("whitelistUsers"),
  shadowBanUsers: $("shadowBanUsers"),
  notes: $("notes"),
  loadBtn: $("loadBtn"),
  saveBtn: $("saveBtn"),
  logsBtn: $("logsBtn"),
  applyBasicBtn: $("applyBasicBtn"),
  applyPremiumBtn: $("applyPremiumBtn"),
  statusBox: $("statusBox"),
  logs: $("logs"),
  queueBtn: $("queueBtn"),
  queueList: $("queueList")
};

let presets = null;

function showStatus(message, ok = true) {
  el.statusBox.textContent = message || "";
  el.statusBox.className = `status-box ${ok ? "ok" : "error"}`;
}

function fillForm(settings) {
  el.tariffPreset.value = settings.tariffPreset || "basic";
  el.enabled.checked = Boolean(settings.enabled);
  el.basicEnabled.checked = Boolean(settings.basicEnabled);
  el.aiEnabled.checked = Boolean(settings.aiEnabled);
  el.applyPresetCommon.checked = Boolean(settings.applyPresetCommon);
  el.blockInvites.checked = Boolean(settings.blockInvites);
  el.blockLinks.checked = Boolean(settings.blockLinks);
  el.action.value = settings.action || "reject";
  el.maxLinks.value = Number(settings.maxLinks || 0);
  el.maxRepeatedChars.value = Number(settings.maxRepeatedChars || 6);
  el.minTextLengthForCapsCheck.value = Number(settings.minTextLengthForCapsCheck || 8);
  el.maxUppercaseRatio.value = Number(settings.maxUppercaseRatio || 0.75);
  el.customBlocklist.value = lines(settings.customBlocklist);
  el.regexRules.value = lines(settings.regexRules);
  el.whitelistUsers.value = lines(settings.whitelistUsers);
  el.shadowBanUsers.value = lines(settings.shadowBanUsers);
  el.notes.value = settings.notes || "";
}

function getPayload() {
  return {
    channelId: el.channelId.value.trim(),
    tariffPreset: el.tariffPreset.value,
    enabled: el.enabled.checked,
    basicEnabled: el.basicEnabled.checked,
    aiEnabled: el.aiEnabled.checked,
    applyPresetCommon: el.applyPresetCommon.checked,
    blockInvites: el.blockInvites.checked,
    blockLinks: el.blockLinks.checked,
    action: el.action.value,
    maxLinks: Number(el.maxLinks.value || 0),
    maxRepeatedChars: Number(el.maxRepeatedChars.value || 6),
    minTextLengthForCapsCheck: Number(el.minTextLengthForCapsCheck.value || 8),
    maxUppercaseRatio: Number(el.maxUppercaseRatio.value || 0.75),
    customBlocklist: parseLines(el.customBlocklist.value),
    regexRules: parseLines(el.regexRules.value),
    whitelistUsers: parseLines(el.whitelistUsers.value),
    shadowBanUsers: parseLines(el.shadowBanUsers.value),
    notes: el.notes.value
  };
}

async function loadSettings() {
  const channelId = el.channelId.value.trim();
  if (!channelId) {
    showStatus("Укажите Channel ID.", false);
    return;
  }
  const data = await apiJson(`/api/moderation/settings?channelId=${encodeURIComponent(channelId)}`);
  fillForm(data.settings || {});
  showStatus("Настройки загружены.");
}

async function saveSettings() {
  const payload = getPayload();
  if (!payload.channelId) {
    showStatus("Укажите Channel ID.", false);
    return;
  }
  await apiJson("/api/moderation/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  showStatus("Настройки сохранены.");
  await loadLogs();
}

async function loadPresets() {
  const data = await apiJson("/api/moderation/presets");
  presets = data.presets || null;
}

function applyPreset(key) {
  if (!presets?.tariffPresets?.[key]) return;
  fillForm({ ...presets.tariffPresets[key], customBlocklist: parseLines(el.customBlocklist.value), regexRules: parseLines(el.regexRules.value), whitelistUsers: parseLines(el.whitelistUsers.value), shadowBanUsers: parseLines(el.shadowBanUsers.value), notes: el.notes.value });
  showStatus(`Применён пресет: ${key}`);
}

async function loadLogs() {
  const channelId = el.channelId.value.trim();
  if (!channelId) {
    el.logs.innerHTML = '<div class="log-item muted">Укажите Channel ID, чтобы видеть лог.</div>';
    return;
  }
  const data = await apiJson(`/api/moderation/logs?channelId=${encodeURIComponent(channelId)}&limit=50`);
  const logs = data.logs || [];
  el.logs.innerHTML = logs.length ? logs.map((item) => `
    <div class="log-item ${item.decision === "blocked" ? "blocked" : "allowed"}">
      <div class="log-head">
        <strong>${item.decision === "blocked" ? "Блок" : "Разрешено"}</strong>
        <span>${new Date(item.createdAt).toLocaleString("ru-RU")}</span>
      </div>
      <div class="log-meta">channelId: ${item.channelId || "—"} · mode: ${item.mode || "—"} · action: ${item.action || "—"}</div>
      <div class="log-text">${(item.text || "").replace(/[<>]/g, "")}</div>
      <div class="log-meta">reasons: ${(item.reasons || []).join(", ") || "—"}</div>
      <div class="log-meta">labels: ${(item.labels || []).join(", ") || "—"}</div>
      <div class="log-meta">matchedWords: ${(item.matchedWords || []).join(", ") || "—"}</div>
    </div>
  `).join("") : '<div class="log-item muted">Лог пока пуст.</div>';
}

el.loadBtn.addEventListener("click", () => loadSettings().catch((error) => showStatus(`Ошибка загрузки: ${error.message}`, false)));
el.saveBtn.addEventListener("click", () => saveSettings().catch((error) => showStatus(`Ошибка сохранения: ${error.message}`, false)));
el.logsBtn.addEventListener("click", () => loadLogs().catch((error) => showStatus(`Ошибка лога: ${error.message}`, false)));
el.queueBtn.addEventListener("click", () => loadQueue().catch((error) => showStatus(`Ошибка очереди: ${error.message}`, false)));
el.applyBasicBtn.addEventListener("click", () => applyPreset("basic"));
el.applyPremiumBtn.addEventListener("click", () => applyPreset("premium_ai"));
el.tariffPreset.addEventListener("change", () => {
  if (el.tariffPreset.value === "basic") applyPreset("basic");
  if (el.tariffPreset.value === "premium_ai") applyPreset("premium_ai");
});

(async () => {
  el.channelId.value = paramsChannelId();
  await loadPresets();
  if (el.channelId.value) {
    await loadSettings().catch(() => {});
    await loadLogs().catch(() => {});
    await loadQueue().catch(() => {});
  } else {
    showStatus("Укажите Channel ID и загрузите настройки.");
  }
})();


async function resolveQueueItem(logId, resolution) {
  await apiJson('/api/moderation/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logId, resolution })
  });
}

async function loadQueue() {
  const channelId = el.channelId.value.trim();
  if (!channelId) {
    el.queueList.innerHTML = '<div class="log-item muted">Укажите Channel ID.</div>';
    return;
  }
  const data = await apiJson(`/api/moderation/queue?channelId=${encodeURIComponent(channelId)}&limit=50`);
  const items = data.items || [];
  el.queueList.innerHTML = items.length ? items.map((item) => `
    <div class="log-item queued">
      <div class="log-head"><strong>Queue</strong><span>${new Date(item.createdAt).toLocaleString('ru-RU')}</span></div>
      <div class="log-meta">mode: ${item.mode || '—'} · action: ${item.action || '—'} · by: ${item.userName || item.userId || '—'}</div>
      <div class="log-text">${String(item.text || '').replace(/[<>]/g, '')}</div>
      <div class="log-meta">reasons: ${(item.reasons || []).join(', ') || '—'}</div>
      <div class="settings-actions">
        <button class="primary-btn queue-action" data-id="${item.id}" data-resolution="approve" type="button">Одобрить</button>
        <button class="ghost-btn queue-action" data-id="${item.id}" data-resolution="reject" type="button">Отклонить</button>
      </div>
    </div>
  `).join('') : '<div class="log-item muted">Очередь пуста.</div>';

  el.queueList.querySelectorAll('.queue-action').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await resolveQueueItem(btn.dataset.id, btn.dataset.resolution);
        showStatus(`Элемент очереди: ${btn.dataset.resolution}`);
        await loadQueue();
        await loadLogs();
      } catch (error) {
        showStatus(`Ошибка очереди: ${error.message}`, false);
      }
    });
  });
}
