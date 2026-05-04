"use strict";

// АдминКИТ SP37 emergency bootstrap.
// Запускается вместо index.js и аккуратно добавляет hotfix-слой до регистрации старых роутов SP36.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Module = require("module");

const SP37_RUNTIME_VERSION = "SP37";
const SP37_SOURCE_MARKER = "adminkit-SP37-fixmedia-gift-debug-token";

process.env.BUILD_VERSION = process.env.BUILD_VERSION || SP37_RUNTIME_VERSION;
process.env.RUNTIME_VERSION = process.env.RUNTIME_VERSION || SP37_RUNTIME_VERSION;
process.env.BUILD_SOURCE_MARKER = process.env.BUILD_SOURCE_MARKER || SP37_SOURCE_MARKER;

const config = require("./config");

// Нормализуем debug env до загрузки index.js. В URL используется только GIFT_ADMIN_TOKEN.
config.githubDebugToken = String(process.env.GITHUB_DEBUG_TOKEN || config.githubDebugToken || "").trim();
config.githubDebugRepo = String(process.env.GITHUB_DEBUG_REPO || config.githubDebugRepo || "").trim();
config.githubDebugBranch = String(process.env.GITHUB_DEBUG_BRANCH || config.githubDebugBranch || "main").trim() || "main";
config.githubDebugPath = String(process.env.GITHUB_DEBUG_PATH || config.githubDebugPath || "debug/latest.json").trim() || "debug/latest.json";
config.githubDebugLitePath = String(process.env.GITHUB_DEBUG_LITE_PATH || config.githubDebugLitePath || "debug/latest-lite.json").trim() || "debug/latest-lite.json";
config.giftAdminToken = String(process.env.GIFT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || config.giftAdminToken || "").trim();

function noCache(res) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "Surrogate-Control": "no-store"
  });
}

function getRequestAdminToken(req) {
  const bearer = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return String(
    req.get("x-admin-token") ||
    bearer ||
    req.query?.token ||
    req.query?.adminToken ||
    req.body?.token ||
    req.body?.adminToken ||
    ""
  ).trim();
}

function isAdminRequest(req) {
  if (config.debugExportAllowPublic) return true;
  if (!config.giftAdminToken) return true;
  return getRequestAdminToken(req) === config.giftAdminToken;
}

function requireGiftAdminToken(req, res) {
  if (isAdminRequest(req)) return true;
  noCache(res);
  res.status(403).json({
    ok: false,
    error: "admin_forbidden",
    runtimeVersion: SP37_RUNTIME_VERSION,
    expectedToken: "GIFT_ADMIN_TOKEN",
    note: "В /debug/export?token=... нужно передавать GIFT_ADMIN_TOKEN, а не GitHub PAT. GitHub PAT берётся только из env GITHUB_DEBUG_TOKEN."
  });
  return false;
}

function maskTokenInfo(token = "") {
  const clean = String(token || "").trim();
  if (!clean) return { present: false, length: 0, prefix: "", suffix: "" };
  return {
    present: true,
    length: clean.length,
    prefix: clean.slice(0, 8),
    suffix: clean.slice(-4)
  };
}

function normalizeSnapshot(snapshot = {}) {
  const now = Date.now();
  return {
    ...snapshot,
    ok: snapshot.ok !== false,
    runtimeVersion: SP37_RUNTIME_VERSION,
    displayVersion: SP37_RUNTIME_VERSION,
    buildVersion: SP37_RUNTIME_VERSION,
    sourceMarker: SP37_SOURCE_MARKER,
    generatedAt: now,
    generatedAtIso: new Date(now).toISOString(),
    sp37: {
      enabled: true,
      fixes: [
        "debug_export_uses_gift_admin_token_only",
        "github_token_is_env_only_and_never_query_token",
        "debug_export_returns_live_debug_even_when_github_write_fails",
        "store_live_no_cache_endpoint",
        "github_check_endpoint",
        "same_origin_file_download_headers",
        "range_video_headers_for_ios",
        "client_fetch_abort_guard_for_media_uploads",
        "visual_viewport_keyboard_guard"
      ]
    }
  };
}

function buildDebugSnapshot() {
  try {
    const { getDebugSnapshot } = require("./store");
    const snapshot = typeof getDebugSnapshot === "function" ? getDebugSnapshot() : {};
    return normalizeSnapshot(snapshot || {});
  } catch (error) {
    return normalizeSnapshot({
      ok: false,
      error: "debug_snapshot_failed",
      data: { message: error?.message || String(error) }
    });
  }
}

function buildLiteDebug(full = {}) {
  const posts = full.posts && typeof full.posts === "object" ? full.posts : {};
  const comments = full.comments && typeof full.comments === "object" ? full.comments : {};
  const uploadDiagnostics = Array.isArray(full.uploadDiagnostics) ? full.uploadDiagnostics : [];
  return {
    ok: full.ok !== false,
    runtimeVersion: SP37_RUNTIME_VERSION,
    displayVersion: SP37_RUNTIME_VERSION,
    buildVersion: SP37_RUNTIME_VERSION,
    sourceMarker: SP37_SOURCE_MARKER,
    generatedAt: full.generatedAt || Date.now(),
    generatedAtIso: full.generatedAtIso || new Date().toISOString(),
    counts: {
      posts: Object.keys(posts).length,
      commentThreads: Object.keys(comments).length,
      uploadDiagnostics: uploadDiagnostics.length
    },
    githubDebug: getGithubDebugInfo(),
    sp37: full.sp37
  };
}

function getGithubDebugInfo() {
  return {
    token: maskTokenInfo(config.githubDebugToken),
    repo: config.githubDebugRepo || "",
    branch: config.githubDebugBranch || "main",
    path: config.githubDebugPath || "debug/latest.json",
    litePath: config.githubDebugLitePath || "debug/latest-lite.json",
    urlTokenMode: "gift-admin-token",
    githubTokenSource: "env:GITHUB_DEBUG_TOKEN"
  };
}

function encodeRepoPath(repoPath = "") {
  return String(repoPath || "").split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function githubFetchJson(method, repoPath, body = null) {
  const repo = String(config.githubDebugRepo || "").trim();
  const token = String(config.githubDebugToken || "").trim();
  if (!repo) return { ok: false, status: 0, error: "github_repo_missing" };
  if (!token) return { ok: false, status: 0, error: "github_token_missing" };
  const url = `https://api.github.com/repos/${repo}/contents/${encodeRepoPath(repoPath)}`;
  const requestUrl = method === "GET" ? `${url}?ref=${encodeURIComponent(config.githubDebugBranch || "main")}` : url;
  let response;
  try {
    response = await fetch(requestUrl, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    return { ok: false, status: 0, error: "github_fetch_failed", data: { message: error?.message || String(error) } };
  }

  let data = null;
  try { data = await response.json(); } catch { data = null; }
  return { ok: response.ok, status: response.status, data };
}

async function writeGithubFile(repoPath, content, message) {
  const current = await githubFetchJson("GET", repoPath);
  const sha = current.ok && current.data?.sha ? String(current.data.sha) : "";
  if (!current.ok && current.status !== 404) {
    return {
      ok: false,
      status: current.status,
      error: `github_read_failed_${current.status || 0}`,
      data: current.data || null
    };
  }
  const payload = {
    message,
    content: Buffer.from(String(content || ""), "utf8").toString("base64"),
    branch: config.githubDebugBranch || "main"
  };
  if (sha) payload.sha = sha;
  const saved = await githubFetchJson("PUT", repoPath, payload);
  return {
    ok: saved.ok,
    status: saved.status,
    error: saved.ok ? "" : `github_write_failed_${saved.status || 0}`,
    data: saved.data || null,
    path: repoPath,
    sha: saved.data?.content?.sha || saved.data?.commit?.sha || ""
  };
}

function summarizeGithubResult(result = {}) {
  return {
    ok: Boolean(result.ok),
    status: result.status || 0,
    error: result.error || "",
    path: result.path || "",
    sha: result.sha || "",
    message: result.data?.message || result.data?.errors?.[0]?.message || "",
    documentation_url: result.data?.documentation_url || ""
  };
}

async function handleDebugStoreLive(req, res) {
  if (!requireGiftAdminToken(req, res)) return;
  noCache(res);
  res.json(buildDebugSnapshot());
}

async function handleGithubCheck(req, res) {
  if (!requireGiftAdminToken(req, res)) return;
  noCache(res);
  const info = getGithubDebugInfo();
  let read = null;
  if (info.token.present && info.repo) {
    read = summarizeGithubResult(await githubFetchJson("GET", config.githubDebugPath || "debug/latest.json"));
  }
  res.json({
    ok: Boolean(info.token.present && info.repo),
    runtimeVersion: SP37_RUNTIME_VERSION,
    sourceMarker: SP37_SOURCE_MARKER,
    githubDebug: info,
    readCheck: read,
    note: "URL token проверяется только как GIFT_ADMIN_TOKEN. GitHub PAT не передаётся в ссылке и читается только из env."
  });
}

async function handleDebugExport(req, res) {
  if (!requireGiftAdminToken(req, res)) return;
  noCache(res);

  const full = buildDebugSnapshot();
  const lite = buildLiteDebug(full);
  const githubInfo = getGithubDebugInfo();
  const startedAt = Date.now();

  let fullWrite = null;
  let liteWrite = null;
  if (githubInfo.token.present && githubInfo.repo) {
    fullWrite = summarizeGithubResult(await writeGithubFile(
      config.githubDebugPath || "debug/latest.json",
      JSON.stringify(full, null, 2),
      `АдминКИТ ${SP37_RUNTIME_VERSION}: export full debug`
    ));
    liteWrite = summarizeGithubResult(await writeGithubFile(
      config.githubDebugLitePath || "debug/latest-lite.json",
      JSON.stringify(lite, null, 2),
      `АдминКИТ ${SP37_RUNTIME_VERSION}: export lite debug`
    ));
  } else {
    fullWrite = { ok: false, status: 0, error: githubInfo.repo ? "github_token_missing" : "github_repo_missing", path: config.githubDebugPath || "debug/latest.json" };
    liteWrite = { ok: false, status: 0, error: githubInfo.repo ? "github_token_missing" : "github_repo_missing", path: config.githubDebugLitePath || "debug/latest-lite.json" };
  }

  const exportOk = Boolean(fullWrite?.ok && liteWrite?.ok);
  res.status(200).json({
    ok: exportOk,
    error: exportOk ? "" : (fullWrite?.error || liteWrite?.error || "github_export_failed"),
    runtimeVersion: SP37_RUNTIME_VERSION,
    sourceMarker: SP37_SOURCE_MARKER,
    generatedAt: Date.now(),
    elapsedMs: Date.now() - startedAt,
    githubDebug: githubInfo,
    export: {
      full: fullWrite,
      lite: liteWrite
    },
    debug: full,
    lite
  });
}

const MIME_BY_EXT = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function safeBasename(value = "") {
  const clean = path.basename(String(value || "").split(/[?#]/)[0] || "");
  if (!clean || !/^[a-zA-Z0-9._% -]+$/.test(clean)) return "";
  return decodeURIComponent(clean).replace(/[^a-zA-Z0-9._ -]/g, "_");
}

function safeJoin(baseDir, fileName) {
  const safe = safeBasename(fileName);
  if (!safe) return "";
  const base = path.resolve(baseDir);
  const resolved = path.resolve(path.join(base, safe));
  if (!resolved.startsWith(base + path.sep)) return "";
  return resolved;
}

function contentDisposition(filePath, mode = "inline") {
  const name = path.basename(filePath || "attachment.bin").replace(/[\r\n"]/g, "_");
  const encoded = encodeURIComponent(name);
  return `${mode}; filename="${name}"; filename*=UTF-8''${encoded}`;
}

function serveFileWithRange(req, res, filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    noCache(res);
    res.status(404).json({ ok: false, error: "attachment_not_found", runtimeVersion: SP37_RUNTIME_VERSION });
    return;
  }

  const stat = fs.statSync(filePath);
  const size = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const mime = options.mimeType || MIME_BY_EXT[ext] || "application/octet-stream";

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", contentDisposition(filePath, options.disposition || "inline"));
  res.setHeader("Cache-Control", "private, max-age=86400, stale-while-revalidate=604800");
  res.setHeader("X-Adminkit-Media-Route", "sp37-range-safe");

  const range = String(req.headers.range || "").trim();
  if (range && /^bytes=/i.test(range)) {
    const match = range.replace(/bytes=/i, "").split("-");
    let start = Number.parseInt(match[0], 10);
    let end = match[1] ? Number.parseInt(match[1], 10) : size - 1;
    if (!Number.isFinite(start)) start = 0;
    if (!Number.isFinite(end) || end >= size) end = size - 1;
    if (start >= size || end < start) {
      res.status(416).setHeader("Content-Range", `bytes */${size}`);
      res.end();
      return;
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.status(200);
  res.setHeader("Content-Length", String(size));
  fs.createReadStream(filePath).pipe(res);
}

function handlePublicCommentUpload(req, res, next) {
  const fileName = req.params?.file || req.path.split("/").pop() || "";
  const filePath = safeJoin(path.join(__dirname, "public", "comment-uploads"), fileName);
  if (!filePath || !fs.existsSync(filePath)) return next();
  serveFileWithRange(req, res, filePath, { disposition: "inline" });
}

function handlePrivateAttachmentDownload(req, res, next) {
  const fileName = req.params?.id || req.path.split("/").pop() || "";
  const filePath = safeJoin(path.join(__dirname, "data", "comment-files"), fileName);
  if (!filePath || !fs.existsSync(filePath)) return next();
  serveFileWithRange(req, res, filePath, { disposition: "inline" });
}

function buildClientHotfix() {
  return `\n<script id="adminkit-sp37-media-hotfix">\n(() => {\n  if (window.__ADMINKIT_SP37_FIX_MEDIA__) return;\n  window.__ADMINKIT_SP37_FIX_MEDIA__ = true;\n  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;\n  if (nativeFetch) {\n    window.fetch = function adminkitSP37Fetch(resource, init) {\n      const url = String(typeof resource === 'string' ? resource : (resource && resource.url) || '');\n      const method = String((init && init.method) || (resource && resource.method) || 'GET').toUpperCase();\n      const body = init && init.body;\n      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;\n      const isCommentMutation = /\\/api\\/comments/i.test(url) && method !== 'GET';\n      const isMediaMutation = isCommentMutation || /attachment|upload|comment-uploads/i.test(url) || isFormData;\n      if (isMediaMutation && init && init.signal) {\n        init = Object.assign({}, init);\n        delete init.signal;\n        init.headers = init.headers || {};\n        try { init.headers['X-Adminkit-SP37-No-Abort'] = '1'; } catch (_) {}\n      }\n      return nativeFetch(resource, init);\n    };\n  }\n\n  const root = document.documentElement;\n  function syncViewport() {\n    try {\n      const vv = window.visualViewport;\n      const bottomGap = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;\n      root.style.setProperty('--adminkit-sp37-keyboard', bottomGap + 'px');\n      root.dataset.adminkitKeyboard = bottomGap > 80 ? 'open' : 'closed';\n    } catch (_) {}\n  }\n  if (window.visualViewport) {\n    visualViewport.addEventListener('resize', syncViewport, { passive: true });\n    visualViewport.addEventListener('scroll', syncViewport, { passive: true });\n  }\n  window.addEventListener('focusin', () => setTimeout(syncViewport, 80), true);\n  window.addEventListener('focusout', () => setTimeout(syncViewport, 160), true);\n  syncViewport();\n\n  document.addEventListener('click', (event) => {\n    const video = event.target && event.target.closest ? event.target.closest('video') : null;\n    if (video) {\n      try {\n        video.setAttribute('playsinline', '');\n        video.setAttribute('webkit-playsinline', '');\n        video.preload = video.preload || 'metadata';\n        if (!video.currentSrc && video.src) video.load();\n      } catch (_) {}\n    }\n  }, true);\n})();\n</script>\n<style id="adminkit-sp37-media-hotfix-css">\n:root { --adminkit-sp37-keyboard: 0px; }\nvideo { max-width: 100%; -webkit-transform: translateZ(0); transform: translateZ(0); }\na[href*="/api/comments/attachments/download"], a[href*="/public/comment-uploads"] { -webkit-touch-callout: default; }\nhtml[data-adminkit-keyboard="open"] .comment-input-bar,\nhtml[data-adminkit-keyboard="open"] .comments-input-bar,\nhtml[data-adminkit-keyboard="open"] .input-bar,\nhtml[data-adminkit-keyboard="open"] .composer,\nhtml[data-adminkit-keyboard="open"] .comment-composer,\nhtml[data-adminkit-keyboard="open"] [data-comment-composer] {\n  padding-bottom: max(env(safe-area-inset-bottom), 8px);\n}\n</style>\n`;
}

function installHtmlInjection(app) {
  app.use((req, res, next) => {
    const originalSend = res.send;
    res.send = function patchedSend(body) {
      try {
        const contentType = String(res.getHeader("content-type") || "");
        const isHtml = contentType.includes("text/html") || (typeof body === "string" && /<html|<!doctype/i.test(body));
        if (isHtml) {
          const patch = buildClientHotfix();
          if (Buffer.isBuffer(body)) body = body.toString("utf8");
          if (typeof body === "string" && !body.includes("adminkit-sp37-media-hotfix")) {
            if (body.includes("</head>")) body = body.replace("</head>", patch + "</head>");
            else if (body.includes("</body>")) body = body.replace("</body>", patch + "</body>");
            else body += patch;
          }
        }
      } catch (_) {}
      return originalSend.call(this, body);
    };
    next();
  });
}

function installSP37Routes(app) {
  if (!app || app.__adminkitSP37RoutesInstalled) return app;
  app.__adminkitSP37RoutesInstalled = true;

  app.get("/debug/store-live", handleDebugStoreLive);
  app.get("/debug/store-live.json", handleDebugStoreLive);
  app.get("/debug/github-check", handleGithubCheck);
  app.get("/debug/export", handleDebugExport);

  app.get("/api/comments/attachments/download/:id", handlePrivateAttachmentDownload);
  app.get("/public/comment-uploads/:file", handlePublicCommentUpload);

  installHtmlInjection(app);
  return app;
}

const originalLoad = Module._load;
Module._load = function patchedModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.apply(this, arguments);
  if (request === "express" && loaded && !loaded.__adminkitSP37Wrapped) {
    function expressSP37Wrapper(...args) {
      const app = loaded(...args);
      return installSP37Routes(app);
    }
    Object.setPrototypeOf(expressSP37Wrapper, loaded);
    Object.assign(expressSP37Wrapper, loaded);
    expressSP37Wrapper.__adminkitSP37Wrapped = true;
    return expressSP37Wrapper;
  }
  return loaded;
};

console.log(`[АдминКИТ] ${SP37_RUNTIME_VERSION} bootstrap loaded: ${SP37_SOURCE_MARKER}`);
require("./index");
