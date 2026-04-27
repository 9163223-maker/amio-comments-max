
function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeText(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function normalizeLongText(value, fallback = "") {
  return String(value || fallback).replace(/\r\n/g, "\n").trim();
}

function makeButtonId(seed = "btn") {
  const cleanSeed = String(seed || "btn").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "btn";
  return `${cleanSeed}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeButton(input = {}, rowIndex = 0, buttonIndex = 0) {
  const source = input && typeof input === "object" ? input : {};
  const type = ["link", "tracked_link"].includes(String(source.type || "").trim())
    ? String(source.type || "").trim()
    : "tracked_link";
  const text = normalizeText(source.text || source.label || `CTA ${rowIndex + 1}.${buttonIndex + 1}`);
  const url = normalizeLongText(source.url || source.targetUrl || source.href || "");
  return {
    id: normalizeText(source.id || "") || makeButtonId(`kb_${rowIndex + 1}_${buttonIndex + 1}`),
    text: text.slice(0, 64),
    type,
    url: url.slice(0, 2000),
    enabled: source.enabled !== false,
    note: normalizeLongText(source.note || "").slice(0, 240)
  };
}

function normalizeRow(input = {}, rowIndex = 0) {
  const buttons = Array.isArray(input?.buttons) ? input.buttons : [];
  return {
    id: normalizeText(input?.id || "") || `row_${Date.now().toString(36)}_${rowIndex + 1}`,
    title: normalizeText(input?.title || "").slice(0, 80),
    buttons: buttons
      .map((button, buttonIndex) => normalizeButton(button, rowIndex, buttonIndex))
      .filter((button) => button.enabled !== false && button.text && button.url)
      .slice(0, 8)
  };
}

function normalizeKeyboardBuilder(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const rows = Array.isArray(source.rows) ? source.rows : [];
  return {
    enabled: source.enabled !== false,
    commentButtonText: normalizeText(source.commentButtonText || "").slice(0, 64),
    rows: rows
      .map((row, rowIndex) => normalizeRow(row, rowIndex))
      .filter((row) => row.buttons.length > 0)
      .slice(0, 8)
  };
}

function buildTrackedKeyboardUrl({ appBaseUrl = "", channelId = "", postId = "", commentKey = "", button = {}, source = "post_keyboard" } = {}) {
  const base = String(appBaseUrl || "").trim().replace(/\/$/, "");
  if (!base) return String(button.url || "").trim();
  const query = new URLSearchParams();
  if (postId) query.set("postId", String(postId || "").trim());
  if (commentKey) query.set("commentKey", String(commentKey || "").trim());
  if (source) query.set("source", String(source || "").trim());
  if (button.url) query.set("target", String(button.url || "").trim());
  if (button.text) query.set("buttonText", String(button.text || "").trim());
  return `${base}/go/${encodeURIComponent(String(channelId || "").trim())}/${encodeURIComponent(String(button.id || makeButtonId("cta")))}?${query.toString()}`;
}

function buildCustomKeyboardRows({ builder = {}, appBaseUrl = "", channelId = "", postId = "", commentKey = "" } = {}) {
  const normalized = normalizeKeyboardBuilder(builder);
  return normalized.rows.map((row) => row.buttons.map((button) => {
    const isTracked = button.type === "tracked_link";
    return {
      type: "link",
      text: String(button.text || "").trim().slice(0, 64),
      url: isTracked
        ? buildTrackedKeyboardUrl({ appBaseUrl, channelId, postId, commentKey, button, source: "post_keyboard" })
        : String(button.url || "").trim()
    };
  })).filter((row) => row.length > 0);
}

module.exports = {
  normalizeKeyboardBuilder,
  buildCustomKeyboardRows,
  buildTrackedKeyboardUrl
};
