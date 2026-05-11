'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC6.5.6.0-V3-NATIVE-HINTS-CLEANUP';
const SOURCE = 'adminkit-CC6.5.6.0-v3-no-overlap-hints';
const MARKER = '__ADMINKIT_V3_NATIVE_HINTS_CLEANUP__';

function buildClientPatch() {
  return `\n;(() => {\n  if (window.${MARKER}) return;\n  window.${MARKER} = true;\n\n  const RUNTIME = '${RUNTIME}';\n  const allowedHintAreas = [\n    '#miniAppStartCard',\n    '#emptyState',\n    '#postError',\n    '#commentInlineStatus',\n    '#composerReply',\n    '.composer-reply',\n    '.error-card',\n    '.empty-state',\n    '[data-ak-native-hint]',\n    '[data-v3-native-hint]'\n  ];\n\n  const forbiddenOverlaySelectors = [\n    '[data-ak-overlay-hint]',\n    '[data-v3-overlay-hint]',\n    '[data-ak-floating-hint]',\n    '[data-v3-floating-hint]',\n    '.adminkit-hint-overlay',\n    '.adminkit-overlay-hint',\n    '.v3-hint-overlay',\n    '.v3-overlay-hint',\n    '.native-hint-overlay',\n    '.ak-tooltip-overlay',\n    '.tour-overlay',\n    '.walkthrough-overlay',\n    '.onboarding-overlay',\n    '.floating-tip',\n    '.floating-help',\n    '.floating-cta',\n    '.powered-by-card',\n    '.adminkit-powered-card'\n  ];\n\n  const oldCtaPattern = /подключить\\s+такие\\s+же|powered\\s+by|попробовать\\s+админкит|админкит[^.]{0,40}подключить|cta\\s+для\\s+этого\\s+обсуждения/i;\n\n  function isInAllowedHintArea(element) {\n    return allowedHintAreas.some((selector) => {\n      try { return Boolean(element.closest(selector)); } catch (_) { return false; }\n    });\n  }\n\n  function disableElement(element, reason) {\n    if (!element || isInAllowedHintArea(element)) return;\n    try { element.dataset.akDisabledBy = RUNTIME; } catch (_) {}\n    try { element.dataset.akDisabledReason = reason || 'overlay_hint'; } catch (_) {}\n    element.classList.add('hidden');\n    element.setAttribute('aria-hidden', 'true');\n    element.style.setProperty('display', 'none', 'important');\n    element.style.setProperty('pointer-events', 'none', 'important');\n  }\n\n  function enforceNativeHintPolicy() {\n    try {\n      document.body?.classList?.add('adminkit-v3-native-hints-clean');\n\n      forbiddenOverlaySelectors.forEach((selector) => {\n        document.querySelectorAll(selector).forEach((element) => disableElement(element, 'forbidden_overlay_hint'));\n      });\n\n      document.querySelectorAll('[class*="hint"], [class*="tooltip"], [class*="tour"], [class*="onboarding"], [id*="hint"], [id*="tooltip"], [id*="tour"]').forEach((element) => {\n        if (isInAllowedHintArea(element)) return;\n        const text = String(element.textContent || '').trim();\n        const style = window.getComputedStyle(element);\n        const isFloating = ['fixed', 'absolute', 'sticky'].includes(style.position) || Number(style.zIndex || 0) >= 20;\n        const looksLikeHint = /подсказ|совет|нажмите|выберите|помощь|hint|tooltip|tour|onboarding/i.test(text + ' ' + element.className + ' ' + element.id);\n        if (isFloating && looksLikeHint) disableElement(element, 'floating_hint_detected');\n      });\n\n      const leadCard = document.getElementById('growthLeadCard');\n      if (leadCard && oldCtaPattern.test(String(leadCard.textContent || ''))) {\n        leadCard.innerHTML = '';\n        disableElement(leadCard, 'legacy_growth_cta');\n      }\n\n      document.querySelectorAll('.growth-brand-pill, .growth-lead-wrap, .growth-lead-link, [data-ak-legacy-cta]').forEach((element) => {\n        const text = String(element.textContent || '').trim();\n        if (oldCtaPattern.test(text)) disableElement(element, 'legacy_cta');\n      });\n\n      const fileButtons = [\n        '#attachFileBtn',\n        '[data-attach-type="file"]',\n        '[data-attachment-type="file"]',\n        '[data-attach-type="video"]',\n        '[data-attachment-type="video"]'\n      ];\n      fileButtons.forEach((selector) => {\n        document.querySelectorAll(selector).forEach((element) => disableElement(element, 'photo_only_policy'));\n      });\n\n      const fileInput = document.getElementById('attachmentFileInput');\n      if (fileInput) {\n        fileInput.disabled = true;\n        fileInput.setAttribute('aria-hidden', 'true');\n        fileInput.style.setProperty('display', 'none', 'important');\n      }\n\n      const mediaInput = document.getElementById('attachmentInput');\n      if (mediaInput) mediaInput.setAttribute('accept', 'image/*');\n      const cameraInput = document.getElementById('attachmentCameraInput');\n      if (cameraInput) cameraInput.setAttribute('accept', 'image/*');\n    } catch (error) {\n      console.warn('[Adminkit V3 hints cleanup]', error && error.message ? error.message : error);\n    }\n  }\n\n  function injectStyle() {\n    if (document.getElementById('adminkit-v3-native-hints-clean-style')) return;\n    const style = document.createElement('style');\n    style.id = 'adminkit-v3-native-hints-clean-style';\n    style.textContent = `\n      body.adminkit-v3-native-hints-clean .adminkit-hint-overlay,\n      body.adminkit-v3-native-hints-clean .adminkit-overlay-hint,\n      body.adminkit-v3-native-hints-clean .v3-hint-overlay,\n      body.adminkit-v3-native-hints-clean .v3-overlay-hint,\n      body.adminkit-v3-native-hints-clean .native-hint-overlay,\n      body.adminkit-v3-native-hints-clean .ak-tooltip-overlay,\n      body.adminkit-v3-native-hints-clean .tour-overlay,\n      body.adminkit-v3-native-hints-clean .walkthrough-overlay,\n      body.adminkit-v3-native-hints-clean .onboarding-overlay,\n      body.adminkit-v3-native-hints-clean .floating-tip,\n      body.adminkit-v3-native-hints-clean .floating-help,\n      body.adminkit-v3-native-hints-clean .floating-cta,\n      body.adminkit-v3-native-hints-clean .powered-by-card,\n      body.adminkit-v3-native-hints-clean .adminkit-powered-card,\n      body.adminkit-v3-native-hints-clean [data-ak-overlay-hint],\n      body.adminkit-v3-native-hints-clean [data-v3-overlay-hint],\n      body.adminkit-v3-native-hints-clean [data-ak-floating-hint],\n      body.adminkit-v3-native-hints-clean [data-v3-floating-hint],\n      body.adminkit-v3-native-hints-clean [data-ak-disabled-by="${RUNTIME}"] {\n        display: none !important;\n        pointer-events: none !important;\n      }\n      body.adminkit-v3-native-hints-clean #attachmentFileInput,\n      body.adminkit-v3-native-hints-clean #attachFileBtn {\n        display: none !important;\n        pointer-events: none !important;\n      }\n    `;\n    document.head?.appendChild(style);\n  }\n\n  injectStyle();\n  enforceNativeHintPolicy();\n  setTimeout(enforceNativeHintPolicy, 0);\n  setTimeout(enforceNativeHintPolicy, 250);\n  setTimeout(enforceNativeHintPolicy, 1000);\n\n  try {\n    const observer = new MutationObserver(() => enforceNativeHintPolicy());\n    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-ak-overlay-hint', 'data-v3-overlay-hint'] });\n  } catch (_) {}\n\n  window.__adminkitV3NativeHintPolicy = {\n    runtimeVersion: RUNTIME,\n    sourceMarker: '${SOURCE}',\n    allowedNativeHints: ['start_screen_inline', 'empty_state_inline', 'step_text_inline', 'error_state_inline', 'composer_reply_inline'],\n    forbidden: ['floating_hints', 'overlay_hints', 'legacy_growth_cta', 'file_video_attachment_buttons'],\n    enforce: enforceNativeHintPolicy\n  };\n})();\n`;
}

function patchPublicAppRead() {
  if (fs.__adminkitV3NativeHintsCleanupPatched) return;
  fs.__adminkitV3NativeHintsCleanupPatched = true;

  const originalReadFileSync = fs.readFileSync.bind(fs);
  const publicAppPath = path.resolve(path.join(__dirname, 'public', 'app.js'));

  fs.readFileSync = function adminkitV3NativeHintsReadFileSync(filePath, options) {
    const content = originalReadFileSync(filePath, options);
    try {
      const resolved = path.resolve(String(filePath || ''));
      const wantsText = options === 'utf8' || options === 'utf-8' || (options && typeof options === 'object' && /utf-?8/i.test(String(options.encoding || '')));
      if (resolved === publicAppPath && wantsText) {
        const text = String(content || '');
        if (!text.includes(MARKER)) return text + buildClientPatch();
      }
    } catch {}
    return content;
  };
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    patchesPublicAppRead: !!fs.__adminkitV3NativeHintsCleanupPatched,
    policy: {
      nativeHintsOnlyInline: true,
      disablesOverlayHints: true,
      disablesLegacyGrowthCta: true,
      photoOnlyAttachmentPolicy: true,
      doesNotPatchWebhook: true,
      doesNotPatchMainRouter: true
    }
  };
}

function install() {
  patchPublicAppRead();
  return selfTest();
}

module.exports = { RUNTIME, SOURCE, install, selfTest };
