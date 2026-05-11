'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC6.5.6.0-V3-NATIVE-HINTS-CLEANUP';
const SOURCE = 'adminkit-CC6.5.6.0-v3-no-overlap-hints';
const MARKER = '__ADMINKIT_V3_NATIVE_HINTS_CLEANUP__';

function clientPatch(runtime, source, marker) {
  if (window[marker]) return;
  window[marker] = true;

  const allowedHintAreas = [
    '#miniAppStartCard',
    '#emptyState',
    '#postError',
    '#commentInlineStatus',
    '#composerReply',
    '.composer-reply',
    '.error-card',
    '.empty-state',
    '[data-ak-native-hint]',
    '[data-v3-native-hint]'
  ];

  const forbiddenOverlaySelectors = [
    '[data-ak-overlay-hint]',
    '[data-v3-overlay-hint]',
    '[data-ak-floating-hint]',
    '[data-v3-floating-hint]',
    '.adminkit-hint-overlay',
    '.adminkit-overlay-hint',
    '.v3-hint-overlay',
    '.v3-overlay-hint',
    '.native-hint-overlay',
    '.ak-tooltip-overlay',
    '.tour-overlay',
    '.walkthrough-overlay',
    '.onboarding-overlay',
    '.floating-tip',
    '.floating-help',
    '.floating-cta',
    '.powered-by-card',
    '.adminkit-powered-card'
  ];

  const oldCtaPattern = /подключить\s+такие\s+же|powered\s+by|попробовать\s+админкит|админкит[^.]{0,40}подключить|cta\s+для\s+этого\s+обсуждения/i;

  function isInAllowedHintArea(element) {
    return allowedHintAreas.some((selector) => {
      try { return Boolean(element.closest(selector)); } catch (_) { return false; }
    });
  }

  function disableElement(element, reason) {
    if (!element || isInAllowedHintArea(element)) return;
    try { element.dataset.akDisabledBy = runtime; } catch (_) {}
    try { element.dataset.akDisabledReason = reason || 'overlay_hint'; } catch (_) {}
    element.classList.add('hidden');
    element.setAttribute('aria-hidden', 'true');
    element.style.setProperty('display', 'none', 'important');
    element.style.setProperty('pointer-events', 'none', 'important');
  }

  function enforceNativeHintPolicy() {
    try {
      document.body?.classList?.add('adminkit-v3-native-hints-clean');

      forbiddenOverlaySelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((element) => disableElement(element, 'forbidden_overlay_hint'));
      });

      document.querySelectorAll('[class*="hint"], [class*="tooltip"], [class*="tour"], [class*="onboarding"], [id*="hint"], [id*="tooltip"], [id*="tour"]').forEach((element) => {
        if (isInAllowedHintArea(element)) return;
        const text = String(element.textContent || '').trim();
        const style = window.getComputedStyle(element);
        const isFloating = ['fixed', 'absolute', 'sticky'].includes(style.position) || Number(style.zIndex || 0) >= 20;
        const looksLikeHint = /подсказ|совет|нажмите|выберите|помощь|hint|tooltip|tour|onboarding/i.test(text + ' ' + element.className + ' ' + element.id);
        if (isFloating && looksLikeHint) disableElement(element, 'floating_hint_detected');
      });

      const leadCard = document.getElementById('growthLeadCard');
      if (leadCard && oldCtaPattern.test(String(leadCard.textContent || ''))) {
        leadCard.innerHTML = '';
        disableElement(leadCard, 'legacy_growth_cta');
      }

      document.querySelectorAll('.growth-brand-pill, .growth-lead-wrap, .growth-lead-link, [data-ak-legacy-cta]').forEach((element) => {
        const text = String(element.textContent || '').trim();
        if (oldCtaPattern.test(text)) disableElement(element, 'legacy_cta');
      });

      const fileButtons = [
        '#attachFileBtn',
        '[data-attach-type="file"]',
        '[data-attachment-type="file"]',
        '[data-attach-type="video"]',
        '[data-attachment-type="video"]'
      ];
      fileButtons.forEach((selector) => {
        document.querySelectorAll(selector).forEach((element) => disableElement(element, 'photo_only_policy'));
      });

      const fileInput = document.getElementById('attachmentFileInput');
      if (fileInput) {
        fileInput.disabled = true;
        fileInput.setAttribute('aria-hidden', 'true');
        fileInput.style.setProperty('display', 'none', 'important');
      }

      const mediaInput = document.getElementById('attachmentInput');
      if (mediaInput) mediaInput.setAttribute('accept', 'image/*');
      const cameraInput = document.getElementById('attachmentCameraInput');
      if (cameraInput) cameraInput.setAttribute('accept', 'image/*');
    } catch (error) {
      console.warn('[Adminkit V3 hints cleanup]', error && error.message ? error.message : error);
    }
  }

  function injectStyle() {
    if (document.getElementById('adminkit-v3-native-hints-clean-style')) return;
    const style = document.createElement('style');
    style.id = 'adminkit-v3-native-hints-clean-style';
    style.textContent = [
      'body.adminkit-v3-native-hints-clean .adminkit-hint-overlay,',
      'body.adminkit-v3-native-hints-clean .adminkit-overlay-hint,',
      'body.adminkit-v3-native-hints-clean .v3-hint-overlay,',
      'body.adminkit-v3-native-hints-clean .v3-overlay-hint,',
      'body.adminkit-v3-native-hints-clean .native-hint-overlay,',
      'body.adminkit-v3-native-hints-clean .ak-tooltip-overlay,',
      'body.adminkit-v3-native-hints-clean .tour-overlay,',
      'body.adminkit-v3-native-hints-clean .walkthrough-overlay,',
      'body.adminkit-v3-native-hints-clean .onboarding-overlay,',
      'body.adminkit-v3-native-hints-clean .floating-tip,',
      'body.adminkit-v3-native-hints-clean .floating-help,',
      'body.adminkit-v3-native-hints-clean .floating-cta,',
      'body.adminkit-v3-native-hints-clean .powered-by-card,',
      'body.adminkit-v3-native-hints-clean .adminkit-powered-card,',
      'body.adminkit-v3-native-hints-clean [data-ak-overlay-hint],',
      'body.adminkit-v3-native-hints-clean [data-v3-overlay-hint],',
      'body.adminkit-v3-native-hints-clean [data-ak-floating-hint],',
      'body.adminkit-v3-native-hints-clean [data-v3-floating-hint],',
      'body.adminkit-v3-native-hints-clean [data-ak-disabled-by="' + runtime + '"] {',
      '  display: none !important;',
      '  pointer-events: none !important;',
      '}',
      'body.adminkit-v3-native-hints-clean #attachmentFileInput,',
      'body.adminkit-v3-native-hints-clean #attachFileBtn {',
      '  display: none !important;',
      '  pointer-events: none !important;',
      '}'
    ].join('\n');
    document.head?.appendChild(style);
  }

  injectStyle();
  enforceNativeHintPolicy();
  setTimeout(enforceNativeHintPolicy, 0);
  setTimeout(enforceNativeHintPolicy, 250);
  setTimeout(enforceNativeHintPolicy, 1000);

  try {
    const observer = new MutationObserver(() => enforceNativeHintPolicy());
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-ak-overlay-hint', 'data-v3-overlay-hint'] });
  } catch (_) {}

  window.__adminkitV3NativeHintPolicy = {
    runtimeVersion: runtime,
    sourceMarker: source,
    allowedNativeHints: ['start_screen_inline', 'empty_state_inline', 'step_text_inline', 'error_state_inline', 'composer_reply_inline'],
    forbidden: ['floating_hints', 'overlay_hints', 'legacy_growth_cta', 'file_video_attachment_buttons'],
    enforce: enforceNativeHintPolicy
  };
}

function buildClientPatch() {
  return '\n;(' + clientPatch.toString() + ')(' + [RUNTIME, SOURCE, MARKER].map((value) => JSON.stringify(value)).join(',') + ');\n';
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
