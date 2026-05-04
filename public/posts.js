
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

const el = {
  channelId: $("channelId"),
  commentKey: $("commentKey"),
  actorName: $("actorName"),
  loadPostsBtn: $("loadPostsBtn"),
  loadCurrentBtn: $("loadCurrentBtn"),
  postStatusBox: $("postStatusBox"),
  postsList: $("postsList"),
  editorMeta: $("editorMeta"),
  postText: $("postText"),
  previewBtn: $("previewBtn"),
  savePostBtn: $("savePostBtn"),
  postPreview: $("postPreview"),
  currentMediaList: $("currentMediaList"),
  mediaFileInput: $("mediaFileInput"),
  selectedMediaMeta: $("selectedMediaMeta"),
  localMediaPreview: $("localMediaPreview"),
  replaceMediaBtn: $("replaceMediaBtn"),
  historyList: $("historyList"),
  commentButtonText: $("commentButtonText"),
  addKeyboardRowBtn: $("addKeyboardRowBtn"),
  addPresetLeadBtn: $("addPresetLeadBtn"),
  saveKeyboardBtn: $("saveKeyboardBtn"),
  keyboardBuilderList: $("keyboardBuilderList"),
  keyboardPreview: $("keyboardPreview")
};

let currentPost = null;
let selectedFile = null;
let selectedFileObjectUrl = "";
let keyboardBuilderState = { enabled: true, commentButtonText: "", rows: [] };

function showStatus(message, ok = true) {
  el.postStatusBox.textContent = message || "";
  el.postStatusBox.className = `status-box ${ok ? "ok" : "error"}`;
}
function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', '&quot;');
}
function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("ru-RU");
}
function formatSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}
function revokeObjectPreview() {
  if (selectedFileObjectUrl) {
    URL.revokeObjectURL(selectedFileObjectUrl);
    selectedFileObjectUrl = "";
  }
}
function makeId(seed = 'id') {
  return `${seed}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
function normalizeBuilderState(input = {}) {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  return {
    enabled: input.enabled !== false,
    commentButtonText: String(input.commentButtonText || '').trim(),
    rows: rows.map((row, rowIndex) => ({
      id: String(row?.id || makeId(`row${rowIndex + 1}`)),
      title: String(row?.title || '').trim(),
      buttons: (Array.isArray(row?.buttons) ? row.buttons : []).map((button, buttonIndex) => ({
        id: String(button?.id || makeId(`btn${rowIndex + 1}${buttonIndex + 1}`)),
        text: String(button?.text || '').trim(),
        type: String(button?.type || 'tracked_link').trim() || 'tracked_link',
        url: String(button?.url || '').trim(),
        note: String(button?.note || '').trim(),
        enabled: button?.enabled !== false
      }))
    }))
  };
}
function buildPresetLeadMagnet() {
  return {
    id: makeId('row'),
    title: 'Lead magnet',
    buttons: [
      {
        id: makeId('cta'),
        text: '🚀 Подключить такие же комментарии',
        type: 'tracked_link',
        url: 'https://example.com/amio-connect',
        note: 'Замените ссылку на свой лендинг или форму.',
        enabled: true
      }
    ]
  };
}
function renderMeta(post) {
  if (!post) {
    el.editorMeta.innerHTML = '<div class="muted">Выберите пост.</div>';
    return;
  }
  const editable = post.editable || {};
  const keyboardRows = Number(post?.customKeyboard?.rows?.length || 0);
  const keyboardButtons = (post?.customKeyboard?.rows || []).reduce((sum, row) => sum + Number(row?.buttons?.length || 0), 0);
  el.editorMeta.innerHTML = `
    <div class="post-admin-meta">
      <div><strong>postId:</strong> ${escapeHtml(post.postId || "—")}</div>
      <div><strong>commentKey:</strong> ${escapeHtml(post.commentKey || "—")}</div>
      <div><strong>Комментарии:</strong> ${Number(post.commentCount || 0)}</div>
      <div><strong>Редактируемый:</strong> ${editable.editable ? "Да" : "Нет"}</div>
      <div><strong>Окно до:</strong> ${formatDate(editable.deadlineAt)}</div>
      <div><strong>Последнее редактирование:</strong> ${formatDate(post.lastEditedAt)}</div>
      <div><strong>Медиа:</strong> ${Number(post.mediaCount || 0)}</div>
      <div><strong>CTA rows:</strong> ${keyboardRows}</div>
      <div><strong>CTA buttons:</strong> ${keyboardButtons}</div>
    </div>`;
}
function renderPosts(posts) {
  el.postsList.innerHTML = posts.length ? posts.map((post) => `
    <button class="list-row-button ${post.commentKey === el.commentKey.value.trim() ? 'active' : ''}" data-comment-key="${escapeHtml(post.commentKey)}">
      <div><strong>${escapeHtml(post.postId || post.commentKey)}</strong></div>
      <div class="muted">${escapeHtml((post.originalText || '').slice(0, 120) || 'Без текста')}</div>
      <div class="muted">Комментарии: ${Number(post.commentCount || 0)} · media: ${Number(post.mediaCount || 0)} · cta rows: ${Number(post?.customKeyboard?.rows?.length || 0)} · editable: ${post.editable?.editable ? 'yes' : 'no'}</div>
    </button>
  `).join("") : '<div class="muted">Посты не найдены.</div>';
  el.postsList.querySelectorAll('[data-comment-key]').forEach((node) => {
    node.addEventListener('click', async () => {
      el.commentKey.value = node.dataset.commentKey || '';
      await loadCurrentPost();
    });
  });
}
function renderAttachmentPreview(item) {
  const type = String(item.type || 'file');
  const previewUrl = String(item.previewUrl || '');
  if (type === 'image' && previewUrl) {
    return `<img class="post-media-image media-thumb" src="${escapeHtml(previewUrl)}" alt="media" />`;
  }
  if (type === 'video' && previewUrl) {
    return `<video class="media-thumb" controls playsinline src="${escapeHtml(previewUrl)}"></video>`;
  }
  if (type === 'audio' && previewUrl) {
    return `<audio controls src="${escapeHtml(previewUrl)}"></audio>`;
  }
  return `<div class="media-badge">${escapeHtml(type.toUpperCase())}</div>`;
}
function renderCurrentMedia(post) {
  if (!post) {
    el.currentMediaList.innerHTML = '<div class="muted">Выберите пост.</div>';
    return;
  }
  const items = Array.isArray(post.mediaAttachments) ? post.mediaAttachments : [];
  el.currentMediaList.innerHTML = items.length ? items.map((item) => `
    <div class="media-card">
      <div class="media-preview-wrap">${renderAttachmentPreview(item)}</div>
      <div class="media-meta">
        <div><strong>${escapeHtml(item.name || item.type || 'media')}</strong></div>
        <div class="muted">Тип: ${escapeHtml(item.type || 'file')} · Размер: ${escapeHtml(formatSize(item.size))}</div>
        <div class="muted">MIME: ${escapeHtml(item.mimeType || '—')}</div>
        <div class="muted">Token: ${escapeHtml((item.token || '').slice(0, 48) || '—')}</div>
      </div>
    </div>
  `).join('') : '<div class="muted">В исходном посте нет сохранённого медиа.</div>';
}
function renderHistory(items) {
  el.historyList.innerHTML = items.length ? items.map((item) => {
    const keyboardRows = Number(item?.appliedKeyboard?.rows?.length || 0);
    const keyboardRowsBefore = Number(item?.snapshotKeyboard?.rows?.length || 0);
    return `
    <div class="history-card">
      <div class="log-head"><strong>${escapeHtml(item.type || 'edit')}</strong><span>${formatDate(item.createdAt)}</span></div>
      <div class="log-meta">${escapeHtml(item.actorName || item.actorId || 'admin')}</div>
      <div class="log-text">До: ${escapeHtml((item.snapshotText || '').slice(0, 140) || '—')}</div>
      <div class="log-text">После: ${escapeHtml((item.appliedText || '').slice(0, 140) || '—')}</div>
      <div class="log-text">Медиа до: ${Array.isArray(item.snapshotAttachments) ? item.snapshotAttachments.length : 0} · после: ${Array.isArray(item.appliedAttachments) ? item.appliedAttachments.length : 0}</div>
      <div class="log-text">CTA rows до: ${keyboardRowsBefore} · после: ${keyboardRows}</div>
      <div class="settings-actions"><button class="ghost-btn rollback-btn" data-version-id="${escapeHtml(item.id)}" type="button">Откатить к этой версии</button></div>
    </div>`;
  }).join('') : '<div class="muted">История пока пустая.</div>';
  el.historyList.querySelectorAll('.rollback-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const payload = {
          commentKey: el.commentKey.value.trim(),
          versionId: btn.dataset.versionId,
          actorName: el.actorName.value.trim() || 'admin'
        };
        await apiJson('/api/posts/rollback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showStatus('Откат выполнен.');
        await loadCurrentPost();
      } catch (error) {
        showStatus(`Ошибка отката: ${error.message}`, false);
      }
    });
  });
}
function renderTextPreview() {
  el.postPreview.innerHTML = `<div class="post-card"><div class="post-text">${escapeHtml(el.postText.value).replaceAll('\n', '<br/>')}</div></div>`;
}
function renderLocalFileSelection(file) {
  revokeObjectPreview();
  if (!file) {
    el.selectedMediaMeta.textContent = 'Файл не выбран.';
    el.localMediaPreview.innerHTML = 'Локальный предпросмотр появится после выбора файла.';
    return;
  }
  el.selectedMediaMeta.textContent = `${file.name} · ${file.type || 'application/octet-stream'} · ${formatSize(file.size)}`;
  selectedFileObjectUrl = URL.createObjectURL(file);
  if (String(file.type || '').startsWith('image/')) {
    el.localMediaPreview.innerHTML = `<img class="post-media-image media-thumb" src="${selectedFileObjectUrl}" alt="preview" />`;
    return;
  }
  if (String(file.type || '').startsWith('video/')) {
    el.localMediaPreview.innerHTML = `<video class="media-thumb" controls playsinline src="${selectedFileObjectUrl}"></video>`;
    return;
  }
  if (String(file.type || '').startsWith('audio/')) {
    el.localMediaPreview.innerHTML = `<audio controls src="${selectedFileObjectUrl}"></audio>`;
    return;
  }
  el.localMediaPreview.innerHTML = `<div class="media-badge">${escapeHtml(file.name)}</div>`;
}
function makeRow() {
  return { id: makeId('row'), title: '', buttons: [{ id: makeId('btn'), text: '', type: 'tracked_link', url: '', note: '', enabled: true }] };
}
function makeButton() {
  return { id: makeId('btn'), text: '', type: 'tracked_link', url: '', note: '', enabled: true };
}
function updateBuilderFromInputs() {
  keyboardBuilderState.commentButtonText = String(el.commentButtonText.value || '').trim();
  el.keyboardBuilderList.querySelectorAll('[data-row-id]').forEach((rowNode) => {
    const row = keyboardBuilderState.rows.find((item) => item.id === rowNode.dataset.rowId);
    if (!row) return;
    row.title = String(rowNode.querySelector('[data-row-title]')?.value || '').trim();
    row.buttons = row.buttons.map((button) => {
      const buttonNode = rowNode.querySelector(`[data-button-id="${button.id}"]`);
      if (!buttonNode) return button;
      return {
        ...button,
        text: String(buttonNode.querySelector('[data-field="text"]')?.value || '').trim(),
        type: String(buttonNode.querySelector('[data-field="type"]')?.value || 'tracked_link').trim() || 'tracked_link',
        url: String(buttonNode.querySelector('[data-field="url"]')?.value || '').trim(),
        note: String(buttonNode.querySelector('[data-field="note"]')?.value || '').trim(),
        enabled: buttonNode.querySelector('[data-field="enabled"]')?.checked !== false
      };
    });
  });
}
function renderKeyboardPreview() {
  const rows = keyboardBuilderState.rows
    .map((row) => row.buttons.filter((button) => button.enabled !== false && button.text && button.url))
    .filter((row) => row.length > 0);
  const mainText = String(el.commentButtonText.value || '').trim() || '💬 Комментарии';
  const htmlRows = [[{ text: mainText, type: 'main' }], ...rows].map((row) => `
    <div class="keyboard-preview-row">
      ${row.map((button) => `<div class="keyboard-preview-button ${button.type === 'main' ? 'main' : ''}">${escapeHtml(button.text)}</div>`).join('')}
    </div>
  `).join('');
  el.keyboardPreview.innerHTML = htmlRows || '<div class="muted">Добавьте хотя бы одну кнопку.</div>';
}
function moveArrayItem(items, fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}
function renderKeyboardBuilder() {
  el.commentButtonText.value = keyboardBuilderState.commentButtonText || '';
  el.keyboardBuilderList.innerHTML = keyboardBuilderState.rows.length ? keyboardBuilderState.rows.map((row, rowIndex) => `
    <div class="keyboard-row-card" data-row-id="${escapeHtml(row.id)}">
      <div class="keyboard-row-head">
        <strong>Ряд ${rowIndex + 1}</strong>
        <div class="settings-actions compact-actions">
          <button class="ghost-btn tiny-btn" data-action="row-up" data-row-id="${escapeHtml(row.id)}" type="button">↑</button>
          <button class="ghost-btn tiny-btn" data-action="row-down" data-row-id="${escapeHtml(row.id)}" type="button">↓</button>
          <button class="ghost-btn tiny-btn" data-action="row-add-button" data-row-id="${escapeHtml(row.id)}" type="button">+ CTA</button>
          <button class="ghost-btn tiny-btn danger-btn" data-action="row-remove" data-row-id="${escapeHtml(row.id)}" type="button">Удалить ряд</button>
        </div>
      </div>
      <label>
        <span>Заголовок ряда</span>
        <input data-row-title class="settings-input" value="${escapeHtml(row.title || '')}" placeholder="Например: Ряд upsell" />
      </label>
      <div class="keyboard-buttons-stack">
        ${row.buttons.map((button, buttonIndex) => `
          <div class="keyboard-button-card" data-button-id="${escapeHtml(button.id)}">
            <div class="keyboard-button-head">
              <strong>Кнопка ${buttonIndex + 1}</strong>
              <div class="settings-actions compact-actions">
                <button class="ghost-btn tiny-btn" data-action="button-left" data-row-id="${escapeHtml(row.id)}" data-button-id="${escapeHtml(button.id)}" type="button">←</button>
                <button class="ghost-btn tiny-btn" data-action="button-right" data-row-id="${escapeHtml(row.id)}" data-button-id="${escapeHtml(button.id)}" type="button">→</button>
                <button class="ghost-btn tiny-btn danger-btn" data-action="button-remove" data-row-id="${escapeHtml(row.id)}" data-button-id="${escapeHtml(button.id)}" type="button">Удалить</button>
              </div>
            </div>
            <div class="form-grid two-col compact-grid">
              <label>
                <span>Текст CTA</span>
                <input data-field="text" class="settings-input" value="${escapeHtml(button.text || '')}" placeholder="Например: 🚀 Подключить" />
              </label>
              <label>
                <span>Тип кнопки</span>
                <select data-field="type" class="settings-input">
                  <option value="tracked_link" ${button.type === 'tracked_link' ? 'selected' : ''}>tracked link</option>
                  <option value="link" ${button.type === 'link' ? 'selected' : ''}>обычная link</option>
                </select>
              </label>
            </div>
            <label>
              <span>URL / целевая ссылка</span>
              <input data-field="url" class="settings-input" value="${escapeHtml(button.url || '')}" placeholder="https://example.com/offer" />
            </label>
            <label>
              <span>Заметка</span>
              <input data-field="note" class="settings-input" value="${escapeHtml(button.note || '')}" placeholder="Необязательно" />
            </label>
            <label class="toggle-inline">
              <input data-field="enabled" type="checkbox" ${button.enabled !== false ? 'checked' : ''} />
              <span>Кнопка активна</span>
            </label>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('') : '<div class="muted">Пока нет CTA-рядов. Добавьте первый.</div>';

  el.keyboardBuilderList.querySelectorAll('input,select').forEach((node) => {
    node.addEventListener('input', () => {
      updateBuilderFromInputs();
      renderKeyboardPreview();
    });
    node.addEventListener('change', () => {
      updateBuilderFromInputs();
      renderKeyboardPreview();
    });
  });
  el.keyboardBuilderList.querySelectorAll('[data-action]').forEach((node) => {
    node.addEventListener('click', () => {
      const action = node.dataset.action;
      const rowId = node.dataset.rowId || '';
      const buttonId = node.dataset.buttonId || '';
      updateBuilderFromInputs();
      const rowIndex = keyboardBuilderState.rows.findIndex((row) => row.id === rowId);
      if (rowIndex < 0) return;
      const row = keyboardBuilderState.rows[rowIndex];
      const buttonIndex = row.buttons.findIndex((button) => button.id === buttonId);
      if (action === 'row-remove') keyboardBuilderState.rows.splice(rowIndex, 1);
      if (action === 'row-up') keyboardBuilderState.rows = moveArrayItem(keyboardBuilderState.rows, rowIndex, rowIndex - 1);
      if (action === 'row-down') keyboardBuilderState.rows = moveArrayItem(keyboardBuilderState.rows, rowIndex, rowIndex + 1);
      if (action === 'row-add-button') row.buttons.push(makeButton());
      if (action === 'button-remove' && buttonIndex >= 0) row.buttons.splice(buttonIndex, 1);
      if (action === 'button-left' && buttonIndex >= 0) row.buttons = moveArrayItem(row.buttons, buttonIndex, buttonIndex - 1);
      if (action === 'button-right' && buttonIndex >= 0) row.buttons = moveArrayItem(row.buttons, buttonIndex, buttonIndex + 1);
      keyboardBuilderState.rows = keyboardBuilderState.rows.filter((item) => item.buttons.length > 0 || item.id !== rowId);
      renderKeyboardBuilder();
    });
  });
  renderKeyboardPreview();
}
async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });
}
async function loadPosts() {
  const channelId = el.channelId.value.trim();
  if (!channelId) return showStatus('Укажите Channel ID.', false);
  const data = await apiJson(`/api/posts?channelId=${encodeURIComponent(channelId)}`);
  renderPosts(data.posts || []);
  showStatus('Посты загружены.');
}
async function loadCurrentPost() {
  const commentKey = el.commentKey.value.trim();
  if (!commentKey) return showStatus('Укажите commentKey.', false);
  const data = await apiJson(`/api/posts/item?commentKey=${encodeURIComponent(commentKey)}`);
  currentPost = data.post || null;
  if (currentPost) {
    el.channelId.value = currentPost.channelId || el.channelId.value;
    el.postText.value = currentPost.originalText || '';
    keyboardBuilderState = normalizeBuilderState(currentPost.customKeyboard || {});
  }
  renderMeta(currentPost);
  renderCurrentMedia(currentPost);
  renderTextPreview();
  renderKeyboardBuilder();
  const history = await apiJson(`/api/posts/history?commentKey=${encodeURIComponent(commentKey)}`);
  renderHistory(history.versions || []);
  showStatus('Пост открыт.');
}
async function replaceMedia() {
  if (!selectedFile) return showStatus('Сначала выберите новый файл.', false);
  if (!el.commentKey.value.trim()) return showStatus('Сначала откройте пост.', false);
  const dataUrl = await fileToDataUrl(selectedFile);
  const payload = {
    commentKey: el.commentKey.value.trim(),
    actorName: el.actorName.value.trim() || 'admin',
    fileName: selectedFile.name,
    mimeType: selectedFile.type || 'application/octet-stream',
    size: selectedFile.size || 0,
    dataUrl
  };
  await apiJson('/api/posts/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  selectedFile = null;
  el.mediaFileInput.value = '';
  renderLocalFileSelection(null);
  showStatus('Медиа поста заменено.');
  await loadCurrentPost();
  await loadPosts().catch(() => {});
}
async function saveKeyboardBuilder() {
  if (!el.commentKey.value.trim()) return showStatus('Сначала откройте пост.', false);
  updateBuilderFromInputs();
  const payload = {
    commentKey: el.commentKey.value.trim(),
    actorName: el.actorName.value.trim() || 'admin',
    commentButtonText: el.commentButtonText.value.trim(),
    rows: keyboardBuilderState.rows
  };
  await apiJson('/api/posts/keyboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  showStatus('CTA / keyboard сохранены.');
  await loadCurrentPost();
  await loadPosts().catch(() => {});
}

el.previewBtn.addEventListener('click', renderTextPreview);
el.savePostBtn.addEventListener('click', async () => {
  try {
    const payload = {
      commentKey: el.commentKey.value.trim(),
      actorName: el.actorName.value.trim() || 'admin',
      text: el.postText.value
    };
    await apiJson('/api/posts/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    showStatus('Пост сохранён.');
    await loadCurrentPost();
    await loadPosts().catch(() => {});
  } catch (error) {
    showStatus(`Ошибка сохранения: ${error.message}`, false);
  }
});
el.mediaFileInput.addEventListener('change', () => {
  selectedFile = el.mediaFileInput.files?.[0] || null;
  renderLocalFileSelection(selectedFile);
});
el.replaceMediaBtn.addEventListener('click', () => replaceMedia().catch((error) => showStatus(`Ошибка замены медиа: ${error.message}`, false)));
el.loadPostsBtn.addEventListener('click', () => loadPosts().catch((error) => showStatus(`Ошибка загрузки: ${error.message}`, false)));
el.loadCurrentBtn.addEventListener('click', () => loadCurrentPost().catch((error) => showStatus(`Ошибка поста: ${error.message}`, false)));
el.addKeyboardRowBtn.addEventListener('click', () => {
  updateBuilderFromInputs();
  keyboardBuilderState.rows.push(makeRow());
  renderKeyboardBuilder();
});
el.addPresetLeadBtn.addEventListener('click', () => {
  updateBuilderFromInputs();
  keyboardBuilderState.rows.push(buildPresetLeadMagnet());
  renderKeyboardBuilder();
});
el.saveKeyboardBtn.addEventListener('click', () => saveKeyboardBuilder().catch((error) => showStatus(`Ошибка сохранения CTA: ${error.message}`, false)));
el.commentButtonText.addEventListener('input', () => {
  updateBuilderFromInputs();
  renderKeyboardPreview();
});
window.addEventListener('beforeunload', revokeObjectPreview);

(async () => {
  el.channelId.value = params('channelId');
  el.commentKey.value = params('commentKey');
  el.actorName.value = params('actorName') || 'admin';
  renderLocalFileSelection(null);
  renderKeyboardBuilder();
  if (el.channelId.value) await loadPosts().catch(() => {});
  if (el.commentKey.value) await loadCurrentPost().catch(() => {});
})();
