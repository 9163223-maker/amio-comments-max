
function getPossibleWebApps() {
  return [
    window.WebApp,
    window.Telegram?.WebApp,
    window.Max?.WebApp,
    window.MAX?.WebApp,
    window.maxWebApp,
    window.MAXWebApp,
    window.MiniApp,
    window.max?.WebApp
  ].filter(Boolean);
}

function safeDecode(value) {
  let current = String(value || "");
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

function getAllRawBridgeStrings() {
  const apps = getPossibleWebApps();
  const raw = [];
  for (const app of apps) {
    raw.push(app?.initDataUnsafe?.start_param);
    raw.push(app?.initDataUnsafe?.startapp);
    raw.push(app?.initDataUnsafe?.postId);
    raw.push(app?.initDataUnsafe?.post_id);
    raw.push(app?.initDataUnsafe?.commentKey);
    raw.push(app?.initDataUnsafe?.query_id);
    raw.push(app?.initData);
    raw.push(app?.startParam);
    raw.push(app?.launchParams);
    raw.push(app?.params);
  }
  raw.push(window.location.href);
  raw.push(window.location.search);
  raw.push(window.location.hash);
  raw.push(document.referrer || "");
  return raw.filter(Boolean).map((item) => String(item));
}

function extractCandidateValues(value) {
  const list = new Set();
  const add = (item) => {
    const normalized = String(item || "").trim().replace(/^['"]+|['"]+$/g, "");
    if (normalized) list.add(normalized);
  };
  const raw = String(value || "");
  const decoded = safeDecode(raw);
  [raw, decoded].forEach((variant) => {
    add(variant);
    const parts = [variant];
    if (variant.includes("?")) parts.push(variant.split("?").slice(1).join("?"));
    if (variant.includes("#")) parts.push(variant.split("#").slice(1).join("#"));
    for (const part of parts) {
      try {
        const params = new URLSearchParams(part);
        ["startapp","postId","commentKey","start_param","post_id","WebAppStartParam","handoff","channelId"].forEach((key) => add(params.get(key)));
      } catch {}
    }
    (variant.match(/-?\d+:-?\d+/g) || []).forEach(add);
    (variant.match(/-?\d{8,}/g) || []).forEach(add);
  });
  return [...list];
}

function getBestParam(name) {
  const values = [];
  const add = (v) => {
    const normalized = String(v || "").trim();
    if (normalized) values.push(normalized);
  };
  try {
    const url = new URL(window.location.href);
    add(url.searchParams.get(name));
  } catch {}
  if (window.location.hash && window.location.hash.includes("?")) {
    try {
      const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
      add(params.get(name));
    } catch {}
  }
  for (const raw of getAllRawBridgeStrings()) {
    for (const candidate of extractCandidateValues(raw)) {
      if (candidate.includes("=") || candidate.includes("?") || candidate.includes("#")) {
        try {
          const params = new URLSearchParams(candidate.includes("?") ? candidate.split("?").slice(1).join("?") : candidate);
          add(params.get(name));
        } catch {}
      }
    }
  }
  return values.find(Boolean) || "";
}

function getBridgeUser() {
  for (const app of getPossibleWebApps()) {
    const user = app?.initDataUnsafe?.user || app?.user;
    if (user) return user;
  }
  return null;
}
function getBridgeController() { return getPossibleWebApps()[0] || null; }
function initBridgeUi() {
  const controller = getBridgeController();
  try { controller?.ready?.(); } catch {}
  try { controller?.expand?.(); } catch {}
  // Не включаем confirmation: стартовая страница должна переходить в чат без лишнего предупреждения.
  try { controller?.disableClosingConfirmation?.(); } catch {}
}
function getBridgeUserName() {
  const user = getBridgeUser();
  return String(user?.first_name || user?.username || user?.last_name || "").trim();
}
function getBridgeUserId() {
  const user = getBridgeUser();
  return String(user?.id || "").trim();
}
function getBridgeAvatarUrl() {
  const user = getBridgeUser();
  return String(user?.photo_url || "").trim();
}
function isReasonableName(value) {
  const normalized = String(value || "").trim();
  return Boolean(normalized) && !/^\d+$/.test(normalized);
}
function extractHandoffToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const decoded = safeDecode(raw);
  const match = decoded.match(/(?:^|[^\w-])(h_[A-Za-z0-9_-]{6,})(?:$|[^\w-])/);
  return match ? match[1] : "";
}
function normalizeStartappValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const decoded = safeDecode(raw);
  const handoff = extractHandoffToken(decoded);
  if (handoff) return handoff;
  const directKey = decoded.match(/-?\d+:-?\d+/);
  if (directKey) return `ck:${directKey[0]}`;
  const numeric = decoded.match(/-?\d{8,}/);
  if (numeric) return `post:${numeric[0]}`;
  return decoded;
}
function extractCommentKeyFromStartapp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const decoded = safeDecode(raw);
  const handoff = extractHandoffToken(decoded);
  if (handoff) return handoff;
  const directKey = decoded.match(/-?\d+:-?\d+/);
  if (directKey) return directKey[0];
  return "";
}
function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function formatDateTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
async function fetchJsonWithTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}
function isNearBottom() {
  return (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 160);
}
function scrollToBottom(force = false) {
  if (!force && !isNearBottom()) return;
  window.scrollTo({ top: document.body.scrollHeight, behavior: force ? 'auto' : 'smooth' });
}
function getKeyboardOverlapPx() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const visibleBottom = Number(viewport.height || 0) + Number(viewport.offsetTop || 0);
  return Math.max(0, Math.round(layoutHeight - visibleBottom));
}

function updateComposerOffset() {
  const composerHeight = composerCard?.offsetHeight || 92;
  const keyboardOverlap = getKeyboardOverlapPx();
  const page = document.querySelector('.page');
  if (composerCard) {
    composerCard.style.setProperty('--keyboard-overlap', `${keyboardOverlap}px`);
    composerCard.classList.toggle('keyboard-visible', keyboardOverlap > 40);
  }
  if (page) page.style.paddingBottom = `${composerHeight + keyboardOverlap + 96}px`;
}
window.visualViewport?.addEventListener?.('resize', updateComposerOffset);
window.visualViewport?.addEventListener?.('scroll', updateComposerOffset);
window.addEventListener?.('resize', updateComposerOffset);

let lastCommentsFingerprint = "";
let lastCommentsStructuralFingerprint = "";
let commentsPollTimer = null;
let commentsRequestInFlight = false;
const commentRowFingerprints = new Map();
const QUICK_REACTIONS = ["👍","❤️","😂","😮","😡","👎","🔥"];
const MAX_COMMENT_ATTACHMENTS = 5;
const MAX_COMMENT_ATTACHMENT_BYTES = 32 * 1024 * 1024;
const MAX_COMMENT_IMAGE_EDGE = 720;
const MAX_COMMENT_IMAGE_QUALITY = 0.52;
const MAX_COMMENT_VIDEO_JSON_BYTES = 20 * 1024 * 1024; // SP36: JSON video upload is fallback only; multipart is tried first for speed.
const EXTRA_REACTIONS = [
  "🎉","😢","🤔","👏","🙏","😍","😎","🤯",
  "😴","🤩","💩","💯","✅","❌","⚡","⭐",
  "💔","🤣","🥳","😬","🤝","🙌","👌","💪",
  "🥰","😱","🤮","🫶","💸","📌","📝","🎁"
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return !(
    a.left + a.width <= b.left ||
    b.left + b.width <= a.left ||
    a.top + a.height <= b.top ||
    b.top + b.height <= a.top
  );
}

function getViewportMetrics() {
  const viewport = window.visualViewport;
  return {
    width: Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 0),
    height: Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0)
  };
}

function isDesktopLike() {
  return Boolean(window.matchMedia?.("(pointer: fine)").matches) && window.innerWidth >= 768;
}

function revealForMeasure(element, displayValue) {
  const previousVisibility = element.style.visibility;
  const previousDisplay = element.style.display;
  const wasHidden = element.classList.contains("hidden");
  element.style.visibility = "hidden";
  element.style.display = displayValue;
  element.classList.remove("hidden");
  return () => {
    element.style.visibility = previousVisibility;
    element.style.display = previousDisplay;
    if (wasHidden) element.classList.add("hidden");
  };
}

function positionFloatingElement(element, { top, left }) {
  element.style.top = `${Math.round(top)}px`;
  element.style.left = `${Math.round(left)}px`;
  element.style.visibility = "visible";
}

function getTopbarBottom() {
  const rect = document.querySelector(".topbar")?.getBoundingClientRect?.();
  return rect ? Math.max(12, Math.round(rect.bottom + 10)) : 12;
}

function getComposerTop(viewportHeight) {
  const rect = composerCard?.getBoundingClientRect?.();
  if (rect?.top) return Math.round(rect.top);
  const fallbackHeight = composerCard?.offsetHeight || 96;
  return Math.max(24, Math.round(viewportHeight - fallbackHeight - 18));
}

function positionReactionBar(anchorRect) {
  const padding = 12;
  const gap = 10;
  const viewport = getViewportMetrics();
  const restore = revealForMeasure(reactionBar, "grid");
  const width = reactionBar.offsetWidth;
  const height = reactionBar.offsetHeight;
  restore();

  let left;
  let top;

  if (!isDesktopLike()) {
    left = clamp((viewport.width - width) / 2, padding, viewport.width - width - padding);
    top = clamp(getTopbarBottom(), padding, viewport.height - height - padding);
  } else {
    left = anchorRect.left + ((anchorRect.width - width) / 2);
    left = clamp(left, padding, viewport.width - width - padding);

    top = anchorRect.top - height - gap;
    if (top < padding) {
      top = clamp(anchorRect.bottom + gap, padding, viewport.height - height - padding);
    }
  }

  reactionBar.style.display = "grid";
  reactionBar.classList.remove("hidden");
  positionFloatingElement(reactionBar, { top, left });

  return { top, left, width, height, isAbove: top + height <= anchorRect.top };
}

function positionActionSheet(anchorRect, reactionRect) {
  const padding = 12;
  const gap = 12;
  const viewport = getViewportMetrics();
  const mobileSheet = !isDesktopLike();
  actionSheet.classList.toggle("mobile-sheet", mobileSheet);
  const restore = revealForMeasure(actionSheet, "block");
  const width = actionSheet.offsetWidth;
  const height = actionSheet.offsetHeight;
  restore();

  actionSheet.style.bottom = "";
  actionSheet.style.transform = "none";

  if (mobileSheet) {
    const left = clamp((viewport.width - width) / 2, padding, viewport.width - width - padding);
    const composerTop = getComposerTop(viewport.height);
    const minTop = Math.min(
      viewport.height - height - padding,
      (reactionRect?.top || getTopbarBottom()) + (reactionRect?.height || 0) + 12
    );
    let top = composerTop - height - 14;
    top = clamp(top, minTop, viewport.height - height - padding);

    actionSheet.style.display = "block";
    actionSheet.classList.remove("hidden");
    positionFloatingElement(actionSheet, { top, left });
    return { top, left, width, height };
  }

  const candidates = [];
  const reactionBox = reactionRect ? { left: reactionRect.left, top: reactionRect.top, width: reactionRect.width, height: reactionRect.height } : null;
  const anchorCenter = anchorRect.left + (anchorRect.width / 2);
  const pushCandidate = (top, left) => {
    candidates.push({
      top: clamp(top, padding, viewport.height - height - padding),
      left: clamp(left, padding, viewport.width - width - padding)
    });
  };

  pushCandidate((reactionRect?.bottom || anchorRect.top) + gap, anchorCenter - (width / 2));
  pushCandidate(anchorRect.bottom + gap, anchorCenter - (width / 2));
  pushCandidate(Math.min(anchorRect.top, reactionRect?.top || anchorRect.top) - height - gap, anchorCenter - (width / 2));
  pushCandidate(anchorRect.top + ((anchorRect.height - height) / 2), anchorRect.right + gap);
  pushCandidate(anchorRect.top + ((anchorRect.height - height) / 2), anchorRect.left - width - gap);

  let chosen = candidates.find((candidate) => !reactionBox || !rectsOverlap({ ...candidate, width, height }, reactionBox));
  if (!chosen) chosen = candidates[0] || { top: padding, left: padding };

  actionSheet.style.display = "block";
  actionSheet.classList.remove("hidden");
  positionFloatingElement(actionSheet, chosen);

  return { ...chosen, width, height };
}

function positionEmojiPicker(anchorRect) {
  const padding = 12;
  const gap = 8;
  const viewport = getViewportMetrics();
  const restore = revealForMeasure(emojiPicker, "grid");
  const width = emojiPicker.offsetWidth;
  const height = emojiPicker.offsetHeight;
  restore();

  let left = anchorRect.right - width;
  left = clamp(left, padding, viewport.width - width - padding);

  let top = anchorRect.bottom + gap;
  if (top + height > viewport.height - padding) {
    top = anchorRect.top - height - gap;
  }
  top = clamp(top, padding, viewport.height - height - padding);

  emojiPicker.style.display = "grid";
  emojiPicker.classList.remove("hidden");
  positionFloatingElement(emojiPicker, { top, left });
}

function replaceCommentInCache(updatedComment) {
  if (!updatedComment?.id) return false;
  let replaced = false;
  state.commentsCache = (state.commentsCache || []).map((item) => {
    if (String(item.id) !== String(updatedComment.id)) return item;
    replaced = true;
    return { ...item, ...updatedComment };
  });
  return replaced;
}

async function sendReaction(commentId, emoji) {
  const cleanEmoji = String(emoji || "").trim();
  if (!commentId || !cleanEmoji) return null;
  const data = await apiRequestJson("/api/comments/react", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commentKey: state.commentKey,
      commentId,
      userId: getOutgoingUserId(),
      emoji: cleanEmoji
    })
  });
  if (data.comment && replaceCommentInCache(data.comment)) {
    renderComments(state.commentsCache);
  }
  return data;
}

function renderAvatar(url, name) {
  if (url) return `<img class="avatar-image" src="${escapeHtml(url)}" alt="${escapeHtml(name || "avatar")}" />`;
  const normalizedName = String(name || "").trim();
  if (/^[A-Za-zА-Яа-яЁё]/.test(normalizedName)) {
    return `<div class="avatar-fallback">${escapeHtml(normalizedName.charAt(0).toUpperCase())}</div>`;
  }
  return `<div class="avatar-fallback">👤</div>`;
}
function getOutgoingUserName() {
  if (isReasonableName(state.currentUserName)) return state.currentUserName;
  const fromInput = String(nameInput.value || "").trim();
  if (isReasonableName(fromInput)) return fromInput;
  return "Гость";
}
function getOutgoingUserId() {
  if (state.currentUserId) return state.currentUserId;
  const fromInput = String(nameInput.value || "").trim();
  if (isReasonableName(fromInput)) return fromInput;
  return "guest";
}
function getOutgoingAvatarUrl() { return state.currentUserAvatarUrl || ""; }

const startappRawValue = getBestParam("startapp") || getBestParam("start_param") || getBestParam("WebAppStartParam") || getBestParam("handoff") || getBestParam("postId") || getBestParam("post_id") || "";
const startappCommentKey = extractCommentKeyFromStartapp(startappRawValue);
const handoffTokenValue = extractHandoffToken(startappRawValue) || getBestParam("handoff") || "";
const rawChannelId = getBestParam("channelId") || "";
const rawPostId = getBestParam("postId") || getBestParam("post_id") || "";

const state = {
  commentKey: getBestParam("commentKey") || startappCommentKey || ((rawChannelId && rawPostId) ? `${rawChannelId}:${rawPostId}` : ""),
  channelId: rawChannelId,
  handoffToken: handoffTokenValue,
  startappRaw: startappRawValue,
  startapp: normalizeStartappValue(startappRawValue),
  currentUserId: getBridgeUserId() || "",
  currentUserName: getBridgeUserName() || "",
  currentUserAvatarUrl: getBridgeAvatarUrl() || "",
  diagnostics: { runtimeVersion: "SP36" },
  composerReplyTo: null,
  editingCommentId: "",
  selectedComment: null,
  growth: null,
  commentsCache: [],
  mediaUploadInFlight: false,
  searchQuery: "",
  selectedAttachments: [],
  mediaPreviewAttachment: null,
  mediaPreviewBaseHeight: 0,
  mediaPreviewFitMode: "contain",
  initialAnchorDone: false,
  adminkitLink: "https://max.ru/id781310320690_bot?start=menu"
};

const postCard = document.getElementById("postCard");
const postTitle = document.getElementById("postTitle");
const postMedia = document.getElementById("postMedia");
const postNativeReactions = document.getElementById("postNativeReactions");
const commentsList = document.getElementById("commentsList");
const emptyState = document.getElementById("emptyState");
const nameInput = document.getElementById("nameInput");
const commentInput = document.getElementById("commentInput");
const sendBtn = document.getElementById("sendBtn");
const searchBtn = document.getElementById("searchBtn");
const attachBtn = document.getElementById("attachBtn");
const attachBtnWrap = document.querySelector(".attach-btn-wrap");
const attachmentInput = document.getElementById("attachmentInput");
const attachmentCameraInput = document.getElementById("attachmentCameraInput");
const attachmentFileInput = document.getElementById("attachmentFileInput");
const attachmentMenu = document.getElementById("attachmentMenu");
const attachMediaBtn = document.getElementById("attachMediaBtn");
const attachCameraBtn = document.getElementById("attachCameraBtn");
const attachFileBtn = document.getElementById("attachFileBtn");
const attachmentPreview = document.getElementById("attachmentPreview");
const commentsCountPill = document.getElementById("commentsCountPill");
const commentSearchPanel = document.getElementById("commentSearchPanel");
const commentSearchInput = document.getElementById("commentSearchInput");
const commentSearchClear = document.getElementById("commentSearchClear");
const adminkitDiscussionLink = document.getElementById("adminkitDiscussionLink");
const backBtn = document.getElementById("backBtn");
const composerAvatar = document.getElementById("composerAvatar");
const composerAvatarFallback = document.getElementById("composerAvatarFallback");
const reactionBar = document.getElementById("reactionBar");
const actionSheet = document.getElementById("actionSheet");
const emojiPicker = document.getElementById("emojiPicker");
const sheetOverlay = document.getElementById("sheetOverlay");
const commentFocusModal = document.getElementById("commentFocusModal");
const focusedCommentCard = document.getElementById("focusedCommentCard");
const discussionLabel = document.getElementById("discussionLabel");
const composerCard = document.getElementById("composerCard");
const composerReply = document.getElementById("composerReply");
const composerReplyName = document.getElementById("composerReplyName");
const composerReplyText = document.getElementById("composerReplyText");
const composerReplyClose = document.getElementById("composerReplyClose");
const postError = document.getElementById("postError");
const commentInlineStatus = document.getElementById("commentInlineStatus");
const growthLeadCard = document.getElementById("growthLeadCard");
const trackedButtonsCard = document.getElementById("trackedButtonsCard");
const pollCard = document.getElementById("pollCard");
const commentsWrap = document.getElementById("commentsWrap");
const miniAppStartCard = document.getElementById("miniAppStartCard");
const miniAppStartText = document.getElementById("miniAppStartText");
const miniAppStartWorkBtn = document.getElementById("miniAppStartWorkBtn");
const miniAppCommunityBtn = document.getElementById("miniAppCommunityBtn");
const miniAppTopbar = document.getElementById("miniAppTopbar");
const mediaPreviewModal = document.getElementById("mediaPreviewModal");
const mediaPreviewClose = document.getElementById("mediaPreviewClose");
const mediaPreviewClear = document.getElementById("mediaPreviewClear");
const mediaPreviewStage = document.getElementById("mediaPreviewStage");
const mediaPreviewBottom = document.getElementById("mediaPreviewBottom");
const mediaPreviewTitle = document.getElementById("mediaPreviewTitle");
const mediaPreviewTools = document.getElementById("mediaPreviewTools");
const mediaPreviewRotate = document.getElementById("mediaPreviewRotate");
const mediaPreviewStatus = document.getElementById("mediaPreviewStatus");
const mediaPreviewCaption = document.getElementById("mediaPreviewCaption");
const mediaPreviewSend = document.getElementById("mediaPreviewSend");
const mediaViewerModal = document.getElementById("mediaViewerModal");
const mediaViewerStage = document.getElementById("mediaViewerStage");
const mediaViewerClose = document.getElementById("mediaViewerClose");
const mediaViewerCaption = document.getElementById("mediaViewerCaption");

initBridgeUi();

if (state.currentUserName) {
  nameInput.value = state.currentUserName;
  nameInput.readOnly = true;
  nameInput.style.display = "none";
}
if (miniAppStartWorkBtn) miniAppStartWorkBtn.addEventListener("click", () => {
  const target = "https://max.ru/id781310320690_bot?start=menu";
  const controller = getBridgeController();
  try { controller?.disableClosingConfirmation?.(); } catch {}
  if (miniAppStartText && !miniAppStartText.querySelector('.miniapp-start-transition')) {
    miniAppStartText.innerHTML += '<div class="miniapp-start-copy subtle miniapp-start-transition">Переходим в чат с ботом…</div>';
  }
  if (controller && typeof controller.openMaxLink === "function") {
    controller.openMaxLink(target);
    setTimeout(() => { try { controller.close?.(); } catch {} }, 250);
  } else {
    window.location.href = target;
  }
});

if (miniAppCommunityBtn) miniAppCommunityBtn.addEventListener("click", () => {
  const target = "https://max.ru/id781310320690_biz";
  if (window.WebApp && typeof window.WebApp.openMaxLink === "function") {
    window.WebApp.openMaxLink(target);
  } else {
    window.location.href = target;
  }
});

if (state.currentUserAvatarUrl) {
  composerAvatar.src = state.currentUserAvatarUrl;
  composerAvatar.style.display = "block";
  if (composerAvatarFallback) composerAvatarFallback.style.display = "none";
}



function setCommentStatus(message, isError = false) {
  if (!commentInlineStatus) return;
  if (!message) {
    commentInlineStatus.textContent = "";
    commentInlineStatus.classList.add("hidden");
    commentInlineStatus.classList.remove("error");
    return;
  }
  commentInlineStatus.textContent = message;
  commentInlineStatus.classList.remove("hidden");
  commentInlineStatus.classList.toggle("error", Boolean(isError));
}

async function apiRequestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error || `http_${response.status}`);
    error.payload = data;
    error.status = response.status;
    throw error;
  }
  return data;
}

function autoGrowCommentInput() {
  if (!commentInput) return;
  commentInput.style.height = "auto";
  commentInput.style.height = `${Math.min(Math.max(commentInput.scrollHeight, 36), 96)}px`;
}

function renderComposerReply() {
  if (!composerReply) return;
  const reply = state.composerReplyTo;
  if (!reply) {
    composerReply.classList.add("hidden");
    composerReplyName.textContent = "";
    composerReplyText.textContent = "";
    updateComposerOffset();
    return;
  }
  composerReplyName.textContent = `В ответ на ${reply.userName || "Гость"}`;
  composerReplyText.textContent = reply.text || "";
  composerReply.classList.remove("hidden");
  updateComposerOffset();
}

function clearComposerReply() {
  state.composerReplyTo = null;
  renderComposerReply();
  if (!state.editingCommentId) commentInput.placeholder = "Напиши комментарий...";
}


function renderMiniAppStartMenu() {
  if (!miniAppStartText) return;
  miniAppStartText.innerHTML = [
    '<div class="miniapp-start-copy strong">АдминКИТ — система управления MAX</div>',
    '<div class="miniapp-start-copy">Комментарии, подарки, кнопки и статистика канала — в одном месте.</div>',
    '<div class="miniapp-start-copy subtle">После нажатия откроется чат с ботом.</div>'
  ].join('');
}

function getDiscussionWrap() {
  return document.querySelector('.discussion-label-wrap');
}

function setCommentsUiVisible(isVisible) {
  const displayCard = isVisible ? "block" : "none";
  if (miniAppTopbar) miniAppTopbar.style.display = isVisible ? "grid" : "none";
  if (!isVisible && commentSearchPanel) commentSearchPanel.classList.add("hidden");
  if (postCard) postCard.style.display = displayCard;
  if (commentsWrap) commentsWrap.style.display = displayCard;
  if (composerCard) composerCard.style.display = isVisible ? "block" : "none";
  const discussionWrap = getDiscussionWrap();
  if (discussionWrap) discussionWrap.style.display = displayCard;
}

function showMiniAppStartMenu() {
  document.body?.classList?.add("miniapp-start-mode");
  setCommentsUiVisible(false);
  if (miniAppStartCard) miniAppStartCard.classList.remove("hidden");
  renderMiniAppStartMenu();
}

function hideMiniAppStartMenu() {
  document.body?.classList?.remove("miniapp-start-mode");
  if (miniAppStartCard) miniAppStartCard.classList.add("hidden");
  setCommentsUiVisible(true);
}

function setPostError(message, isSoft = false) {
  postError.textContent = message || "";
  postError.classList.toggle("soft-error", Boolean(isSoft && message));
  postError.style.display = message ? "block" : "none";
  postCard.style.display = message && !isSoft ? "none" : "block";
}


function hideGrowthCards() {
  if (growthLeadCard) {
    growthLeadCard.innerHTML = "";
    growthLeadCard.classList.add("hidden");
  }
  if (trackedButtonsCard) {
    trackedButtonsCard.innerHTML = "";
    trackedButtonsCard.classList.add("hidden");
  }
  if (pollCard) {
    pollCard.innerHTML = "";
    pollCard.classList.add("hidden");
  }
}

function renderLeadMagnet(growth) {
  // В 14.6.20 убираем отдельную надпись «Разработано АдминКит».
  // Ненавязчивая активная ссылка остаётся только рядом с «Начало обсуждения».
  if (!growthLeadCard) return;
  growthLeadCard.innerHTML = "";
  growthLeadCard.classList.add("hidden");
}

function renderTrackedButtons(growth) {
  const buttons = Array.isArray(growth?.trackedButtons) ? growth.trackedButtons : [];
  if (!trackedButtonsCard) return;
  if (!buttons.length) {
    trackedButtonsCard.innerHTML = "";
    trackedButtonsCard.classList.add("hidden");
    return;
  }
  trackedButtonsCard.innerHTML = `
    <div class="growth-section-head">
      <strong>Полезные кнопки</strong>
      <span>Клики считаются в analytics dashboard</span>
    </div>
    <div class="growth-button-grid">
      ${buttons.map((button) => `
        <a class="growth-button growth-button-${escapeHtml(button.style || "primary")}" href="${escapeHtml(button.trackedUrl)}">
          ${escapeHtml(button.text || "Открыть")}
        </a>
      `).join("")}
    </div>
  `;
  trackedButtonsCard.classList.remove("hidden");
}

async function voteInGrowthPoll(optionId) {
  if (!state.growth?.poll?.id || !state.channelId) return;
  try {
    const data = await apiRequestJson("/api/poll/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: state.channelId,
        commentKey: state.commentKey,
        postId: state.commentKey.split(":").slice(1).join(":"),
        pollId: state.growth.poll.id,
        optionId,
        userId: getOutgoingUserId()
      })
    });
    state.growth.poll = data.poll || state.growth.poll;
    renderPoll(state.growth);
  } catch (error) {
    setCommentStatus("Не удалось отправить голос.", true);
  }
}

function renderPoll(growth) {
  const poll = growth?.poll;
  if (!pollCard) return;
  if (!poll?.question || !Array.isArray(poll.options) || !poll.options.length) {
    pollCard.innerHTML = "";
    pollCard.classList.add("hidden");
    return;
  }
  const totalVotes = Number(poll.totalVotes || 0);
  pollCard.innerHTML = `
    <div class="growth-section-head">
      <strong>Опрос</strong>
      <span>${totalVotes} голосов</span>
    </div>
    <div class="poll-question">${escapeHtml(poll.question || "")}</div>
    <div class="poll-options">
      ${poll.options.map((option) => {
        const isMine = poll.myVote && poll.myVote === option.id;
        const percent = totalVotes > 0 ? Math.round((Number(option.votes || 0) / totalVotes) * 100) : 0;
        return `
          <button class="poll-option${isMine ? " active" : ""}" type="button" data-poll-option="${escapeHtml(option.id)}">
            <span>${escapeHtml(option.text || "")}</span>
            <span>${Number(option.votes || 0)} · ${percent}%</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
  pollCard.classList.remove("hidden");
  pollCard.querySelectorAll("[data-poll-option]").forEach((button) => {
    button.addEventListener("click", () => voteInGrowthPoll(button.getAttribute("data-poll-option")));
  });
}

function renderGrowthBlocks(growth) {
  state.growth = growth || null;
  renderLeadMagnet(growth || {});
  renderTrackedButtons(growth || null);
  renderPoll(growth || null);
}

function renderPostNativeReactions(reactions = []) {
  if (!postNativeReactions) return;
  const items = Array.isArray(reactions) ? reactions.filter((item) => item && (item.emoji || item.text || item.type) && Number(item.count || item.value || 0) > 0).slice(0, 8) : [];
  if (!items.length) {
    postNativeReactions.innerHTML = "";
    postNativeReactions.classList.add("hidden");
    return;
  }
  postNativeReactions.innerHTML = items.map((item) => {
    const emoji = escapeHtml(item.emoji || item.text || item.type || "❤️");
    const count = Number(item.count || item.value || 0);
    return `<span class="post-native-reaction-pill"><span>${emoji}</span><strong>${count}</strong></span>`;
  }).join("");
  postNativeReactions.classList.remove("hidden");
}

function renderPostAttachments(attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  const html = list.map((item) => {
    if (item?.type === "image" && item?.payload?.url) {
      return `<img class="post-media-image" src="${escapeHtml(item.payload.url)}" alt="post image" />`;
    }
    return "";
  }).join("");
  postMedia.innerHTML = html;
  postMedia.style.display = html ? "block" : "none";
}

function waitForPostMediaReady(timeoutMs = 1200) {
  const images = Array.from(postMedia?.querySelectorAll?.("img") || []);
  if (!images.length) return Promise.resolve();
  const pending = images.filter((img) => !img.complete);
  if (!pending.length) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    let left = pending.length;
    const onOne = () => {
      left -= 1;
      if (left <= 0) {
        clearTimeout(timer);
        finish();
      }
    };
    pending.forEach((img) => {
      img.addEventListener("load", onOne, { once: true });
      img.addEventListener("error", onOne, { once: true });
    });
  });
}

function inferAttachmentType(file = {}) {
  const mime = String(file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}


function getUploadFileName(file) {
  return String(file?.name || "attachment.bin").trim() || "attachment.bin";
}

function getUploadMime(file) {
  return String(file?.type || "application/octet-stream").trim() || "application/octet-stream";
}

function captureVideoPosterBlob(src, timeoutMs = 900) {
  return new Promise((resolve) => {
    if (!src || typeof document === "undefined") return resolve(null);
    const video = document.createElement("video");
    let done = false;
    const finish = (blob = null) => {
      if (done) return;
      done = true;
      try { video.pause(); video.removeAttribute("src"); video.load?.(); } catch {}
      resolve(blob || null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.addEventListener("loadeddata", () => {
      try {
        const width = Math.max(1, video.videoWidth || 720);
        const height = Math.max(1, video.videoHeight || 1280);
        const edge = Math.max(width, height);
        const scale = Math.min(1, 900 / edge);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) { clearTimeout(timer); finish(null); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { clearTimeout(timer); finish(blob || null); }, "image/jpeg", 0.78);
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    }, { once: true });
    video.addEventListener("error", () => { clearTimeout(timer); finish(null); }, { once: true });
    video.src = src;
    try { video.currentTime = 0.05; } catch {}
    video.load?.();
  });
}

async function normalizeSelectedFile(file) {
  if (!file) return null;
  if (Number(file.size || 0) > MAX_COMMENT_ATTACHMENT_BYTES) {
    throw new Error('Файл ' + (file.name || '') + ' больше ' + Math.round(MAX_COMMENT_ATTACHMENT_BYTES / 1024 / 1024) + ' МБ.');
  }
  const type = inferAttachmentType(file);
  let localPreviewUrl = "";
  let uploadBlob = null;
  let uploadName = getUploadFileName(file);
  let uploadMime = getUploadMime(file);
  let uploadSize = Number(file.size || 0);

  if (type === "image") {
    try {
      uploadBlob = await imageFileToUploadBlob(file, MAX_COMMENT_IMAGE_EDGE, MAX_COMMENT_IMAGE_QUALITY);
      if (uploadBlob?.size) {
        uploadName = uploadName.replace(/\.[^.]+$/, "") + ".jpg";
        uploadMime = "image/jpeg";
        uploadSize = uploadBlob.size;
        localPreviewUrl = URL.createObjectURL(uploadBlob);
      }
    } catch {}
  }

  if (!localPreviewUrl) {
    try { localPreviewUrl = URL.createObjectURL(file); } catch {}
  }

  return {
    id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    clientUploadId: Date.now() + "_" + Math.random().toString(36).slice(2, 10),
    type,
    name: uploadName,
    mime: uploadMime,
    size: uploadSize,
    originalSize: Number(file.size || 0),
    file,
    uploadBlob,
    localPreviewUrl,
    posterBlob: null
  };
}

async function uploadCommentAttachment(normalized) {
  if (!normalized) return null;
  if (isUploadedCommentAttachment(normalized)) return normalized;
  const file = normalized.file;
  if (!file) throw new Error("upload_file_required");

  const uploadBlob = normalized.uploadBlob || file;
  const uploadName = normalized.name || getUploadFileName(file);
  const uploadMime = normalized.mime || getUploadMime(file);
  const uploadSize = Number(normalized.size || uploadBlob.size || file.size || 0);

  const form = new FormData();
  form.append("commentKey", state.commentKey || "");
  form.append("type", normalized.type || inferAttachmentType(file));
  form.append("fileName", uploadName);
  form.append("mimeType", uploadMime);
  form.append("size", String(uploadSize));
  form.append("file", uploadBlob, uploadName);

  if (normalized.type === "video") {
    try {
      const posterBlob = normalized.posterBlob || await captureVideoPosterBlob(normalized.localPreviewUrl, 1600);
      normalized.posterBlob = posterBlob || null;
      if (posterBlob) {
        form.append("poster", posterBlob, (normalized.name || "video").replace(/\.[^.]+$/, "") + "-poster.jpg");
        if (!normalized.posterPreviewUrl) {
          try { normalized.posterPreviewUrl = URL.createObjectURL(posterBlob); } catch {}
        }
      }
    } catch {}
  }

  normalized.clientUploadId = normalized.clientUploadId || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  // SP36: фото в MAX iOS WebView отправляем сразу через JSON после сжатия.
  // Так мы убираем ложный первый multipart-fail upload_file_required.
  if ((normalized.type || inferAttachmentType(file)) === "image") {
    const direct = await uploadCommentAttachmentJsonFallback(normalized, "direct_json_image");
    const attachment = direct.attachment || null;
    if (attachment) attachment.clientUploadId = normalized.clientUploadId;
    return attachment;
  }

  // SP36: video tries multipart first to avoid base64 overhead. JSON is fallback only.

  try {
    const uploadTimeoutMs = (normalized.type === "video") ? 15000 : 10000;
    const data = await fetchJsonWithAbort("/api/comments/attachments/upload", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "X-Comment-Key": state.commentKey || "",
        "X-Upload-Type": normalized.type || inferAttachmentType(file),
        "X-File-Name": uploadName,
        "X-Mime-Type": uploadMime,
        "X-Client-Upload-Id": normalized.clientUploadId
      },
      body: form
    }, uploadTimeoutMs);
    const attachment = data.attachment || null;
    if (attachment) attachment.clientUploadId = normalized.clientUploadId;
    return attachment;
  } catch (multipartError) {
    const fallbackReason = multipartError?.name === "AbortError" ? "multipart_timeout" : "multipart_failed";
    const fallback = await uploadCommentAttachmentJsonFallback(normalized, fallbackReason);
    const attachment = fallback.attachment || null;
    if (attachment) attachment.clientUploadId = normalized.clientUploadId;
    return attachment;
  }
}

function isStableAttachmentUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw || /^(blob|data):/i.test(raw)) return false;
  return true;
}

function isUploadedCommentAttachment(item) {
  if (!item || typeof item !== "object" || item.file) return false;
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  return Boolean(
    isStableAttachmentUrl(item.url) ||
    isStableAttachmentUrl(item.previewUrl) ||
    isStableAttachmentUrl(item.posterUrl) ||
    Object.keys(payload).length ||
    item.token
  );
}

async function prepareSelectedAttachmentForComment(selected) {
  if (isUploadedCommentAttachment(selected)) return selected;
  return uploadCommentAttachment(selected);
}

function renderSelectedAttachments() {
  if (!attachmentPreview) return;
  const items = Array.isArray(state.selectedAttachments) ? state.selectedAttachments : [];
  if (!items.length) {
    attachmentPreview.innerHTML = "";
    attachmentPreview.classList.add("hidden");
    updateComposerOffset();
    return;
  }
  attachmentPreview.innerHTML = items.map((item, index) => `
    <div class="composer-attachment-chip">
      <span>${escapeHtml(item.type === "image" ? "Фото" : item.type === "video" ? "Видео" : item.type === "audio" ? "Аудио" : "Файл")}</span>
      <strong>${escapeHtml(item.name || "Вложение")}</strong>
      <button type="button" data-attachment-index="${index}" aria-label="Убрать вложение">×</button>
    </div>
  `).join("");
  attachmentPreview.classList.remove("hidden");
  attachmentPreview.querySelectorAll("[data-attachment-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.getAttribute("data-attachment-index"));
      state.selectedAttachments.splice(index, 1);
      renderSelectedAttachments();
    });
  });
  updateComposerOffset();
}

function revokeLocalPreviewUrl(item) {
  const url = String(item?.localPreviewUrl || "");
  if (url && url.startsWith("blob:")) {
    try { URL.revokeObjectURL(url); } catch {}
  }
}

function clearSelectedAttachments() {
  (state.selectedAttachments || []).forEach(revokeLocalPreviewUrl);
  state.selectedAttachments = [];
  if (attachmentInput) attachmentInput.value = "";
  if (attachmentCameraInput) attachmentCameraInput.value = "";
  if (attachmentFileInput) attachmentFileInput.value = "";
  renderSelectedAttachments();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

function imageFileToUploadBlob(file, maxEdge = MAX_COMMENT_IMAGE_EDGE, quality = MAX_COMMENT_IMAGE_QUALITY) {
  return new Promise((resolve) => {
    if (!file || !String(file.type || "").toLowerCase().startsWith("image/")) return resolve(null);
    const localUrl = URL.createObjectURL(file);
    const img = new Image();
    const finish = (value) => {
      try { URL.revokeObjectURL(localUrl); } catch {}
      resolve(value || null);
    };
    img.onload = () => {
      try {
        const width = Math.max(1, img.naturalWidth || img.width || 1);
        const height = Math.max(1, img.naturalHeight || img.height || 1);
        const edge = Math.max(width, height);
        const scale = Math.min(1, maxEdge / edge);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob || null), "image/jpeg", quality);
      } catch { finish(null); }
    };
    img.onerror = () => finish(null);
    img.src = localUrl;
  });
}

async function imageFileToUploadDataUrl(file, maxEdge = MAX_COMMENT_IMAGE_EDGE, quality = MAX_COMMENT_IMAGE_QUALITY) {
  const blob = await imageFileToUploadBlob(file, maxEdge, quality);
  return blob ? fileToDataUrl(blob) : null;
}

function fetchJsonWithAbort(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return apiRequestJson(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function uploadCommentAttachmentJsonFallback(normalized, reason = "multipart_failed") {
  const file = normalized?.file;
  if (!file) throw new Error("upload_file_required");
  const uploadType = normalized.type || inferAttachmentType(file);
  // SP36: JSON/base64 is a fallback if multipart fails in MAX iOS WebView.
  // Large videos are rejected from fallback to avoid freezing the mini-app.
  if (uploadType === "video" && Number(file.size || 0) > MAX_COMMENT_VIDEO_JSON_BYTES) {
    throw new Error(reason === "multipart_timeout" ? "video_upload_timeout" : "video_upload_failed");
  }
  let dataUrl = null;
  let posterDataUrl = "";
  let mimeType = normalized.mime || getUploadMime(file);
  let fileName = normalized.name || getUploadFileName(file);
  if (uploadType === "image") {
    const uploadBlob = normalized.uploadBlob || await imageFileToUploadBlob(file, MAX_COMMENT_IMAGE_EDGE, MAX_COMMENT_IMAGE_QUALITY);
    if (uploadBlob?.size) {
      dataUrl = await fileToDataUrl(uploadBlob);
      mimeType = "image/jpeg";
      fileName = fileName.replace(/\.[^.]+$/, "") + ".jpg";
    }
  } else if (uploadType === "video") {
    try {
      const posterBlob = normalized.posterBlob || await captureVideoPosterBlob(normalized.localPreviewUrl, 1280);
      normalized.posterBlob = posterBlob || null;
      if (posterBlob?.size) {
        posterDataUrl = await fileToDataUrl(posterBlob);
        if (!normalized.posterPreviewUrl) {
          try { normalized.posterPreviewUrl = URL.createObjectURL(posterBlob); } catch {}
        }
      }
    } catch {}
  }
  if (!dataUrl) dataUrl = await fileToDataUrl(file);
  normalized.clientUploadId = normalized.clientUploadId || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return fetchJsonWithAbort("/api/comments/attachments/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Comment-Key": state.commentKey || "",
      "X-Upload-Fallback": reason,
      "X-Client-Upload-Id": normalized.clientUploadId
    },
    body: JSON.stringify({
      commentKey: state.commentKey || "",
      clientUploadId: normalized.clientUploadId,
      type: uploadType,
      fileName,
      mimeType,
      size: Number(file.size || 0),
      dataUrl,
      posterDataUrl,
      fallbackReason: reason
    })
  }, uploadType === "video" ? 120000 : 12000);
}

function getCommentAttachmentUrl(item = {}) {
  const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
  const raw = String(
    item.url ||
    item.downloadUrl ||
    item.previewUrl ||
    payload.url ||
    payload.download_url ||
    payload.link ||
    ""
  ).trim();
  if (item?.local && /^(blob|data):/i.test(raw)) return raw;
  return isStableAttachmentUrl(raw) ? raw : "";
}

function getCommentAttachmentPosterUrl(item = {}) {
  const raw = String(item.posterUrl || item.poster_url || item.thumbnailUrl || item.thumbUrl || "");
  if (!raw) return "";
  if (item?.local && /^(blob|data):/i.test(raw)) return raw;
  return isStableAttachmentUrl(raw) ? raw : "";
}

function getCommentAttachmentClientPreviewUrl(item = {}) {
  const raw = String(item.clientPreviewUrl || item.localPreviewUrl || "").trim();
  if (/^(blob|data):/i.test(raw)) return raw;
  return "";
}

function getCommentAttachmentClientPosterUrl(item = {}) {
  const raw = String(item.clientPosterUrl || item.localPosterUrl || "").trim();
  if (/^(blob|data):/i.test(raw)) return raw;
  return "";
}
function isPlayableCommentVideo(item = {}, rawUrl = "") {
  const mime = String(item?.mime || item?.mimeType || "").toLowerCase();
  const url = String(rawUrl || getCommentAttachmentUrl(item) || "").toLowerCase();
  return Boolean(url) && (mime.includes("video/mp4") || /\.mp4(?:$|[?#])/i.test(url));
}

function renderCommentAttachments(attachments = [], commentId = "") {
  const items = Array.isArray(attachments) ? attachments : [];
  if (!items.length) return "";
  return `<div class="comment-attachments">` + items.map((item, index) => {
    const type = String(item.type || "file").toLowerCase();
    const nameText = String(item.name || "Вложение");
    const name = escapeHtml(nameText);
    const rawUrl = getCommentAttachmentUrl(item);
    const clientPreview = getCommentAttachmentClientPreviewUrl(item);
    const displayImageUrl = clientPreview || rawUrl;
    const rawPoster = getCommentAttachmentPosterUrl(item);
    const clientPoster = getCommentAttachmentClientPosterUrl(item);
    const displayPoster = rawPoster || clientPoster;
    const url = escapeHtml(rawUrl);
    const imageSrc = escapeHtml(displayImageUrl);
    const poster = escapeHtml(displayPoster);
    // SP36: preview is final display quality for comment photos; do not promote to heavier image.
    const finalSrcAttr = "";
    const commentAttr = escapeHtml(commentId || "");
    const indexAttr = String(index);
    if (type === "image" && displayImageUrl) {
      return `<button type="button" class="comment-media-shell image" data-media-type="image" data-comment-id="${commentAttr}" data-attachment-index="${indexAttr}" data-media-url="${url || imageSrc}" data-media-name="${name}" aria-label="Открыть фото"><img class="comment-attachment-image" src="${imageSrc}"${finalSrcAttr} alt="${name}" loading="eager" decoding="async" /></button>`;
    }
    if (type === "video") {
      const status = String(item.status || "").toLowerCase();
      const failed = status === "error" || Boolean(item.transcodeError);
      const playable = isPlayableCommentVideo(item, rawUrl);
      const processing = !failed && (item.processing === true || status === "processing" || !playable);
      const readyClass = failed ? " error" : (processing ? " processing" : "");
      const posterImg = poster ? `<img class="comment-video-poster" src="${poster}" alt="${name}" loading="eager" decoding="async" />` : `<div class="comment-video-placeholder silent" aria-hidden="true"></div>`;
      const statusText = failed ? `<span class="comment-video-status error">Видео не удалось открыть</span>` : "";
      const playLabel = processing ? `<span class="comment-video-play processing" aria-hidden="true">▶</span>` : `<span class="comment-video-play" aria-hidden="true">▶</span>`;
      return `<button type="button" class="comment-media-shell video${readyClass}" data-media-type="video" data-comment-id="${commentAttr}" data-attachment-index="${indexAttr}" data-video-url="${url}" data-media-url="${url}" data-poster-url="${poster}" data-media-name="${name}" aria-label="Открыть видео">${posterImg}${playLabel}${statusText}</button>`;
    }
    if (type === "audio" && rawUrl) return `<audio class="comment-attachment-audio" src="${url}" controls preload="metadata"></audio>`;
    if (rawUrl) return `<a class="comment-attachment-file" href="${url}" target="_blank" rel="noopener" draggable="false">📎 ${name}</a>`;
    return `<span class="comment-attachment-file secure-file" role="note">📎 ${name}</span>`;
  }).join("") + `</div>`;
}


function getAttachmentByShell(shell, commentItem) {
  const attachments = Array.isArray(commentItem?.attachments) ? commentItem.attachments : [];
  const index = Number(shell?.dataset?.attachmentIndex || 0);
  return attachments[index] || attachments[0] || null;
}

function closeMediaViewer() {
  if (!mediaViewerModal) return;
  mediaViewerModal.classList.add("hidden");
  mediaViewerModal.setAttribute("aria-hidden", "true");
  if (mediaViewerStage) mediaViewerStage.innerHTML = "";
  if (mediaViewerCaption) {
    mediaViewerCaption.textContent = "";
    mediaViewerCaption.classList.add("hidden");
  }
  document.body.classList.remove("media-viewer-open");
}

// SP34: обычный тап по фото открывает viewer; long press открывает реакции/действия.
function promoteDecodedServerMedia(root = commentsList) {
  if (!root) return;
  root.querySelectorAll?.('img.comment-attachment-image[data-final-src]')?.forEach((img) => {
    const finalSrc = String(img.getAttribute('data-final-src') || '').trim();
    if (!finalSrc || img.dataset.promoting === '1') return;
    img.dataset.promoting = '1';
    const preloader = new Image();
    preloader.onload = async () => {
      try { await preloader.decode?.(); } catch {}
      img.src = finalSrc;
      img.removeAttribute('data-final-src');
      img.dataset.promoting = '';
    };
    preloader.onerror = () => { img.dataset.promoting = ''; };
    preloader.src = finalSrc;
  });
}
function openMediaViewer(attachment = {}, commentItem = null) {
  if (!mediaViewerModal || !mediaViewerStage) return false;
  const type = String(attachment?.type || "").toLowerCase();
  const src = getCommentAttachmentUrl(attachment);
  const poster = getCommentAttachmentPosterUrl(attachment);
  const caption = String(commentItem?.text || "").trim();
  if (!src && !poster) return false;
  closeMenus();
  commentInput?.blur?.();
  mediaPreviewCaption?.blur?.();

  if (type === "image" && src) {
    mediaViewerStage.innerHTML = `<img class="media-viewer-image" src="${escapeHtml(src)}" alt="Фото" decoding="async" />`;
  } else if (type === "video") {
    const failed = String(attachment?.status || "").toLowerCase() === "error" || Boolean(attachment?.transcodeError);
    if (failed) {
      mediaViewerStage.innerHTML = `<div class="media-viewer-message">Видео не удалось подготовить для просмотра. Попробуйте загрузить другое видео или отправить как файл.</div>`;
    } else if (!isPlayableCommentVideo(attachment, src)) {
      mediaViewerStage.innerHTML = `<div class="media-viewer-message">Видео ещё обрабатывается. Оно появится после подготовки MP4.</div>`;
    } else {
      const posterAttr = poster ? ` poster="${escapeHtml(poster)}"` : "";
      mediaViewerStage.innerHTML = `<video class="media-viewer-video" src="${escapeHtml(src)}"${posterAttr} controls playsinline webkit-playsinline preload="metadata"></video>`;
      const video = mediaViewerStage.querySelector("video");
      setTimeout(() => video?.play?.().catch(() => {}), 120);
    }
  } else {
    return false;
  }

  if (mediaViewerCaption) {
    mediaViewerCaption.textContent = caption;
    mediaViewerCaption.classList.toggle("hidden", !caption);
  }
  mediaViewerModal.classList.remove("hidden");
  mediaViewerModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("media-viewer-open");
  return true;
}

function scrollDiscussionIntoTelegramPosition() {
  const wrap = getDiscussionWrap();
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const viewportHeight = window.visualViewport?.height || window.innerHeight || 0;
  if (!viewportHeight) return;
  const absoluteTop = rect.top + window.scrollY;
  const targetY = Math.max(0, absoluteTop - viewportHeight * 0.62);
  window.scrollTo({ top: targetY, behavior: "auto" });
}

function scrollFirstSearchResultIntoView() {
  if (!state.searchQuery) return;
  const first = commentsList?.querySelector?.(".comment-row");
  if (!first) return;
  requestAnimationFrame(() => {
    first.scrollIntoView({ block: "center", behavior: "smooth" });
    commentSearchPanel?.scrollIntoView({ block: "nearest" });
  });
}

async function requestPost(extra = {}) {
  const params = new URLSearchParams();
  if (state.commentKey) params.set("commentKey", state.commentKey);
  if (state.channelId) params.set("channelId", state.channelId);
  if (state.handoffToken) params.set("handoff", state.handoffToken);
  if (getOutgoingUserId()) params.set("userId", getOutgoingUserId());
  if (state.startapp) params.set("startapp", state.startapp);
  else if (state.startappRaw) params.set("startapp", state.startappRaw);
  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, value);
  });
  return fetchJsonWithTimeout(`/api/post?${params.toString()}`);
}

async function loadPost() {
  const result = await requestPost();
  if (!result.response.ok || !result.data.ok || !result.data.post) {
    setPostError("", true);
    showMiniAppStartMenu();
    if (postMedia) postMedia.style.display = "none";
    discussionLabel.textContent = "АдминКит";
    hideGrowthCards();
    return;
  }
  setPostError("", true);
  hideMiniAppStartMenu();
  setCommentsUiVisible(true);
  setCommentStatus("");
  composerCard.style.display = "block";
  state.commentKey = result.data.post.commentKey;
  state.channelId = result.data.post.channelId ? String(result.data.post.channelId) : state.channelId;
  state.adminkitLink = result.data.adminkitLink || state.adminkitLink;
  if (adminkitDiscussionLink && state.adminkitLink) adminkitDiscussionLink.href = state.adminkitLink;
  const hasText = Boolean(result.data.post.originalText || result.data.post.postText);
  if (hasText) {
    postTitle.textContent = result.data.post.originalText || result.data.post.postText;
    postTitle.style.display = "block";
  } else {
    postTitle.textContent = "";
    postTitle.style.display = "none";
  }
  renderPostAttachments(result.data.post.sourceAttachments || result.data.post.attachments || result.data.post.patchedAttachments || []);
  renderPostNativeReactions(result.data.post.nativeReactions || result.data.post.nativeReactionSummary || result.data.post.reactionSummary || []);
  renderGrowthBlocks(result.data.growth || null);
}

function buildReplyBlock(replyTo) {
  if (!replyTo) return "";
  return `<div class="reply-preview"><div class="reply-line"></div><div class="reply-content"><div class="reply-name">${escapeHtml(replyTo.userName || "Гость")}</div><div class="reply-text">${escapeHtml(replyTo.text || "")}</div></div></div>`;
}
function pluralizeComments(count) {
  const n = Math.abs(Number(count || 0));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} комментарий`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} комментария`;
  return `${n} комментариев`;
}

function updateCommentsCount(count) {
  if (commentsCountPill) commentsCountPill.textContent = pluralizeComments(count);
}

function getCommentSearchText(item) {
  return [item.userName, item.text, item.replyTo?.userName, item.replyTo?.text]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getVisibleComments(items) {
  const query = String(state.searchQuery || "").trim().toLowerCase();
  if (!query) return items;
  return items.filter((item) => getCommentSearchText(item).includes(query));
}

function buildReactionAvatarStack(users = []) {
  const visible = Array.isArray(users) ? users.slice(0, 3) : [];
  if (!visible.length) return "";
  return `<span class="reaction-avatar-stack">` + visible.map((user) => {
    const name = user?.userName || user?.userId || "Гость";
    return `<span class="reaction-avatar-mini">${renderAvatar(user?.avatarUrl || "", name)}</span>`;
  }).join("") + `</span>`;
}

function buildReactionPills(item) {
  const details = Array.isArray(item.reactionDetails) && item.reactionDetails.length
    ? item.reactionDetails
    : Object.entries(item.reactionCounts || {}).map(([emoji, count]) => ({
        emoji,
        count,
        active: (item.ownReactions || []).includes(emoji),
        users: []
      }));
  const cleanDetails = details
    .map((entry) => ({ ...entry, emoji: String(entry.emoji || "").trim(), count: Number(entry.count || 0) }))
    .filter((entry) => entry.emoji && entry.count > 0);
  if (!cleanDetails.length) return "";
  return `<div class="reaction-pills embedded-reactions">` + cleanDetails.map((entry) => {
    const emoji = String(entry.emoji || "");
    const count = Number(entry.count || 0);
    const active = entry.active || (item.ownReactions || []).includes(emoji) ? " active" : "";
    const users = buildReactionAvatarStack(entry.users || []);
    return `<button type="button" class="reaction-pill${active}${users ? " has-avatars" : ""}" data-comment-id="${escapeHtml(item.id)}" data-emoji="${escapeHtml(emoji)}"><span class="reaction-emoji">${escapeHtml(emoji)}</span><span class="reaction-count">${count}</span>${users}</button>`;
  }).join("") + `</div>`;
}

function buildFocusedCommentCard(item) {
  if (!item) return "";
  const displayName = isReasonableName(item.userName) ? item.userName : "Гость";
  const isOwn = String(item.userId || "") === String(getOutgoingUserId());
  return `
    <div class="focused-comment-card-inner${isOwn ? " own" : ""}">
      ${isOwn ? "" : `<div class="focused-comment-name">${escapeHtml(displayName)}</div>`}
      <div class="focused-comment-time">${escapeHtml(formatDateTime(item.createdAt))}</div>
      ${buildReplyBlock(item.replyTo)}
      <div class="focused-comment-text">${escapeHtml(item.text || "")}</div>
    </div>
  `;
}

function syncFocusedCommentCard() {
  if (!focusedCommentCard) return;
  focusedCommentCard.innerHTML = buildFocusedCommentCard(state.selectedComment);
}

function bindReactionPillHandlers() {
  commentsList?.querySelectorAll?.(".reaction-pill")?.forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const emoji = String(btn.dataset.emoji || "").trim();
      if (!emoji) return;
      await sendReaction(btn.dataset.commentId, emoji);
    });
  });
}


function makeCommentRowFingerprint(item) {
  return JSON.stringify([
    item?.id,
    item?.updatedAt || item?.editedAt || item?.createdAt,
    item?.text,
    Array.isArray(item?.attachments) ? item.attachments.map((att) => [att.id, att.type, att.name, att.size, att.url, att.previewUrl, att.native, att.local, att.failed, att.payload?.token, att.payload?.url, JSON.stringify(att.payload?.photos || {}), att.posterUrl]).slice(0, 5) : [],
    item?.reactionCounts,
    item?.reactionDetails,
    Boolean(item?.pending),
    Boolean(item?.failed),
    state.searchQuery
  ]);
}

function createCommentRowElement(item, currentUserId) {
  const displayName = isReasonableName(item.userName) ? item.userName : "Гость";
  const isOwn = currentUserId && String(item.userId || "") === currentUserId;
  const attachments = Array.isArray(item.attachments) ? item.attachments : [];
  const hasMedia = attachments.some((att) => ["image", "video"].includes(String(att?.type || "").toLowerCase()));
  const mediaOnly = hasMedia && !String(item.text || "").trim();
  const el = document.createElement("article");
  el.className = `comment-row${isOwn ? " own" : ""}${mediaOnly ? " media-only-row" : ""}`;
  el.dataset.commentId = item.id;
  el.innerHTML = `
    ${isOwn ? "" : `<div class="avatar-wrap message-avatar">${renderAvatar(item.avatarUrl, displayName)}</div>`}
    <div class="bubble-wrap">
      <div class="comment-bubble${isOwn ? " own" : ""}${mediaOnly ? " media-only" : ""}" data-comment-id="${escapeHtml(item.id)}">
        ${buildReplyBlock(item.replyTo)}
        ${isOwn ? "" : `<div class="comment-name">${escapeHtml(displayName)}</div>`}
        ${renderCommentAttachments(item.attachments || [], item.id)}
        ${item.text ? `<div class="comment-text">${escapeHtml(item.text || "")}</div>` : ""}
        <div class="bubble-footer">
          ${buildReactionPills(item)}
          <div class="bubble-meta">
            ${item.failed ? `<span class="edited-mark">не синхр.</span>` : item.editedAt ? `<span class="edited-mark">изменено</span>` : ""}
            <span class="comment-time">${escapeHtml(formatTime(item.createdAt))}</span>
          </div>
        </div>
      </div>
    </div>
  `;
  return el;
}

function getLocalTransientComments() {
  return (state.commentsCache || []).filter((item) => {
    const id = String(item?.id || "");
    return id.startsWith("local_") || item?.pending || item?.failed;
  });
}

function mergeServerAndTransientComments(serverItems = []) {
  const server = Array.isArray(serverItems) ? serverItems : [];
  const serverIds = new Set(server.map((item) => String(item?.id || "")));
  const transient = getLocalTransientComments().filter((item) => !serverIds.has(String(item?.id || "")));
  if (!transient.length) return server;
  return [...server, ...transient].sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
}

function renderComments(items) {
  const allItems = Array.isArray(items) ? items : [];
  updateCommentsCount(allItems.length);
  const sorted = getVisibleComments(allItems);
  const structuralFingerprint = JSON.stringify(sorted.map((item) => [
    item.id,
    item.updatedAt || item.editedAt || item.createdAt,
    item.text,
    Array.isArray(item.attachments) ? item.attachments.map((att) => [att.id, att.type, att.name, att.size, att.url, att.previewUrl, att.native, att.payload?.token, att.payload?.url, JSON.stringify(att.payload?.photos || {}), att.posterUrl]).slice(0, 5) : [],
    state.searchQuery
  ]));
  const fingerprint = JSON.stringify(sorted.map((item) => [
    item.id,
    item.updatedAt || item.editedAt || item.createdAt,
    item.text,
    Array.isArray(item.attachments) ? item.attachments.map((att) => [att.id, att.type, att.name, att.size, att.url, att.previewUrl, att.native, att.payload?.token, att.payload?.url, JSON.stringify(att.payload?.photos || {}), att.posterUrl]).slice(0, 5) : [],
    item.reactionCounts,
    item.reactionDetails,
    Boolean(item.pending),
    Boolean(item.failed),
    state.searchQuery
  ]));
  const changed = fingerprint !== lastCommentsFingerprint;
  if (!changed) {
    if (emptyState) {
      emptyState.textContent = allItems.length && state.searchQuery ? "Ничего не найдено" : "Комментариев пока нет";
      emptyState.style.display = sorted.length ? "none" : "block";
    }
    return;
  }
  const onlyReactionsChanged = structuralFingerprint === lastCommentsStructuralFingerprint && commentsList?.children?.length;
  if (onlyReactionsChanged) {
    sorted.forEach((item) => {
      const id = String(item.id || "").replace(/"/g, "\\\"");
      const bubble = commentsList.querySelector("[data-comment-id=\"" + id + "\"] .comment-bubble");
      if (!bubble) return;
      const footer = bubble.querySelector('.bubble-footer');
      const oldPills = footer?.querySelector('.embedded-reactions');
      const nextHtml = buildReactionPills(item);
      if (oldPills) oldPills.remove();
      if (nextHtml && footer) footer.insertAdjacentHTML('afterbegin', nextHtml);
    });
    lastCommentsFingerprint = fingerprint;
    bindReactionPillHandlers();
    return;
  }
  lastCommentsFingerprint = fingerprint;
  lastCommentsStructuralFingerprint = structuralFingerprint;
  if (emptyState) {
    emptyState.textContent = allItems.length && state.searchQuery ? "Ничего не найдено" : "Комментариев пока нет";
    emptyState.style.display = sorted.length ? "none" : "block";
  }

  // SP33.1: не пересоздаём уже показанные медиа-комментарии при добавлении нового файла.
  // Старые img/video DOM-ноды переиспользуются, поэтому фото/видео не моргают и не пропадают
  // во время длительного upload/polling в MAX iOS WebView.
  const currentUserId = String(getOutgoingUserId() || "");
  const existingRows = new Map(Array.from(commentsList.children || []).map((el) => [String(el.dataset?.commentId || ""), el]));
  const usedIds = new Set();
  const fragment = document.createDocumentFragment();
  sorted.forEach((item) => {
    const id = String(item.id || "");
    const rowFingerprint = makeCommentRowFingerprint(item);
    const existing = existingRows.get(id);
    const el = existing && commentRowFingerprints.get(id) === rowFingerprint
      ? existing
      : createCommentRowElement(item, currentUserId);
    commentRowFingerprints.set(id, rowFingerprint);
    usedIds.add(id);
    fragment.appendChild(el);
  });
  Array.from(commentRowFingerprints.keys()).forEach((id) => {
    if (!usedIds.has(id)) commentRowFingerprints.delete(id);
  });
  commentsList.replaceChildren(fragment);

  bindReactionPillHandlers();
  promoteDecodedServerMedia(commentsList);

  commentsList.querySelectorAll(".comment-media-shell").forEach((shell) => {
    if (shell.dataset.bound === "1") return;
    shell.dataset.bound = "1";
    let longPressTimer = null;
    let longPressTriggered = false;
    const commentId = shell.dataset.commentId;
    const item = sorted.find((entry) => entry.id === commentId);
    const video = shell.querySelector("video");
    const openActions = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (!item) return;
      longPressTriggered = true;
      state.selectedComment = item;
      openQuickActions(shell, item);
    };
    shell.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      longPressTriggered = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => openActions(event), 430);
    });
    shell.addEventListener("pointermove", () => clearTimeout(longPressTimer));
    shell.addEventListener("pointerup", () => clearTimeout(longPressTimer));
    shell.addEventListener("pointercancel", () => clearTimeout(longPressTimer));
    shell.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      commentInput?.blur?.();
      mediaPreviewCaption?.blur?.();
      if (longPressTriggered) { longPressTriggered = false; return; }
      const attachment = getAttachmentByShell(shell, item);
      if (shell.classList.contains("processing")) {
        setCommentStatus("Видео загружается и готовится. Если не появится, карточка сама перейдёт в ошибку.", false);
        setTimeout(() => { if (commentInlineStatus && !commentInlineStatus.classList.contains("error")) setCommentStatus(""); }, 1800);
        return;
      }
      if (attachment && openMediaViewer(attachment, item)) return;
    });
    shell.addEventListener("contextmenu", (event) => openActions(event));
  });

  commentsList.querySelectorAll(".comment-bubble").forEach((bubble) => {
    if (bubble.dataset.bound === "1") return;
    bubble.dataset.bound = "1";
    bubble.addEventListener("selectstart", (event) => event.preventDefault());
    bubble.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse") event.preventDefault();
    });

    let pressTimer = null;
    const open = (event) => {
      if (event?.target?.closest?.(".reaction-pill, .comment-media-shell, .comment-attachment-file, audio, video")) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const commentId = bubble.dataset.commentId;
      const item = sorted.find((entry) => entry.id === commentId);
      if (!item) return;
      state.selectedComment = item;
      openQuickActions(bubble, item);
    };

    bubble.addEventListener("click", (event) => {
      // SP34: обычный тап по пузырю не вызывает реакции/меню. Действия — только long press/contextmenu.
      if (event?.target?.closest?.(".reaction-pill, .comment-media-shell, .comment-attachment-file, audio, video")) return;
    });

    bubble.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      open(event);
    });

    bubble.addEventListener("touchstart", (event) => {
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => open(event), 350);
    }, { passive: false });

    bubble.addEventListener("touchmove", () => clearTimeout(pressTimer), { passive: true });
    bubble.addEventListener("touchend", () => clearTimeout(pressTimer), { passive: true });
    bubble.addEventListener("touchcancel", () => clearTimeout(pressTimer), { passive: true });
  });
  updateComposerOffset();
  if (state.searchQuery) {
    scrollFirstSearchResultIntoView();
  } else if (changed && state.initialAnchorDone) {
    requestAnimationFrame(() => scrollToBottom(false));
  }
}

async function loadComments(forceScroll = false) {
  if (!state.commentKey || commentsRequestInFlight) return;
  if (!forceScroll && state.mediaUploadInFlight) return;
  commentsRequestInFlight = true;
  try {
    const params = new URLSearchParams({ commentKey: state.commentKey });
    if (getOutgoingUserId()) params.set("userId", getOutgoingUserId());
    const { data } = await fetchJsonWithTimeout(`/api/comments?${params.toString()}`);
    state.commentsCache = mergeServerAndTransientComments(data.comments || []);
    renderComments(state.commentsCache);
    if (forceScroll && !state.searchQuery) requestAnimationFrame(() => scrollToBottom(true));
  } catch (error) {
    console.warn("loadComments failed", error);
  } finally {
    commentsRequestInFlight = false;
  }
}
function startCommentsPolling() {
  if (commentsPollTimer) clearInterval(commentsPollTimer);
  commentsPollTimer = setInterval(() => {
    if (document.hidden || state.mediaUploadInFlight) return;
    loadComments(false);
  }, 3500);
}

function openQuickActions(anchor, item) {
  state.selectedComment = item;
  if (focusedCommentCard) syncFocusedCommentCard();

  reactionBar.innerHTML = QUICK_REACTIONS.map((emoji) =>
    `<button class="reaction-choice" type="button" data-emoji="${emoji}">${emoji}</button>`
  ).join("") + `<button class="reaction-choice reaction-plus" type="button" data-emoji="+">+</button>`;

  emojiPicker.innerHTML = EXTRA_REACTIONS.map((emoji) =>
    `<button class="emoji-picker-choice" type="button" data-emoji="${emoji}">${emoji}</button>`
  ).join("");

  const isOwn = String(item.userId || "") === String(getOutgoingUserId());
  actionSheet.querySelector('[data-action="edit"]').style.display = isOwn ? "block" : "none";
  actionSheet.querySelector('[data-action="delete"]').style.display = isOwn ? "block" : "none";

  reactionBar.classList.remove("hidden");
  actionSheet.classList.remove("hidden");
  sheetOverlay.classList.remove("hidden");
  commentFocusModal?.classList.remove("hidden");
  commentFocusModal?.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  emojiPicker.classList.add("hidden");

  reactionBar.querySelectorAll(".reaction-choice").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (btn.dataset.emoji === "+") {
        emojiPicker.classList.toggle("hidden");
        return;
      }
      await sendReaction(item.id, btn.dataset.emoji);
      closeMenus();
    });
  });

  emojiPicker.querySelectorAll(".emoji-picker-choice").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await sendReaction(item.id, btn.dataset.emoji);
      closeMenus();
    });
  });
}


function closeMenus() {
  reactionBar.classList.add("hidden");
  actionSheet.classList.add("hidden");
  emojiPicker.classList.add("hidden");
  sheetOverlay.classList.add("hidden");
  commentFocusModal?.classList.add("hidden");
  commentFocusModal?.setAttribute("aria-hidden", "true");
  reactionBar.style.visibility = "";
  actionSheet.style.visibility = "";
  emojiPicker.style.visibility = "";
  state.selectedComment = null;
  document.body.classList.remove("modal-open");
}


function isPreviewableMediaAttachment(item) {
  const type = String(item?.type || "").toLowerCase();
  return type === "image" || type === "video";
}

function getMediaPreviewSource(item = {}) {
  if (!item) return "";
  return String(item.localPreviewUrl || item.previewUrl || item.url || "");
}

function setMediaPreviewStatus(message, isError = false) {
  if (!mediaPreviewStatus) return;
  if (!message) {
    mediaPreviewStatus.textContent = "";
    mediaPreviewStatus.classList.add("hidden");
    mediaPreviewStatus.classList.remove("error");
    return;
  }
  mediaPreviewStatus.textContent = message;
  mediaPreviewStatus.classList.remove("hidden");
  mediaPreviewStatus.classList.toggle("error", Boolean(isError));
}

function setCommentUploadStatus(message, isError = false) {
  if (document.body.classList.contains("media-preview-open")) setMediaPreviewStatus(message, isError);
  else setCommentStatus(message, isError);
}

function updateMediaPreviewKeyboardLayout() {
  if (!mediaPreviewModal || mediaPreviewModal.classList.contains("hidden")) return;
  const viewport = window.visualViewport;
  const baseHeight = state.mediaPreviewBaseHeight || window.innerHeight || document.documentElement.clientHeight || 0;
  if (baseHeight) mediaPreviewModal.style.height = `${Math.round(baseHeight)}px`;
  const visibleBottom = viewport ? (viewport.height + viewport.offsetTop) : (window.innerHeight || baseHeight);
  const keyboardHeight = Math.max(0, Math.round(baseHeight - visibleBottom));
  const safeKeyboardHeight = keyboardHeight > 80 ? Math.max(keyboardHeight, 300) : 0;
  const isKeyboardOpen = safeKeyboardHeight > 0;
  mediaPreviewModal.classList.toggle("keyboard-open", isKeyboardOpen);
  mediaPreviewBottom?.style.setProperty("--media-keyboard-offset", `${safeKeyboardHeight}px`);
  mediaPreviewStage?.style?.setProperty("--media-keyboard-offset", `${safeKeyboardHeight}px`);
}

function renderMediaPreviewStage(item) {
  if (!mediaPreviewStage) return;
  const src = getMediaPreviewSource(item);
  const type = String(item?.type || "").toLowerCase();
  const fit = item?.fitMode === "cover" ? "cover" : "contain";
  mediaPreviewStage.dataset.fit = "contain";
  if (mediaPreviewTitle) mediaPreviewTitle.textContent = type === "video" ? "Видео" : type === "image" ? "Предпросмотр" : "Вложение";
  if (!src) {
    mediaPreviewStage.innerHTML = '<div class="media-preview-file">📎 Вложение готово к отправке</div>';
    return;
  }
  const rotation = Number(item?.rotation || 0) % 360;
  const transform = rotation ? ` style="transform: rotate(${rotation}deg)"` : "";
  if (type === "video") {
    const poster = String(item?.posterPreviewUrl || item?.localPosterUrl || item?.posterUrl || "");
    if (poster) {
      mediaPreviewStage.innerHTML = '<div class="media-preview-video-poster"><img class="media-preview-image" src="' + escapeHtml(poster) + '" alt="video poster" /><span class="media-preview-play">▶</span></div>';
    } else {
      mediaPreviewStage.innerHTML = '<div class="media-preview-file video">▶ Видео выбрано<br><small>Превью появится после обработки</small></div>';
    }
    return;
  }
  mediaPreviewStage.innerHTML = '<img class="media-preview-image" src="' + escapeHtml(src) + '" alt="preview"' + transform + ' />';
}

function autoGrowMediaCaption() {
  if (!mediaPreviewCaption) return;
  mediaPreviewCaption.style.height = "auto";
  mediaPreviewCaption.style.height = Math.min(Math.max(mediaPreviewCaption.scrollHeight, 42), 112) + "px";
  updateMediaPreviewKeyboardLayout();
}

function openMediaPreview(item) {
  if (!mediaPreviewModal || !item) return false;
  closeAttachmentMenu();
  state.mediaPreviewAttachment = item;
  state.mediaPreviewBaseHeight = Math.max(
    window.innerHeight || 0,
    (window.visualViewport?.height || 0) + (window.visualViewport?.offsetTop || 0),
    document.documentElement?.clientHeight || 0
  );
  state.mediaPreviewFitMode = "contain";
  renderMediaPreviewStage(item);
  setMediaPreviewStatus("");
  if (mediaPreviewCaption) {
    mediaPreviewCaption.value = String(commentInput?.value || "").trim();
    autoGrowMediaCaption();
  }
  mediaPreviewModal.style.height = `${Math.round(state.mediaPreviewBaseHeight)}px`;
  mediaPreviewModal.classList.remove("hidden");
  mediaPreviewModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("media-preview-open");
  // Не фокусируем подпись автоматически: в MAX/Telegram клавиатура появляется только по нажатию на поле.
  setTimeout(updateMediaPreviewKeyboardLayout, 60);
  return true;
}

function closeMediaPreview({ clear = false } = {}) {
  if (clear) {
    revokeLocalPreviewUrl(state.mediaPreviewAttachment);
    state.mediaPreviewAttachment = null;
  }
  mediaPreviewModal?.classList.add("hidden");
  mediaPreviewModal?.setAttribute("aria-hidden", "true");
  mediaPreviewModal?.classList.remove("keyboard-open");
  if (mediaPreviewModal) mediaPreviewModal.style.height = "";
  mediaPreviewBottom?.style.removeProperty("--media-keyboard-offset");
  document.body.classList.remove("media-preview-open");
  setMediaPreviewStatus("");
  if (mediaPreviewStage) {
    mediaPreviewStage.innerHTML = "";
    mediaPreviewStage.dataset.fit = "contain";
  }
  if (mediaPreviewCaption) mediaPreviewCaption.value = "";
  if (attachmentInput) attachmentInput.value = "";
  if (attachmentCameraInput) attachmentCameraInput.value = "";
  if (attachmentFileInput) attachmentFileInput.value = "";
  state.mediaPreviewBaseHeight = 0;
  state.mediaPreviewFitMode = "contain";
}

// SP33.1: HD/crop/rotate tools are intentionally disabled until native-quality editing is stable.

window.visualViewport?.addEventListener("resize", updateMediaPreviewKeyboardLayout);
window.visualViewport?.addEventListener("scroll", updateMediaPreviewKeyboardLayout);
window.addEventListener("orientationchange", () => setTimeout(updateMediaPreviewKeyboardLayout, 250));
window.addEventListener("resize", updateMediaPreviewKeyboardLayout);

sheetOverlay.addEventListener("click", closeMenus);
commentFocusModal?.addEventListener("click", (event) => { if (event.target === commentFocusModal) closeMenus(); });
actionSheet.addEventListener("mousedown", (event) => event.preventDefault());
reactionBar.addEventListener("mousedown", (event) => event.preventDefault());
emojiPicker.addEventListener("mousedown", (event) => event.preventDefault());
actionSheet.addEventListener("click", async (event) => {
  const action = event.target?.dataset?.action;
  if (!action || !state.selectedComment) return;
  if (action === "close") {
    closeMenus();
    return;
  }
  if (action === "copy") {
    navigator.clipboard?.writeText(state.selectedComment.text || "");
    closeMenus();
    return;
  }
  if (action === "reply") {
    state.editingCommentId = "";
    state.composerReplyTo = state.selectedComment;
    commentInput.placeholder = "Напиши комментарий...";
    renderComposerReply();
    commentInput.focus();
    closeMenus();
    return;
  }
  if (action === "edit") {
    state.composerReplyTo = null;
    renderComposerReply();
    state.editingCommentId = state.selectedComment.id;
    commentInput.value = state.selectedComment.text || "";
    commentInput.placeholder = "Изменить комментарий";
    autoGrowCommentInput();
    commentInput.focus();
    closeMenus();
    return;
  }
  if (action === "delete") {
    await fetch("/api/comments/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commentKey: state.commentKey,
        commentId: state.selectedComment.id,
        userId: getOutgoingUserId()
      })
    });
    closeMenus();
    await loadComments(false);
  }
});

function preloadImageUrl(url = "", timeoutMs = 1400) {
  const raw = String(url || "").trim();
  if (!raw || /^(blob|data):/i.test(raw)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const timer = setTimeout(finish, timeoutMs);
    img.onload = () => { clearTimeout(timer); finish(); };
    img.onerror = () => { clearTimeout(timer); finish(); };
    img.src = raw;
  });
}

async function preloadCommentMedia(comment = {}, timeoutMs = 1400) {
  const urls = [];
  (comment.attachments || []).forEach((att) => {
    if (att.type === "image") urls.push(getCommentAttachmentUrl(att));
    if (att.type === "video") urls.push(getCommentAttachmentPosterUrl(att));
  });
  await Promise.all(urls.filter(Boolean).map((url) => preloadImageUrl(url, timeoutMs)));
}

function attachClientPreviewsToCreatedComment(comment = {}, selectedItems = []) {
  if (!comment || !Array.isArray(comment.attachments) || !Array.isArray(selectedItems)) return comment;
  const byId = new Map();
  selectedItems.forEach((item) => {
    if (!item) return;
    const id = String(item.uploadedAttachmentId || item.serverAttachmentId || item.clientUploadId || item.id || "");
    if (id) byId.set(id, item);
  });
  const fallback = selectedItems[0] || null;
  return {
    ...comment,
    attachments: comment.attachments.map((attachment, index) => {
      const selected = byId.get(String(attachment.id || attachment.uploadId || attachment.clientUploadId || "")) || selectedItems[index] || fallback;
      if (!selected) return attachment;
      const patch = {};
      if (selected.localPreviewUrl && String(attachment.type || '').toLowerCase() === 'image') patch.clientPreviewUrl = selected.localPreviewUrl;
      if (selected.posterPreviewUrl) patch.clientPosterUrl = selected.posterPreviewUrl;
      return { ...attachment, ...patch };
    })
  };
}

async function markCommentAttachmentStatus(uploadId, patch = {}) {
  const id = String(uploadId || '').trim();
  if (!id) return;
  try {
    await apiRequestJson('/api/comments/attachments/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentKey: state.commentKey || '', uploadId: id, ...patch })
    });
  } catch {}
}

function makeVideoProcessingPlaceholder(selected = {}) {
  const uploadId = selected.clientUploadId || selected.id || `1777545193435_l93k75sd`;
  selected.clientUploadId = uploadId;
  return {
    id: uploadId,
    uploadId,
    clientUploadId: uploadId,
    type: 'video',
    name: selected.name || 'Видео',
    mime: selected.mime || 'video/quicktime',
    size: Number(selected.size || selected.originalSize || 0),
    url: '',
    previewUrl: '',
    posterUrl: '',
    payload: {},
    native: false,
    localOnly: false,
    storage: 'client_upload_pending',
    processing: true,
    status: 'processing',
    transcodeError: ''
  };
}

function startBackgroundVideoUpload(selected) {
  if (!selected) return;
  const uploadId = selected.clientUploadId || selected.id || '';
  setTimeout(async () => {
    try {
      await uploadCommentAttachment(selected);
      setTimeout(() => loadComments(false).catch(() => {}), 700);
    } catch (error) {
      await markCommentAttachmentStatus(uploadId, {
        status: 'error',
        processing: false,
        transcodeError: error?.message || 'video_upload_failed',
        storage: 'client_upload_failed'
      });
      setTimeout(() => loadComments(false).catch(() => {}), 300);
    }
  }, 250);
}
async function submitComment({ textOverride = null, attachmentsOverride = null, closePreviewAfterSend = false } = {}) {
  const text = String(textOverride !== null ? textOverride : commentInput.value || "").trim();
  const attachmentsToSend = Array.isArray(attachmentsOverride) ? attachmentsOverride : (state.selectedAttachments || []);
  const hasAttachments = Array.isArray(attachmentsToSend) && attachmentsToSend.length > 0;
  if (!state.commentKey || (!text && !hasAttachments)) return;

  let uploadedAttachments = [];
  let uploadStageSucceeded = false;

  try {
    setCommentStatus("");
    if (state.editingCommentId) {
      await apiRequestJson("/api/comments/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentKey: state.commentKey,
          commentId: state.editingCommentId,
          userId: getOutgoingUserId(),
          userName: getOutgoingUserName(),
          text
        })
      });
    } else {
      const optimisticId = hasAttachments ? `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` : "";
      if (optimisticId) {
        const optimisticAttachments = (attachmentsToSend || []).map((selected) => ({
          id: selected.id || optimisticId,
          type: selected.type || "file",
          name: selected.name || "Вложение",
          mime: selected.mime || "",
          size: selected.size || 0,
          url: selected.localPreviewUrl || selected.previewUrl || selected.url || "",
          previewUrl: selected.localPreviewUrl || selected.previewUrl || selected.url || "",
          posterUrl: selected.posterUrl || "",
          local: true
        }));
        state.commentsCache = [...(state.commentsCache || []), {
          id: optimisticId,
          userId: getOutgoingUserId(),
          userName: getOutgoingUserName(),
          avatarUrl: getOutgoingAvatarUrl(),
          text,
          attachments: optimisticAttachments,
          createdAt: Date.now(),
          reactionCounts: {},
          reactionDetails: [],
          ownReactions: [],
          pending: true
        }];
        renderComments(state.commentsCache);
        requestAnimationFrame(() => scrollToBottom(true));
        if (closePreviewAfterSend) closeMediaPreview({ clear: false });
      }

      uploadedAttachments = [];
      const videoAttachmentsToUploadLater = [];
      if (hasAttachments) {
        state.mediaUploadInFlight = true;
        // SP35.3: не показываем постоянную плашку загрузки; локальное превью уже показывает действие.
        // Legacy invariant: Комментарий не сохранён, чтобы не оставить битый blob-preview.
        setCommentUploadStatus("");
        for (const selected of attachmentsToSend || []) {
          try {
            if (String(selected?.type || '').toLowerCase() === 'video') {
              const placeholder = makeVideoProcessingPlaceholder(selected);
              selected.uploadedAttachmentId = placeholder.id;
              selected.serverAttachmentId = placeholder.id;
              uploadedAttachments.push(placeholder);
              videoAttachmentsToUploadLater.push(selected);
              uploadStageSucceeded = true;
              continue;
            }
            const uploaded = await prepareSelectedAttachmentForComment(selected);
            if (uploaded) {
              selected.uploadedAttachmentId = uploaded.id || selected.id || "";
              selected.serverAttachmentId = uploaded.id || "";
              uploadedAttachments.push(uploaded);
              uploadStageSucceeded = true;
            }
          } catch (uploadError) {
            // SP33.1: blob: допускается только для мгновенного optimistic-preview на экране.
            // В постоянный store отправляем комментарий только после успешного серверного /public/comment-uploads URL.
            const error = new Error(uploadError?.payload?.error || uploadError?.message || "attachment_upload_failed");
            error.payload = uploadError?.payload || null;
            error.status = uploadError?.status || 400;
            throw error;
          }
        }
        setCommentUploadStatus("");
        state.mediaUploadInFlight = false;
        if (uploadedAttachments.length !== (attachmentsToSend || []).length) {
          throw new Error("attachment_upload_incomplete");
        }
      }

      const createdResponse = await apiRequestJson("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentKey: state.commentKey,
          userId: getOutgoingUserId(),
          userName: getOutgoingUserName(),
          avatarUrl: getOutgoingAvatarUrl(),
          text,
          replyToId: state.composerReplyTo?.id || "",
          attachments: uploadedAttachments,
          clientUploadIds: (attachmentsToSend || []).map((item) => String(item?.clientUploadId || "")).filter(Boolean)
        })
      });
      const createdComment = createdResponse.comment ? attachClientPreviewsToCreatedComment(createdResponse.comment, attachmentsToSend) : null;
      if (optimisticId) state.commentsCache = (state.commentsCache || []).filter((item) => item.id !== optimisticId);
      if (createdComment) {
        state.commentsCache = [...(state.commentsCache || []), createdComment];
        renderComments(state.commentsCache);
      }
      if (videoAttachmentsToUploadLater.length) {
        videoAttachmentsToUploadLater.forEach((item) => startBackgroundVideoUpload(item));
      }
    }

    commentInput.value = "";
    commentInput.placeholder = "Напиши комментарий...";
    state.editingCommentId = "";
    clearComposerReply();
    clearSelectedAttachments();
    state.mediaPreviewAttachment = null;
    if (closePreviewAfterSend && !mediaPreviewModal?.classList.contains("hidden")) closeMediaPreview({ clear: true });
    autoGrowCommentInput();
    // SP33.1: не перезагружаем весь список после отправки медиа — optimistic/created comment уже применён локально.
    requestAnimationFrame(() => scrollToBottom(true));
  } catch (error) {
    const moderation = error?.payload?.moderation || {};
    if (error?.payload?.error === "comment_blocked_by_moderation") {
      const reasons = Array.isArray(moderation.reasons) ? moderation.reasons.filter(Boolean).join(", ") : "";
      const labels = Array.isArray(moderation.labels) ? moderation.labels.filter(Boolean).join(", ") : "";
      const details = [reasons, labels].filter(Boolean).join(" · ");
      setCommentStatus(details ? `Комментарий отклонён модерацией: ${details}` : "Комментарий отклонён модерацией.", true);
    } else {
      const hadAttachments = hasAttachments;
      setCommentUploadStatus("");
      state.mediaUploadInFlight = false;
      if (hadAttachments) {
        state.commentsCache = (state.commentsCache || []).map((item) => {
          if (!String(item.id || "").startsWith("local_")) return item;
          return { ...item, pending: false, failed: true, uploadError: true };
        });
        renderComments(state.commentsCache || []);
        const errorCode = String(error?.payload?.error || error?.message || "").trim();
        const message = uploadStageSucceeded
          ? (errorCode ? `Файл загружен, но комментарий не сохранён: ${errorCode}` : "Файл загружен, но комментарий не сохранён. Попробуйте отправить ещё раз.")
          : (errorCode && !/upload|attachment|timeout/i.test(errorCode)
            ? `Комментарий не сохранён: ${errorCode}`
            : "Не удалось подготовить вложение. Комментарий не отправлен, чтобы не оставить битое превью.");
        if (closePreviewAfterSend && !mediaPreviewModal?.classList.contains("hidden")) setMediaPreviewStatus(message, true);
        else setCommentStatus(message, true);
      } else {
        setCommentStatus("Не удалось отправить комментарий. Попробуйте ещё раз.", true);
        await loadComments(false);
      }
    }
  }
}

sendBtn.addEventListener("click", () => submitComment());

commentInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendBtn.click();
  }
});
commentInput.addEventListener("input", () => {
  autoGrowCommentInput();
  updateComposerOffset();
});

function closeAttachmentMenu() {
  attachmentMenu?.classList.add("hidden");
  attachmentMenu?.setAttribute("aria-hidden", "true");
}

function positionAttachmentMenuNearButton() {
  if (!attachmentMenu) return;
  const anchor = attachBtnWrap || attachBtn;
  const rect = anchor?.getBoundingClientRect?.();
  const viewport = window.visualViewport;
  const vw = Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 0);
  const vh = Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);
  if (!rect || !vw || !vh) {
    attachmentMenu.style.left = "12px";
    attachmentMenu.style.top = "auto";
    attachmentMenu.style.bottom = "calc(env(safe-area-inset-bottom, 0px) + 62px)";
    return;
  }
  const wasHidden = attachmentMenu.classList.contains("hidden");
  const prevVisibility = attachmentMenu.style.visibility;
  if (wasHidden) {
    attachmentMenu.style.visibility = "hidden";
    attachmentMenu.classList.remove("hidden");
  }
  attachmentMenu.style.bottom = "auto";
  const menuWidth = attachmentMenu.offsetWidth || Math.min(300, vw - 24);
  const menuHeight = attachmentMenu.offsetHeight || 172;
  if (wasHidden) {
    attachmentMenu.classList.add("hidden");
    attachmentMenu.style.visibility = prevVisibility;
  }
  const desiredLeft = rect.left + rect.width / 2 - 34;
  const left = clamp(desiredLeft, 12, Math.max(12, vw - menuWidth - 12));
  const topAbove = rect.top - menuHeight - 10;
  const top = topAbove >= 12 ? topAbove : Math.min(vh - menuHeight - 12, rect.bottom + 10);
  attachmentMenu.style.left = Math.round(left) + "px";
  attachmentMenu.style.top = Math.round(top) + "px";
  attachmentMenu.style.bottom = "auto";
}

let attachmentMenuLastOpenedAt = 0;
let attachmentMenuLockUntil = 0;
function openAttachmentMenu() {
  if (!attachmentMenu) return;
  closeMenus();
  commentInput?.blur?.();
  positionAttachmentMenuNearButton();
  attachmentMenu.classList.remove("hidden");
  attachmentMenu.setAttribute("aria-hidden", "false");
  attachmentMenuLastOpenedAt = Date.now();
}

async function handleAttachmentInputChange(input) {
  const files = Array.from(input?.files || []).slice(0, MAX_COMMENT_ATTACHMENTS);
  closeAttachmentMenu();
  if (!files.length) return;
  try {
    setCommentStatus("");
    attachBtn?.setAttribute("disabled", "disabled");
    sendBtn?.setAttribute("disabled", "disabled");
    const selected = [];
    for (const file of files) {
      const normalized = await normalizeSelectedFile(file);
      if (normalized) selected.push(normalized);
    }
    const cleanSelected = selected.filter(Boolean);
    if (cleanSelected.length === 1 && isPreviewableMediaAttachment(cleanSelected[0])) {
      state.selectedAttachments = [];
      renderSelectedAttachments();
      setCommentStatus("");
      openMediaPreview(cleanSelected[0]);
      return;
    }
    state.selectedAttachments = cleanSelected;
    renderSelectedAttachments();
    setCommentStatus(cleanSelected.length ? "Файл прикреплён. Нажмите отправить." : "");
    setTimeout(() => { if (commentInlineStatus && !commentInlineStatus.classList.contains("error")) setCommentStatus(""); }, 1400);
  } catch (error) {
    clearSelectedAttachments();
    closeMediaPreview({ clear: true });
    setCommentStatus(error?.payload?.error || error?.message || "Не удалось прикрепить файл. Попробуйте ещё раз.", true);
  } finally {
    attachBtn?.removeAttribute("disabled");
    sendBtn?.removeAttribute("disabled");
    if (input) input.value = "";
  }
}

function handleAttachTriggerClick(event) {
  // SP33.1: native file input sits physically over the paperclip button.
  // Do not call input.click() from wrapper/button; this caused duplicate iOS/MAX picker layers.
  if (event?.target === attachmentInput) {
    commentInput?.blur?.();
    mediaPreviewCaption?.blur?.();
    closeMenus();
    closeAttachmentMenu();
    return;
  }
  event?.preventDefault?.();
  event?.stopPropagation?.();
  commentInput?.blur?.();
  mediaPreviewCaption?.blur?.();
  closeMenus();
  closeAttachmentMenu();
}

attachBtnWrap?.addEventListener("click", handleAttachTriggerClick);
// attachBtn is visual only; the real tap target is #attachmentInput overlay.

// SP33.1: legacy custom attachment menu buttons removed.

window.visualViewport?.addEventListener?.("resize", () => { if (!attachmentMenu?.classList.contains("hidden")) positionAttachmentMenuNearButton(); });
window.visualViewport?.addEventListener?.("scroll", () => { if (!attachmentMenu?.classList.contains("hidden")) positionAttachmentMenuNearButton(); });

document.addEventListener("click", (event) => {
  if (attachmentMenu?.classList.contains("hidden")) return;
  if (event.target?.closest?.("#attachmentMenu, #attachBtn, .attach-btn-wrap")) return;
  closeAttachmentMenu();
}, { capture: true });

attachmentInput?.addEventListener("change", () => handleAttachmentInputChange(attachmentInput));
attachmentCameraInput?.addEventListener("change", () => handleAttachmentInputChange(attachmentCameraInput));
attachmentFileInput?.addEventListener("change", () => handleAttachmentInputChange(attachmentFileInput));

mediaPreviewClose?.addEventListener("click", () => closeMediaPreview({ clear: true }));
mediaPreviewClear?.addEventListener("click", () => closeMediaPreview({ clear: true }));
mediaPreviewCaption?.addEventListener("input", autoGrowMediaCaption);
mediaPreviewCaption?.addEventListener("focus", () => setTimeout(updateMediaPreviewKeyboardLayout, 80));
mediaPreviewCaption?.addEventListener("blur", () => setTimeout(updateMediaPreviewKeyboardLayout, 80));
mediaPreviewSend?.addEventListener("click", async () => {
  const selected = state.mediaPreviewAttachment;
  if (!selected) return;
  mediaPreviewSend?.setAttribute("disabled", "disabled");
  const caption = String(mediaPreviewCaption?.value || "").trim();
  await submitComment({ textOverride: caption, attachmentsOverride: [selected], closePreviewAfterSend: true });
  mediaPreviewSend?.removeAttribute("disabled");
});
mediaPreviewModal?.addEventListener("click", (event) => {
  if (event.target === mediaPreviewModal) closeMediaPreview({ clear: true });
});
mediaViewerClose?.addEventListener("click", closeMediaViewer);
mediaViewerModal?.addEventListener("click", (event) => {
  if (event.target === mediaViewerModal || event.target === mediaViewerStage) closeMediaViewer();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenus();
    closeMediaViewer();
    closeMediaPreview({ clear: false });
  }
});

searchBtn?.addEventListener("click", () => {
  commentSearchPanel?.classList.toggle("hidden");
  const opened = !commentSearchPanel?.classList.contains("hidden");
  document.body.classList.toggle("search-open", Boolean(opened));
  if (opened) {
    commentSearchPanel?.scrollIntoView({ block: "start" });
    setTimeout(() => commentSearchInput?.focus(), 50);
  }
});

commentSearchInput?.addEventListener("input", () => {
  state.searchQuery = String(commentSearchInput.value || "").trim();
  document.body.classList.toggle("search-open", Boolean(state.searchQuery));
  renderComments(state.commentsCache || []);
});

commentSearchClear?.addEventListener("click", () => {
  state.searchQuery = "";
  if (commentSearchInput) commentSearchInput.value = "";
  commentSearchPanel?.classList.add("hidden");
  document.body.classList.remove("search-open");
  renderComments(state.commentsCache || []);
});

backBtn.addEventListener("click", () => {
  if (window.history.length > 1) return window.history.back();
  const controller = getBridgeController();
  if (controller?.close) controller.close();
});

window.addEventListener('resize', () => {
  updateComposerOffset();
  closeMenus();
});
window.addEventListener('scroll', () => {
  if (!reactionBar.classList.contains('hidden')) closeMenus();
}, { passive: true });
window.visualViewport?.addEventListener?.('resize', closeMenus);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadComments(false);
  else closeMenus();
});
window.addEventListener('focus', () => loadComments(false));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenus();
});

composerReplyClose?.addEventListener("click", () => {
  clearComposerReply();
});

function hasRealCommentsLaunchContext() {
  const start = String(state.startapp || state.startappRaw || "").trim();
  const startLooksLikePost = /^(ck:|cp:|post:|h_|-?\d+:-?\d+$|-?\d{8,}$)/i.test(start);
  return Boolean(state.commentKey || state.postId || state.handoffToken || startLooksLikePost);
}

(async () => {
  autoGrowCommentInput();
  renderComposerReply();
  updateComposerOffset();

  // Стартовая посадочная должна быть чистой: без фонового интерфейса комментариев,
  // без загрузки поста и без polling, даже если MAX передал startapp=menu/start.
  if (!hasRealCommentsLaunchContext()) {
    showMiniAppStartMenu();
    stopCommentsPolling();
    return;
  }

  await loadPost();
  waitForPostMediaReady(1400).catch(() => {});
  await loadComments(false);
  const anchorDiscussion = () => {
    scrollDiscussionIntoTelegramPosition();
    state.initialAnchorDone = true;
    document.body.classList.add("comments-screen");
  };
  requestAnimationFrame(anchorDiscussion);
  setTimeout(anchorDiscussion, 180);
  setTimeout(anchorDiscussion, 520);
  startCommentsPolling();
})();
