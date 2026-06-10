'use strict';

const path = require('path');

const RUNTIME = 'CC8.3.55-PR189-PUSH-FRESH-PWA-PENDING';
const SOURCE = 'adminkit-pr189-push-fresh-pwa-pending';

function clean(value) { return String(value || '').trim(); }
function versionToken() { return encodeURIComponent(clean(process.env.RUNTIME_VERSION) || RUNTIME); }

function setNoCacheHeaders(res) {
  if (!res || typeof res.setHeader !== 'function') return;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-Adminkit-Push-Fresh-PWA', RUNTIME);
  res.setHeader('X-Adminkit-Push-Source', SOURCE);
}

function patchPushHtml(html) {
  if (typeof html !== 'string' || !html.includes('/public/push-client.js')) return html;
  const marker = `<script>window.__ADMINKIT_PUSH_CLIENT_VERSION__=${JSON.stringify(RUNTIME)};window.__ADMINKIT_PUSH_CLIENT_SOURCE__=${JSON.stringify(SOURCE)};</script>`;
  return html
    .replace(/<script>window\.__ADMINKIT_PUSH_CLIENT_VERSION__=[\s\S]*?<\/script>\s*/g, '')
    .replace(/<script\s+src="\/public\/push-client\.js(?:\?[^\"]*)?"><\/script>/g, `${marker}\n    <script src="/public/push-client.js?v=${versionToken()}"></script>`)
    .replace(/Персональная ссылка найдена\. Теперь нажмите «Включить уведомления»\.?/g, 'Откройте АдминКИТ PUSH с экрана Домой. В приложении появится кнопка «Подключить этот чат».')
    .replace(/Если АдминКИТ PUSH уже установлен,\s*просто откройте ссылку и нажмите\s*«Включить уведомления»\.?/g, 'Если АдминКИТ PUSH уже установлен, откройте приложение с экрана Домой — в нём появится кнопка «Подключить этот чат».');
}

function wrapSendForPush(req, res, next) {
  setNoCacheHeaders(res);
  if (res && typeof res.send === 'function' && !res.__adminkitPr189SendWrapped) {
    const originalSend = res.send.bind(res);
    res.send = function pr189Send(body) {
      if (typeof body === 'string') return originalSend(patchPushHtml(body));
      if (Buffer.isBuffer(body)) {
        const text = body.toString('utf8');
        if (text.includes('/public/push-client.js')) return originalSend(Buffer.from(patchPushHtml(text), 'utf8'));
      }
      return originalSend(body);
    };
    res.__adminkitPr189SendWrapped = true;
  }
  if (typeof next === 'function') return next();
  return undefined;
}

function shouldPatchRoute(routePath) {
  const value = Array.isArray(routePath) ? routePath.join('|') : String(routePath || '');
  return value === '/push' || value.startsWith('/push/') || value.includes('/push/join') || value.includes('/push/sw.js');
}

function shouldNoCacheAsset(filePath) {
  const name = path.basename(String(filePath || '')).toLowerCase();
  return name === 'push-client.js' || name === 'push-sw.js' || name === 'push.html' || name.includes('adminkit-push');
}

function install() {
  const express = require('express');
  const state = { staticPatched: false, getPatched: false };

  if (express && !express.__adminkitPr189StaticPatched && typeof express.static === 'function') {
    const originalStatic = express.static;
    express.static = function pr189Static(root, options = {}) {
      const previous = options && typeof options.setHeaders === 'function' ? options.setHeaders : null;
      return originalStatic.call(this, root, {
        ...(options || {}),
        setHeaders(res, filePath, stat) {
          if (previous) previous(res, filePath, stat);
          if (shouldNoCacheAsset(filePath)) setNoCacheHeaders(res);
        }
      });
    };
    Object.assign(express.static, originalStatic);
    express.__adminkitPr189StaticPatched = true;
    state.staticPatched = true;
  }

  if (express && express.application && !express.application.__adminkitPr189GetPatched) {
    const originalGet = express.application.get;
    express.application.get = function pr189Get(routePath, ...handlers) {
      if (handlers.length && shouldPatchRoute(routePath)) return originalGet.call(this, routePath, wrapSendForPush, ...handlers);
      return originalGet.call(this, routePath, ...handlers);
    };
    express.application.__adminkitPr189GetPatched = true;
    state.getPatched = true;
  }

  return state;
}

const state = install();
function info() { return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, state, versionToken: versionToken() }; }

module.exports = { RUNTIME, SOURCE, setNoCacheHeaders, patchPushHtml, info, state };
